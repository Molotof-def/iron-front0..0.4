import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../game/data.mjs';
import * as E from '../game/engine.mjs';
import { buildView } from '../game/view.mjs';
import { createState } from '../game/legacy.mjs';
import { createFileStore } from '../store/file-store.mjs';
import { createNotifier } from '../notifier.mjs';
import { createGameApi, summarize } from '../api.mjs';
import { createRateLimiter } from '../auth.mjs';

const T0 = Date.UTC(2026, 10, 23, 12); // понедельник
const act = (s, a, p, now, extra = {}) => E.perform(s, a, p, { now, rng: () => 0.5, ...extra });
const code = (fn, c) => assert.throws(fn, (e) => e instanceof E.GameError && e.code === c, `ожидалась ${c}`);
const mkStore = (clockRef) => createFileStore(null, { createState: (l, p) => createState(l, p, clockRef.now), summarize, qualifyLevel: 3 });

test('недельное событие: ротация по неделям, множитель наград только для своих типов', () => {
  const ids = new Set([0, 1, 2, 3].map((i) => D.eventForWeek(T0 + i * 7 * 86_400_000).id));
  assert.equal(ids.size, 4, 'за 4 недели показаны все события');
  assert.equal(D.eventForWeek(T0).id, D.eventForWeek(T0 + 3 * 86_400_000).id, 'внутри недели событие одно');
  assert.ok(D.weekEndsAt(T0) > T0 && D.weekEndsAt(T0) - T0 <= 7 * 86_400_000);
  // множитель: берём неделю с разведкой
  let day = T0; while (D.eventForWeek(day).id !== 'recon-week') day += 7 * 86_400_000;
  const run = (now, mission) => {
    let s = createState(null, {}, now); s.xp = D.xpForLevel(14); s.buildings.radar = 4;
    for (const k of D.RESOURCES) s.res[k] = 1e6;
    s = act(s, 'battle/start', { missionId: mission, squad: ['t34'] }, now);
    s.battle.status = 'won'; s.battle.turn = 9; s.battle.lost = 1; // фиксируем исход, чтобы сравнить только множитель
    s = E.perform(s, 'battle/claim', { battleId: s.battle.id }, { now, rng: () => 0.5 });
    return s;
  };
  // принудительно завершаем бой победой через публичный путь движка
  const finish = (now, mission) => {
    let s = createState(null, {}, now); for (const k of D.RESOURCES) s.res[k] = 1e6; s.xp = D.xpForLevel(14); s.buildings.radar = 4;
    s = act(s, 'battle/start', { missionId: mission, squad: ['t34'] }, now);
    s.battle.enemies.forEach((e) => { e.hp = 1; e.armor = 0; });
    let g = 0; while (s.battle.status === 'active' && g++ < 60) s = act(s, 'battle/action', { battleId: s.battle.id, action: s.battle.squad[s.battle.active].energy > 0 ? 'attack' : 'guard' }, now);
    return s.battle;
  };
  void run;
  const inEvent = finish(day, 'r1'); const outEvent = finish(day + 7 * 86_400_000, 'r1');
  assert.equal(inEvent.status, 'won'); assert.equal(outEvent.status, 'won');
  assert.equal(D.eventForWeek(day + 7 * 86_400_000).id === 'recon-week', false);
  assert.equal(inEvent.reward.event, true);
  assert.ok(inEvent.reward.credits > outEvent.reward.credits, 'награда в событии выше');
});

test('недельная цель: прогресс только за победы, награда один раз, сброс по неделям', () => {
  let s = createState(null, {}, T0);
  code(() => act(s, 'weekly/claim', {}, T0), 'not_done');
  s.weekly.progress = D.WEEKLY_GOAL.wins;
  const c = Math.floor(s.res.credits);
  s = act(s, 'weekly/claim', {}, T0);
  assert.equal(Math.floor(s.res.credits), c + D.WEEKLY_GOAL.reward.credits);
  code(() => act(s, 'weekly/claim', {}, T0), 'already_claimed');
  const next = E.settle(structuredClone(s), T0 + 8 * 86_400_000);
  assert.equal(next.weekly.progress, 0); assert.equal(next.weekly.claimed, false);
  assert.equal(buildView(createState(null, {}, T0), T0).weekly.goal, D.WEEKLY_GOAL.wins);
});

