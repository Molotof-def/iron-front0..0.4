import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../game/data.mjs';
import * as E from '../game/engine.mjs';
import { buildView, buildConfig } from '../game/view.mjs';
import { createState } from '../game/legacy.mjs';
import { createFileStore } from '../store/file-store.mjs';
import { createGameApi, summarize } from '../api.mjs';
import { createRateLimiter } from '../auth.mjs';

const T0 = Date.UTC(2026, 10, 23, 12); // понедельник, ноябрь
const act = (s, a, p, now, extra = {}) => E.perform(s, a, p, { now, rng: () => 0.5, ...extra });
const code = (fn, c) => assert.throws(fn, (e) => e instanceof E.GameError && e.code === c, `ожидалась ${c}`);
const fresh = (now = T0, level = 1) => { const s = createState(null, {}, now); s.xp = D.xpForLevel(level); for (const k of D.RESOURCES) s.res[k] = 1e6; return s; };
/** Доводит текущий бой до конца: слабеет противник, игрок атакует/защищается. */
const finish = (s, now, { weak = true } = {}) => {
  if (weak) s.battle.enemies.forEach((e) => { e.hp = 1; e.armor = 0; });
  let g = 0;
  while (s.battle.status === 'active' && g++ < 80) s = act(s, 'battle/action', { battleId: s.battle.id, action: s.battle.squad[s.battle.active].energy > 0 ? 'attack' : 'guard' }, now);
  return s;
};

test('звания командира', () => {
  assert.equal(D.rankFor(1), 'Рядовой'); assert.equal(D.rankFor(5), 'Младший сержант'); assert.equal(D.rankFor(50), 'Генерал армии');
  assert.equal(buildView(fresh(T0, 12), T0).commander.rank, 'Прапорщик');
});

test('экипаж: опыт за бой, очки, навыки, предел рангов, сброс и влияние на бой', () => {
  let s = fresh(T0, 3);
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  s = finish(s, T0); s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  assert.equal(s.tanks.t34.xp, D.CREW.xpWin);
  code(() => act(s, 'tank/skill', { tankId: 't34', skill: 'gunnery' }, T0), 'no_points');
  s.tanks.t34.xp = 500; // 5 очков
  const before = buildView(s, T0).tanks.find((t) => t.id === 't34').stats.attack;
  s = act(s, 'tank/skill', { tankId: 't34', skill: 'gunnery' }, T0);
  s = act(s, 'tank/skill', { tankId: 't34', skill: 'gunnery' }, T0);
  assert.equal(s.tanks.t34.skills.gunnery, 2);
  const after = buildView(s, T0).tanks.find((t) => t.id === 't34').stats.attack;
  assert.ok(after > before, 'навык повышает огневую мощь в характеристиках');
  code(() => act(s, 'tank/skill', { tankId: 't34', skill: 'evasion' }, T0), 'unknown_skill'); // навык лёгких, а Т-34 средний
  code(() => act(s, 'tank/skill', { tankId: 'tiger', skill: 'gunnery' }, T0), 'not_owned');
  s = act(s, 'tank/skill', { tankId: 't34', skill: 'allround' }, T0);
  for (let i = 0; i < 2; i++) s = act(s, 'tank/skill', { tankId: 't34', skill: 'medic' }, T0);
  code(() => act(s, 'tank/skill', { tankId: 't34', skill: 'driver' }, T0), 'no_points'); // 5 очков потрачено
  // навык в бою: юнит получает повышенную атаку
  const w = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  assert.equal(w.battle.squad[0].attack, after);
  // особый навык класса
  const l = fresh(T0, 3); l.tanks.t70 = { level: 1, xp: 300, skills: {} };
  const lv = act(l, 'tank/skill', { tankId: 't70', skill: 'evasion' }, T0);
  assert.equal(E.crewEffects(lv, 't70').evadeBonus, 0.02);
  // сброс стоит кредитов и возвращает очки
  const credits = Math.floor(s.res.credits);
  s = act(s, 'tank/respec', { tankId: 't34' }, T0);
  assert.equal(Math.floor(s.res.credits), credits - 5 * D.CREW.respecPerPoint);
  assert.equal(E.crewInfo(s.tanks.t34, 'medium').free, 5);
  code(() => act(s, 'tank/respec', { tankId: 't34' }, T0), 'nothing_to_reset');
});

