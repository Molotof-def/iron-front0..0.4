import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../game/data.mjs';
import * as E from '../game/engine.mjs';
import { buildView, buildConfig } from '../game/view.mjs';
import { createState, migrateLegacy } from '../game/legacy.mjs';

const T0 = Date.UTC(2026, 10, 20, 12, 0, 0);
const rngFixed = (v = 0.5) => () => v;
const act = (state, action, payload, now, extra = {}) => E.perform(state, action, payload, { now, rng: rngFixed(), ...extra });

test('каталог: целостность данных', () => {
  assert.equal(D.TANKS.length, 27);
  assert.equal(new Set(D.TANKS.map((t) => t.id)).size, D.TANKS.length);
  for (const cls of ['light', 'medium', 'heavy', 'td', 'arty']) assert.ok(D.TANKS.some((t) => t.class === cls), cls);
  for (const t of D.TECHS) { if (t.req) assert.ok(D.TECH_BY_ID[t.req], `req ${t.id}`); }
  for (const t of D.TANKS) { if (t.reqTech) assert.ok(D.TECH_BY_ID[t.reqTech], `tech ${t.id}`); }
  for (const m of D.MISSIONS) for (const e of m.enemies) assert.ok(D.TANK_BY_ID[e.tankId], `${m.id}:${e.tankId}`);
  assert.equal(Object.keys(D.BUILDINGS).length, 8);
  assert.equal(Object.keys(D.BRANCHES).length, 6);
  assert.deepEqual(new Set(D.MISSIONS.map((m) => m.type)), new Set(['recon', 'defense', 'capture', 'trial', 'boss']));
  const cfg = JSON.stringify(buildConfig());
  assert.ok(!cfg.includes('"enemies"'), 'конфиг не раскрывает составы врагов');
});

test('накопление ресурсов идёт по серверным меткам и ограничено складом', () => {
  const s = createState(null, {}, T0);
  const after1h = E.settle(structuredClone(s), T0 + 3_600_000);
  assert.ok(after1h.res.steel > s.res.steel + 29 && after1h.res.steel < s.res.steel + 31);
  assert.ok(after1h.res.credits > s.res.credits + 39);
  const capped = E.settle(structuredClone(s), T0 + 1000 * 3_600_000);
  assert.ok(capped.res.steel <= D.storageCaps(0).steel + 1e-6);
  assert.ok(capped.res.fuel <= D.storageCaps(0).fuel + 1e-6);
  // время не идёт назад
  const back = E.settle(structuredClone(after1h), T0);
  assert.equal(back.lastTick, after1h.lastTick);
});

test('строительство: таймер завершается только по серверному времени, офлайн-прогресс учитывается', () => {
  let s = createState(null, {}, T0);
  s = act(s, 'build/start', { buildingId: 'factory' }, T0);
  assert.equal(s.buildQueue.length, 1);
  const item = s.buildQueue[0];
  assert.ok(item.endsAt > T0);
  // слишком рано — уровень не меняется
  let early = E.settle(structuredClone(s), item.endsAt - 1000);
  assert.equal(early.buildings.factory, 1);
  // позже — готово; доход считается сегментами (до и после завершения)
  const late = E.settle(structuredClone(s), item.endsAt + 3_600_000);
  assert.equal(late.buildings.factory, 2);
  assert.equal(late.buildQueue.length, 0);
  const segBefore = 30 * ((item.endsAt - T0) / 3_600_000);
  const segAfter = 60 * 1;
  const spent = item.cost.steel;
  const expectedSteel = D.START_RESOURCES.steel - spent + segBefore + segAfter;
  assert.ok(Math.abs(late.res.steel - expectedSteel) < 0.01, `${late.res.steel} vs ${expectedSteel}`);
  assert.ok(late.events.some((e) => e.kind === 'build'));
});

const rich = (s) => { for (const k of D.RESOURCES) s.res[k] = 1_000_000; return s; };
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof E.GameError && e.code === code, `ожидалась ошибка ${code}`);

