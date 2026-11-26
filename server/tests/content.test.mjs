import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../game/data.mjs';
import * as E from '../game/engine.mjs';
import { buildView, buildConfig } from '../game/view.mjs';
import { createState } from '../game/legacy.mjs';
import { createFileStore } from '../store/file-store.mjs';
import { createGameApi, summarize } from '../api.mjs';
import { createRateLimiter } from '../auth.mjs';

const T0 = Date.UTC(2026, 10, 23, 12);
const act = (s, a, p, now, extra = {}) => E.perform(s, a, p, { now, rng: () => 0.5, ...extra });
const code = (fn, c) => assert.throws(fn, (e) => e instanceof E.GameError && e.code === c, `ожидалась ${c}`);
const rich = (level = 1) => { const s = createState(null, {}, T0); s.xp = D.xpForLevel(level); for (const k of D.RESOURCES) s.res[k] = 1e6; s.buildings.hangar = 8; s.buildings.repair = 3; s.buildings.lab = 8; return s; };
const finish = (s, now = T0, weak = true) => {
  if (weak) s.battle.enemies.forEach((e) => { e.hp = 1; e.armor = 0; });
  let g = 0;
  while (s.battle.status === 'active' && g++ < 120) s = act(s, 'battle/action', { battleId: s.battle.id, action: s.battle.squad[s.battle.active].energy > 0 ? 'attack' : 'guard' }, now);
  return s;
};

test('кампания: этапы идут по порядку, награда за первое прохождение, глава забирается один раз', () => {
  let s = rich(30);
  code(() => act(s, 'battle/start', { missionId: 'k1_2', squad: ['t34'] }, T0), 'locked_prev');
  assert.equal(buildView(s, T0).missions.find((m) => m.id === 'k1_2').locked, true);
  const ids = D.CAMPAIGN[0].stages.map((x) => x.id);
  for (const id of ids) {
    s = act(s, 'battle/start', { missionId: id, squad: ['t34', 'tiger'].slice(0, 1) }, T0);
    s = finish(s); assert.equal(s.battle.status, 'won', id);
    s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  }
  code(() => act(s, 'campaign/claim', { chapterId: 'ch2' }, T0), 'not_done');
  const c = Math.floor(s.res.credits);
  s = act(s, 'campaign/claim', { chapterId: 'ch1' }, T0);
  assert.equal(Math.floor(s.res.credits), c + D.CAMPAIGN[0].reward.credits);
  code(() => act(s, 'campaign/claim', { chapterId: 'ch1' }, T0), 'already_claimed');
  code(() => act(s, 'campaign/claim', { chapterId: 'zzz' }, T0), 'not_found');
  assert.equal(buildView(s, T0).missions.find((m) => m.id === 'k2_1').locked, false, 'глава 2 открылась после главы 1');
  // у кампании видны враги без РЛС, историю видно в представлении
  assert.ok(buildView(rich(30), T0).missions.find((m) => m.id === 'k1_1').story.length > 20);
  assert.equal(buildConfig().campaign.length, 3);
  assert.equal(D.CAMPAIGN_MISSIONS.length, 18);
});