test('сезонный пропуск: опыт от боёв и заданий, награды один раз, открывает косметику', () => {
  let s = fresh(T0, 3);
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0); s = finish(s, T0);
  assert.equal(s.pass.xp, D.PASS.xp.win);
  s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  code(() => act(s, 'pass/claim', { level: 1 }, T0), 'not_done');
  s.pass.xp = 250;
  assert.equal(E.passLevel(s), 2);
  const c = Math.floor(s.res.credits);
  s = act(s, 'pass/claim', { level: 1 }, T0);
  assert.equal(Math.floor(s.res.credits), c + D.PASS_REWARDS[0].reward.credits);
  code(() => act(s, 'pass/claim', { level: 1 }, T0), 'already_claimed');
  code(() => act(s, 'pass/claim', { level: 3 }, T0), 'not_done');
  code(() => act(s, 'pass/claim', { level: 99 }, T0), 'not_found');
  assert.equal(buildView(s, T0).cosmetics.camos.find((x) => x.id === 'night').unlocked, false);
  s.pass.xp = 1000; // 10 уровень
  assert.equal(buildView(s, T0).cosmetics.camos.find((x) => x.id === 'night').unlocked, true);
});

test('косметика: нельзя надеть неоткрытое, надетое попадает в защитный отряд', () => {
  let s = fresh(T0, 3);
  code(() => act(s, 'cosmetic/equip', { tankId: 't34', camo: 'gold', emblem: 'none' }, T0), 'locked');
  code(() => act(s, 'cosmetic/equip', { tankId: 't34', camo: 'zzz', emblem: 'none' }, T0), 'unknown_cosmetic');
  code(() => act(s, 'cosmetic/equip', { tankId: 'tiger', camo: 'default', emblem: 'none' }, T0), 'not_owned');
  s.xp = D.xpForLevel(10);
  s = act(s, 'cosmetic/equip', { tankId: 't34', camo: 'forest', emblem: 'none' }, T0);
  assert.equal(E.settle(structuredClone(s), T0).pvp.defense[0].camo, 'forest');
  assert.deepEqual(buildView(s, T0).tanks.find((t) => t.id === 't34').cosmetic, { camo: 'forest', emblem: 'none' });
});

test('дуэли: бот, жетоны, рейтинг, награда один раз, нельзя во время другого боя', () => {
  let s = fresh(T0, 3);
  const v0 = buildView(s, T0).pvp;
  assert.equal(v0.rating, 1000); assert.equal(v0.ticketsLeft, D.PVP.dailyTickets); assert.ok(v0.defense.length >= 1 && v0.power > 0);
  const bot = E.makeBot(s, 1, T0);
  assert.deepEqual(bot, E.makeBot(s, 1, T0), 'бот детерминирован');
  code(() => act(fresh(T0, 1), 'pvp/start', { opponentId: 'bot:0', squad: ['t34'] }, T0), 'commander_level');
  code(() => act(s, 'pvp/start', { opponentId: 'bot:9', squad: ['t34'] }, T0), 'bad_opponent');
  code(() => act(s, 'pvp/start', { opponentId: 'bot:0', squad: ['tiger'] }, T0), 'not_owned');
  s = act(s, 'pvp/start', { opponentId: 'bot:0', squad: ['t34'] }, T0);
  assert.equal(s.pvp.used, 1); assert.ok(s.battle.pvp.opponent.bot);
  code(() => act(s, 'pvp/start', { opponentId: 'bot:1', squad: ['t34'] }, T0), 'battle_active');
  s = finish(s, T0);
  assert.equal(s.battle.status, 'won');
  const rating = s.pvp.rating;
  assert.ok(rating > 1000, 'победа повышает рейтинг');
  assert.equal(s.battle.reward.rating, rating - 1000);
  const c = Math.floor(s.res.credits);
  s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  assert.equal(Math.floor(s.res.credits), c + Math.round(D.PVP.win.credits * D.PVP.botMul));
  assert.equal(s.pvp.wins, 1); assert.equal(s.stats.wins, 0, 'дуэль не считается победой в операциях');
  assert.equal(s.weekly.progress, 0, 'дуэль не идёт в недельную цель');
  // жетоны заканчиваются
  for (let i = 1; i < D.PVP.dailyTickets; i++) { s = act(s, 'pvp/start', { opponentId: 'bot:0', squad: ['t34'] }, T0); s = finish(s, T0, { weak: false }); s = act(s, 'battle/claim', { battleId: s.battle.id }, T0); }
  code(() => act(s, 'pvp/start', { opponentId: 'bot:0', squad: ['t34'] }, T0), 'no_tickets');
  s = E.settle(structuredClone(s), T0 + 86_400_000);
  assert.equal(s.pvp.used, 0, 'жетоны обновляются каждые сутки');
});