test('строительство: требования, очередь, ресурсы, отмена с возвратом 70%', () => {
  let s = createState(null, {}, T0);
  throwsCode(() => act(s, 'build/start', { buildingId: 'hq' }, T0), 'commander_level'); // штаб 2 требует командира 2
  throwsCode(() => act(s, 'build/start', { buildingId: 'radar' }, T0), 'hq_level'); // радар требует штаб 3
  throwsCode(() => act(s, 'build/start', { buildingId: 'nope' }, T0), 'unknown_building');
  s = act(s, 'build/start', { buildingId: 'hangar' }, T0);
  throwsCode(() => act(s, 'build/start', { buildingId: 'hangar' }, T0), 'already_building');
  throwsCode(() => act(s, 'build/start', { buildingId: 'factory' }, T0), 'no_slot'); // штаб 1 → одна очередь
  const q = s.buildQueue[0];
  const before = Math.floor(s.res.steel);
  const cancelled = act(s, 'build/cancel', { queueId: q.id }, T0);
  assert.equal(cancelled.buildQueue.length, 0);
  assert.equal(Math.floor(cancelled.res.steel), before + Math.floor(q.cost.steel * 0.7));
  throwsCode(() => act(cancelled, 'build/cancel', { queueId: q.id }, T0), 'not_found');
  const poor = createState(null, {}, T0); poor.res.steel = 0;
  throwsCode(() => act(poor, 'build/start', { buildingId: 'factory' }, T0), 'no_resources');
});

test('защита от дублей: повторный requestId отклоняется, исходное состояние не меняется', () => {
  const s = createState(null, {}, T0);
  const a = act(s, 'build/start', { buildingId: 'factory' }, T0, { requestId: 'req-aaaaaaaa-1' });
  throwsCode(() => act(a, 'build/start', { buildingId: 'lab' }, T0, { requestId: 'req-aaaaaaaa-1' }), 'duplicate_request');
  assert.equal(s.buildQueue.length, 0, 'perform не мутирует переданный объект');
});

test('производство и улучшение танков', () => {
  let s = rich(createState(null, {}, T0));
  throwsCode(() => act(s, 'tank/produce', { tankId: 't34' }, T0), 'owned');
  throwsCode(() => act(s, 'tank/produce', { tankId: 'abrams' }, T0), 'hangar_level');
  s = act(s, 'tank/produce', { tankId: 't70' }, T0);
  throwsCode(() => act(s, 'tank/produce', { tankId: 'sherman' }, T0), 'no_slot');
  const done = E.settle(structuredClone(s), s.produceQueue[0].endsAt + 1);
  assert.ok(done.tanks.t70);
  throwsCode(() => act(done, 'tank/produce', { tankId: 't70' }, s.produceQueue[0].endsAt + 1), 'owned');
  // улучшение: без учебного полигона предел — 3 уровень
  let u = act(done, 'tank/upgrade', { tankId: 't34' }, T0 + 10_000_000);
  assert.equal(u.tanks.t34.level, 2);
  u = act(u, 'tank/upgrade', { tankId: 't34' }, T0 + 10_000_000);
  assert.equal(u.tanks.t34.level, 3);
  throwsCode(() => act(u, 'tank/upgrade', { tankId: 't34' }, T0 + 10_000_000), 'tank_max');
  throwsCode(() => act(u, 'tank/upgrade', { tankId: 'abrams' }, T0 + 10_000_000), 'not_owned');
  u.buildings.training = 2;
  assert.equal(act(u, 'tank/upgrade', { tankId: 't34' }, T0 + 10_000_000).tanks.t34.level, 4);
});

