// Представление состояния для клиента: только производные и безопасные данные.
import * as D from './data.mjs';
import * as E from './engine.mjs';
import { tankStats } from './battle.mjs';

/** Статический каталог для клиента (кешируется по CONFIG_VERSION). */
export function buildConfig() {
  return {
    version: D.CONFIG_VERSION,
    classes: D.CLASSES,
    buildings: D.BUILDING_ORDER.map((id) => {
      const b = D.BUILDINGS[id];
      return { id, name: b.name, category: b.category, desc: b.desc, maxLevel: b.maxLevel, power: b.power };
    }),
    tanks: D.TANKS.map((t) => ({
      id: t.id, name: t.name, country: t.country, class: t.class, rarity: t.rarity, tier: t.tier, shape: t.shape,
      desc: t.desc, history: t.history, special: t.special || null, base: { hp: t.hp, armor: t.armor, attack: t.attack, mobility: t.mobility },
      cost: t.cost, reqHangar: t.reqHangar, reqLevel: t.reqLevel, reqTech: t.reqTech,
    })),
    techs: D.TECHS.map((t) => ({ id: t.id, branch: t.branch, name: t.name, desc: t.desc, req: t.req, lab: t.lab, cost: t.cost })),
    branches: D.BRANCHES,
    missionTypes: D.MISSION_TYPES,
    arenas: D.ARENAS,
    weather: D.WEATHER,
    roles: D.ROLES,
    achievements: D.ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, goal: a.goal, reward: a.reward })),
    resources: D.RESOURCES,
    levelGrowth: D.LEVEL_GROWTH,
    tutorial: D.TUTORIAL.map((t) => ({ id: t.id, title: t.title, text: t.text, screen: t.screen, reward: t.reward })),
    dailyBonus: D.DAILY_BONUS,
    items: D.ITEMS, modules: D.MODULES.map((m) => ({ id: m.id, name: m.name, desc: m.desc })), moduleMax: D.MODULE_MAX,
    campaign: D.CAMPAIGN.map((c) => ({ id: c.id, title: c.title, intro: c.intro, reward: c.reward, stages: c.stages.map((st) => st.id) })),
    raid: D.RAID, war: { minPoints: D.WAR.minPoints, bands: D.WAR.bands },
    ranks: D.RANKS,
    crew: D.CREW,
    skills: Object.fromEntries(Object.keys(D.CLASSES).map((c) => [c, D.skillsFor(c).map((k) => ({ id: k.id, name: k.name, desc: k.desc, max: k.max }))])),
    camos: D.CAMOS.map((c) => ({ id: c.id, name: c.name, text: c.text })),
    emblems: D.EMBLEMS.map((c) => ({ id: c.id, name: c.name, text: c.text })),
    pass: { levels: D.PASS.levels, xpPerLevel: D.PASS.xpPerLevel, rewards: D.PASS_REWARDS },
    pvpTiers: D.PVP_TIERS, pvp: { dailyTickets: D.PVP.dailyTickets, minLevel: D.PVP.minLevel, win: D.PVP.win, loss: D.PVP.loss },
    clan: { minLevel: D.CLAN.minLevel, maxMembers: D.CLAN.maxMembers, goalPerMember: D.CLAN.goalPerMember, reward: D.CLAN.reward, minName: D.CLAN.minName, maxName: D.CLAN.maxName },
    referral: { qualifyLevel: D.REFERRAL.qualifyLevel, perFriend: D.REFERRAL.perFriend, welcome: D.REFERRAL.welcome },
  };
}

const sec = (ms) => Math.round(ms / 1000);
const problemOf = (p) => (p ? { code: p.code, message: p.message } : null);

function missionView(state, m, intel) {
  const problem = E.checkMission(state, m);
  const locked = problem && ['commander_level', 'radar', 'training', 'locked_prev'].includes(problem.code);
  const view = {
    id: m.id, type: m.type, name: m.name, desc: m.desc, arena: m.arena, weather: m.weather,
    fuel: E.fuelCost(state, m), reqLevel: m.reqLevel, reqRadar: m.reqRadar, reqTraining: m.reqTraining || 0,
    turnLimit: m.turnLimit || 0, rules: m.rules || null, bonus: m.bonus, reward: m.reward,
    clears: state.missionClears[m.id] || 0, locked: Boolean(locked), problem: problemOf(problem), intel,
    enemyCount: m.enemies.length,
    ...(m.chapter ? { chapter: m.chapter, order: m.order, story: m.story } : {}),
  };
  if (!locked) {
    if (intel >= 2 || m.chapter) {
      view.enemies = m.enemies.map((e) => {
        const def = D.TANK_BY_ID[e.tankId];
        const o = { name: def.name, class: def.class, level: e.level, shape: def.shape, tankId: def.id };
        if (intel >= 3 || m.chapter) {
          const s = tankStats(def, e.level, {});
          Object.assign(o, { role: e.role, hp: Math.round(s.hp * m.diff * (e.role === 'boss' ? 1.25 : 1)), attack: Math.round(s.attack * m.diff), armor: Math.round(s.armor * m.diff) });
        }
        return o;
      });
    } else {
      view.enemies = m.enemies.map((e) => ({ name: 'Неопознанная цель', class: D.TANK_BY_ID[e.tankId].class, level: 0, shape: -1 }));
    }
  }
  return view;
}