test('бесконечный рейд: волны растут, награда за пройденные волны, попытки, отступление', () => {
  let s = rich(6);
  code(() => act(rich(1), 'raid/start', { squad: ['t34'] }, T0), 'commander_level');
  s = act(s, 'raid/start', { squad: ['t34'] }, T0);
  assert.equal(s.raid.used, 1); assert.equal(s.battle.raid.wave, 1);
  code(() => act(s, 'raid/start', { squad: ['t34'] }, T0), 'battle_active');
  // проходим первые волны, подсаживая врагов
  for (let i = 0; i < 3; i++) {
    s.battle.enemies.forEach((e) => { e.hp = 1; e.armor = 0; });
    let g = 0; const w = s.battle.raid.wave;
    while (s.battle.raid.wave === w && s.battle.status === 'active' && g++ < 40) s = act(s, 'battle/action', { battleId: s.battle.id, action: s.battle.squad[s.battle.active].energy > 0 ? 'attack' : 'guard' }, T0);
  }
  assert.equal(s.battle.raid.wave, 4);
  assert.ok(s.battle.enemies.length >= 1);
  s = act(s, 'battle/action', { battleId: s.battle.id, action: 'retreat' }, T0);
  assert.equal(s.battle.status, 'retreated');
  assert.equal(s.battle.reward.waves, 3);
  assert.equal(s.battle.reward.credits, D.raidReward(3).credits);
  assert.equal(s.raid.best, 3);
  const c = Math.floor(s.res.credits);
  s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  assert.equal(Math.floor(s.res.credits), c + D.raidReward(3).credits);
  for (let i = 1; i < D.RAID.attempts; i++) { s = act(s, 'raid/start', { squad: ['t34'] }, T0); s = act(s, 'battle/action', { battleId: s.battle.id, action: 'retreat' }, T0); s = act(s, 'battle/claim', { battleId: s.battle.id }, T0); }
  code(() => act(s, 'raid/start', { squad: ['t34'] }, T0), 'no_attempts');
  assert.equal(E.settle(structuredClone(s), T0 + 86_400_000).raid.used, 0);
  // волна детерминирована, а 5-я — босс
  const w5 = E.makeRaidWave(s, 5, T0); assert.equal(w5.length, 1); assert.equal(w5[0].role, 'boss');
  assert.deepEqual(E.makeRaidWave(s, 3, T0).map((u) => u.tankId), E.makeRaidWave(s, 3, T0).map((u) => u.tankId));
  // поражение в рейде — тоже результат
  let l = act(rich(6), 'raid/start', { squad: ['t34'] }, T0); l.battle.squad[0].hp = 1;
  l = finish(l, T0, false); assert.ok(['lost', 'retreated'].includes(l.battle.status)); assert.ok(l.battle.reward);
});

test('расходники: изготовление, лимиты, применение в бою и защита от пустого запаса', () => {
  let s = rich(3);
  s.items = { kit: 0, smoke: 0, boost: 0 };
  code(() => act(createState(null, {}, T0), 'item/craft', { itemId: 'kit' }, T0), 'repair_level');
  code(() => act(s, 'item/craft', { itemId: 'zzz' }, T0), 'unknown_item');
  s = act(s, 'item/craft', { itemId: 'kit', qty: 3 }, T0);
  assert.equal(s.items.kit, 3);
  const full = structuredClone(s); full.items.kit = 8;
  code(() => act(full, 'item/craft', { itemId: 'kit', qty: 5 }, T0), 'stock_full');
  s = act(s, 'item/craft', { itemId: 'smoke' }, T0); s = act(s, 'item/craft', { itemId: 'boost' }, T0);
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  code(() => act(s, 'battle/action', { battleId: s.battle.id, action: 'kit' }, T0), 'invalid_action'); // корпус цел — расходник не тратится
  assert.equal(s.items.kit, 3);
  s.battle.squad[0].hp = 30;
  s = act(s, 'battle/action', { battleId: s.battle.id, action: 'kit' }, T0);
  assert.equal(s.items.kit, 2); assert.ok(s.battle.squad[0].hp > 30);
  s = act(s, 'battle/action', { battleId: s.battle.id, action: 'smoke' }, T0);
  assert.equal(s.items.smoke, 0);
  assert.ok(s.battle.log.slice(-3).join(' ').includes('дым'), 'дым сработал против атаки врага');
  code(() => act(s, 'battle/action', { battleId: s.battle.id, action: 'smoke' }, T0), 'no_item');
  s.battle.squad[0].energy = 0;
  s = act(s, 'battle/action', { battleId: s.battle.id, action: 'boost' }, T0);
  assert.equal(s.items.boost, 0);
  assert.ok(s.battle.squad[0].energy >= 1, 'форсаж восстановил энергию');
});

