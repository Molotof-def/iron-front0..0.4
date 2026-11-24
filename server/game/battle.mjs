// Боевая система IRON FRONT. Все функции чистые: на вход состояние боя и генератор случайных чисел.
// Механики прежней версии (атака, оборона, прицеливание, ремонт, залп, роли противника) сохранены
// и расширены классами техники, погодой, аренами и отрядами.
import { ARENAS, CLASSES, LEVEL_GROWTH, WEATHER } from './data.mjs';

export const ACTIONS = ['attack', 'guard', 'aim', 'repair', 'overdrive'];
export const MAX_ENERGY = 3;
const LOG_LIMIT = 40;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const roll = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/** Параметры машины с учётом уровня и бонусов исследований. */
export function tankStats(def, level, bonuses = {}) {
  const k = 1 + LEVEL_GROWTH * (level - 1);
  return {
    hp: Math.round(def.hp * k * (1 + (bonuses.hpPct || 0) / 100)),
    attack: Math.round(def.attack * k * (1 + (bonuses.attackPct || 0) / 100)),
    armor: Math.round(def.armor * k * (1 + (bonuses.armorPct || 0) / 100)),
    mobility: def.mobility + (bonuses.mobilityFlat || 0),
  };
}

const unitFrom = (def, stats, role) => ({
  tankId: def.id, name: def.name, cls: def.class, role: role || null,
  hp: stats.hp, maxHp: stats.hp, attack: stats.attack, armor: stats.armor, mobility: stats.mobility,
  energy: MAX_ENERGY, shield: 0, aim: 0, ambush: def.class === 'td', acted: 0,
});

/** special — личные эффекты экипажа: evadeBonus, guardBonus, ambushBonus, splashBonus, repairPct. */
export function makePlayerUnit(def, level, bonuses, mission, special = {}) {
  const s = tankStats(def, level, bonuses);
  const arena = ARENAS[mission.arena];
  s.armor = Math.round((s.armor + arena.playerArmor) * (1 + (mission.armorBonus || 0)));
  return Object.assign(unitFrom(def, s), {
    evadeBonus: special.evadeBonus || 0, guardBonus: special.guardBonus || 0, ambushBonus: special.ambushBonus || 0,
    splashBonus: special.splashBonus || 0, repairPct: special.repairPct || 0,
  });
}

/** Защитник из снимка отряда другого игрока (PvP): параметры уже посчитаны с бонусами владельца. */
export function makeSnapshotUnit(def, snap, role) {
  return unitFrom(def, { hp: snap.hp, attack: snap.attack, armor: snap.armor, mobility: snap.mobility }, role);
}

export function makeEnemyUnit(def, level, role, mission) {
  const base = tankStats(def, level, {});
  const arena = ARENAS[mission.arena];
  const s = {
    hp: Math.round(base.hp * mission.diff), attack: Math.round(base.attack * mission.diff),
    armor: Math.round(base.armor * mission.diff) + arena.enemyArmor, mobility: base.mobility,
  };
  if (role === 'boss') s.hp = Math.round(s.hp * 1.25);
  return unitFrom(def, s, role);
}

export function createBattle({ id, mission, squad, enemies, now, freeRepairs, repairPct, title, pvp }) {
  return {
    id, missionId: mission.id, title: title || mission.name, pvp: pvp || null, startedAt: now, turn: 0, status: 'active',
    squad, active: 0, enemies, foe: 0,
    turnLimit: mission.turnLimit || 0, arena: mission.arena, weather: mission.weather,
    freeRepairs, repairPct, lost: 0, log: [`Операция «${mission.name}» началась. ${ARENAS[mission.arena].name}, ${WEATHER[mission.weather].name.toLowerCase()}.`],
    reward: null, claimed: false,
  };
}