test('исследования: зависимости, уровень лаборатории, очередь и бонусы', () => {
  let s = rich(createState(null, {}, T0));
  throwsCode(() => act(s, 'research/start', { techId: 'arm2' }, T0), 'prereq');
  s = act(s, 'research/start', { techId: 'arm1' }, T0);
  throwsCode(() => act(s, 'research/start', { techId: 'arm1' }, T0), 'in_progress');
  throwsCode(() => act(s, 'research/start', { techId: 'wpn1' }, T0), 'no_slot');
  const done = E.settle(structuredClone(s), s.researchQueue[0].endsAt);
  assert.deepEqual(done.researchDone, ['arm1']);
  assert.equal(E.bonusesOf(done).armorPct, 4);
  throwsCode(() => act(done, 'research/start', { techId: 'arm2' }, s.researchQueue[0].endsAt), 'lab_level'); // нужна лаборатория 3
  throwsCode(() => act(done, 'research/start', { techId: 'arm1' }, s.researchQueue[0].endsAt), 'done');
  // разблокировка техники исследованием
  const fresh = rich(createState(null, {}, T0)); fresh.buildings.hangar = 3; fresh.xp = D.xpForLevel(4);
  throwsCode(() => act(fresh, 'tank/produce', { tankId: 'panther' }, T0), 'tech');
  fresh.researchDone.push('arm1');
  assert.equal(act(fresh, 'tank/produce', { tankId: 'panther' }, T0).produceQueue.length, 1);
});

const playUntilDone = (state, now, policy) => {
  let s = state; let guard = 0;
  while (s.battle.status === 'active' && guard++ < 80) {
    const u = s.battle.squad[s.battle.active];
    const action = policy ? policy(s.battle) : (u.energy >= 1 ? 'attack' : 'guard');
    s = act(s, 'battle/action', { battleId: s.battle.id, action }, now);
  }
  return s;
};

test('бой: полный цикл — старт, расчёт на сервере, награда один раз', () => {
  let s = createState(null, {}, T0);
  const fuel0 = Math.floor(s.res.fuel);
  throwsCode(() => act(s, 'battle/start', { missionId: 'b1', squad: ['t34'] }, T0), 'commander_level');
  throwsCode(() => act(s, 'battle/start', { missionId: 'r1', squad: [] }, T0), 'squad_empty');
  throwsCode(() => act(s, 'battle/start', { missionId: 'r1', squad: ['tiger'] }, T0), 'not_owned');
  throwsCode(() => act(s, 'battle/start', { missionId: 'r1', squad: ['t34', 't34'] }, T0), 'squad_dup');
  throwsCode(() => act(s, 'battle/start', { missionId: 'r1', squad: ['t34', 't70', 'sherman'] }, T0), 'squad_size');
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  assert.equal(Math.floor(s.res.fuel), fuel0 - D.MISSION_BY_ID.r1.fuel);
  throwsCode(() => act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0), 'battle_active');
  throwsCode(() => act(s, 'battle/claim', { battleId: s.battle.id }, T0), 'battle_active');
  throwsCode(() => act(s, 'battle/action', { battleId: 'wrong', action: 'attack' }, T0), 'no_battle');
  throwsCode(() => act(s, 'battle/action', { battleId: s.battle.id, action: 'cheat' }, T0), 'invalid_action');
  s = playUntilDone(s, T0);
  assert.equal(s.battle.status, 'won');
  assert.ok(s.battle.reward.credits > 0);
  throwsCode(() => act(s, 'battle/action', { battleId: s.battle.id, action: 'attack' }, T0), 'battle_finished');
  throwsCode(() => act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0), 'claim_pending');
  const credits = Math.floor(s.res.credits); const xp = s.xp;
  const claimed = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  assert.equal(claimed.battle, null);
  assert.equal(Math.floor(claimed.res.credits), credits + s.battle.reward.credits);
  assert.equal(claimed.xp, xp + s.battle.reward.xp);
  assert.equal(claimed.stats.wins, 1);
  throwsCode(() => act(claimed, 'battle/claim', { battleId: s.battle.id }, T0), 'no_battle');
});