test('уведомления: берутся один раз, только о стройке/танках/исследованиях, учитывают выключатель', () => {
  let s = createState(null, {}, T0);
  s = act(s, 'build/start', { buildingId: 'factory' }, T0);
  s = act(s, 'research/start', { techId: 'arm1' }, T0);
  assert.equal(E.nextEventAt(s), Math.min(...[...s.buildQueue, ...s.researchQueue].map((q) => q.endsAt)));
  // игрок «ушёл»: таймеры завершились без него
  const later = E.settle(structuredClone(s), T0 + 24 * 3_600_000);
  const msgs = E.takeNotifications(later);
  assert.equal(msgs.length, 2);
  assert.ok(msgs.some((m) => m.startsWith('🏗')) && msgs.some((m) => m.startsWith('🔬')));
  assert.deepEqual(E.takeNotifications(later), [], 'повторно не отправляются');
  // события, увиденные игроком в игре, не дублируются сообщением
  const seen = act(structuredClone(s), 'profile/nickname', { nickname: 'Волк' }, T0 + 24 * 3_600_000);
  assert.deepEqual(E.takeNotifications(seen), []);
  // выключатель
  const off = act(createState(null, {}, T0), 'profile/notify', { enabled: false }, T0);
  assert.equal(off.notify.enabled, false);
  assert.equal(summarize(off).notifyEnabled, false);
  // игрок без поля notify (старое сохранение) не получает уведомления о прошлом
  const old = createState(null, {}, T0); delete old.notify; old.eventSeq = 5;
  assert.equal(E.settle(old, T0).notify.upTo, 5);
});

test('уведомитель: отправляет сообщение по завершении таймера, один раз; блокировку бота отключает', async () => {
  const clock = { now: T0 };
  const store = mkStore(clock);
  const sent = [];
  const notifier = createNotifier({ store, clock: () => clock.now, send: async (id, text) => { sent.push([id, text]); }, log: { error() {} } });
  // игрок с реальным (положительным) id начинает стройку
  await store.transact('1001', {}, async (st) => ({ state: act(st, 'build/start', { buildingId: 'factory' }, clock.now) }));
  assert.equal(await notifier.tick(), 0, 'до срока ничего не отправляется');
  clock.now += 24 * 3_600_000;
  assert.equal(await notifier.tick(), 1);
  assert.equal(sent.length, 1); assert.equal(sent[0][0], '1001'); assert.match(sent[0][1], /Завод/);
  assert.equal(await notifier.tick(), 0, 'повторно не шлёт');
  // dev-пользователь (отрицательный id) не получает сообщений
  await store.transact('-5', {}, async (st) => ({ state: act(st, 'build/start', { buildingId: 'factory' }, clock.now) }));
  clock.now += 24 * 3_600_000;
  assert.equal(await notifier.tick(), 0);
  // заблокированный бот: уведомления отключаются
  await store.transact('1002', {}, async (st) => ({ state: act(st, 'build/start', { buildingId: 'hangar' }, clock.now) }));
  clock.now += 24 * 3_600_000;
  const blocked = createNotifier({ store, clock: () => clock.now, send: async () => { throw new Error('Forbidden: bot was blocked by the user'); }, log: { error() {} } });
  assert.equal(await blocked.tick(), 0);
  const st = await store.transact('1002', {}, async (x) => ({ result: x.notify.enabled }));
  assert.equal(st, false);
});