const say = (b, msg) => { b.log.push(msg); if (b.log.length > LOG_LIMIT) b.log.splice(0, b.log.length - LOG_LIMIT); };
const evasionOf = (unit, weather) => clamp((unit.mobility - 28) * 0.008 + (CLASSES[unit.cls].evasion || 0) + (unit.evadeBonus || 0) + WEATHER[weather].evade, 0, 0.3);
const frontPlayer = (b) => b.squad[b.active];
const frontEnemy = (b) => b.enemies[b.foe];

/** Выполняет действие игрока. Возвращает { ok:false, message } без изменения боя, если действие недопустимо. */
function resolvePlayer(b, action, rng) {
  const p = frontPlayer(b); const e = frontEnemy(b); const w = WEATHER[b.weather]; const cls = CLASSES[p.cls];
  if (action === 'attack' || action === 'overdrive') {
    const need = action === 'attack' ? 1 : 3;
    if (p.energy < need) return { ok: false, message: need === 1 ? 'Недостаточно энергии: для атаки нужен 1 заряд.' : 'Для залпового удара требуется 3 энергии.' };
    p.energy -= need;
    if (rng() < evasionOf(e, b.weather)) {
      p.aim = 0;
      say(b, `${e.name} уходит из-под удара благодаря мобильности. Выстрел мимо.`);
      return { ok: true };
    }
    let mul = w.attackMul;
    let ambushUsed = false;
    if (p.ambush && cls.ambush) { mul *= cls.ambush + (p.ambushBonus || 0); p.ambush = false; ambushUsed = true; }
    if (CLASSES[e.cls].fragile) mul *= CLASSES[e.cls].fragile;
    if (action === 'attack') {
      const base = p.attack + p.aim + roll(rng, -3, 7);
      const dmg = Math.max(6, Math.round(base * mul) - Math.floor(e.armor * (cls.armorFactor ?? 0.38)));
      e.hp = Math.max(0, e.hp - dmg);
      say(b, `Прямое попадание${ambushUsed ? ' из засады' : ''}${p.aim ? ' с прицеливанием' : ''}: ${e.name} получает ${dmg} урона.`);
    } else {
      const base = Math.floor(p.attack * 1.65) + roll(rng, 4, 12);
      const dmg = Math.max(10, Math.round(base * mul) - Math.floor(e.armor * (cls.overFactor ?? 0.25)));
      e.hp = Math.max(0, e.hp - dmg);
      say(b, `ЗАЛП! ${p.name} наносит ${dmg} урона по ${e.name}.`);
      if (p.cls === 'arty') {
        for (const other of b.enemies) {
          if (other !== e && other.hp > 0) {
            const splash = Math.max(5, Math.floor(dmg * (0.5 + (p.splashBonus || 0))));
            other.hp = Math.max(0, other.hp - splash);
            say(b, `Осколки задевают ${other.name}: ${splash} урона.`);
          }
        }
      }
    }
    p.aim = 0;
    return { ok: true };
  }
  if (action === 'guard') {
    p.shield = 1; p.energy = Math.min(MAX_ENERGY, p.energy + 1);
    say(b, `${p.name} занимает оборонительную позицию: следующий удар будет ослаблен, +1 энергия.`);
    return { ok: true };
  }
  if (action === 'aim') {
    if (p.energy < 1) return { ok: false, message: 'Недостаточно энергии: для прицеливания нужен 1 заряд.' };
    p.energy -= 1; p.aim = 18;
    say(b, 'Стабилизатор наведения готов: следующая атака получит +18 к силе удара.');
    return { ok: true };
  }
  if (action === 'repair') {
    if (p.hp >= p.maxHp) return { ok: false, message: 'Ремонт не требуется: бронекорпус полностью исправен.' };
    const free = b.freeRepairs > 0;
    if (!free && p.energy < 2) return { ok: false, message: 'Недостаточно энергии: для ремонта нужны 2 заряда.' };
    if (free) b.freeRepairs -= 1; else p.energy -= 2;
    const amount = Math.round(26 * (1 + (b.repairPct + (p.repairPct || 0)) / 100) * (cls.repairMul || 1));
    const restored = Math.min(amount, p.maxHp - p.hp);
    p.hp += restored;
    say(b, `Ремонтная бригада восстанавливает ${restored} прочности${free ? ' (бесплатный ремонт)' : ''}.`);
    return { ok: true };
  }
  return { ok: false, message: 'Команда не распознана.' };
}