test('модули танков: нужен исследовательский центр, повышают характеристики, предел 5', () => {
  let s = rich(3); s.buildings.lab = 1;
  const before = buildView(s, T0).tanks.find((t) => t.id === 't34').stats;
  s = act(s, 'tank/module', { tankId: 't34', slot: 'gun' }, T0);
  code(() => act(s, 'tank/module', { tankId: 't34', slot: 'gun' }, T0), 'lab_level'); // нужен центр 2 уровня
  code(() => act(s, 'tank/module', { tankId: 't34', slot: 'zzz' }, T0), 'unknown_module');
  code(() => act(s, 'tank/module', { tankId: 'tiger', slot: 'gun' }, T0), 'not_owned');
  const after = buildView(s, T0).tanks.find((t) => t.id === 't34').stats;
  assert.ok(after.attack > before.attack && after.hp === before.hp);
  s.buildings.lab = 10;
  for (let i = 0; i < 4; i++) s = act(s, 'tank/module', { tankId: 't34', slot: 'gun' }, T0);
  code(() => act(s, 'tank/module', { tankId: 't34', slot: 'gun' }, T0), 'module_max');
  s = act(s, 'tank/module', { tankId: 't34', slot: 'armor' }, T0); s = act(s, 'tank/module', { tankId: 't34', slot: 'engine' }, T0);
  const v = buildView(s, T0).tanks.find((t) => t.id === 't34');
  assert.ok(v.stats.armor > before.armor && v.stats.mobility === before.mobility + 1);
  assert.equal(v.modules.find((m) => m.id === 'gun').level, 5);
  const poor = rich(3); poor.res.science = 0;
  code(() => act(poor, 'tank/module', { tankId: 't34', slot: 'gun' }, T0), 'no_resources');
});

test('событийные танки: нельзя произвести, выдаются за пропуск и недельные цели', () => {
  let s = rich(10);
  code(() => act(s, 'tank/produce', { tankId: 'ob279' }, T0), 'special_tank');
  assert.equal(buildConfig().tanks.find((t) => t.id === 'strv103').special.text.length > 5, true);
  // пропуск 30 уровня → Объект 279
  s.pass.xp = 3000;
  s = act(s, 'pass/claim', { level: 30 }, T0);
  assert.ok(s.tanks.ob279);
  // повторный сезон: танк уже есть — компенсация кредитами
  s.pass = { season: s.pass.season, xp: 3000, claimed: [] };
  const c = Math.floor(s.res.credits);
  s = act(s, 'pass/claim', { level: 30 }, T0);
  assert.ok(Math.floor(s.res.credits) >= c + 2000);
  // 4 недельные цели → Strv 103
  let w = rich(10);
  for (let i = 0; i < 4; i++) {
    const now = T0 + i * 7 * 86_400_000;
    w = E.settle(w, now); w.weekly.progress = D.WEEKLY_GOAL.wins;
    assert.equal(Boolean(w.tanks.strv103), false, `до ${i + 1}-й цели танка нет`);
    w = act(w, 'weekly/claim', {}, now);
  }
  assert.ok(w.tanks.strv103); assert.equal(w.tanks.strv103.modules.gun, 0);
});

test('клановая война: итоги недели, место в рейтинге, награда по лиге один раз и только за личный вклад', async () => {
  let s = rich(8);
  s = E.settle(s, T0); s.clan.points = 40;
  s = E.settle(s, T0 + 7 * 86_400_000); // новая неделя: очки ушли в «прошлую неделю»
  assert.equal(s.clan.prevPoints, 40);
  code(() => act(s, 'clan/war-claim', {}, T0 + 7 * 86_400_000), 'no_war');
  const now = T0 + 7 * 86_400_000;
  const c = Math.floor(s.res.credits);
  s = act(s, 'clan/war-claim', {}, now, { clanWar: { inClan: true, rank: 2 } });
  assert.equal(Math.floor(s.res.credits), c + D.warBand(2).reward.credits);
  code(() => act(s, 'clan/war-claim', {}, now, { clanWar: { inClan: true, rank: 1 } }), 'already_claimed');
  const lazy = E.settle(E.settle(rich(8), T0), now); lazy.clan.prevPoints = 3; lazy.clan.prevWeek = D.weekIndex(now) - 1;
  code(() => act(lazy, 'clan/war-claim', {}, now, { clanWar: { inClan: true, rank: 1 } }), 'not_done');
  assert.equal(D.warBand(1).name, '1 место'); assert.equal(D.warBand(7).name, 'Топ-10'); assert.equal(D.warBand(50).name, 'Участие');
});

