// Серверный игровой движок IRON FRONT.
// Все важные операции выполняются здесь над сохранённым состоянием игрока.
// Время считается только по серверным меткам: клиентские часы не используются.
import * as D from './data.mjs';
import * as B from './battle.mjs';

export const SCHEMA_VERSION = 1;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const RECENT_LIMIT = 30;

export class GameError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message, status) => { throw new GameError(code, message, status); };

export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const nextDayAt = (ms) => (Math.floor(ms / DAY) + 1) * DAY;

// ---------- Создание состояния ----------
export function newPlayer(now, nickname = 'Командир') {
  return {
    schemaVersion: SCHEMA_VERSION, createdAt: now, nickname, xp: 0,
    res: { ...D.START_RESOURCES }, lastTick: now,
    buildings: Object.fromEntries(D.BUILDING_ORDER.map((id) => [id, D.BUILDINGS[id].startLevel])),
    buildQueue: [], produceQueue: [], researchDone: [], researchQueue: [],
    tanks: { [D.STARTER_TANK]: { level: 1 } }, squad: [D.STARTER_TANK],
    battle: null, missionClears: {},
    stats: { battles: 0, wins: 0, losses: 0, built: 0, researched: 0, upgrades: 0, produced: 0, bossWins: 0, questsClaimed: 0 },
    tutorial: { step: 0, done: false }, bonus: { lastDay: '', streak: 0 },
    daily: { day: '', quests: [] }, achievementsClaimed: [],
    events: [], eventSeq: 0, idSeq: 1, recent: [], legacy: null,
  };
}

// ---------- Производные величины ----------
const BONUS_KEYS = ['armorPct', 'attackPct', 'hpPct', 'mobilityFlat', 'buildSpeed', 'tankTimePct', 'steelPct', 'scrapPct',
  'creditPct', 'fuelRegenPct', 'storagePct', 'sciencePct', 'xpPct', 'powerFlat', 'fuelCostPct', 'rewardPct'];
export function bonusesOf(state) {
  const b = Object.fromEntries(BONUS_KEYS.map((k) => [k, 0]));
  for (const id of state.researchDone) {
    const t = D.TECH_BY_ID[id];
    if (t) for (const [k, v] of Object.entries(t.effect)) b[k] += v;
  }
  return b;
}
export function powerOf(state, bonuses = bonusesOf(state)) {
  const produced = D.powerProduced(state.buildings.hq, bonuses.powerFlat);
  const used = D.powerUsed(state.buildings);
  const efficiency = used <= produced ? 1 : Math.max(0.25, produced / used);
  return { produced, used, efficiency };
}
export const commanderLevel = (state) => D.levelFromXp(state.xp);
export const capsOf = (state, bonuses = bonusesOf(state)) => D.storageCaps(state.buildings.storage, bonuses.storagePct);
export const ratesOf = (state, bonuses = bonusesOf(state)) => D.hourlyRates(state.buildings, bonuses, powerOf(state, bonuses).efficiency);
const floorRes = (state, k) => Math.floor(state.res[k] + 1e-9);

export const buildDurationMs = (state, id, toLevel, ts = 1, bonuses = bonusesOf(state)) => {
  const speed = 1 + bonuses.buildSpeed / 100 + 0.03 * (state.buildings.hq - 1);
  return Math.max(5, Math.round(D.buildTime(id, toLevel) / speed / ts)) * 1000;
};
export const produceDurationMs = (state, def, ts = 1, bonuses = bonusesOf(state)) =>
  Math.max(5, Math.round(def.time * Math.max(0.4, 1 + bonuses.tankTimePct / 100) / ts)) * 1000;
export const researchDurationMs = (state, tech, ts = 1) =>
  Math.max(5, Math.round(tech.time / (1 + 0.04 * (state.buildings.lab - 1)) / ts)) * 1000;

// ---------- Журнал, опыт, награды ----------
export function pushEvent(state, kind, text, at) {
  state.eventSeq += 1;
  state.events.unshift({ id: state.eventSeq, t: at, kind, text });
  if (state.events.length > D.EVENT_LIMIT) state.events.length = D.EVENT_LIMIT;
}
const nextId = (state) => `q${state.idSeq++}`;

