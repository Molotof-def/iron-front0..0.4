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
const newNotify = (now, upTo) => ({
  enabled: true, upTo, types: { builds: true, fuel: false, bonus: false, event: false },
  mark: { fuelSent: true, bonusDay: '', eventWeek: D.weekIndex(now) }, lastSeen: now,
});
const newPvp = (now) => ({ rating: D.PVP.startRating, bestEver: D.PVP.startRating, season: D.seasonKey(now), played: 0, wins: 0, losses: 0, day: '', used: 0, recent: [], defenseIds: [], defense: [], prev: null });

export function newPlayer(now, nickname = 'Командир') {
  return {
    schemaVersion: SCHEMA_VERSION, createdAt: now, nickname, xp: 0,
    res: { ...D.START_RESOURCES }, lastTick: now,
    buildings: Object.fromEntries(D.BUILDING_ORDER.map((id) => [id, D.BUILDINGS[id].startLevel])),
    buildQueue: [], produceQueue: [], researchDone: [], researchQueue: [],
    tanks: { [D.STARTER_TANK]: { level: 1, xp: 0, skills: {} } }, squad: [D.STARTER_TANK],
    battle: null, missionClears: {},
    stats: { battles: 0, wins: 0, losses: 0, built: 0, researched: 0, upgrades: 0, produced: 0, bossWins: 0, questsClaimed: 0 },
    tutorial: { step: 0, done: false }, bonus: { lastDay: '', streak: 0 },
    notify: newNotify(now, 0), referral: { welcomed: false, claimed: 0, milestones: [] }, weekly: { week: -1, progress: 0, claimed: false },
    pvp: newPvp(now), pass: { season: D.seasonKey(now), xp: 0, claimed: [] }, clan: { week: -1, points: 0, claimedWeek: -1 }, cosmetics: {},
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
  state.notify ??= newNotify(state.lastTick, state.eventSeq); // старым игрокам не шлём уведомления о прошлом
  state.notify.types ??= { builds: true, fuel: false, bonus: false, event: false };
  state.notify.mark ??= { fuelSent: true, bonusDay: '', eventWeek: D.weekIndex(state.lastTick) };
  state.notify.lastSeen ??= state.lastTick;
  state.pvp ??= newPvp(state.lastTick);
  state.pass ??= { season: D.seasonKey(state.lastTick), xp: 0, claimed: [] };
  state.clan ??= { week: -1, points: 0, claimedWeek: -1 };
  state.cosmetics ??= {};
  for (const t of Object.values(state.tanks)) { t.xp ??= 0; t.skills ??= {}; }
  state.referral ??= { welcomed: false, claimed: 0, milestones: [] };
  state.weekly ??= { week: -1, progress: 0, claimed: false };
  state.bonus ??= { lastDay: '', streak: 0 };
  if (!state.tutorial) {
    const veteran = Boolean(state.legacy) || state.stats.battles > 0 || state.stats.built > 0;
    state.tutorial = { step: veteran ? D.TUTORIAL.length : 0, done: veteran };
  }
}

// ---------- Недельное событие и цель ----------
function ensureWeekly(state, now) {
  const w = D.weekIndex(now);
  if (state.weekly.week !== w) state.weekly = { week: w, progress: 0, claimed: false };
}
export function weeklyStatus(state, now) {
  const ev = D.eventForWeek(now);
  return { event: ev, endsAt: D.weekEndsAt(now), progress: state.weekly.progress, goal: D.WEEKLY_GOAL.wins, claimed: state.weekly.claimed, reward: D.WEEKLY_GOAL.reward };
}

// ---------- Уведомления бота ----------
const NOTIFY_ICON = { build: '🏗', produce: '🛠', research: '🔬' };
const activeWithin = (state, now, days) => now - state.notify.lastSeen <= days * DAY;
/** Моменты напоминаний, которые ещё не отправлены и могут сработать (для неактивных игроков их нет). */
function reminderTimes(state, now) {
  const n = state.notify; const out = [];
  if (!n.enabled) return out;
  if (n.types.fuel && !n.mark.fuelSent && activeWithin(state, now, 2)) {
    const caps = capsOf(state); const rate = ratesOf(state).fuel;
    out.push(state.res.fuel >= caps.fuel - 0.5 ? now : now + Math.ceil(((caps.fuel - state.res.fuel) / Math.max(0.1, rate)) * HOUR));
  }
  if (n.types.bonus && n.mark.bonusDay !== dayKey(now) && bonusStatus(state, now).available && activeWithin(state, now, D.REMIND.activeDays)) {
    out.push(Math.floor(now / DAY) * DAY + D.REMIND.bonusHourUtc * HOUR);
  }
  if (n.types.event && n.mark.eventWeek !== D.weekIndex(now) && activeWithin(state, now, D.REMIND.eventActiveDays)) {
    out.push(D.weekEndsAt(now) - 7 * DAY + D.REMIND.eventHourUtc * HOUR);
  }
  return out;
}
/** Время ближайшего события для планировщика: завершение таймера или напоминание. null — ничего не ждём. */
export function nextEventAt(state) {
  const now = state.lastTick;
  const ends = state.notify?.types?.builds === false ? [] : [...state.buildQueue, ...state.produceQueue, ...state.researchQueue].map((q) => q.endsAt);
  const all = [...ends, ...reminderTimes(state, now)];
  return all.length ? Math.min(...all) : null;
}
/** Забирает уведомления, которые пора отправить, и помечает их отправленными. */
export function takeNotifications(state, now = state.lastTick) {
  const n = state.notify;
  const fresh = state.events.filter((e) => e.id > n.upTo && NOTIFY_ICON[e.kind]).reverse();
  n.upTo = state.eventSeq;
  if (!n.enabled) return [];
  const lines = n.types.builds ? fresh.map((e) => `${NOTIFY_ICON[e.kind]} ${e.text}`) : [];
  if (n.types.fuel && !n.mark.fuelSent && activeWithin(state, now, 2) && state.res.fuel >= capsOf(state).fuel - 0.5) {
    n.mark.fuelSent = true; lines.push('⛽ Топливо полностью восстановлено — пора на операцию!');
  }
  const day = dayKey(now);
  if (n.types.bonus && n.mark.bonusDay !== day && now >= Math.floor(now / DAY) * DAY + D.REMIND.bonusHourUtc * HOUR && bonusStatus(state, now).available && activeWithin(state, now, D.REMIND.activeDays)) {
    n.mark.bonusDay = day; lines.push('🎁 Ежедневный бонус ждёт — заберите его и продлите серию!');
  }
  const week = D.weekIndex(now);
  if (n.types.event && n.mark.eventWeek !== week && now >= D.weekEndsAt(now) - 7 * DAY + D.REMIND.eventHourUtc * HOUR && activeWithin(state, now, D.REMIND.eventActiveDays)) {
    n.mark.eventWeek = week; const ev = D.eventForWeek(now); lines.push(`⚡ Событие недели: ${ev.name}. ${ev.desc}`);
  }
  return lines;
}
/** Игрок сейчас в игре и видит события сам — уведомления о них не нужны. */
export const markEventsSeen = (state) => { state.notify.upTo = state.eventSeq; state.notify.lastSeen = state.lastTick; };

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
    state.tanks[item.tankId] = { level: 1, xp: 0, skills: {} };
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
  ensureWeekly(state, now);
  ensureSeason(state, now);
  ensurePvpDay(state, now);
  ensureClanWeek(state, now);
  refreshDefense(state);
  if (state.res.fuel < capsOf(state).fuel - 0.5) state.notify.mark.fuelSent = false;
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
  const units = squad.map((id) => B.makePlayerUnit(D.TANK_BY_ID[id], state.tanks[id].level, combinedBonuses(state, id, bonuses), mission, crewEffects(state, id)));
  const enemies = mission.enemies.map((e) => B.makeEnemyUnit(D.TANK_BY_ID[e.tankId], e.level, e.role, mission));
  state.battle = B.createBattle({
    id: nextId(state), mission, squad: units, enemies, now: ctx.now,
    freeRepairs: D.freeRepairs(state.buildings.repair), repairPct: 8 * state.buildings.repair,
  });
  pushEvent(state, 'battle', `Начата операция «${mission.name}».`, ctx.now);
}