test('API: рейтинги топ-100, клановая война, сводка владельца защищена токеном', async () => {
  const clock = { now: T0 };
  const store = createFileStore(null, { createState: (l, p) => createState(l, p, clock.now), summarize });
  const api = createGameApi({ store, clock: () => clock.now, rng: () => 0.5, log: { log() {} }, limiter: createRateLimiter({ max: 5000 }), adminToken: 'secret-token', getErrors: () => [{ msg: 'x' }],
    authenticate: (req) => (req.headers['x-id'] ? { id: String(req.headers['x-id']), firstName: 'Тест', username: '' } : null) });
  const call = (m, path, id, body = {}, headers = {}) => api({ method: m, headers: { ...(id ? { 'x-id': id } : {}), ...headers } }, new URL(`http://x${path}`), async () => body);
  for (const [id, nick, rating, best] of [['6001', 'Альфа', 1200, 7], ['6002', 'Браво', 1100, 12], ['6003', 'Чарли', 1000, 0]]) {
    await store.transact(id, {}, async (st) => { const n = structuredClone(st); n.nickname = nick; n.pvp.rating = rating; n.pvp.played = rating > 1000 ? 3 : 0; n.raid.best = best; n.xp = D.xpForLevel(6); return { state: n }; });
  }
  const pvp = await call('GET', '/api/game/top?kind=pvp', '6001');
  assert.deepEqual(pvp.body.rows.map((r) => r.nickname), ['Альфа', 'Браво']); assert.equal(pvp.body.me.rank, 1);
  const raid = await call('GET', '/api/game/top?kind=raid', '6001');
  assert.deepEqual(raid.body.rows.map((r) => r.nickname), ['Браво', 'Альфа']); assert.equal(raid.body.me.rank, 2);
  assert.equal((await call('GET', '/api/game/top?kind=raid', '6003')).body.me.rank, null, 'без результата места нет');
  assert.equal((await call('GET', '/api/game/top?kind=hack', '6001')).body.kind, 'pvp', 'неизвестный тип заменяется безопасным');
  // клан и война
  const cr = await call('POST', '/api/game/clan-create', '6001', { name: 'Альфа клан', tag: 'ALF' });
  assert.equal(cr.status, 200); assert.ok(cr.body.clan.war);
  assert.equal(cr.body.clan.war.liveRank, 1);
  assert.equal((await call('POST', '/api/game/clan/war-claim', '6001')).status, 400);
  // сводка владельца
  assert.equal((await call('GET', '/api/admin/stats', null)).status, 404);
  assert.equal((await call('GET', '/api/admin/stats', null, {}, { 'x-admin-token': 'wrong' })).status, 404);
  const ok = await call('GET', '/api/admin/stats', null, {}, { 'x-admin-token': 'secret-token' });
  assert.equal(ok.status, 200); assert.equal(ok.body.players.total, 3); assert.ok(ok.body.funnel && ok.body.retention && ok.body.recentErrors.length === 1);
  const off = createGameApi({ store, authenticate: () => null, limiter: () => true, adminToken: '' });
  assert.equal((await off(({ method: 'GET', headers: { 'x-admin-token': '' } }), new URL('http://x/api/admin/stats'), async () => ({}))).status, 404, 'без ADMIN_TOKEN маршрут отключён');
});
