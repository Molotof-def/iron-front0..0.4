export type EnemyRole = 'assault' | 'guardian' | 'engineer' | 'skirmisher';
export interface Fighter {
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  armor: number;
  speed?: number;
  energy: number;
  maxEnergy?: number;
  shieldTurns?: number;
  aimBonus?: number;
  role?: EnemyRole;
}
export type Action = 'attack' | 'guard' | 'aim' | 'repair' | 'overdrive';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const roll = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/** Resolves one player action. Invalid actions are rejected without changing either unit. */
export function resolveAction(player: Fighter, enemy: Fighter, action: Action): string {
  const maxEnergy = player.maxEnergy ?? 3;
  player.energy = clamp(player.energy, 0, maxEnergy);

  if (action === 'attack') {
    if (player.energy < 1) return 'Недостаточно энергии: для атаки нужен 1 заряд.';
    player.energy -= 1;
    const bonus = player.aimBonus ?? 0;
    const damage = Math.max(6, player.attack + bonus + roll(-3, 7) - Math.floor(enemy.armor * 0.38));
    enemy.hp = Math.max(0, enemy.hp - damage);
    player.aimBonus = 0;
    return `Прямое попадание! ${enemy.name} получает ${damage} урона${bonus ? ' (с бонусом прицеливания)' : ''}.`;
  }

  if (action === 'guard') {
    player.shieldTurns = 1;
    player.energy = Math.min(maxEnergy, player.energy + 1);
    return 'Танк занял оборонительную позицию. Следующий входящий удар будет ослаблен; +1 энергия.';
  }

  if (action === 'aim') {
    if (player.energy < 1) return 'Недостаточно энергии: для прицеливания нужен 1 заряд.';
    player.energy -= 1;
    player.aimBonus = 18;
    return 'Стабилизатор наведения готов. Следующая атака получит +18 к силе удара.';
  }

  if (action === 'repair') {
    if (player.energy < 2) return 'Недостаточно энергии: для ремонта нужны 2 заряда.';
    if (player.hp >= player.maxHp) return 'Ремонт не требуется: бронекорпус полностью исправен.';
    player.energy -= 2;
    const restored = Math.min(26, player.maxHp - player.hp);
    player.hp += restored;
    return `Ремонтная бригада восстановила ${restored} единиц прочности.`;
  }

  if (action === 'overdrive') {
    if (player.energy < 3) return 'Для залпового удара требуется 3 энергии.';
    player.energy -= 3;
    const damage = Math.max(10, Math.floor(player.attack * 1.65) + roll(4, 12) - Math.floor(enemy.armor * 0.25));
    enemy.hp = Math.max(0, enemy.hp - damage);
    player.aimBonus = 0;
    return `ЗАЛП! Тяжёлый удар наносит ${damage} урона.`;
  }

  return 'Команда не распознана.';
}

/** Enemy behaviour depends on its role and current battlefield state. */
export function enemyTurn(player: Fighter, enemy: Fighter): string {
  const maxEnergy = enemy.maxEnergy ?? 3;
  enemy.energy = clamp(enemy.energy, 0, maxEnergy);
  const rollValue = Math.random();
  const role = enemy.role ?? 'assault';

  if ((player.speed ?? 0) >= 34 && rollValue < Math.min(0.24, 0.08 + ((player.speed ?? 0) - 34) * 0.012)) {
    enemy.energy = Math.min(maxEnergy, enemy.energy + 1);
    return `${player.name} уклоняется благодаря высокой мобильности. Вражеская атака сорвана.`;
  }

  if (role === 'engineer' && enemy.hp <= enemy.maxHp * 0.62 && enemy.energy >= 2 && rollValue < 0.48) {
    const heal = Math.min(22, enemy.maxHp - enemy.hp);
    enemy.hp += heal;
    enemy.energy -= 2;
    return `${enemy.name} использует ремонтный модуль: +${heal} прочности.`;
  }

  if (role === 'skirmisher' && enemy.energy >= 2 && rollValue < 0.55) {
    enemy.energy -= 2;
    const damage = Math.max(7, enemy.attack + roll(3, 10) - Math.floor(player.armor * 0.22));
    player.hp = Math.max(0, player.hp - damage);
    return `${enemy.name} выполняет манёвр флангового обхода: ${damage} урона.`;
  }

  if (role === 'guardian' && rollValue < 0.42) {
    enemy.shieldTurns = 1;
    enemy.energy = Math.min(maxEnergy, enemy.energy + 1);
    return `${enemy.name} закрывается бронеплитами и готовит контратаку.`;
  }

  if (enemy.energy >= 1 && (role === 'assault' || rollValue < 0.72)) {
    enemy.energy -= 1;
    let damage = Math.max(5, enemy.attack + roll(-2, 5) - Math.floor(player.armor * 0.34));
    if ((player.shieldTurns ?? 0) > 0) {
      damage = Math.max(2, Math.floor(damage * 0.45));
      player.shieldTurns = 0;
      player.armor = Math.max(0, player.armor - 9);
      player.hp = Math.max(0, player.hp - damage);
      enemy.energy = Math.min(maxEnergy, enemy.energy + 1);
      return `${enemy.name} атакует, но оборона смягчает удар: ${damage} урона.`;
    }
    player.hp = Math.max(0, player.hp - damage);
    enemy.energy = Math.min(maxEnergy, enemy.energy + 1);
    return `${enemy.name} проводит атаку: ${damage} урона.`;
  }

  enemy.energy = Math.min(maxEnergy, enemy.energy + 1);
  return `${enemy.name} перегруппировывается и восстанавливает энергию.`;
}