test('рефералы: только новый игрок, не сам себя, засчёт после 3 уровня, награды один раз, вехи', async () => {
  const clock = { now: T0 };
  const store = mkStore(clock);
  const open = (id) => store.transact(id, {}, async (st) => ({ state: structuredClone(st) }));
  await open('2001'); // пригласивший
  assert.equal(await store.recordReferral('2001', '2001'), false, 'нельзя пригласить себя');
  assert.equal(await store.recordReferral('3001', '9999'), false, 'пригласившего не существует');
  assert.equal(await store.recordReferral('3001', '2001'), true);
  assert.equal(await store.recordReferral('3001', '2001'), false, 'повтор игнорируется');
  await open('3002'); // уже играл
  assert.equal(await store.recordReferral('3002', '2001'), false, 'существующий игрок не считается приглашённым');
  assert.equal(await store.referralOf('3001'), '2001');
  assert.deepEqual(await store.referralStats('2001'), { invited: 1, qualified: 0 });

  // приветственный бонус приглашённому — один раз
  let friend = createState(null, {}, T0);
  const c0 = Math.floor(friend.res.credits);
  assert.equal(E.applyReferralWelcome(friend, T0), true);
  assert.equal(E.applyReferralWelcome(friend, T0), false);
  assert.equal(Math.floor(friend.res.credits), c0 + D.REFERRAL.welcome.credits);

  // друг достигает 3 уровня → засчитан
  await store.transact('3001', {}, async (st) => { const n = structuredClone(st); n.xp = D.xpForLevel(3); return { state: n }; });
  assert.deepEqual(await store.referralStats('2001'), { invited: 1, qualified: 1 });

  // пригласивший забирает награду один раз
  let me = createState(null, {}, T0);
  code(() => act(me, 'referral/claim', {}, T0, { referral: { invited: 1, qualified: 0 } }), 'nothing_to_claim');
  const before = Math.floor(me.res.credits);
  me = act(me, 'referral/claim', {}, T0, { referral: { invited: 1, qualified: 1 } });
  assert.equal(Math.floor(me.res.credits), before + D.REFERRAL.perFriend.credits);
  code(() => act(me, 'referral/claim', {}, T0, { referral: { invited: 1, qualified: 1 } }), 'nothing_to_claim');
  // веха на 3 друзьях
  const b2 = Math.floor(me.res.credits);
  me = act(me, 'referral/claim', {}, T0, { referral: { invited: 3, qualified: 3 } });
  assert.equal(Math.floor(me.res.credits), b2 + 2 * D.REFERRAL.perFriend.credits + D.REFERRAL.milestones[0].reward.credits);
  assert.deepEqual(me.referral.milestones, [3]);
  // потолок учёта
  assert.equal(E.referralStatus(createState(null, {}, T0), { invited: 500, qualified: 500 }).qualified, D.REFERRAL.maxCounted);
});

test('API: реферальная ссылка, приветственный бонус и сквозная проверка через HTTP-слой', async () => {
  const clock = { now: T0 };
  const store = mkStore(clock);
  const api = createGameApi({ store, clock: () => clock.now, rng: () => 0.5, log: { log() {} }, limiter: createRateLimiter({ max: 1000 }), botUsername: () => 'iron_test_bot',
    authenticate: (req) => (req.headers['x-id'] ? { id: String(req.headers['x-id']), firstName: 'Тест', username: '' } : null) });
  const call = (m, path, id, body = {}) => api({ method: m, headers: { 'x-id': id } }, new URL(`http://x${path}`), async () => body);
  const a = await call('GET', '/api/game/state', '4001');
  assert.equal(a.body.view.referral.link, 'https://t.me/iron_test_bot?start=ref_4001');
  assert.equal((await call('GET', '/api/game/state', '-7')).body.view.referral.link, null, 'dev-пользователям ссылка не выдаётся');
  assert.equal(await store.recordReferral('4002', '4001'), true);
  const b = await call('GET', '/api/game/state', '4002');
  assert.equal(b.body.view.referral.welcomed, true);
  const credits = b.body.view.resources.credits;
  const b2 = await call('GET', '/api/game/state', '4002');
  assert.equal(b2.body.view.resources.credits, credits, 'бонус не повторяется');
  assert.equal((await call('POST', '/api/game/referral/claim', '4001')).status, 400, 'друг ещё не достиг нужного уровня');
  assert.equal(b.body.view.notify, true);
  assert.equal((await call('POST', '/api/game/profile/notify', '4002', { enabled: false })).body.view.notify, false);
});