test('бой: первая победа даёт бонус, повторная — нет; отступление не даёт награды; недостаток энергии не тратит ход', () => {
  let s = createState(null, {}, T0);
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  s = playUntilDone(s, T0);
  assert.equal(s.battle.reward.firstClear, true);
  s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  // энергия: перерасход ремонта и залпа отклоняется без изменения боя
  s.battle.squad[0].energy = 0;
  const turn = s.battle.turn;
  throwsCode(() => act(s, 'battle/action', { battleId: s.battle.id, action: 'overdrive' }, T0), 'invalid_action');
  assert.equal(s.battle.turn, turn);
  s.battle.squad[0].energy = 3;
  s = playUntilDone(s, T0);
  assert.equal(s.battle.reward.firstClear, false);
  s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  s = act(s, 'battle/action', { battleId: s.battle.id, action: 'retreat' }, T0);
  assert.equal(s.battle.status, 'retreated');
  assert.equal(s.battle.reward.credits, 0);
  assert.equal(s.stats.losses, 1);
});

test('бой: итог зависит от характеристик (слабый отряд проигрывает сильному боссу)', () => {
  let s = rich(createState(null, {}, T0));
  s.xp = D.xpForLevel(8); s.buildings.radar = 2;
  s = act(s, 'battle/start', { missionId: 'b1', squad: ['t34'] }, T0);
  s = playUntilDone(s, T0);
  assert.equal(s.battle.status, 'lost');
  const lossReward = s.battle.reward;
  assert.ok(lossReward.credits < D.MISSION_BY_ID.b1.reward.credits * 0.3);
  assert.equal(lossReward.steel, 0);
});

test('операции: правила состава отряда в испытаниях', () => {
  let s = rich(createState(null, {}, T0));
  s.xp = D.xpForLevel(9); s.buildings.training = 4; s.buildings.radar = 2; s.buildings.hangar = 6;
  s.tanks.t70 = { level: 1 }; s.tanks.hellcat = { level: 1 };
  throwsCode(() => act(s, 'battle/start', { missionId: 't1', squad: ['t34'] }, T0), 'squad_class'); // только лёгкие
  throwsCode(() => act(s, 'battle/start', { missionId: 't2', squad: ['t34', 't70'] }, T0), 'squad_size'); // одиночка
  throwsCode(() => act(s, 'battle/start', { missionId: 't3', squad: ['t34', 'sherman'] }, T0), 'not_owned');
  s.tanks.sherman = { level: 1 };
  throwsCode(() => act(s, 'battle/start', { missionId: 't3', squad: ['t34', 'sherman'] }, T0), 'squad_mix'); // оба средние
  assert.ok(act(s, 'battle/start', { missionId: 't3', squad: ['t34', 't70'] }, T0).battle);
  assert.ok(act(s, 'battle/start', { missionId: 't1', squad: ['t70'] }, T0).battle);
});

test('операции: ограничение по ходам в захвате территории', () => {
  let s = rich(createState(null, {}, T0));
  s.xp = D.xpForLevel(3);
  s = act(s, 'battle/start', { missionId: 'c1', squad: ['t34'] }, T0);
  assert.equal(s.battle.turnLimit, 12);
  s = playUntilDone(s, T0, () => 'guard'); // только защита → время выйдет
  assert.equal(s.battle.status, 'lost');
});

test('суточные задания: три на день, прогресс на сервере, награда один раз, смена по суткам', () => {
  let s = createState(null, {}, T0);
  assert.equal(s.daily.quests.length, 3);
  assert.equal(new Set(s.daily.quests.map((q) => q.tpl)).size, 3);
  const again = createState(null, {}, T0);
  assert.deepEqual(s.daily.quests, again.daily.quests, 'детерминированно для игрока и дня');
  const q = s.daily.quests[0];
  throwsCode(() => act(s, 'quest/claim', { questId: q.id }, T0), 'not_done');
  q.progress = q.goal;
  const credits = Math.floor(s.res.credits);
  const claimed = act(s, 'quest/claim', { questId: q.id }, T0);
  assert.ok(Math.floor(claimed.res.credits) > credits);
  throwsCode(() => act(claimed, 'quest/claim', { questId: q.id }, T0), 'already_claimed');
  const nextDay = E.settle(structuredClone(claimed), E.nextDayAt(T0) + 1000);
  assert.notEqual(nextDay.daily.day, claimed.daily.day);
  assert.ok(nextDay.daily.quests.every((x) => !x.claimed && x.progress === 0));
});