export function addXp(state, amount, at) {
  if (!(amount > 0)) return;
  const before = commanderLevel(state);
  state.xp += Math.floor(amount);
  const after = commanderLevel(state);
  if (after > before) pushEvent(state, 'level', `Уровень командира повышен до ${after}.`, at);
}
export function giveReward(state, reward, at) {
  for (const k of D.RESOURCES) if (reward[k] > 0) state.res[k] += reward[k];
  if (reward.xp > 0) addXp(state, reward.xp, at);
}
const canAfford = (state, cost) => Object.entries(cost).every(([k, v]) => !(v > 0) || floorRes(state, k) >= v);
const spend = (state, cost) => { for (const [k, v] of Object.entries(cost)) if (v > 0) state.res[k] -= v; };
const costText = (cost) => Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${RES_NAME[k]}`).join(', ');
const RES_NAME = { credits: 'кредитов', scrap: 'металлолома', steel: 'стали', fuel: 'топлива', science: 'научных данных' };
const missing = (state, cost) => {
  const miss = {};
  for (const [k, v] of Object.entries(cost)) if (v > 0 && floorRes(state, k) < v) miss[k] = v - floorRes(state, k);
  return miss;
};

// ---------- Суточные задания ----------
function seededRng(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function ensureDaily(state, now) {
  const key = dayKey(now);
  if (state.daily.day === key) return;
  const rng = seededRng(`${state.createdAt}:${key}`);
  const lvl = commanderLevel(state);
  const pool = D.QUEST_TEMPLATES.filter((q) => !q.minLevel || lvl >= q.minLevel);
  const picked = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  state.daily = {
    day: key,
    quests: picked.map((q) => ({ id: `${key}:${q.tpl}`, tpl: q.tpl, goal: q.goals[Math.floor(rng() * q.goals.length)], progress: 0, claimed: false })),
  };
}
const track = (state, tpl, n = 1) => {
  for (const q of state.daily.quests) if (q.tpl === tpl) q.progress = Math.min(q.goal, q.progress + n);
};
export const questTemplate = (tpl) => D.QUEST_TEMPLATES.find((q) => q.tpl === tpl);

// ---------- Миграция формата состояния «на лету» ----------
function ensureProgress(state) {
  state.stats.questsClaimed ??= 0;
  state.bonus ??= { lastDay: '', streak: 0 };
  if (!state.tutorial) {
    const veteran = Boolean(state.legacy) || state.stats.battles > 0 || state.stats.built > 0;
    state.tutorial = { step: veteran ? D.TUTORIAL.length : 0, done: veteran };
  }
}

// ---------- Обучение ----------
/** Выполнено ли условие текущего шага обучения. Проверяется только по серверному состоянию. */
export function tutorialReady(state) {
  const t = state.tutorial;
  if (!t || t.done) return false;
  const st = state.stats;
  switch (D.TUTORIAL[t.step]?.id) {
    case 'welcome': return true;
    case 'build': return st.built > 0 || state.buildQueue.length > 0;
    case 'research': return state.researchDone.length > 0 || state.researchQueue.length > 0;
    case 'tank': return st.produced > 0 || st.upgrades > 0 || state.produceQueue.length > 0;
    case 'battle': return st.wins > 0;
    case 'quest': return st.questsClaimed > 0;
    default: return false;
  }
}

// ---------- Таймеры и накопление ----------
function accrue(state, from, to) {
  if (to <= from) return;
  const hours = (to - from) / HOUR;
  const bonuses = bonusesOf(state);
  const rates = ratesOf(state, bonuses);
  const caps = capsOf(state, bonuses);
  state.res.credits += rates.credits * hours;
  state.res.science += rates.science * hours;
  for (const k of ['steel', 'scrap', 'fuel']) {
    if (state.res[k] < caps[k]) state.res[k] = Math.min(caps[k], state.res[k] + rates[k] * hours);
  }
}
function completeItem(state, item) {
  if (item.kind === 'build') {
    state.buildings[item.building] = item.toLevel;
    state.stats.built += 1;
    pushEvent(state, 'build', `${D.BUILDINGS[item.building].name}: уровень ${item.toLevel} готов.`, item.endsAt);
  } else if (item.kind === 'produce') {
    state.tanks[item.tankId] = { level: 1 };
    state.stats.produced += 1;
    pushEvent(state, 'produce', `Танк «${D.TANK_BY_ID[item.tankId].name}» выпущен и поступил в ангар.`, item.endsAt);
  } else if (item.kind === 'research') {
    state.researchDone.push(item.techId);
    state.stats.researched += 1;
    pushEvent(state, 'research', `Исследование «${D.TECH_BY_ID[item.techId].name}» завершено.`, item.endsAt);
  }
}
/** Доводит состояние до момента now: выполняет завершённые таймеры и накапливает ресурсы по сегментам. */
export function settle(state, now) {
  if (now < state.lastTick) now = state.lastTick;
  const due = [
    ...state.buildQueue.map((i) => ({ ...i, kind: 'build' })),
    ...state.produceQueue.map((i) => ({ ...i, kind: 'produce' })),
    ...state.researchQueue.map((i) => ({ ...i, kind: 'research' })),
  ].filter((i) => i.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
  let cursor = state.lastTick;
  for (const item of due) {
    accrue(state, cursor, item.endsAt);
    cursor = Math.max(cursor, item.endsAt);
    completeItem(state, item);
    const queue = item.kind === 'build' ? state.buildQueue : item.kind === 'produce' ? state.produceQueue : state.researchQueue;
    const idx = queue.findIndex((q) => q.id === item.id);
    if (idx >= 0) queue.splice(idx, 1);
  }
  accrue(state, cursor, now);
  state.lastTick = now;
  ensureProgress(state);
  ensureDaily(state, now);
  return state;
}

// ---------- Проверки (используются и действиями, и представлением) ----------
export function checkBuild(state, id) {
  const def = D.BUILDINGS[id];
  if (!def) return { code: 'unknown_building', message: 'Неизвестное здание.' };
  const level = state.buildings[id];
  if (state.buildQueue.some((q) => q.building === id)) return { code: 'already_building', message: 'Это здание уже строится.' };
  if (level >= def.maxLevel) return { code: 'max_level', message: 'Достигнут максимальный уровень.' };
  const to = level + 1;
  const hq = state.buildings.hq;
  if (id === 'hq' && commanderLevel(state) < D.requiredCommander(to)) return { code: 'commander_level', message: `Нужен уровень командира ${D.requiredCommander(to)}.` };
  if (hq < D.requiredHq(id, to)) return { code: 'hq_level', message: `Нужен штаб ${D.requiredHq(id, to)} уровня.` };
  if (state.buildQueue.length >= D.buildSlots(hq)) return { code: 'no_slot', message: 'Все строительные очереди заняты.' };
  const cost = D.buildCost(id, to);
  if (!canAfford(state, cost)) return { code: 'no_resources', message: `Не хватает ресурсов: ${costText(missing(state, cost))}.` };
  return null;
}
export function checkProduce(state, tankId) {
  const def = D.TANK_BY_ID[tankId];
  if (!def) return { code: 'unknown_tank', message: 'Неизвестная модель.' };
  if (state.tanks[tankId]) return { code: 'owned', message: 'Эта машина уже в ангаре.' };
  if (state.produceQueue.some((q) => q.tankId === tankId)) return { code: 'in_production', message: 'Эта машина уже в производстве.' };
  if (state.buildings.hangar < def.reqHangar) return { code: 'hangar_level', message: `Нужен ангар ${def.reqHangar} уровня.` };
  if (commanderLevel(state) < def.reqLevel) return { code: 'commander_level', message: `Нужен уровень командира ${def.reqLevel}.` };
  if (def.reqTech && !state.researchDone.includes(def.reqTech)) return { code: 'tech', message: `Нужно исследование «${D.TECH_BY_ID[def.reqTech].name}».` };
  if (Object.keys(state.tanks).length + state.produceQueue.length >= D.garageCapacity(state.buildings.hangar)) return { code: 'garage_full', message: 'Ангар заполнен. Улучшите ангар.' };
  if (state.produceQueue.length >= D.productionSlots(state.buildings.hangar)) return { code: 'no_slot', message: 'Все линии производства заняты.' };
  if (!canAfford(state, def.cost)) return { code: 'no_resources', message: `Не хватает ресурсов: ${costText(missing(state, def.cost))}.` };
  return null;
}
export function checkUpgradeTank(state, tankId) {
  const def = D.TANK_BY_ID[tankId]; const t = state.tanks[tankId];
  if (!def || !t) return { code: 'not_owned', message: 'Машины нет в ангаре.' };
  if (t.level >= D.maxTankLevel(state.buildings.training)) return { code: 'tank_max', message: 'Предел уровня. Улучшите учебный полигон.' };
  const cost = D.upgradeCost(def, t.level);
  if (!canAfford(state, cost)) return { code: 'no_resources', message: `Не хватает ресурсов: ${costText(missing(state, cost))}.` };
  return null;
}
export function checkResearch(state, techId) {
  const t = D.TECH_BY_ID[techId];
  if (!t) return { code: 'unknown_tech', message: 'Неизвестная технология.' };
  if (state.researchDone.includes(techId)) return { code: 'done', message: 'Технология уже изучена.' };
  if (state.researchQueue.some((q) => q.techId === techId)) return { code: 'in_progress', message: 'Исследование уже идёт.' };
  if (t.req && !state.researchDone.includes(t.req)) return { code: 'prereq', message: `Сначала изучите «${D.TECH_BY_ID[t.req].name}».` };
  if (state.buildings.lab < t.lab) return { code: 'lab_level', message: `Нужен исследовательский центр ${t.lab} уровня.` };
  if (state.researchQueue.length >= D.researchSlots(state.buildings.lab)) return { code: 'no_slot', message: 'Все лаборатории заняты.' };
  if (!canAfford(state, t.cost)) return { code: 'no_resources', message: `Не хватает ресурсов: ${costText(missing(state, t.cost))}.` };
  return null;
}
export function fuelCost(state, mission) {
  return Math.max(1, Math.ceil(mission.fuel * (1 + bonusesOf(state).fuelCostPct / 100)));
}
export function checkMission(state, mission) {
  if (!mission) return { code: 'unknown_mission', message: 'Неизвестная операция.' };
  if (commanderLevel(state) < mission.reqLevel) return { code: 'commander_level', message: `Нужен уровень командира ${mission.reqLevel}.` };
  if (state.buildings.radar < mission.reqRadar) return { code: 'radar', message: `Нужна радиолокационная станция ${mission.reqRadar} уровня.` };
  if ((mission.reqTraining || 0) > state.buildings.training) return { code: 'training', message: `Нужен учебный полигон ${mission.reqTraining} уровня.` };
  if (floorRes(state, 'fuel') < fuelCost(state, mission)) return { code: 'no_fuel', message: `Не хватает топлива: нужно ${fuelCost(state, mission)}.` };
  return null;
}
export function checkSquad(state, mission, squad) {
  if (!Array.isArray(squad) || squad.length < 1) return { code: 'squad_empty', message: 'Выберите хотя бы одну машину.' };
  if (new Set(squad).size !== squad.length) return { code: 'squad_dup', message: 'Машины в отряде не должны повторяться.' };
  const limit = Math.min(D.squadLimit(state.buildings.hangar), mission?.rules?.maxSquad ?? 99);
  if (squad.length > limit) return { code: 'squad_size', message: `Отряд ограничен: ${limit}.` };
  for (const id of squad) if (!state.tanks[id]) return { code: 'not_owned', message: 'В отряде есть машина, которой нет в ангаре.' };
  const classes = new Set(squad.map((id) => D.TANK_BY_ID[id].class));
  if (mission?.rules?.classes && [...classes].some((c) => !mission.rules.classes.includes(c))) {
    return { code: 'squad_class', message: `Допустимы только: ${mission.rules.classes.map((c) => D.CLASSES[c].name).join(', ')}.` };
  }
  if (mission?.rules?.minClasses && classes.size < mission.rules.minClasses) return { code: 'squad_mix', message: `Нужно минимум ${mission.rules.minClasses} разных класса.` };
  return null;
}
const throwIf = (problem) => { if (problem) fail(problem.code, problem.message); };

// ---------- Действия ----------
function startBuilding(state, ctx, { buildingId }) {
  throwIf(checkBuild(state, buildingId));
  const to = state.buildings[buildingId] + 1;
  spend(state, D.buildCost(buildingId, to));
  const ms = buildDurationMs(state, buildingId, to, ctx.timeScale);
  state.buildQueue.push({ id: nextId(state), building: buildingId, toLevel: to, startedAt: ctx.now, endsAt: ctx.now + ms, cost: D.buildCost(buildingId, to) });
  track(state, 'build');
  pushEvent(state, 'info', `Начато: ${D.BUILDINGS[buildingId].name} → уровень ${to}.`, ctx.now);
}
function cancelQueue(state, ctx, queue, id, label) {
  const idx = queue.findIndex((q) => q.id === id);
  if (idx < 0) fail('not_found', 'Задача не найдена или уже завершена.', 404);
  const item = queue[idx];
  const refund = {};
  for (const [k, v] of Object.entries(item.cost || {})) if (v > 0) refund[k] = Math.floor(v * 0.7);
  for (const [k, v] of Object.entries(refund)) state.res[k] += v;
  queue.splice(idx, 1);
  pushEvent(state, 'info', `${label} отменено. Возвращено 70% ресурсов.`, ctx.now);
}
function cancelBuilding(state, ctx, { queueId }) { cancelQueue(state, ctx, state.buildQueue, queueId, 'Строительство'); }
function cancelProduction(state, ctx, { queueId }) { cancelQueue(state, ctx, state.produceQueue, queueId, 'Производство'); }
function cancelResearch(state, ctx, { queueId }) { cancelQueue(state, ctx, state.researchQueue, queueId, 'Исследование'); }

function produceTank(state, ctx, { tankId }) {
  throwIf(checkProduce(state, tankId));
  const def = D.TANK_BY_ID[tankId];
  spend(state, def.cost);
  const ms = produceDurationMs(state, def, ctx.timeScale);
  state.produceQueue.push({ id: nextId(state), tankId, startedAt: ctx.now, endsAt: ctx.now + ms, cost: { ...def.cost } });
  track(state, 'produce');
  pushEvent(state, 'info', `Запущено производство: ${def.name}.`, ctx.now);
}
function upgradeTank(state, ctx, { tankId }) {
  throwIf(checkUpgradeTank(state, tankId));
  const def = D.TANK_BY_ID[tankId]; const t = state.tanks[tankId];
  spend(state, D.upgradeCost(def, t.level));
  t.level += 1;
  state.stats.upgrades += 1;
  track(state, 'upgrade');
  pushEvent(state, 'upgrade', `${def.name} улучшен до уровня ${t.level}.`, ctx.now);
}
function startResearch(state, ctx, { techId }) {
  throwIf(checkResearch(state, techId));
  const t = D.TECH_BY_ID[techId];
  spend(state, t.cost);
  state.researchQueue.push({ id: nextId(state), techId, startedAt: ctx.now, endsAt: ctx.now + researchDurationMs(state, t, ctx.timeScale), cost: { ...t.cost } });
  track(state, 'research');
  pushEvent(state, 'info', `Начато исследование: ${t.name}.`, ctx.now);
}
function setSquad(state, ctx, { squad }) {
  throwIf(checkSquad(state, null, squad));
  state.squad = [...squad];
}

function startBattle(state, ctx, { missionId, squad }) {
  if (state.battle) fail(state.battle.status === 'active' ? 'battle_active' : 'claim_pending', state.battle.status === 'active' ? 'Сначала завершите текущий бой.' : 'Сначала заберите награду за прошлый бой.', 409);
  const mission = D.MISSION_BY_ID[missionId];
  throwIf(checkMission(state, mission));
  throwIf(checkSquad(state, mission, squad));
  const bonuses = bonusesOf(state);
  state.res.fuel -= fuelCost(state, mission);
  state.squad = [...squad];
  const units = squad.map((id) => B.makePlayerUnit(D.TANK_BY_ID[id], state.tanks[id].level, bonuses, mission));
  const enemies = mission.enemies.map((e) => B.makeEnemyUnit(D.TANK_BY_ID[e.tankId], e.level, e.role, mission));
  state.battle = B.createBattle({
    id: nextId(state), mission, squad: units, enemies, now: ctx.now,
    freeRepairs: D.freeRepairs(state.buildings.repair), repairPct: 8 * state.buildings.repair,
  });
  pushEvent(state, 'battle', `Начата операция «${mission.name}».`, ctx.now);
}

function finishBattle(state, ctx) {
  const b = state.battle; const mission = D.MISSION_BY_ID[b.missionId];
  const won = b.status === 'won';
  const first = won && !state.missionClears[mission.id];
  b.reward = B.computeReward(mission, b, bonusesOf(state), state.buildings.training, first);
  state.stats.battles += 1;
  track(state, 'battles');
  if (won) {
    state.stats.wins += 1;
    state.missionClears[mission.id] = (state.missionClears[mission.id] || 0) + 1;
    track(state, 'wins');
    if (mission.type === 'recon') track(state, 'recon');
    if (mission.type === 'boss') { track(state, 'boss'); state.stats.bossWins += 1; }
    pushEvent(state, 'win', `Победа в операции «${mission.name}».`, ctx.now);
  } else {
    state.stats.losses += 1;
    pushEvent(state, 'loss', b.status === 'retreated' ? `Отступление из операции «${mission.name}».` : `Поражение в операции «${mission.name}».`, ctx.now);
  }
}
function battleAction(state, ctx, { battleId, action }) {
  const b = state.battle;
  if (!b || b.id !== battleId) fail('no_battle', 'Бой не найден.', 404);
  if (b.status !== 'active') fail('battle_finished', 'Бой уже завершён. Заберите награду.', 409);
  const result = action === 'retreat' ? B.retreat(b) : B.playRound(b, action, ctx.rng);
  if (!result.ok) fail('invalid_action', result.message);
  if (b.status !== 'active') finishBattle(state, ctx);
}
function claimBattle(state, ctx, { battleId }) {
  const b = state.battle;
  if (!b || b.id !== battleId) fail('no_battle', 'Бой не найден.', 404);
  if (b.status === 'active') fail('battle_active', 'Бой ещё не завершён.', 409);
  if (b.claimed || !b.reward) fail('already_claimed', 'Награда уже получена.', 409);
  giveReward(state, b.reward, ctx.now);
  b.claimed = true;
  const r = b.reward;
  pushEvent(state, 'reward', `Награда за операцию: ${[r.credits && `${r.credits} кредитов`, r.steel && `${r.steel} стали`, r.scrap && `${r.scrap} металлолома`, r.science && `${r.science} науч. данных`, r.xp && `${r.xp} XP`].filter(Boolean).join(', ') || 'нет'}.`, ctx.now);
  state.battle = null;
}

function claimQuest(state, ctx, { questId }) {
  const q = state.daily.quests.find((x) => x.id === questId);
  if (!q) fail('not_found', 'Задание не найдено.', 404);
  if (q.claimed) fail('already_claimed', 'Награда уже получена.', 409);
  if (q.progress < q.goal) fail('not_done', 'Задание ещё не выполнено.');
  q.claimed = true;
  state.stats.questsClaimed += 1;
  const reward = questTemplate(q.tpl).reward(q.goal);
  giveReward(state, reward, ctx.now);
  pushEvent(state, 'reward', `Задание «${questTemplate(q.tpl).name}» выполнено.`, ctx.now);
}

export function achievementValue(state, metric) {
  switch (metric) {
    case 'wins': return state.stats.wins;
    case 'battles': return state.stats.battles;
    case 'tanks': return Object.keys(state.tanks).length;
    case 'built': return state.stats.built;
    case 'hq': return state.buildings.hq;
    case 'researched': return state.stats.researched;
    case 'bossWins': return state.stats.bossWins;
    case 'commander': return commanderLevel(state);
    case 'upgrades': return state.stats.upgrades;
    default: return 0;
  }
}
function claimAchievement(state, ctx, { achievementId }) {
  const a = D.ACHIEVEMENTS.find((x) => x.id === achievementId);
  if (!a) fail('not_found', 'Достижение не найдено.', 404);
  if (state.achievementsClaimed.includes(a.id)) fail('already_claimed', 'Награда уже получена.', 409);
  if (achievementValue(state, a.metric) < a.goal) fail('not_done', 'Достижение ещё не выполнено.');
  state.achievementsClaimed.push(a.id);
  giveReward(state, a.reward, ctx.now);
  pushEvent(state, 'reward', `Достижение «${a.name}» получено.`, ctx.now);
}

function claimTutorial(state, ctx) {
  const t = state.tutorial;
  if (t.done) fail('tutorial_done', 'Обучение уже завершено.', 409);
  if (!tutorialReady(state)) fail('tutorial_not_ready', 'Сначала выполните шаг обучения.');
  const step = D.TUTORIAL[t.step];
  giveReward(state, step.reward, ctx.now);
  t.step += 1;
  if (t.step >= D.TUTORIAL.length) { t.done = true; pushEvent(state, 'reward', 'Обучение завершено. Вы готовы к настоящей войне, командир!', ctx.now); }
  else pushEvent(state, 'reward', `Обучение: «${step.title}» выполнено.`, ctx.now);
}
function skipTutorial(state) {
  if (state.tutorial.done) fail('tutorial_done', 'Обучение уже завершено.', 409);
  state.tutorial.done = true; state.tutorial.step = D.TUTORIAL.length;
}
export function bonusStatus(state, now) {
  const today = dayKey(now);
  const yesterday = dayKey(now - DAY);
  const b = state.bonus;
  const available = b.lastDay !== today;
  const streak = b.lastDay === today ? b.streak : b.lastDay === yesterday ? b.streak : 0;
  return { available, streak, nextDay: (streak % D.DAILY_BONUS.length) + 1 };
}
function claimBonus(state, ctx) {
  const st = bonusStatus(state, ctx.now);
  if (!st.available) fail('already_claimed', 'Ежедневный бонус уже получен. Возвращайтесь завтра.', 409);
  state.bonus.streak = st.streak + 1;
  state.bonus.lastDay = dayKey(ctx.now);
  const reward = D.DAILY_BONUS[(state.bonus.streak - 1) % D.DAILY_BONUS.length];
  giveReward(state, reward, ctx.now);
  pushEvent(state, 'reward', `Ежедневный бонус: день ${((state.bonus.streak - 1) % D.DAILY_BONUS.length) + 1}.`, ctx.now);
}

const NICK = /^[\p{L}\p{N} _.\-]{2,18}$/u;
function setNickname(state, ctx, { nickname }) {
  const n = String(nickname ?? '').replace(/\s+/g, ' ').trim();
  if (!NICK.test(n)) fail('bad_nickname', 'Позывной: 2–18 символов, буквы, цифры, пробел, _ . -');
  state.nickname = n;
}

const HANDLERS = {
  'build/start': startBuilding, 'build/cancel': cancelBuilding,
  'tank/produce': produceTank, 'tank/produce-cancel': cancelProduction, 'tank/upgrade': upgradeTank, 'squad/set': setSquad,
  'research/start': startResearch, 'research/cancel': cancelResearch,
  'battle/start': startBattle, 'battle/action': battleAction, 'battle/claim': claimBattle,
  'quest/claim': claimQuest, 'tutorial/claim': claimTutorial, 'tutorial/skip': skipTutorial, 'bonus/claim': claimBonus, 'achievement/claim': claimAchievement, 'profile/nickname': setNickname,
};
export const ACTION_NAMES = Object.keys(HANDLERS);

/**
 * Выполняет игровое действие над копией состояния. Возвращает новое состояние;
 * исходный объект не меняется, так что при ошибке ничего не сохраняется.
 */
export function perform(state, action, payload, opts) {
  const handler = HANDLERS[action];
  if (!handler) fail('unknown_action', 'Неизвестное действие.', 404);
  const ctx = { now: opts.now, rng: opts.rng || Math.random, timeScale: opts.timeScale || 1 };
  const next = structuredClone(state);
  settle(next, ctx.now);
  const requestId = typeof opts.requestId === 'string' && /^[\w-]{8,64}$/.test(opts.requestId) ? opts.requestId : null;
  if (requestId && next.recent.includes(requestId)) fail('duplicate_request', 'Запрос уже был обработан.', 409);
  handler(next, ctx, payload && typeof payload === 'object' ? payload : {});
  if (requestId) { next.recent.unshift(requestId); next.recent.length = Math.min(next.recent.length, RECENT_LIMIT); }
  return next;
}