function battleView(b) {
  if (!b) return null;
  const unit = (u) => ({ tankId: u.tankId, name: u.name, cls: u.cls, role: u.role, hp: u.hp, maxHp: u.maxHp, attack: u.attack, armor: u.armor, mobility: u.mobility, energy: u.energy, shield: u.shield > 0, aim: u.aim });
  return {
    id: b.id, missionId: b.missionId, title: b.title, pvp: b.pvp, raid: b.raid, status: b.status, turn: b.turn, turnLimit: b.turnLimit, arena: b.arena, weather: b.weather,
    squad: b.squad.map(unit), active: b.active, enemies: b.enemies.map(unit), foe: b.foe, freeRepairs: b.freeRepairs,
    log: b.log.slice(-14), reward: b.reward, claimed: b.claimed,
  };
}

function pvpView(state, now) {
  const p = state.pvp; const tier = D.tierFor(p.rating);
  const prev = p.prev && { season: p.prev.season, title: D.seasonTitle(p.prev.season), rating: p.prev.rating, tier: D.PVP_TIERS.find((t) => t.id === p.prev.tier), claimed: p.prev.claimed };
  const next = D.PVP_TIERS.find((t) => t.min > p.rating) || null;
  return {
    rating: p.rating, tier: { id: tier.id, name: tier.name }, nextTier: next && { name: next.name, at: next.min }, bestEver: p.bestEver,
    played: p.played, wins: p.wins, losses: p.losses, ticketsLeft: Math.max(0, D.PVP.dailyTickets - p.used), ticketsMax: D.PVP.dailyTickets,
    season: p.season, seasonTitle: D.seasonTitle(p.season), seasonEndsAt: D.seasonEndsAt(now), minLevel: D.PVP.minLevel,
    defenseIds: p.defenseIds.length ? p.defenseIds : state.squad, defense: p.defense, power: E.defensePower(p.defense), prev,
  };
}
function passView(state, now) {
  return { season: state.pass.season, seasonTitle: D.seasonTitle(state.pass.season), endsAt: D.seasonEndsAt(now), xp: state.pass.xp, level: E.passLevel(state), claimed: state.pass.claimed };
}
function cosmeticsView(state) {
  const mark = (list) => list.map((c) => ({ id: c.id, unlocked: E.cosmeticUnlocked(state, c), progress: c.req ? Math.min(c.req.goal, E.cosmeticMetric(state, c.req.metric)) : 0, goal: c.req ? c.req.goal : 0 }));
  return { camos: mark(D.CAMOS), emblems: mark(D.EMBLEMS) };
}

