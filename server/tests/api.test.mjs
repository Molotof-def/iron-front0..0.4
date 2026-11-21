import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validateInitData, devUser, createRateLimiter } from '../auth.mjs';
import { createGameApi, summarize } from '../api.mjs';
import { createFileStore } from '../store/file-store.mjs';
import { createState } from '../game/legacy.mjs';

const TOKEN = '123456:TEST_TOKEN';
const sign = (fields, token = TOKEN) => {
  const p = new URLSearchParams(fields);
  const dcs = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  p.set('hash', createHmac('sha256', secret).update(dcs).digest('hex'));
  return p.toString();
};
const NOW = Date.UTC(2026, 10, 20, 12);
const userJson = JSON.stringify({ id: 4242, first_name: 'Иван', username: 'ivan' });

test('initData: валидная подпись принимается, подделка и просрочка отклоняются', () => {
  const ok = sign({ user: userJson, auth_date: String(Math.floor(NOW / 1000)) });
  assert.equal(validateInitData(ok, TOKEN, NOW).id, '4242');
  assert.equal(validateInitData(ok, 'other:token', NOW), null);
  assert.equal(validateInitData(ok.replace('4242', '4243'), TOKEN, NOW), null);
  const old = sign({ user: userJson, auth_date: String(Math.floor(NOW / 1000) - 90_000) });
  assert.equal(validateInitData(old, TOKEN, NOW), null);
  assert.equal(validateInitData('', TOKEN, NOW), null);
  assert.equal(validateInitData(ok, '', NOW), null);
});

test('dev-авторизация отключена в production', () => {
  assert.equal(devUser('player1', { production: true, allow: true }), null);
  assert.equal(devUser('player1', { production: false, allow: false }), null);
  assert.ok(devUser('player1', { production: false, allow: true }).id.startsWith('-'));
  assert.equal(devUser('x', { production: false, allow: true }), null);
});

const mkApi = (over = {}) => {
  let clock = NOW;
  const store = createFileStore(null, { createState: (l, p) => createState(l, p, clock), summarize });
  const api = createGameApi({
    store, clock: () => clock, rng: () => 0.5, limiter: createRateLimiter({ max: 1000 }), log: { log() {} },
    authenticate: (req) => (req.headers['x-dev-user'] ? { id: String(req.headers['x-dev-user']), firstName: 'Тест', username: '' } : null),
    ...over,
  });
  const call = (method, path, user, body = {}) => api({ method, headers: user ? { 'x-dev-user': user } : {} }, new URL(`http://x${path}`), async () => body);
  return { call, tick: (ms) => { clock += ms; } };
};

test('API: без авторизации 401, конфиг публичный и кешируемый', async () => {
  const { call } = mkApi();
  assert.equal((await call('GET', '/api/game/state', null)).status, 401);
  const cfg = await call('GET', '/api/game/config', null);
  assert.equal(cfg.status, 200);
  assert.ok(cfg.headers.ETag);
  assert.equal(await call('GET', '/api/other', null), null);
});

test('API: состояние, постройка, ошибки и изоляция игроков', async () => {
  const { call, tick } = mkApi();
  const s1 = await call('GET', '/api/game/state', '1001');
  assert.equal(s1.status, 200);
  assert.equal(s1.body.view.resources.credits, 650);
  const b = await call('POST', '/api/game/build/start', '1001', { buildingId: 'factory', requestId: 'abcdef123456' });
  assert.equal(b.status, 200);
  assert.equal(b.body.view.buildQueue.length, 1);
  const dup = await call('POST', '/api/game/build/start', '1001', { buildingId: 'lab', requestId: 'abcdef123456' });
  assert.equal(dup.status, 409);
  const bad = await call('POST', '/api/game/build/start', '1001', { buildingId: 'hq' });
  assert.equal(bad.status, 400);
  assert.equal((await call('POST', '/api/game/nope/nope', '1001')).status, 404);
  const other = await call('GET', '/api/game/state', '2002');
  assert.equal(other.body.view.buildQueue.length, 0, 'состояние другого игрока не затронуто');
  tick(24 * 3_600_000);
  const later = await call('GET', '/api/game/state', '1001');
  assert.equal(later.body.view.buildQueue.length, 0);
  assert.equal(later.body.view.buildings.find((x) => x.id === 'factory').level, 2);
  const board = await call('GET', '/api/game/leaderboard', '1001');
  assert.equal(board.status, 200);
  assert.ok(board.body.top.length >= 2);
});

test('API: клиент не может подменить награду, цены или результат боя', async () => {
  const { call } = mkApi();
  await call('GET', '/api/game/state', '3003');
  const start = await call('POST', '/api/game/battle/start', '3003', { missionId: 'r1', squad: ['t34'], reward: { credits: 99999 }, win: true });
  const id = start.body.view.battle.id;
  const claimEarly = await call('POST', '/api/game/battle/claim', '3003', { battleId: id, reward: { credits: 99999 } });
  assert.equal(claimEarly.status, 409);
  let view = start.body.view; let guard = 0;
  while (view.battle.status === 'active' && guard++ < 60) {
    const u = view.battle.squad[view.battle.active];
    view = (await call('POST', '/api/game/battle/action', '3003', { battleId: id, action: u.energy > 0 ? 'attack' : 'guard', damage: 9999 })).body.view;
  }
  const claim = await call('POST', '/api/game/battle/claim', '3003', { battleId: id, reward: { credits: 99999 } });
  assert.equal(claim.status, 200);
  assert.ok(claim.body.view.resources.credits < 1200, `кредиты ${claim.body.view.resources.credits}`);
  assert.equal((await call('POST', '/api/game/battle/claim', '3003', { battleId: id })).status, 404);
});

test('API: лимит частоты и отсутствие БД', async () => {
  const lim = mkApi({ limiter: createRateLimiter({ max: 3 }) });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await lim.call('GET', '/api/game/state', '4004')).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  const nodb = mkApi({ store: null });
  assert.equal((await nodb.call('GET', '/api/game/state', '5005')).status, 503);
});