/** Ход противника. Поведение зависит от роли. */
function resolveEnemy(b, rng) {
  const p = frontPlayer(b); const e = frontEnemy(b); const w = WEATHER[b.weather];
  const r = rng(); const role = e.role || 'assault';
  e.acted += 1;

  if (rng() < evasionOf(p, b.weather)) {
    e.energy = Math.min(MAX_ENERGY, e.energy + 1);
    say(b, `${p.name} уклоняется от атаки благодаря мобильности.`);
    return;
  }
  if (role === 'engineer' && e.hp <= e.maxHp * 0.62 && e.energy >= 2 && r < 0.48) {
    const heal = Math.min(22, e.maxHp - e.hp);
    e.hp += heal; e.energy -= 2;
    say(b, `${e.name} использует ремонтный модуль: +${heal} прочности.`);
    return;
  }
  const fragile = CLASSES[p.cls].fragile || 1;
  const hit = (base, min) => Math.max(min, Math.round(base * w.attackMul * fragile) - Math.floor(p.armor * 0.34));
  const apply = (dmg) => {
    if (p.shield > 0) {
      const g = Math.max(0.15, (CLASSES[p.cls].guardMul ?? 0.45) - (p.guardBonus || 0));
      dmg = Math.max(2, Math.floor(dmg * g));
      p.shield = 0; p.armor = Math.max(0, p.armor - 4);
      p.hp = Math.max(0, p.hp - dmg);
      return `${dmg} урона (оборона смягчила удар)`;
    }
    p.hp = Math.max(0, p.hp - dmg);
    return `${dmg} урона`;
  };
  if (role === 'boss' && e.acted % 3 === 0) {
    const text = apply(hit(Math.round((e.attack + roll(rng, 2, 8)) * 1.6), 12));
    e.energy = Math.min(MAX_ENERGY, e.energy + 1);
    say(b, `${e.name} производит командирский залп: ${text}.`);
    return;
  }
  if (role === 'skirmisher' && e.energy >= 2 && r < 0.55) {
    e.energy -= 2;
    const text = apply(hit(e.attack + roll(rng, 3, 10), 7));
    say(b, `${e.name} совершает фланговый манёвр: ${text}.`);
    return;
  }
  if (role === 'guardian' && r < 0.42) {
    e.shield = 1; e.energy = Math.min(MAX_ENERGY, e.energy + 1);
    say(b, `${e.name} закрывается бронеплитами и готовит контратаку.`);
    return;
  }
  if (e.energy >= 1 && (role === 'assault' || role === 'boss' || r < 0.72)) {
    e.energy -= 1;
    const text = apply(hit(e.attack + roll(rng, -2, 5), 5));
    e.energy = Math.min(MAX_ENERGY, e.energy + 1);
    say(b, `${e.name} атакует: ${text}.`);
    return;
  }
  e.energy = Math.min(MAX_ENERGY, e.energy + 1);
  say(b, `${e.name} перегруппировывается и восстанавливает энергию.`);
}

/** Применяет щит защитника к входящему урону игрока: упрощённо уменьшает следующий удар по врагу. */
function applyEnemyGuard(b) {
  const e = frontEnemy(b);
  if (e && e.shield > 0) { e.shield = 0; }
}