export function buildView(state, now, opts = {}) {
  const ts = opts.timeScale || 1;
  const bonuses = E.bonusesOf(state);
  const power = E.powerOf(state, bonuses);
  const caps = E.capsOf(state, bonuses);
  const rates = E.ratesOf(state, bonuses);
  const level = E.commanderLevel(state);
  const xpBase = D.xpForLevel(level); const xpNext = D.xpForLevel(level + 1);
  const hq = state.buildings.hq; const hangar = state.buildings.hangar;
  const resources = Object.fromEntries(D.RESOURCES.map((k) => [k, Math.floor(state.res[k] + 1e-9)]));

  const buildings = D.BUILDING_ORDER.map((id) => {
    const def = D.BUILDINGS[id]; const lvl = state.buildings[id];
    const queued = state.buildQueue.find((q) => q.building === id) || null;
    const to = lvl + 1;
    const next = lvl >= def.maxLevel ? null : {
      level: to, cost: D.buildCost(id, to), seconds: sec(E.buildDurationMs(state, id, to, ts, bonuses)),
      reqHq: D.requiredHq(id, to), reqCommander: id === 'hq' ? D.requiredCommander(to) : 0,
    };
    return { id, level: lvl, queued, next, problem: next ? problemOf(E.checkBuild(state, id)) : null };
  });

  const tanks = D.TANKS.map((def) => {
    const owned = state.tanks[def.id];
    const lvl = owned ? owned.level : 1;
    const tb = owned ? E.combinedBonuses(state, def.id, bonuses) : bonuses;
    const maxLvl = D.maxTankLevel(state.buildings.training);
    const produce = owned ? null : state.produceQueue.find((q) => q.tankId === def.id) || null;
    const upCost = owned && owned.level < maxLvl ? D.upgradeCost(def, owned.level) : null;
    return {
      id: def.id, owned: Boolean(owned), level: owned ? owned.level : 0,
      stats: tankStats(def, lvl, tb),
      nextStats: owned && owned.level < maxLvl ? tankStats(def, lvl + 1, tb) : null,
      crew: owned ? E.crewInfo(owned, def.class) : null,
      modules: owned ? D.MODULES.map((m) => {
        const lvl = owned.modules?.[m.id] || 0; const next = lvl + 1;
        return { id: m.id, level: lvl, cost: lvl >= D.MODULE_MAX ? null : D.moduleCost(def, next), needLab: lvl >= D.MODULE_MAX ? 0 : next, blocked: lvl >= D.MODULE_MAX ? 'Максимальный уровень' : state.buildings.lab < next ? `Нужен исследовательский центр ${next} уровня` : null };
      }) : null,
      cosmetic: owned ? (state.cosmetics[def.id] || { camo: 'default', emblem: 'none' }) : null,
      upgradeCost: upCost, upgradeProblem: owned ? problemOf(E.checkUpgradeTank(state, def.id)) : null,
      produceSeconds: owned ? 0 : sec(E.produceDurationMs(state, def, ts, bonuses)),
      producing: produce, problem: owned ? null : problemOf(E.checkProduce(state, def.id)),
    };
  });

  const techs = D.TECHS.map((t) => {
    const done = state.researchDone.includes(t.id);
    const queued = state.researchQueue.find((q) => q.techId === t.id) || null;
    return { id: t.id, done, queued, seconds: sec(E.researchDurationMs(state, t, ts)), problem: done || queued ? null : problemOf(E.checkResearch(state, t.id)) };
  });

  const intel = D.radarIntel(state.buildings.radar);
  const missions = D.MISSIONS.map((m) => missionView(state, m, intel));

  const quests = state.daily.quests.map((q) => {
    const t = E.questTemplate(q.tpl);
    return { id: q.id, name: t.name, desc: t.desc(q.goal), goal: q.goal, progress: q.progress, claimed: q.claimed, reward: t.reward(q.goal) };
  });
  const achievements = D.ACHIEVEMENTS.map((a) => {
    const value = Math.min(a.goal, E.achievementValue(state, a.metric));
    return { id: a.id, value, claimed: state.achievementsClaimed.includes(a.id) };
  });

  return {
    serverTime: now, timeScale: ts, nickname: state.nickname,
    commander: { level, rank: D.rankFor(level), xp: state.xp, xpBase, xpNext: level >= D.MAX_COMMANDER_LEVEL ? xpBase : xpNext },
    resources, caps, rates: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    power, bonuses,
    base: {
      level: hq, buildSlots: D.buildSlots(hq), productionSlots: D.productionSlots(hangar), researchSlots: D.researchSlots(state.buildings.lab),
      garage: { used: Object.keys(state.tanks).length + state.produceQueue.length, capacity: D.garageCapacity(hangar) },
      squadLimit: D.squadLimit(hangar), maxTankLevel: D.maxTankLevel(state.buildings.training),
      freeRepairs: D.freeRepairs(state.buildings.repair), intel,
    },
    buildings, buildQueue: state.buildQueue, produceQueue: state.produceQueue, researchQueue: state.researchQueue,
    tanks, techs, missions, squad: state.squad, battle: battleView(state.battle),
    quests, questsResetAt: E.nextDayAt(now), achievements,
    tutorial: { step: state.tutorial.step, total: D.TUTORIAL.length, done: state.tutorial.done, ready: E.tutorialReady(state) },
    bonus: E.bonusStatus(state, now),
    weekly: E.weeklyStatus(state, now),
    notify: state.notify.enabled, notifyTypes: state.notify.types,
    pvp: pvpView(state, now), pass: passView(state, now), cosmetics: cosmeticsView(state),
    clan: { points: state.clan.points, claimed: state.clan.claimedWeek === state.clan.week, week: state.clan.week, goalPerMember: D.CLAN.goalPerMember, prevWeek: state.clan.prevWeek, prevPoints: state.clan.prevPoints, warClaimed: state.clan.warClaimedWeek === state.clan.prevWeek },
    items: state.items, raid: { best: state.raid.best, used: state.raid.used, attempts: D.RAID.attempts, fuel: D.RAID.fuel, minLevel: D.RAID.minLevel, season: state.raid.season },
    campaign: { claimed: state.campaign.claimed },
    referral: { ...E.referralStatus(state, opts.referral), link: opts.referralLink || null, welcomed: state.referral.welcomed },
    stats: state.stats, events: state.events, legacy: state.legacy ? { importedAt: state.legacy.importedAt } : null,
  };
}