test('дуэли с игроком: окно рейтинга, повтор запрещён, поражение снижает рейтинг, отступление — поражение', () => {
  let s = fresh(T0, 3);
  const opp = { id: '777', nickname: 'Иван', level: 5, rating: 1000, defense: [{ tankId: 'tiger', level: 8, hp: 400, attack: 80, armor: 60, mobility: 18, camo: 'default', emblem: 'none' }] };
  code(() => act(s, 'pvp/start', { opponentId: '777', squad: ['t34'] }, T0), 'bad_opponent'); // нет данных соперника от сервера
  code(() => act(s, 'pvp/start', { opponentId: '777', squad: ['t34'] }, T0, { opponent: { ...opp, rating: 1600 } }), 'bad_opponent');
  code(() => act(s, 'pvp/start', { opponentId: '888', squad: ['t34'] }, T0, { opponent: opp }), 'bad_opponent'); // подмена id
  s = act(s, 'pvp/start', { opponentId: '777', squad: ['t34'] }, T0, { opponent: opp });
  assert.equal(s.battle.enemies[0].hp, 400);
  s = finish(s, T0, { weak: false });
  assert.equal(s.battle.status, 'lost');
  assert.ok(s.pvp.rating < 1000); assert.equal(s.battle.reward.credits, D.PVP.loss.credits);
  s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  code(() => act(s, 'pvp/start', { opponentId: '777', squad: ['t34'] }, T0, { opponent: opp }), 'recent_opponent');
  // отступление
  const other = { ...opp, id: '778' };
  s = act(s, 'pvp/start', { opponentId: '778', squad: ['t34'] }, T0, { opponent: other });
  s = act(s, 'battle/action', { battleId: s.battle.id, action: 'retreat' }, T0);
  assert.equal(s.pvp.losses, 2);
});

test('сезоны рейтинга: смена месяца, мягкий сброс, награда по лиге один раз', () => {
  let s = fresh(T0, 3);
  s.pvp.rating = 1350; s.pvp.played = 5; s.pvp.wins = 4; s.pass.xp = 500;
  code(() => act(s, 'pvp/season-claim', {}, T0), 'nothing_to_claim');
  const next = Date.UTC(2026, 11, 2, 10); // декабрь
  s = E.settle(s, next);
  assert.equal(s.pvp.season, '2026-12');
  assert.equal(s.pvp.rating, 1000 + 175, 'сброс: половина прироста сохраняется');
  assert.equal(s.pvp.prev.tier, 'gold'); assert.equal(s.pvp.prev.claimed, false);
  assert.equal(s.pass.xp, 0, 'пропуск нового сезона начинается заново');
  const c = Math.floor(s.res.credits);
  s = act(s, 'pvp/season-claim', {}, next);
  assert.equal(Math.floor(s.res.credits), c + D.PVP_TIERS.find((t) => t.id === 'gold').reward.credits);
  code(() => act(s, 'pvp/season-claim', {}, next), 'nothing_to_claim');
  const idle = E.settle(fresh(T0, 3), next); // не играл в дуэли — награды нет
  assert.equal(idle.pvp.prev.claimed, true);
  assert.equal(D.seasonTitle('2026-11'), 'Ноябрь 2026');
});

test('клановые очки и награда: нужен клан и выполненная цель, один раз за неделю', () => {
  let s = fresh(T0, 6);
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0); s = finish(s, T0); s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  assert.equal(s.clan.points, D.CLAN.points.recon);
  code(() => act(s, 'clan/claim', {}, T0), 'no_clan');
  code(() => act(s, 'clan/claim', {}, T0, { clan: { inClan: true, total: 10, members: 3 } }), 'not_done');
  const c = Math.floor(s.res.credits);
  s = act(s, 'clan/claim', {}, T0, { clan: { inClan: true, total: D.clanGoal(3), members: 3 } });
  assert.equal(Math.floor(s.res.credits), c + D.CLAN.reward.credits);
  code(() => act(s, 'clan/claim', {}, T0, { clan: { inClan: true, total: 99999, members: 3 } }), 'already_claimed');
  s = E.settle(structuredClone(s), T0 + 8 * 86_400_000);
  assert.equal(s.clan.points, 0, 'очки сбрасываются каждую неделю');
});

