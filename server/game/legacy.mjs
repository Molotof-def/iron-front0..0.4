// Импорт старого сохранения v0.4.0 (таблица player_saves) в новую модель.
// Старая таблица не изменяется и не удаляется. Импорт выполняется один раз при первом входе в v2.
import * as D from './data.mjs';
import { newPlayer, pushEvent, settle } from './engine.mjs';

const num = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const NICK = /^[\p{L}\p{N} _.\-]{2,18}$/u;

export function cleanNickname(raw) {
  const n = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return NICK.test(n) ? n : 'Командир';
}

export function migrateLegacy(legacy, profile, now) {
  const s = newPlayer(now, cleanNickname(legacy?.nickname || profile?.firstName));
  s.res.credits = num(legacy.credits, 0, 1_000_000, s.res.credits);
  s.res.steel = num(legacy.steel, 0, 1_000_000, s.res.steel);
  s.res.science = num(legacy.science, 0, 100_000, s.res.science);
  s.xp = Math.floor(num(legacy.xp, 0, 1_000_000, 0));

  for (const [oldId, newId] of Object.entries(D.LEGACY_BUILDINGS)) {
    const lvl = legacy.buildings?.[oldId];
    if (Number.isFinite(lvl)) s.buildings[newId] = Math.max(D.BUILDINGS[newId].startLevel, Math.min(D.BUILDINGS[newId].maxLevel, Math.floor(lvl)));
  }
  const done = new Set();
  const add = (id) => {
    if (!id || done.has(id) || !D.TECH_BY_ID[id]) return;
    add(D.TECH_BY_ID[id].req); // сохраняем целостность зависимостей
    done.add(id);
  };
  if (Array.isArray(legacy.research)) for (const old of legacy.research) add(D.LEGACY_RESEARCH[old]);
  s.researchDone = [...done];

  for (const [id, t] of Object.entries(legacy.tanks || {})) {
    if (t?.owned && D.TANK_BY_ID[id]) s.tanks[id] = { level: Math.floor(num(t.level, 1, 30, 1)) };
  }
  s.squad = [D.TANK_BY_ID[legacy.activeTank] && s.tanks[legacy.activeTank] ? legacy.activeTank : D.STARTER_TANK];

  s.stats.wins = Math.floor(num(legacy.wins, 0, 100_000, 0));
  s.stats.losses = Math.floor(num(legacy.losses, 0, 100_000, 0));
  s.stats.battles = Math.floor(num(legacy.battles, 0, 200_000, s.stats.wins + s.stats.losses));
  s.stats.researched = s.researchDone.length;
  s.stats.upgrades = Math.floor(num(legacy.missions?.upgrades, 0, 100_000, 0));
  s.legacy = { importedAt: now, source: 'player_saves', version: 1 };
  pushEvent(s, 'info', 'Прогресс из версии 0.4.0 перенесён в новую базу. Старые данные сохранены.', now);
  settle(s, now);
  return s;
}

/** Создаёт начальное состояние игрока: из старого сохранения либо с нуля. */
export function createState(legacy, profile, now = Date.now()) {
  if (legacy && typeof legacy === 'object' && legacy.version === 1 && legacy.tanks && legacy.buildings) {
    return migrateLegacy(legacy, profile, now);
  }
  const s = newPlayer(now, cleanNickname(profile?.firstName));
  pushEvent(s, 'info', 'Добро пожаловать, командир! База готова к работе.', now);
  settle(s, now);
  return s;
}