test('достижения: нельзя получить без выполнения и дважды', () => {
  const s = createState(null, {}, T0);
  throwsCode(() => act(s, 'achievement/claim', { achievementId: 'first-blood' }, T0), 'not_done');
  s.stats.wins = 1;
  const c = act(s, 'achievement/claim', { achievementId: 'first-blood' }, T0);
  throwsCode(() => act(c, 'achievement/claim', { achievementId: 'first-blood' }, T0), 'already_claimed');
  throwsCode(() => act(c, 'achievement/claim', { achievementId: 'zzz' }, T0), 'not_found');
});

test('профиль: позывной проверяется', () => {
  const s = createState(null, {}, T0);
  assert.equal(act(s, 'profile/nickname', { nickname: '  Волк  Севера ' }, T0).nickname, 'Волк Севера');
  throwsCode(() => act(s, 'profile/nickname', { nickname: '<script>' }, T0), 'bad_nickname');
  throwsCode(() => act(s, 'profile/nickname', { nickname: 'a' }, T0), 'bad_nickname');
});

test('электроэнергия: дефицит снижает выработку завода', () => {
  const s = createState(null, {}, T0);
  const ok = E.powerOf(s); assert.equal(ok.efficiency, 1);
  s.buildings.factory = 10; s.buildings.lab = 10; s.buildings.radar = 10;
  const low = E.powerOf(s); assert.ok(low.efficiency < 1 && low.efficiency >= 0.25);
});

test('миграция старого сохранения v0.4.0 сохраняет прогресс', () => {
  const legacy = {
    version: 1, credits: 1234, steel: 777, science: 88, xp: 420, level: 3, activeTank: 'tiger',
    tanks: { t34: { owned: true, level: 4 }, tiger: { owned: true, level: 2 }, kv2: { owned: false, level: 1 }, ghost: { owned: true, level: 9 } },
    buildings: { hq: 3, hangar: 2, factory: 4, lab: 2, arsenal: 5 },
    research: ['composite', 'engine', 'unknown'], wins: 7, losses: 2, battles: 9, nickname: 'Старый Волк', history: [],
  };
  const s = createState(legacy, { firstName: 'Иван' }, T0);
  assert.equal(Math.floor(s.res.credits), 1234);
  assert.equal(Math.floor(s.res.steel), 777);
  assert.equal(s.xp, 420);
  assert.equal(s.tanks.t34.level, 4);
  assert.equal(s.tanks.tiger.level, 2);
  assert.ok(!s.tanks.kv2 && !s.tanks.ghost);
  assert.deepEqual(s.squad, ['tiger']);
  assert.equal(s.buildings.factory, 4);
  assert.equal(s.buildings.storage, 5, 'Арсенал → Склад');
  assert.equal(s.buildings.radar, 0);
  assert.ok(s.researchDone.includes('arm1') && s.researchDone.includes('arm2') && s.researchDone.includes('eng1'), 'зависимости достроены');
  assert.equal(s.stats.wins, 7);
  assert.equal(s.nickname, 'Старый Волк');
  assert.ok(s.legacy);
  assert.equal(createState({ version: 2 }, { firstName: 'Иван' }, T0).legacy, null, 'неизвестный формат не импортируется');
  // подделка огромных значений ограничена
  assert.ok(migrateLegacy({ version: 1, credits: 1e15, tanks: {}, buildings: {}, steel: NaN }, {}, T0).res.credits <= 1_000_000);
});

test('представление: не раскрывает состав врага без разведки, раскрывает по уровню радара', () => {
  const s = createState(null, {}, T0);
  let v = buildView(s, T0);
  const r1 = v.missions.find((m) => m.id === 'r1');
  assert.equal(r1.enemies[0].name, 'Неопознанная цель');
  s.buildings.radar = 1; v = buildView(s, T0);
  assert.equal(v.missions.find((m) => m.id === 'r1').enemies[0].name, 'Т-70');
  assert.equal(v.missions.find((m) => m.id === 'r1').enemies[0].hp, undefined);
  s.buildings.radar = 3; v = buildView(s, T0);
  assert.ok(v.missions.find((m) => m.id === 'r1').enemies[0].hp > 0);
  assert.ok(!JSON.stringify(v).includes('"seed"'));
  assert.equal(v.resources.credits, 650);
});

