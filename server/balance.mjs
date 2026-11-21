// Симуляция баланса: как проходят миссии типичные отряды (простая стратегия). Не часть тестов.
import * as D from './game/data.mjs';
import * as E from './game/engine.mjs';
import { createState } from './game/legacy.mjs';
let seed = 12345; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const policy = (b) => { const u = b.squad[b.active]; if (u.hp < u.maxHp * 0.35 && (b.freeRepairs > 0 || u.energy >= 2)) return 'repair'; if (u.energy >= 3 && u.cls !== 'light') return 'overdrive'; if (u.energy >= 1) return 'attack'; return 'guard'; };
function run(profile, mission, squad, n = 200) {
  let wins = 0, turns = 0;
  for (let i = 0; i < n; i++) {
    let s = createState(null, {}, 0);
    for (const k of D.RESOURCES) s.res[k] = 1e6;
    Object.assign(s.buildings, profile.b); s.xp = D.xpForLevel(profile.lvl); s.researchDone = profile.tech;
    for (const [id, l] of Object.entries(profile.tanks)) s.tanks[id] = { level: l };
    s = E.perform(s, 'battle/start', { missionId: mission, squad }, { now: 0, rng });
    let g = 0;
    while (s.battle.status === 'active' && g++ < 100) s = E.perform(s, 'battle/action', { battleId: s.battle.id, action: policy(s.battle) }, { now: 0, rng });
    if (s.battle.status === 'won') wins++; turns += s.battle.turn;
  }
  return `${mission}: ${Math.round(wins / n * 100)}% побед, ср. ходов ${(turns / n).toFixed(1)}`;
}
const early = { lvl: 3, b: { hq: 2, hangar: 2, training: 0, radar: 0, repair: 0 }, tech: [], tanks: { t34: 2, t70: 2 } };
const mid = { lvl: 10, b: { hq: 6, hangar: 5, training: 3, radar: 3, repair: 2 }, tech: ['arm1', 'arm2', 'wpn1', 'wpn2', 'eng1'], tanks: { tiger: 6, t72: 6, su100: 5, t34: 5 } };
const late = { lvl: 18, b: { hq: 9, hangar: 8, training: 7, radar: 6, repair: 5 }, tech: ['arm1', 'arm2', 'arm3', 'wpn1', 'wpn2', 'wpn3', 'eng1', 'eng2', 'eng3'], tanks: { abrams: 8, t90: 8, merkava: 8 } };
console.log('— начало (ур.3, Т-34 ур.2)'); for (const m of ['r1', 'r2', 'd1', 'c1']) console.log(run(early, m, m==='r1'||m==='r2'?['t34']:['t34','t70']));
console.log('— середина (ур.9, отряд 3)'); for (const m of ['r3', 'd2', 'c2', 'b1']) console.log(run(mid, m, ['tiger', 't72', 'su100']));
for (const m of ['d3', 'c3']) console.log(run(mid, m, ['tiger', 't72', 'su100']));
console.log('— поздняя (ур.18)'); for (const m of ['b2', 'b3']) console.log(run(late, m, ['abrams', 't90', 'merkava']));
