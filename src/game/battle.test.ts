import {describe,it,expect,vi,afterEach} from 'vitest';
import {resolveAction,enemyTurn,type Fighter} from './battle';
const fighter=():Fighter=>({name:'Тестовый танк',hp:100,maxHp:100,attack:30,armor:20,energy:3,maxEnergy:3});
afterEach(()=>vi.restoreAllMocks());

describe('тактическая боевая система',()=>{
  it('атака снижает HP противника и не уходит ниже нуля',()=>{vi.spyOn(Math,'random').mockReturnValue(0.5);const p=fighter(),e=fighter();e.hp=5;resolveAction(p,e,'attack');expect(e.hp).toBe(0);expect(p.energy).toBe(2);});
  it('прицеливание тратит энергию и усиливает только следующий удар',()=>{vi.spyOn(Math,'random').mockReturnValue(0.5);const p=fighter(),e=fighter();resolveAction(p,e,'aim');expect(p.aimBonus).toBe(18);const before=e.hp;resolveAction(p,e,'attack');expect(before-e.hp).toBeGreaterThan(30);expect(p.aimBonus).toBe(0);});
  it('нельзя ремонтироваться без двух зарядов',()=>{const p=fighter(),e=fighter();p.hp=50;p.energy=1;const message=resolveAction(p,e,'repair');expect(p.hp).toBe(50);expect(message).toContain('Недостаточно энергии');});
  it('ремонт не превышает максимальную прочность',()=>{const p=fighter(),e=fighter();p.hp=90;resolveAction(p,e,'repair');expect(p.hp).toBe(100);});
  it('оборона уменьшает следующий входящий урон и затем заканчивается',()=>{vi.spyOn(Math,'random').mockReturnValue(0.5);const p=fighter(),e=fighter();resolveAction(p,e,'guard');const before=p.hp;enemyTurn(p,e);expect(before-p.hp).toBeLessThan(20);expect(p.shieldTurns).toBe(0);});
  it('инженер чинится при низком HP',()=>{vi.spyOn(Math,'random').mockReturnValue(0.1);const p=fighter(),e=fighter();e.role='engineer';e.hp=40;const msg=enemyTurn(p,e);expect(e.hp).toBeGreaterThan(40);expect(msg).toContain('ремонтный модуль');});
  it('разведчик использует фланговый манёвр',()=>{vi.spyOn(Math,'random').mockReturnValue(0.5);const p=fighter(),e=fighter();e.role='skirmisher';const before=p.hp;const msg=enemyTurn(p,e);expect(p.hp).toBeLessThan(before);expect(msg).toContain('флангового обхода');});
  it('здоровье игрока никогда не становится отрицательным',()=>{vi.spyOn(Math,'random').mockReturnValue(0.99);const p=fighter(),e=fighter();p.hp=1;for(let i=0;i<30;i++)enemyTurn(p,e);expect(p.hp).toBeGreaterThanOrEqual(0);});
});