test('хранилище: кланы — создание, вступление, лимит, выход, передача лидерства', async () => {
  const clock = { now: T0 };
  const store = createFileStore(null, { createState: (l, p) => createState(l, p, clock.now), summarize });
  for (const id of ['11', '12', '13']) await store.transact(id, {}, async (st) => ({ state: structuredClone(st) }));
  const id = await store.clanCreate('11', 'Стальной кулак', 'SK');
  await assert.rejects(() => store.clanCreate('12', 'стальной КУЛАК', 'XX'), /заняты/);
  await assert.rejects(() => store.clanCreate('12', 'Другой', 'sk'), /заняты/);
  await assert.rejects(() => store.clanCreate('11', 'Ещё один', 'EO'), /заняты/, 'нельзя состоять в двух кланах');
  await store.clanJoin('12', id, 2);
  await assert.rejects(() => store.clanJoin('13', id, 2), /нет свободных мест/);
  await assert.rejects(() => store.clanJoin('12', id, 5), /уже состоите/);
  assert.equal((await store.clanInfo(id, 0)).members.length, 2);
  assert.equal((await store.clanList(0, 'стальной'))[0].members, 2);
  await store.clanLeave('11');
  assert.equal((await store.clanInfo(id, 0)).leader, '12', 'лидерство перешло участнику');
  await store.clanLeave('12');
  assert.equal(await store.clanInfo(id, 0), null, 'пустой клан удалён');
  await assert.rejects(() => store.clanLeave('12'), /не состоите/);
});

test('API: клан, дуэли и безопасность через HTTP-слой', async () => {
  const clock = { now: T0 };
  const store = createFileStore(null, { createState: (l, p) => createState(l, p, clock.now), summarize });
  const api = createGameApi({ store, clock: () => clock.now, rng: () => 0.5, log: { log() {} }, limiter: createRateLimiter({ max: 5000 }),
    authenticate: (req) => (req.headers['x-id'] ? { id: String(req.headers['x-id']), firstName: 'Тест', username: '' } : null) });
  const call = (m, path, id, body = {}) => api({ method: m, headers: { 'x-id': id } }, new URL(`http://x${path}`), async () => body);
  // повышаем игроков до 5 уровня
  for (const id of ['5001', '5002']) await store.transact(id, {}, async (st) => { const n = structuredClone(st); n.xp = D.xpForLevel(6); return { state: n }; });
  assert.equal((await call('POST', '/api/game/clan-create', '5003', { name: 'Тест', tag: 'TT' })).status, 400, 'нужен 5 уровень');
  assert.equal((await call('POST', '/api/game/clan-create', '5001', { name: '<b>', tag: 'TT' })).status, 400);
  assert.equal((await call('POST', '/api/game/clan-create', '5001', { name: 'Волки', tag: 'T' })).status, 400);
  const created = await call('POST', '/api/game/clan-create', '5001', { name: 'Волки Фронта', tag: 'WLF' });
  assert.equal(created.status, 200); assert.equal(created.body.clan.name, 'Волки Фронта');
  assert.ok(created.body.clan.members[0].me && created.body.clan.members[0].leader);
  assert.ok(!JSON.stringify(created.body).includes('"5001"'), 'идентификаторы игроков не раскрываются');
  assert.equal((await call('GET', '/api/game/clan?q=вол', '5002')).body.list.length, 1);
  assert.equal((await call('POST', '/api/game/clan-join', '5002', { clanId: created.body.clan.id })).body.clan.members.length, 2);
  assert.equal((await call('POST', '/api/game/clan-join', '5002', { clanId: 'abc' })).status, 400);
  assert.equal((await call('POST', '/api/game/clan/claim', '5001')).status, 400, 'цель не выполнена');
  // дуэли
  const list = await call('GET', '/api/game/pvp/opponents', '5001');
  assert.equal(list.status, 200); assert.ok(list.body.opponents.length >= 2 && list.body.opponents.length <= 5);
  assert.ok(list.body.opponents.some((o) => o.bot));
  assert.ok(list.body.opponents.every((o) => o.units.length >= 1 && o.power > 0));
  const real = list.body.opponents.find((o) => !o.bot);
  assert.ok(real && real.id === '5002', 'другой игрок попал в подбор');
  const started = await call('POST', '/api/game/pvp/start', '5001', { opponentId: real.id, squad: ['t34'] });
  assert.equal(started.status, 200); assert.equal(started.body.view.battle.pvp.opponent.nickname.length > 0, true);
  const bad = await call('POST', '/api/game/pvp/start', '5002', { opponentId: '999999', squad: ['t34'] });
  assert.equal(bad.status, 400, 'несуществующий соперник');
  const noOpp = await call('GET', '/api/game/state', '5001');
  assert.equal(noOpp.body.view.pvp.ticketsLeft, D.PVP.dailyTickets - 1);
  assert.ok(buildConfig().ranks.length > 10 && buildConfig().skills.td.length === 6);
});