function finishBattle(state, ctx) {
  if (state.battle.pvp) return finishDuel(state, ctx);
  const b = state.battle; const mission = D.MISSION_BY_ID[b.missionId];
  const won = b.status === 'won';
  const first = won && !state.missionClears[mission.id];
  const ev = D.eventForWeek(ctx.now);
  b.reward = B.computeReward(mission, b, bonusesOf(state), state.buildings.training, first, ev.types.includes(mission.type) ? ev.mul : 1);
  state.stats.battles += 1;
  track(state, 'battles');
  grantCrewXp(state, b.squad, won, mission.type === 'boss');
  addPassXp(state, won ? D.PASS.xp.win : D.PASS.xp.loss);
  if (won) addClanPoints(state, D.CLAN.points[mission.type] || 5);
  if (won) {
    state.stats.wins += 1;
    state.weekly.progress = Math.min(D.WEEKLY_GOAL.wins, state.weekly.progress + 1);
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
  addPassXp(state, D.PASS.xp.quest);
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

function claimWeekly(state, ctx) {
  const w = state.weekly;
  if (w.claimed) fail('already_claimed', 'Награда недели уже получена.', 409);
  if (w.progress < D.WEEKLY_GOAL.wins) fail('not_done', 'Недельная цель ещё не выполнена.');
  w.claimed = true;
  addPassXp(state, D.PASS.xp.weekly);
  giveReward(state, D.WEEKLY_GOAL.reward, ctx.now);
  pushEvent(state, 'reward', 'Награда недельной цели получена.', ctx.now);
}
function setNotify(state, ctx, { enabled, types }) {
  if (enabled !== undefined) state.notify.enabled = Boolean(enabled);
  if (types && typeof types === 'object') for (const k of D.NOTIFY_TYPES) if (typeof types[k] === 'boolean') state.notify.types[k] = types[k];
  state.notify.upTo = state.eventSeq;
  state.notify.mark.fuelSent = state.res.fuel >= capsOf(state).fuel - 0.5; // не слать «бак полон», если он уже полон
}
/** Приветственный бонус приглашённому: выдаётся один раз при первом входе после перехода по ссылке друга. */
export function applyReferralWelcome(state, now) {
  if (state.referral.welcomed) return false;
  state.referral.welcomed = true;
  giveReward(state, D.REFERRAL.welcome, now);
  pushEvent(state, 'reward', 'Бонус за приглашение друга получен.', now);
  return true;
}
export function referralStatus(state, stats) {
  const qualified = Math.min(stats?.qualified ?? 0, D.REFERRAL.maxCounted);
  return {
    invited: stats?.invited ?? 0, qualified, claimed: state.referral.claimed,
    claimable: Math.max(0, qualified - state.referral.claimed),
    milestones: D.REFERRAL.milestones.map((m) => ({ at: m.at, reward: m.reward, reached: qualified >= m.at, claimed: state.referral.milestones.includes(m.at) })),
  };
}
function claimReferral(state, ctx) {
  const st = referralStatus(state, ctx.referral);
  const fresh = st.claimable;
  const ready = D.REFERRAL.milestones.filter((m) => st.qualified >= m.at && !state.referral.milestones.includes(m.at));
  if (fresh <= 0 && !ready.length) fail('nothing_to_claim', 'Пока нечего забирать: друзья должны достичь 3 уровня командира.');
  for (let i = 0; i < fresh; i++) giveReward(state, D.REFERRAL.perFriend, ctx.now);
  for (const m of ready) { giveReward(state, m.reward, ctx.now); state.referral.milestones.push(m.at); }
  state.referral.claimed = st.qualified;
  pushEvent(state, 'reward', `Награды за друзей получены (друзей: ${fresh}${ready.length ? `, вех: ${ready.length}` : ''}).`, ctx.now);
}

const NICK = /^[\p{L}\p{N} _.\-]{2,18}$/u;
function setNickname(state, ctx, { nickname }) {
  const n = String(nickname ?? '').replace(/\s+/g, ' ').trim();
  if (!NICK.test(n)) fail('bad_nickname', 'Позывной: 2–18 символов, буквы, цифры, пробел, _ . -');
  state.nickname = n;
}


// ---------- Экипаж и навыки ----------
export const crewInfo = (tank, cls) => {
  const points = Math.min(D.CREW.maxPoints, Math.floor(tank.xp / D.CREW.xpPerPoint));
  const spent = Object.values(tank.skills).reduce((a, b) => a + b, 0);
  return { xp: tank.xp, points, spent, free: Math.max(0, points - spent), skills: { ...tank.skills }, nextAt: points >= D.CREW.maxPoints ? null : (points + 1) * D.CREW.xpPerPoint };
};
const CREW_KEYS = ['attackPct', 'armorPct', 'hpPct', 'mobilityFlat', 'repairPct', 'evadeBonus', 'guardBonus', 'ambushBonus', 'splashBonus'];
export function crewEffects(state, tankId) {
  const out = Object.fromEntries(CREW_KEYS.map((k) => [k, 0]));
  const tank = state.tanks[tankId]; const def = D.TANK_BY_ID[tankId];
  if (!tank || !def) return out;
  for (const sk of D.skillsFor(def.class)) {
    const rank = Math.min(sk.max, tank.skills[sk.id] || 0);
    for (const [k, v] of Object.entries(sk.effect)) out[k] += v * rank;
  }
  return out;
}
/** Бонусы исследований плюс экипажа конкретной машины. */
export function combinedBonuses(state, tankId, base = bonusesOf(state)) {
  const crew = crewEffects(state, tankId);
  return { ...base, attackPct: base.attackPct + crew.attackPct, armorPct: base.armorPct + crew.armorPct, hpPct: base.hpPct + crew.hpPct, mobilityFlat: base.mobilityFlat + crew.mobilityFlat };
}
function learnSkill(state, ctx, { tankId, skill }) {
  const tank = state.tanks[tankId]; const def = D.TANK_BY_ID[tankId];
  if (!tank) fail('not_owned', 'Машины нет в ангаре.');
  const sk = D.skillsFor(def.class).find((x) => x.id === skill);
  if (!sk) fail('unknown_skill', 'Такого навыка нет у этой машины.');
  const info = crewInfo(tank, def.class);
  if ((tank.skills[skill] || 0) >= sk.max) fail('skill_max', 'Навык изучен до максимума.');
  if (info.free < 1) fail('no_points', 'Нет свободных очков экипажа. Очки даёт опыт машины в боях.');
  tank.skills[skill] = (tank.skills[skill] || 0) + 1;
  pushEvent(state, 'upgrade', `${def.name}: навык «${sk.name}» ${tank.skills[skill]} ур.`, ctx.now);
}
function respecCrew(state, ctx, { tankId }) {
  const tank = state.tanks[tankId]; const def = D.TANK_BY_ID[tankId];
  if (!tank) fail('not_owned', 'Машины нет в ангаре.');
  const spent = Object.values(tank.skills).reduce((a, b) => a + b, 0);
  if (!spent) fail('nothing_to_reset', 'Навыки не изучены.');
  const cost = { credits: spent * D.CREW.respecPerPoint };
  if (!canAfford(state, cost)) fail('no_resources', `Не хватает ресурсов: ${costText(missing(state, cost))}.`);
  spend(state, cost);
  tank.skills = {};
  pushEvent(state, 'info', `${def.name}: навыки экипажа сброшены.`, ctx.now);
}
const grantCrewXp = (state, units, won, boss) => {
  for (const u of units) {
    const t = state.tanks[u.tankId];
    if (t) t.xp = Math.min(D.CREW.maxPoints * D.CREW.xpPerPoint + 100, t.xp + Math.round((won ? D.CREW.xpWin : D.CREW.xpLoss) * (boss ? 1.5 : 1)));
  }
};

// ---------- Сезонный пропуск ----------
export const passLevel = (state) => Math.min(D.PASS.levels, Math.floor(state.pass.xp / D.PASS.xpPerLevel));
const addPassXp = (state, n) => { state.pass.xp = Math.min(D.PASS.levels * D.PASS.xpPerLevel, state.pass.xp + n); };
function claimPass(state, ctx, { level }) {
  const row = D.PASS_REWARDS.find((r) => r.level === level);
  if (!row) fail('not_found', 'Такого уровня нет.', 404);
  if (level > passLevel(state)) fail('not_done', 'Уровень пропуска ещё не достигнут.');
  if (state.pass.claimed.includes(level)) fail('already_claimed', 'Награда уже получена.', 409);
  state.pass.claimed.push(level);
  giveReward(state, row.reward, ctx.now);
  pushEvent(state, 'reward', `Сезонный пропуск: награда уровня ${level} получена.`, ctx.now);
}

// ---------- Косметика ----------
export function cosmeticMetric(state, metric) {
  switch (metric) {
    case 'commander': return commanderLevel(state);
    case 'wins': return state.stats.wins;
    case 'bossWins': return state.stats.bossWins;
    case 'passLevel': return passLevel(state);
    case 'pvpBest': return state.pvp.bestEver;
    default: return 0;
  }
}
export const cosmeticUnlocked = (state, item) => !item.req || cosmeticMetric(state, item.req.metric) >= item.req.goal;
function equipCosmetic(state, ctx, { tankId, camo, emblem }) {
  if (!state.tanks[tankId]) fail('not_owned', 'Машины нет в ангаре.');
  const c = D.CAMOS.find((x) => x.id === camo); const e = D.EMBLEMS.find((x) => x.id === emblem);
  if (!c || !e) fail('unknown_cosmetic', 'Неизвестный вариант оформления.');
  if (!cosmeticUnlocked(state, c) || !cosmeticUnlocked(state, e)) fail('locked', 'Это оформление ещё не открыто.');
  state.cosmetics[tankId] = { camo: c.id, emblem: e.id };
}

// ---------- Дуэли и сезоны рейтинга ----------
function ensureSeason(state, now) {
  const key = D.seasonKey(now);
  const p = state.pvp;
  if (p.season === key) return;
  if (p.season) {
    p.prev = { season: p.season, rating: p.rating, tier: D.tierFor(p.rating).id, claimed: p.played === 0 };
    const keep = Math.floor(Math.max(0, p.rating - D.PVP.startRating) / 2); // мягкий сброс: половина прироста
    p.rating = D.PVP.startRating + keep;
  }
  p.season = key; p.played = 0; p.wins = 0; p.losses = 0;
  state.pass = { season: key, xp: 0, claimed: [] };
}
function ensurePvpDay(state, now) {
  const day = dayKey(now);
  if (state.pvp.day !== day) { state.pvp.day = day; state.pvp.used = 0; }
  state.pvp.recent = state.pvp.recent.filter((r) => now - r.t < DAY);
}
function ensureClanWeek(state, now) {
  const w = D.weekIndex(now);
  if (state.clan.week !== w) { state.clan.week = w; state.clan.points = 0; }
}
const powerOfUnit = (u) => Math.round(u.hp + u.attack * 3 + u.armor * 2);
/** Снимок защитного отряда: другие игроки сражаются с ним в дуэлях. Параметры включают исследования и экипаж. */
export function refreshDefense(state) {
  const ids = state.pvp.defenseIds.filter((id) => state.tanks[id]);
  const use = ids.length ? ids : state.squad.filter((id) => state.tanks[id]);
  const base = bonusesOf(state);
  state.pvp.defense = use.slice(0, 3).map((id) => {
    const def = D.TANK_BY_ID[id]; const t = state.tanks[id];
    const st = B.tankStats(def, t.level, combinedBonuses(state, id, base));
    const cos = state.cosmetics[id] || { camo: 'default', emblem: 'none' };
    return { tankId: id, level: t.level, hp: st.hp, attack: st.attack, armor: st.armor, mobility: st.mobility, camo: cos.camo, emblem: cos.emblem };
  });
}
export const defensePower = (defense) => defense.reduce((a, u) => a + powerOfUnit(u), 0);
function setDefense(state, ctx, { squad }) {
  throwIf(checkSquad(state, null, squad));
  state.pvp.defenseIds = [...squad];
  refreshDefense(state);
  pushEvent(state, 'info', 'Защитный отряд дуэлей обновлён.', ctx.now);
}
const BOT_NAMES = ['Лейтенант Орлов', 'Сержант Железнов', 'Капитан Громов', 'Полковник Стальной', 'Майор Бронев', 'Старшина Танков'];
/** Тренировочный противник: детерминирован по игроку, дню и слоту, поэтому сервер может проверить его без базы данных. */
export function makeBot(state, slot, now) {
  const rng = seededRng(`${state.createdAt}:${dayKey(now)}:bot${slot}`);
  const lvl = commanderLevel(state);
  const tier = lvl < 2 ? 1 : lvl < 4 ? 2 : lvl < 7 ? 3 : lvl < 12 ? 4 : 5;
  const pool = D.TANKS.filter((t) => t.tier <= tier && t.tier >= Math.max(1, tier - 1));
  const count = Math.max(1, Math.min(3, state.squad.length));
  const levels = Object.values(state.tanks).map((t) => t.level);
  const avg = Math.max(1, Math.round(levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length)));
  const skew = 0.92 + slot * 0.05;
  const defense = Array.from({ length: count }, () => {
    const def = pool[Math.floor(rng() * pool.length)];
    const level = Math.max(1, Math.min(14, avg + Math.floor(rng() * 3) - 1));
    const st = B.tankStats(def, level, {});
    return { tankId: def.id, level, hp: Math.round(st.hp * skew), attack: Math.round(st.attack * skew), armor: Math.round(st.armor * skew), mobility: st.mobility, camo: 'default', emblem: 'none' };
  });
  return { id: `bot:${slot}`, nickname: BOT_NAMES[(slot + Math.floor(rng() * 3)) % BOT_NAMES.length], level: Math.max(1, lvl + slot - 1), rating: state.pvp.rating + (slot - 1) * 40, bot: true, defense };
}
const DUEL_ARENAS = ['desert', 'hills', 'factory', 'coast'];
const DUEL_WEATHER = ['clear', 'rain', 'sand', 'fog'];
const ROLE_BY_CLASS = { arty: 'skirmisher', light: 'skirmisher', heavy: 'guardian', td: 'assault', medium: 'assault' };
function startDuel(state, ctx, { opponentId, squad }) {
  if (state.battle) fail(state.battle.status === 'active' ? 'battle_active' : 'claim_pending', state.battle.status === 'active' ? 'Сначала завершите текущий бой.' : 'Сначала заберите награду за прошлый бой.', 409);
  if (commanderLevel(state) < D.PVP.minLevel) fail('commander_level', `Дуэли открываются с ${D.PVP.minLevel} уровня командира.`);
  if (state.pvp.used >= D.PVP.dailyTickets) fail('no_tickets', 'Дуэльные жетоны на сегодня закончились. Они обновляются каждые сутки.');
  throwIf(checkSquad(state, null, squad));
  let opp;
  if (typeof opponentId === 'string' && /^bot:[0-2]$/.test(opponentId)) opp = makeBot(state, Number(opponentId.slice(4)), ctx.now);
  else {
    opp = ctx.opponent;
    if (!opp || opp.id !== opponentId || !Array.isArray(opp.defense) || !opp.defense.length) fail('bad_opponent', 'Соперник недоступен. Обновите список.');
    if (Math.abs(opp.rating - state.pvp.rating) > D.PVP.maxWindow) fail('bad_opponent', 'Соперник слишком далёк по рейтингу.');
    if (state.pvp.recent.some((r) => r.id === opp.id)) fail('recent_opponent', 'С этим игроком вы уже сражались сегодня.');
  }
  const enemies = opp.defense.map((d) => ({ d, def: D.TANK_BY_ID[d.tankId] })).filter((x) => x.def)
    .map(({ d, def }) => B.makeSnapshotUnit(def, d, ROLE_BY_CLASS[def.class]));
  if (!enemies.length) fail('bad_opponent', 'У соперника нет боеспособного отряда.');
  const rng = seededRng(`${opp.id}:${dayKey(ctx.now)}:${state.pvp.used}`);
  const mission = { id: 'pvp', name: `Дуэль: ${opp.nickname}`, arena: DUEL_ARENAS[Math.floor(rng() * 4)], weather: DUEL_WEATHER[Math.floor(rng() * 4)], diff: 1, turnLimit: D.PVP.turnLimit, armorBonus: 0 };
  const base = bonusesOf(state);
  const units = squad.map((id) => {
    const eff = crewEffects(state, id);
    return B.makePlayerUnit(D.TANK_BY_ID[id], state.tanks[id].level, combinedBonuses(state, id, base), mission, eff);
  });
  state.squad = [...squad];
  state.pvp.used += 1;
  if (!opp.bot) state.pvp.recent.push({ id: opp.id, t: ctx.now });
  state.battle = B.createBattle({
    id: nextId(state), mission, squad: units, enemies, now: ctx.now, freeRepairs: D.freeRepairs(state.buildings.repair), repairPct: 8 * state.buildings.repair,
    title: mission.name, pvp: { opponent: { id: opp.id, nickname: opp.nickname, level: opp.level, rating: opp.rating, bot: Boolean(opp.bot) } },
  });
  pushEvent(state, 'battle', `Начата дуэль против ${opp.nickname}.`, ctx.now);
}
function finishDuel(state, ctx) {
  const b = state.battle; const won = b.status === 'won'; const p = state.pvp; const opp = b.pvp.opponent;
  const K = opp.bot ? D.PVP.kBot : D.PVP.kPlayer;
  const expected = 1 / (1 + Math.pow(10, (opp.rating - p.rating) / 400));
  const delta = Math.round(K * ((won ? 1 : 0) - expected));
  const before = p.rating;
  p.rating = Math.max(0, p.rating + delta);
  p.bestEver = Math.max(p.bestEver, p.rating);
  p.played += 1; if (won) p.wins += 1; else p.losses += 1;
  const mul = opp.bot ? D.PVP.botMul : 1;
  const base = won ? D.PVP.win : D.PVP.loss;
  b.reward = { credits: Math.round((base.credits || 0) * mul), steel: Math.round((base.steel || 0) * mul), scrap: Math.round((base.scrap || 0) * mul), science: 0, fuel: 0, xp: Math.round((base.xp || 0) * mul), bonus: false, firstClear: false, event: false, rating: p.rating - before };
  state.stats.battles += 1;
  track(state, 'battles');
  grantCrewXp(state, b.squad, won, false);
  addPassXp(state, D.PASS.xp.pvp);
  if (won) addClanPoints(state, D.CLAN.points.pvp);
  pushEvent(state, won ? 'win' : 'loss', `${won ? 'Победа' : 'Поражение'} в дуэли против ${opp.nickname} (${p.rating - before >= 0 ? '+' : ''}${p.rating - before}).`, ctx.now);
}
function claimSeason(state, ctx) {
  const prev = state.pvp.prev;
  if (!prev || prev.claimed) fail('nothing_to_claim', 'Награды прошлого сезона уже получены или недоступны.', 409);
  const tier = D.PVP_TIERS.find((t) => t.id === prev.tier) || D.PVP_TIERS[0];
  prev.claimed = true;
  giveReward(state, tier.reward, ctx.now);
  pushEvent(state, 'reward', `Награда сезона «${D.seasonTitle(prev.season)}»: ${tier.name}.`, ctx.now);
}

// ---------- Кланы (очки и награды; состав клана хранится в БД) ----------
function addClanPoints(state, n) { state.clan.points += n; }
function claimClan(state, ctx) {
  const c = ctx.clan;
  if (!c || !c.inClan) fail('no_clan', 'Вы не состоите в клане.');
  if (state.clan.claimedWeek === state.clan.week) fail('already_claimed', 'Награда клана за эту неделю уже получена.', 409);
  if (c.total < D.clanGoal(c.members)) fail('not_done', 'Клан ещё не выполнил недельную цель.');
  state.clan.claimedWeek = state.clan.week;
  giveReward(state, D.CLAN.reward, ctx.now);
  addPassXp(state, 30);
  pushEvent(state, 'reward', 'Награда клана за неделю получена.', ctx.now);
}

const HANDLERS = {
  'build/start': startBuilding, 'build/cancel': cancelBuilding,
  'tank/produce': produceTank, 'tank/produce-cancel': cancelProduction, 'tank/upgrade': upgradeTank, 'squad/set': setSquad,
  'research/start': startResearch, 'research/cancel': cancelResearch,
  'battle/start': startBattle, 'battle/action': battleAction, 'battle/claim': claimBattle,
  'quest/claim': claimQuest, 'weekly/claim': claimWeekly, 'tank/skill': learnSkill, 'tank/respec': respecCrew, 'pass/claim': claimPass, 'cosmetic/equip': equipCosmetic, 'pvp/defense': setDefense, 'pvp/start': startDuel, 'pvp/season-claim': claimSeason, 'clan/claim': claimClan, 'profile/notify': setNotify, 'referral/claim': claimReferral, 'tutorial/claim': claimTutorial, 'tutorial/skip': skipTutorial, 'bonus/claim': claimBonus, 'achievement/claim': claimAchievement, 'profile/nickname': setNickname,
};
export const ACTION_NAMES = Object.keys(HANDLERS);

/**
 * Выполняет игровое действие над копией состояния. Возвращает новое состояние;
 * исходный объект не меняется, так что при ошибке ничего не сохраняется.
 */
export function perform(state, action, payload, opts) {
  const handler = HANDLERS[action];
  if (!handler) fail('unknown_action', 'Неизвестное действие.', 404);
  const ctx = { now: opts.now, rng: opts.rng || Math.random, timeScale: opts.timeScale || 1, referral: opts.referral || null, opponent: opts.opponent || null, clan: opts.clan || null };
  const next = structuredClone(state);
  settle(next, ctx.now);
  const requestId = typeof opts.requestId === 'string' && /^[\w-]{8,64}$/.test(opts.requestId) ? opts.requestId : null;
  if (requestId && next.recent.includes(requestId)) fail('duplicate_request', 'Запрос уже был обработан.', 409);
  handler(next, ctx, payload && typeof payload === 'object' ? payload : {});
  markEventsSeen(next);
  if (requestId) { next.recent.unshift(requestId); next.recent.length = Math.min(next.recent.length, RECENT_LIMIT); }
  return next;
}