test('обучение: шаги проверяет сервер, награда один раз, ветераны и пропуск', () => {
  let s = createState(null, {}, T0);
  assert.equal(s.tutorial.step, 0);
  assert.equal(buildView(s, T0).tutorial.ready, true, 'приветственный шаг готов сразу');
  const c0 = Math.floor(s.res.credits);
  s = act(s, 'tutorial/claim', {}, T0);
  assert.equal(s.tutorial.step, 1);
  assert.equal(Math.floor(s.res.credits), c0 + D.TUTORIAL[0].reward.credits);
  throwsCode(() => act(s, 'tutorial/claim', {}, T0), 'tutorial_not_ready'); // шаг «стройка» не выполнен
  s = act(s, 'build/start', { buildingId: 'factory' }, T0);
  s = act(s, 'tutorial/claim', {}, T0);
  assert.equal(s.tutorial.step, 2);
  throwsCode(() => act(s, 'tutorial/claim', {}, T0), 'tutorial_not_ready');
  s = act(s, 'research/start', { techId: 'arm1' }, T0); s = act(s, 'tutorial/claim', {}, T0);
  s = act(s, 'tank/upgrade', { tankId: 't34' }, T0); s = act(s, 'tutorial/claim', {}, T0);
  throwsCode(() => act(s, 'tutorial/claim', {}, T0), 'tutorial_not_ready'); // нужна победа
  s = act(s, 'battle/start', { missionId: 'r1', squad: ['t34'] }, T0);
  s = playUntilDone(s, T0); s = act(s, 'battle/claim', { battleId: s.battle.id }, T0);
  s = act(s, 'tutorial/claim', {}, T0);
  const q = s.daily.quests[0]; q.progress = q.goal;
  s = act(s, 'quest/claim', { questId: q.id }, T0);
  s = act(s, 'tutorial/claim', {}, T0);
  assert.equal(s.tutorial.done, true);
  throwsCode(() => act(s, 'tutorial/claim', {}, T0), 'tutorial_done');
  // пропуск и ветераны
  const k = act(createState(null, {}, T0), 'tutorial/skip', {}, T0);
  assert.equal(k.tutorial.done, true);
  const old = createState(null, {}, T0); delete old.tutorial; old.stats.battles = 3;
  assert.equal(E.settle(old, T0).tutorial.done, true, 'существующий игрок с прогрессом не получает обучение');
  const fresh = createState(null, {}, T0); delete fresh.tutorial;
  assert.equal(E.settle(fresh, T0).tutorial.done, false);
  assert.equal(createState({ version: 1, tanks: {}, buildings: {}, credits: 5 }, {}, T0).tutorial.done, true, 'импорт старого сохранения');
});

test('ежедневный бонус: раз в сутки, серия растёт и сбрасывается', () => {
  let s = createState(null, {}, T0);
  assert.equal(buildView(s, T0).bonus.available, true);
  const c0 = Math.floor(s.res.credits);
  s = act(s, 'bonus/claim', {}, T0);
  assert.equal(Math.floor(s.res.credits), c0 + D.DAILY_BONUS[0].credits);
  throwsCode(() => act(s, 'bonus/claim', {}, T0 + 1000), 'already_claimed');
  const d2 = T0 + 86_400_000;
  assert.equal(buildView(s, d2).bonus.available, true);
  s = act(s, 'bonus/claim', {}, d2);
  assert.equal(s.bonus.streak, 2);
  const d5 = d2 + 3 * 86_400_000; // пропуск дней — серия сбрасывается
  assert.equal(buildView(s, d5).bonus.nextDay, 1);
  s = act(s, 'bonus/claim', {}, d5);
  assert.equal(s.bonus.streak, 1);
});