test('напоминания бота: топливо, бонус, событие недели — по включённым типам, только активным игрокам', () => {
  const mk = () => { const s = createState(null, {}, T0); return s; };
  // выключено по умолчанию: никаких лишних напоминаний
  let s = mk(); s.notify.types = { builds: true, fuel: false, bonus: false, event: false };
  assert.equal(E.nextEventAt(s), null);
  // бонус: напоминание в 16:00 UTC, если бонус не забран
  s = mk(); s.notify.types.bonus = true;
  assert.equal(E.nextEventAt(s), Date.UTC(2026, 10, 23, 16));
  let late = E.settle(structuredClone(s), Date.UTC(2026, 10, 23, 17));
  late.notify.lastSeen = Date.UTC(2026, 10, 23, 12);
  assert.ok(E.takeNotifications(late, Date.UTC(2026, 10, 23, 17)).some((l) => l.includes('бонус')));
  assert.deepEqual(E.takeNotifications(late, Date.UTC(2026, 10, 23, 17, 1)), [], 'дважды в сутки не напоминаем');
  assert.ok(E.nextEventAt(late) === null || E.nextEventAt(late) > Date.UTC(2026, 10, 24, 0), 'не остаётся «вечно просроченным»');
  // бонус забран — напоминать не нужно
  const claimed = act(mk(), 'bonus/claim', {}, T0); claimed.notify.types.bonus = true;
  assert.equal(E.nextEventAt(claimed), null);
  // неактивный игрок не получает напоминаний
  const idle = mk(); idle.notify.types.bonus = true; idle.notify.lastSeen = T0 - 10 * 86_400_000;
  assert.equal(E.nextEventAt(idle), null);
  // топливо
  let f = mk(); f.notify.types.fuel = true; f.res.fuel = 10; f.notify.mark.fuelSent = false;
  const eta = E.nextEventAt(f);
  assert.ok(eta > T0 && eta < T0 + 24 * 3_600_000);
  const full = E.settle(structuredClone(f), eta + 1000); full.notify.lastSeen = eta;
  assert.ok(E.takeNotifications(full, eta + 1000).some((l) => l.includes('Топливо')));
  assert.deepEqual(E.takeNotifications(full, eta + 2000), []);
  // событие недели: новая неделя → сообщение в понедельник 08:00
  let ev = mk(); ev.notify.types.event = true;
  const nextMonday = D.weekEndsAt(T0);
  assert.equal(E.nextEventAt(E.settle(structuredClone(ev), nextMonday - 1000)) === null, true, 'в текущей неделе уже учтено');
  ev = E.settle(ev, nextMonday + 9 * 3_600_000); ev.notify.lastSeen = nextMonday;
  assert.ok(E.takeNotifications(ev, nextMonday + 9 * 3_600_000).some((l) => l.includes('Событие недели')));
  // переключатели типов
  const t = act(mk(), 'profile/notify', { types: { fuel: true, bonus: true, junk: true } }, T0);
  assert.equal(t.notify.types.fuel, true); assert.equal(t.notify.types.bonus, true); assert.equal(t.notify.types.junk, undefined);
});