/** Один раунд: действие игрока, затем ответ противника. Меняет объект боя. */
export function playRound(b, action, rng = Math.random) {
  if (b.status !== 'active') return { ok: false, message: 'Бой уже завершён.' };
  if (!ACTIONS.includes(action)) return { ok: false, message: 'Неизвестное действие.' };
  const p = frontPlayer(b); const e = frontEnemy(b);
  // Защитник держит стойку: удар по нему слабее.
  const hpBefore = e.hp;
  const result = resolvePlayer(b, action, rng);
  if (!result.ok) return result;
  if (e.shield > 0 && e.hp > 0 && e.hp < hpBefore) {
    const lost = hpBefore - e.hp; const give = Math.floor(lost * 0.4);
    e.hp = Math.min(e.maxHp, e.hp + give); e.shield = 0;
    say(b, `Броня ${e.name} смягчила удар: урон снижен на ${give}.`);
  }
  applyEnemyGuard(b);
  b.turn += 1;

  if (e.hp <= 0) {
    say(b, `${e.name} выведен из строя.`);
    const next = b.enemies.findIndex((x) => x.hp > 0);
    if (next === -1) { b.status = 'won'; say(b, 'Победа! Все цели уничтожены.'); return { ok: true }; }
    b.foe = next;
    say(b, `На позицию выходит ${b.enemies[next].name}.`);
  } else {
    resolveEnemy(b, rng);
  }

  if (p.hp <= 0) {
    b.lost += 1;
    say(b, `${p.name} уничтожен.`);
    const nextP = b.squad.findIndex((x) => x.hp > 0);
    if (nextP === -1) { b.status = 'lost'; say(b, 'Поражение. Весь отряд выведен из строя.'); return { ok: true }; }
    b.active = nextP;
    say(b, `В бой вступает ${b.squad[nextP].name}.`);
  } else {
    p.energy = Math.min(MAX_ENERGY, p.energy + 1); // перезарядка в конце раунда
  }
  if (b.turnLimit && b.turn >= b.turnLimit && b.status === 'active') {
    b.status = 'lost';
    say(b, 'Время операции вышло. Задача не выполнена.');
  }
  return { ok: true };
}

export function retreat(b) {
  if (b.status !== 'active') return { ok: false, message: 'Бой уже завершён.' };
  b.status = 'retreated';
  say(b, 'Отряд отступил с поля боя.');
  return { ok: true };
}

/** Награда. Считается один раз при завершении боя; выдаётся при /battle/claim. */
export function computeReward(mission, b, bonuses, trainingLevel, firstClear, eventMul = 1) {
  const empty = { credits: 0, scrap: 0, steel: 0, science: 0, xp: 0, fuel: 0 };
  if (b.status === 'retreated') return { ...empty, bonus: false, firstClear: false };
  const won = b.status === 'won';
  const base = mission.reward;
  const reward = { ...empty };
  const rewardMul = 1 + (bonuses.rewardPct || 0) / 100;
  const xpMul = 1 + ((bonuses.xpPct || 0) + trainingLevel * 3) / 100;
  let bonusDone = false;
  if (won) {
    if (mission.bonus?.turns) bonusDone = b.turn <= mission.bonus.turns;
    if (mission.bonus?.noLoss) bonusDone = b.lost === 0;
  }
  const bonusMul = (bonusDone ? 1.2 : 1) * eventMul;
  const firstMul = won && firstClear ? 1.5 : 1;
  const k = won ? 1 : 0.25;
  reward.credits = Math.round(base.credits * k * rewardMul * bonusMul * firstMul);
  reward.scrap = Math.round(base.scrap * k * rewardMul * bonusMul);
  reward.steel = won ? Math.round(base.steel * rewardMul * bonusMul) : 0;
  reward.science = Math.round(base.science * (won ? 1 : 0.2) * eventMul);
  reward.xp = Math.round(base.xp * (won ? 1 : 0.2) * xpMul * firstMul * eventMul);
  return { ...reward, bonus: bonusDone, firstClear: won && firstClear, event: eventMul > 1 };
}
