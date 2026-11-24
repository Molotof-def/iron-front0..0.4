// IRON FRONT — статический игровой каталог и формулы баланса.
// Единый источник правды: сервер считает по этим данным, клиент получает их через /api/game/config.

export const CONFIG_VERSION = 1;
export const RESOURCES = ['credits', 'scrap', 'steel', 'fuel', 'science'];
export const START_RESOURCES = { credits: 650, scrap: 120, steel: 420, fuel: 60, science: 180 };
export const MAX_COMMANDER_LEVEL = 50;
export const EVENT_LIMIT = 40;

export const CLASSES = {
  light: { name: 'Лёгкий танк', short: 'ЛТ', role: 'Разведчик', desc: 'Быстрый и юркий: чаще уклоняется от ударов, но хрупок.', evasion: 0.06 },
  medium: { name: 'Средний танк', short: 'СТ', role: 'Универсал', desc: 'Сбалансирован. Ремонтные бригады восстанавливают на 20% больше.', repairMul: 1.2 },
  heavy: { name: 'Тяжёлый танк', short: 'ТТ', role: 'Штурмовик', desc: 'Много брони и прочности. Оборонительная стойка гасит 65% урона.', guardMul: 0.35 },
  td: { name: 'ПТ-САУ', short: 'ПТ', role: 'Охотник', desc: 'Первый выстрел в бою на 30% сильнее; игнорирует часть брони.', ambush: 1.3, armorFactor: 0.26, overFactor: 0.15 },
  arty: { name: 'Артиллерия', short: 'САУ', role: 'Огневая поддержка', desc: 'Почти игнорирует броню, залп задевает всех врагов. Уязвима вблизи (+15% урона).', armorFactor: 0.12, overFactor: 0.08, fragile: 1.15 },
};

export const BUILDINGS = {
  hq: { id: 'hq', name: 'Штаб', category: 'Управление', desc: 'Центр командования. Определяет уровень базы, электроэнергию, число строительных очередей и приносит кредиты.', maxLevel: 10, base: { credits: 150, steel: 120, scrap: 20 }, costGrowth: 1.7, baseTime: 60, timeGrowth: 1.85, power: 0, startLevel: 1 },
  hangar: { id: 'hangar', name: 'Танковый ангар', category: 'Техника', desc: 'Вместимость парка, очереди производства техники и размер боевого отряда.', maxLevel: 10, base: { credits: 120, steel: 110, scrap: 15 }, costGrowth: 1.62, baseTime: 50, timeGrowth: 1.8, power: 6, startLevel: 1, unlockHq: 1 },
  factory: { id: 'factory', name: 'Завод', category: 'Производство', desc: 'Выпускает сталь и металлолом каждый час, даже когда вы не в игре.', maxLevel: 10, base: { credits: 130, steel: 90, scrap: 25 }, costGrowth: 1.65, baseTime: 55, timeGrowth: 1.82, power: 10, startLevel: 1, unlockHq: 1 },
  storage: { id: 'storage', name: 'Склад ресурсов', category: 'Логистика', desc: 'Увеличивает лимит хранения стали, металлолома и топлива.', maxLevel: 10, base: { credits: 100, steel: 100, scrap: 10 }, costGrowth: 1.55, baseTime: 45, timeGrowth: 1.75, power: 2, startLevel: 0, unlockHq: 2 },
  lab: { id: 'lab', name: 'Исследовательский центр', category: 'Наука', desc: 'Открывает дерево технологий, даёт научные данные и вторую очередь исследований.', maxLevel: 10, base: { credits: 160, steel: 100, scrap: 30 }, costGrowth: 1.7, baseTime: 70, timeGrowth: 1.85, power: 8, startLevel: 1, unlockHq: 1 },
  repair: { id: 'repair', name: 'Ремонтный комплекс', category: 'Боевая поддержка', desc: 'Усиливает полевой ремонт и даёт бесплатные ремонты в каждом бою.', maxLevel: 10, base: { credits: 140, steel: 120, scrap: 40 }, costGrowth: 1.6, baseTime: 60, timeGrowth: 1.8, power: 6, startLevel: 0, unlockHq: 2 },
  training: { id: 'training', name: 'Учебный полигон', category: 'Боевая поддержка', desc: 'Повышает предельный уровень техники и опыт командира за операции. Открывает испытания.', maxLevel: 10, base: { credits: 170, steel: 130, scrap: 30 }, costGrowth: 1.62, baseTime: 65, timeGrowth: 1.82, power: 6, startLevel: 0, unlockHq: 3 },
  radar: { id: 'radar', name: 'Радиолокационная станция', category: 'Разведка', desc: 'Раскрывает данные о противнике и открывает операции повышенной сложности.', maxLevel: 10, base: { credits: 150, steel: 110, scrap: 35 }, costGrowth: 1.62, baseTime: 60, timeGrowth: 1.8, power: 8, startLevel: 0, unlockHq: 3 },
};
export const BUILDING_ORDER = ['hq', 'hangar', 'factory', 'storage', 'lab', 'repair', 'training', 'radar'];

export const buildCost = (id, toLevel) => {
  const b = BUILDINGS[id];
  const k = Math.pow(b.costGrowth, toLevel - 1);
  return { credits: Math.round(b.base.credits * k), steel: Math.round(b.base.steel * k), scrap: Math.round(b.base.scrap * k) };
};
export const buildTime = (id, toLevel) => Math.round(BUILDINGS[id].baseTime * Math.pow(BUILDINGS[id].timeGrowth, toLevel - 1));
/** Требование к штабу для постройки/улучшения здания до уровня toLevel. */
export const requiredHq = (id, toLevel) => (id === 'hq' ? 1 : Math.max(BUILDINGS[id].unlockHq || 1, toLevel - 1));
/** Штаб требует достаточного уровня командира. */
export const requiredCommander = (toLevel) => Math.max(1, toLevel);

export const powerProduced = (hq, flat = 0) => 40 + 14 * (hq - 1) + flat;
export const powerUsed = (levels) => BUILDING_ORDER.reduce((s, id) => s + BUILDINGS[id].power * (levels[id] || 0), 0);
export const buildSlots = (hq) => 1 + (hq >= 4 ? 1 : 0) + (hq >= 8 ? 1 : 0);
export const productionSlots = (hangar) => 1 + (hangar >= 4 ? 1 : 0) + (hangar >= 8 ? 1 : 0);
export const researchSlots = (lab) => 1 + (lab >= 6 ? 1 : 0);
export const garageCapacity = (hangar) => 5 + 2 * hangar;
export const squadLimit = (hangar) => 1 + (hangar >= 2 ? 1 : 0) + (hangar >= 5 ? 1 : 0);
export const maxTankLevel = (training) => 3 + training;
export const freeRepairs = (repair) => Math.ceil(repair / 3);
export const radarIntel = (radar) => (radar >= 3 ? 3 : radar >= 1 ? 2 : 1); // 1: состав, 2: названия, 3: роли и параметры
export const storageCaps = (storage, pct = 0) => ({
  steel: Math.round((2000 + 1500 * storage) * (1 + pct / 100)),
  scrap: Math.round((1000 + 800 * storage) * (1 + pct / 100)),
  fuel: Math.round((60 + 12 * storage) * (1 + pct / 100)),
});
/** Производство в час при уровнях зданий. */
export const hourlyRates = (levels, bonuses, efficiency) => ({
  credits: 40 * (levels.hq || 0) * (1 + bonuses.creditPct / 100),
  steel: 30 * (levels.factory || 0) * (1 + bonuses.steelPct / 100) * efficiency,
  scrap: 12 * (levels.factory || 0) * (1 + bonuses.scrapPct / 100) * efficiency,
  science: 4 * (levels.lab || 0) * (1 + bonuses.sciencePct / 100) * efficiency,
  fuel: (8 + 2 * ((levels.hq || 1) - 1)) * (1 + bonuses.fuelRegenPct / 100),
});

// ---------- Танки ----------
const T = (id, name, country, cls, rarity, tier, hp, armor, attack, mobility, price, reqTech, shape, desc, history) => ({
  id, name, country, class: cls, rarity, tier, hp, armor, attack, mobility, shape, desc, history, reqTech,
  cost: { credits: price, steel: Math.round(price * 0.45), scrap: tier * 12 },
  time: [0, 120, 300, 900, 3600, 10800][tier],
  reqHangar: [0, 1, 2, 3, 5, 7][tier],
  reqLevel: [0, 1, 2, 4, 7, 10][tier],
});
export const TANKS = [
  T('t34', 'T-34', 'СССР', 'medium', 'Обычная', 1, 110, 18, 25, 35, 0, null, 0, 'Манёвренная машина с надёжным балансом характеристик.', 'Один из самых известных средних танков Второй мировой войны.'),
  T('t70', 'Т-70', 'СССР', 'light', 'Обычная', 1, 85, 10, 20, 48, 150, null, 16, 'Лёгкая разведывательная машина с отличной скоростью.', 'Советский лёгкий танк, массово выпускавшийся в 1942–1943 годах.'),
  T('sherman', 'M4 Sherman', 'США', 'medium', 'Обычная', 1, 120, 22, 27, 31, 230, null, 10, 'Надёжная универсальная машина.', 'Американский средний танк, выпускавшийся большими сериями.'),
  T('su76', 'СУ-76М', 'СССР', 'arty', 'Обычная', 2, 80, 8, 42, 28, 240, null, 17, 'Лёгкое самоходное орудие для огневой поддержки.', 'Советская САУ на шасси Т-70, самая массовая после Т-34.'),
  T('m24', 'M24 Chaffee', 'США', 'light', 'Обычная', 2, 95, 12, 24, 50, 220, null, 18, 'Быстрый разведчик с хорошей пушкой для своего класса.', 'Американский лёгкий танк конца Второй мировой войны.'),
  T('hellcat', 'M18 Hellcat', 'США', 'td', 'Обычная', 2, 100, 14, 38, 40, 260, null, 19, 'Скоростной охотник на танки.', 'Одна из самых быстрых американских гусеничных машин того времени.'),
  T('t55', 'T-55', 'СССР', 'medium', 'Обычная', 2, 130, 24, 29, 30, 260, null, 3, 'Простой и универсальный танк.', 'Послевоенная машина, получившая широкое распространение.'),
  T('panther', 'Panther', 'Германия', 'medium', 'Редкая', 3, 145, 28, 35, 27, 440, 'arm1', 9, 'Сбалансированная машина для активной игры.', 'Немецкий средний танк с наклонной бронёй.'),
  T('t62', 'T-62', 'СССР', 'medium', 'Редкая', 3, 145, 27, 34, 28, 410, 'wpn1', 4, 'Уверенный боец средней дистанции.', 'Советский основной танк с гладкоствольным орудием.'),
  T('tiger', 'Tiger I', 'Германия', 'heavy', 'Редкая', 3, 175, 36, 38, 18, 480, 'arm1', 8, 'Тяжёлый танк, который держит позицию.', 'Немецкий тяжёлый танк времён Второй мировой войны.'),
  T('is2', 'ИС-2', 'СССР', 'heavy', 'Редкая', 3, 170, 34, 39, 20, 390, 'arm1', 2, 'Сочетает защиту и серьёзную огневую мощь.', 'Советский тяжёлый танк позднего периода войны.'),
  T('amx13', 'AMX-13', 'Франция', 'light', 'Редкая', 3, 105, 14, 30, 54, 380, 'eng1', 20, 'Очень быстрый разведчик с мощным орудием.', 'Французский лёгкий танк с качающейся башней.'),
  T('su100', 'СУ-100', 'СССР', 'td', 'Редкая', 3, 120, 22, 46, 24, 420, 'wpn1', 21, 'Мощное орудие в компактном корпусе.', 'Советская ПТ-САУ с орудием 100 мм.'),
  T('hummel', 'Hummel', 'Германия', 'arty', 'Редкая', 3, 90, 10, 58, 16, 400, 'wpn1', 22, 'Тяжёлая гаубица, бьёт издалека.', 'Немецкая самоходная гаубица калибра 150 мм.'),
  T('t72', 'T-72', 'СССР', 'medium', 'Эпическая', 4, 165, 32, 39, 29, 650, 'arm2', 5, 'Крепкая платформа с хорошей подвижностью.', 'Один из наиболее массовых основных танков.'),
  T('t80', 'T-80', 'СССР', 'medium', 'Эпическая', 4, 155, 29, 36, 39, 760, 'eng2', 6, 'Высокая мобильность и гибкий стиль игры.', 'Серия советских основных танков с газотурбинным двигателем.'),
  T('pershing', 'M26 Pershing', 'США', 'heavy', 'Эпическая', 4, 180, 35, 40, 23, 690, 'arm2', 11, 'Уверенно чувствует себя в обороне.', 'Американский тяжёлый танк конца Второй мировой войны.'),
  T('kv2', 'КВ-2', 'СССР', 'heavy', 'Эпическая', 4, 190, 38, 48, 12, 520, 'wpn2', 1, 'Медленный тяжёлый танк с мощным ударом.', 'Тяжёлый штурмовой танк с крупной башней.'),
  T('cv90', 'CV90-120', 'Швеция', 'light', 'Эпическая', 4, 120, 18, 34, 52, 600, 'eng2', 23, 'Скорость и точность современной разведывательной машины.', 'Шведская лёгкая боевая машина с 120-мм орудием.'),
  T('jagd', 'Jagdpanther', 'Германия', 'td', 'Эпическая', 4, 135, 28, 52, 22, 700, 'wpn2', 24, 'Один выстрел — одна цель.', 'Немецкая ПТ-САУ с длинноствольным орудием.'),
  T('msta', '2С19 Мста-С', 'Россия', 'arty', 'Эпическая', 4, 105, 14, 68, 20, 720, 'wpn2', 25, 'Скорострельная самоходная гаубица.', 'Российская САУ калибра 152 мм.'),
  T('paladin', 'M109 Paladin', 'США', 'arty', 'Эпическая', 4, 110, 16, 64, 22, 700, 'wpn2', 26, 'Надёжная артиллерийская платформа.', 'Американская самоходная гаубица калибра 155 мм.'),
  T('t90', 'T-90M', 'Россия', 'medium', 'Легендарная', 5, 190, 39, 45, 32, 1250, 'wpn3', 7, 'Современная машина с сильным набором параметров.', 'Глубоко модернизированная версия семейства Т-90.'),
  T('leo', 'Leopard 2A7', 'Германия', 'medium', 'Легендарная', 5, 185, 37, 46, 36, 1380, 'eng3', 12, 'Точная и быстрая машина высокого уровня.', 'Современная модификация семейства Leopard 2.'),
  T('abrams', 'Abrams M1A2', 'США', 'heavy', 'Легендарная', 5, 205, 43, 44, 30, 1450, 'arm3', 13, 'Сильная защита и стабильный урон.', 'Основной боевой танк армии США.'),
  T('challenger', 'Challenger 2', 'Великобритания', 'heavy', 'Легендарная', 5, 215, 46, 42, 22, 1420, 'arm3', 14, 'Максимальная стойкость в затяжном бою.', 'Британский основной боевой танк.'),
  T('merkava', 'Merkava Mk.4', 'Израиль', 'heavy', 'Легендарная', 5, 210, 44, 43, 25, 1480, 'arm3', 15, 'Выносливый танк для осторожной тактики.', 'Современный израильский основной боевой танк.'),
  T('su152', 'ИСУ-152', 'СССР', 'td', 'Эпическая', 4, 150, 30, 56, 18, 760, 'wpn2', 27, 'Зверобой: тяжёлый снаряд пробивает почти любую броню.', 'Советская тяжёлая САУ с гаубицей-пушкой 152 мм.'),
  T('sprut', 'Спрут-СДМ1', 'Россия', 'light', 'Легендарная', 5, 140, 22, 40, 55, 1300, 'eng3', 28, 'Лёгкая плавающая машина с орудием среднего танка.', 'Российский лёгкий танк на базе БМД-4.'),
  T('t14', 'Т-14 Армата', 'Россия', 'medium', 'Легендарная', 5, 200, 42, 48, 31, 1650, 'arm4', 29, 'Необитаемая башня и мощная защита нового поколения.', 'Российский основной танк на платформе «Армата».'),
  T('k2', 'K2 Black Panther', 'Корея', 'medium', 'Легендарная', 5, 188, 39, 47, 37, 1600, 'eng3', 30, 'Быстрый и точный танк с автоматом заряжания.', 'Южнокорейский основной боевой танк.'),
  T('pzh', 'PzH 2000', 'Германия', 'arty', 'Легендарная', 5, 120, 18, 78, 24, 1700, 'wpn4', 31, 'Самая мощная артиллерия: бьёт по всем целям.', 'Немецкая самоходная гаубица калибра 155 мм.'),
];
export const TANK_BY_ID = Object.fromEntries(TANKS.map((t) => [t.id, t]));
export const STARTER_TANK = 't34';
export const LEVEL_GROWTH = 0.08;
export const upgradeCost = (tank, level) => ({ steel: 80 + level * 65, scrap: level * tank.tier * 8, credits: 0 });

// ---------- Исследования ----------
const R = (id, branch, name, desc, req, lab, cost, time, effect) => ({ id, branch, name, desc, req, lab, cost, time, effect });
export const BRANCHES = {
  armor: 'Броня', weapons: 'Вооружение', engines: 'Двигатели', production: 'Производство', logistics: 'Логистика', base: 'Развитие базы',
};
export const TECHS = [
  R('arm1', 'armor', 'Усиленные сплавы', '+4% к броне всей техники', null, 1, { science: 60, credits: 120 }, 90, { armorPct: 4 }),
  R('arm2', 'armor', 'Композитная броня', '+6% к броне. Открывает машины 4 уровня.', 'arm1', 3, { science: 160, steel: 150 }, 600, { armorPct: 6 }),
  R('arm3', 'armor', 'Динамическая защита', '+8% к броне. Открывает современные тяжёлые танки.', 'arm2', 5, { science: 380, steel: 400, scrap: 80 }, 3600, { armorPct: 8 }),
  R('arm4', 'armor', 'Керамические вставки', '+8% к прочности всей техники', 'arm3', 7, { science: 700, steel: 800, scrap: 150 }, 10800, { hpPct: 8 }),
  R('wpn1', 'weapons', 'Система наведения', '+4% к огневой мощи', null, 1, { science: 70, credits: 130 }, 100, { attackPct: 4 }),
  R('wpn2', 'weapons', 'Бронебойные снаряды', '+6% к огневой мощи. Открывает ПТ-САУ и артиллерию 4 уровня.', 'wpn1', 3, { science: 170, steel: 160 }, 700, { attackPct: 6 }),
  R('wpn3', 'weapons', 'Кумулятивные боеприпасы', '+8% к огневой мощи', 'wpn2', 5, { science: 400, steel: 420, scrap: 90 }, 3900, { attackPct: 8 }),
  R('wpn4', 'weapons', 'Автомат заряжания', '+10% к огневой мощи', 'wpn3', 7, { science: 720, steel: 820, scrap: 160 }, 11400, { attackPct: 10 }),
  R('eng1', 'engines', 'Турбонаддув', '+3 к мобильности', null, 1, { science: 70, credits: 110 }, 100, { mobilityFlat: 3 }),
  R('eng2', 'engines', 'Активная подвеска', '+3 к мобильности', 'eng1', 3, { science: 160, steel: 140 }, 650, { mobilityFlat: 3 }),
  R('eng3', 'engines', 'Газотурбинный двигатель', '+4 к мобильности. Открывает Leopard 2A7.', 'eng2', 5, { science: 390, steel: 380, scrap: 90 }, 3700, { mobilityFlat: 4 }),
  R('eng4', 'engines', 'Гибридный привод', '−15% расхода топлива на операции', 'eng3', 7, { science: 650, steel: 700, scrap: 140 }, 9600, { fuelCostPct: -15 }),
  R('prod1', 'production', 'Поточная сборка', '+10% стали с завода', null, 1, { science: 80, credits: 140 }, 120, { steelPct: 10 }),
  R('prod2', 'production', 'Автоматизация цехов', '+15% стали и +10% металлолома', 'prod1', 3, { science: 190, steel: 170 }, 800, { steelPct: 15, scrapPct: 10 }),
  R('prod3', 'production', 'Конвейер техники', '−10% времени производства танков', 'prod2', 5, { science: 420, steel: 450 }, 4000, { tankTimePct: -10 }),
  R('prod4', 'production', 'Роботизированные линии', '−15% времени производства, +15% металлолома', 'prod3', 7, { science: 700, steel: 850, scrap: 160 }, 10200, { tankTimePct: -15, scrapPct: 15 }),
  R('log1', 'logistics', 'Логистическая сеть', '+10% кредитов', null, 1, { science: 70, credits: 120 }, 100, { creditPct: 10 }),
  R('log2', 'logistics', 'Сеть снабжения', '+20% скорости восстановления топлива', 'log1', 3, { science: 170, steel: 130 }, 700, { fuelRegenPct: 20 }),
  R('log3', 'logistics', 'Полевые склады', '+20% к лимитам хранения', 'log2', 5, { science: 380, steel: 380 }, 3500, { storagePct: 20 }),
  R('log4', 'logistics', 'Воздушный мост', '+10% наград за операции', 'log3', 7, { science: 650, steel: 720, scrap: 130 }, 9400, { rewardPct: 10 }),
  R('base1', 'base', 'Инженерные бригады', '+8% скорости строительства', null, 1, { science: 60, credits: 110 }, 90, { buildSpeed: 8 }),
  R('base2', 'base', 'Модульное строительство', '+10% скорости строительства', 'base1', 3, { science: 150, steel: 140 }, 600, { buildSpeed: 10 }),
  R('base3', 'base', 'Силовые установки', '+20 к электроэнергии', 'base2', 5, { science: 360, steel: 360 }, 3300, { powerFlat: 20 }),
  R('base4', 'base', 'Центр анализа', '+20% научных данных, +10% опыта командира', 'base3', 7, { science: 620, steel: 680, scrap: 120 }, 9000, { sciencePct: 20, xpPct: 10 }),
];
export const TECH_BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Соответствие технологий старого сохранения v0.4.0 новым идентификаторам. */
export const LEGACY_RESEARCH = {
  armor: 'arm1', composite: 'arm2', targeting: 'wpn1', engine: 'eng1', suspension: 'eng2',
  industry: 'prod1', automation: 'prod2', logistics: 'log1', supply: 'log2', telemetry: 'base1',
};
/** Старый «Арсенал» превращается в «Склад ресурсов». */
export const LEGACY_BUILDINGS = { hq: 'hq', hangar: 'hangar', factory: 'factory', lab: 'lab', arsenal: 'storage' };

// ---------- Арены и погода ----------
export const ARENAS = {
  desert: { name: 'Пустынный рубеж', desc: 'Открытая местность без укрытий.', playerArmor: 0, enemyArmor: 0 },
  hills: { name: 'Зелёные высоты', desc: 'Холмы дают укрытие: +4 к броне вашей техники.', playerArmor: 4, enemyArmor: 0 },
  factory: { name: 'Заброшенный завод', desc: 'Бетонные укрытия противника: +5 к броне врага.', playerArmor: 0, enemyArmor: 5 },
  coast: { name: 'Прибрежная полоса', desc: 'Открытый берег, укрытий нет.', playerArmor: 0, enemyArmor: 0 },
};
export const WEATHER = {
  clear: { name: 'Ясно', desc: 'Без модификаторов.', attackMul: 1, evade: 0 },
  rain: { name: 'Дождь', desc: '−8% урона у всех участников.', attackMul: 0.92, evade: 0 },
  sand: { name: 'Песчаная буря', desc: '+8% к уклонению у всех участников.', attackMul: 1, evade: 0.08 },
  fog: { name: 'Туман', desc: '+5% к уклонению, −4% урона.', attackMul: 0.96, evade: 0.05 },
};

// ---------- Операции ----------
const E = (tankId, level, role) => ({ tankId, level, role });
const M = (id, type, name, desc, o) => ({ id, type, name, desc, ...o });
export const MISSION_TYPES = {
  recon: { name: 'Разведка', desc: 'Короткие вылазки: победите быстро за бонус.' },
  defense: { name: 'Оборона', desc: 'Отразите волны атакующих. Ваша броня усилена.' },
  capture: { name: 'Захват территории', desc: 'Уничтожьте врага в ограниченное число ходов.' },
  trial: { name: 'Испытания', desc: 'Особые условия состава отряда. Награда — научные данные.' },
  boss: { name: 'Сильный противник', desc: 'Грозный противник с усиленными параметрами.' },
};
export const MISSIONS = [
  M('r1', 'recon', 'Разведка рубежа', 'Одиночная машина противника у границы.', { arena: 'desert', weather: 'clear', diff: 0.9, fuel: 5, reqLevel: 1, reqRadar: 0, enemies: [E('t70', 1, 'skirmisher')], reward: { credits: 90, scrap: 14, steel: 26, xp: 40, science: 8 }, bonus: { turns: 5 } }),
  M('r2', 'recon', 'Дозор на высотах', 'Патруль закрепился на холмах.', { arena: 'hills', weather: 'fog', diff: 1, fuel: 6, reqLevel: 2, reqRadar: 0, enemies: [E('m24', 2, 'skirmisher')], reward: { credits: 130, scrap: 20, steel: 36, xp: 55, science: 10 }, bonus: { turns: 5 } }),
  M('r3', 'recon', 'Глубокая разведка', 'Бронегруппа охраняет перекрёсток.', { arena: 'factory', weather: 'clear', diff: 1.05, fuel: 8, reqLevel: 5, reqRadar: 1, enemies: [E('amx13', 3, 'skirmisher')], reward: { credits: 230, scrap: 34, steel: 60, xp: 85, science: 16 }, bonus: { turns: 6 } }),
  M('d1', 'defense', 'Удержать блокпост', 'Две волны лёгкой техники.', { arena: 'desert', weather: 'sand', diff: 0.85, fuel: 8, reqLevel: 2, reqRadar: 0, armorBonus: 0.1, enemies: [E('t70', 1, 'assault'), E('sherman', 1, 'assault')], reward: { credits: 190, scrap: 30, steel: 54, xp: 70, science: 12 }, bonus: { noLoss: true } }),
  M('d2', 'defense', 'Оборона переправы', 'Штурмовая группа прорывается к мосту.', { arena: 'coast', weather: 'rain', diff: 1.05, fuel: 10, reqLevel: 4, reqRadar: 1, armorBonus: 0.1, enemies: [E('t55', 3, 'assault'), E('panther', 3, 'guardian')], reward: { credits: 300, scrap: 46, steel: 90, xp: 105, science: 18 }, bonus: { noLoss: true } }),
  M('d3', 'defense', 'Последний рубеж', 'Три волны тяжёлой техники.', { arena: 'hills', weather: 'clear', diff: 1.2, fuel: 14, reqLevel: 9, reqRadar: 3, armorBonus: 0.12, enemies: [E('tiger', 5, 'guardian'), E('t72', 5, 'assault'), E('pershing', 5, 'engineer')], reward: { credits: 640, scrap: 96, steel: 190, xp: 210, science: 36 }, bonus: { noLoss: true } }),
  M('c1', 'capture', 'Захват деревни', 'Выбейте противника за 12 ходов.', { arena: 'desert', weather: 'clear', diff: 0.9, fuel: 9, reqLevel: 3, reqRadar: 0, turnLimit: 12, enemies: [E('sherman', 1, 'assault'), E('hellcat', 1, 'skirmisher')], reward: { credits: 220, scrap: 34, steel: 64, xp: 80, science: 14 }, bonus: { turns: 8 } }),
  M('c2', 'capture', 'Штурм промзоны', 'Укреплённый завод. 16 ходов.', { arena: 'factory', weather: 'fog', diff: 1, fuel: 12, reqLevel: 6, reqRadar: 1, turnLimit: 16, enemies: [E('t62', 4, 'guardian'), E('su100', 4, 'assault')], reward: { credits: 420, scrap: 64, steel: 120, xp: 140, science: 24 }, bonus: { turns: 12 } }),
  M('c3', 'capture', 'Высота 214', 'Три позиции за 20 ходов.', { arena: 'hills', weather: 'rain', diff: 1.05, fuel: 15, reqLevel: 10, reqRadar: 3, turnLimit: 20, enemies: [E('t72', 6, 'assault'), E('jagd', 5, 'skirmisher'), E('t80', 6, 'guardian')], reward: { credits: 760, scrap: 110, steel: 220, xp: 240, science: 40 }, bonus: { turns: 15 } }),
  M('t1', 'trial', 'Испытание лёгких сил', 'Только лёгкие танки, отряд до двух машин.', { arena: 'desert', weather: 'clear', diff: 1, fuel: 7, reqLevel: 3, reqRadar: 0, reqTraining: 1, rules: { classes: ['light'], maxSquad: 2 }, enemies: [E('m24', 3, 'assault'), E('t70', 3, 'skirmisher')], reward: { credits: 120, scrap: 20, steel: 36, xp: 70, science: 40 }, bonus: { noLoss: true } }),
  M('t2', 'trial', 'Одинокий волк', 'Выйдите на бой одной машиной.', { arena: 'coast', weather: 'sand', diff: 1.05, fuel: 9, reqLevel: 6, reqRadar: 1, reqTraining: 2, rules: { maxSquad: 1 }, enemies: [E('panther', 4, 'assault'), E('t62', 4, 'assault')], reward: { credits: 200, scrap: 34, steel: 60, xp: 110, science: 70 }, bonus: { turns: 12 } }),
  M('t3', 'trial', 'Разнородный отряд', 'Отряд из машин разных классов (минимум 2 класса).', { arena: 'factory', weather: 'clear', diff: 1.1, fuel: 12, reqLevel: 9, reqRadar: 2, reqTraining: 4, rules: { minClasses: 2 }, enemies: [E('is2', 5, 'guardian'), E('hummel', 5, 'skirmisher'), E('t72', 5, 'assault')], reward: { credits: 380, scrap: 60, steel: 110, xp: 190, science: 120 }, bonus: { noLoss: true } }),
  M('b1', 'boss', 'Стальной монстр', 'Усиленный КВ-2 перекрыл дорогу.', { arena: 'desert', weather: 'clear', diff: 1.1, fuel: 18, reqLevel: 8, reqRadar: 2, enemies: [E('kv2', 6, 'boss')], reward: { credits: 700, scrap: 110, steel: 200, xp: 240, science: 60 }, bonus: { turns: 12 } }),
  M('b2', 'boss', 'Командный бункер', 'Современный танк-командир противника.', { arena: 'hills', weather: 'rain', diff: 1.3, fuel: 22, reqLevel: 13, reqRadar: 4, enemies: [E('abrams', 9, 'boss')], reward: { credits: 1500, scrap: 220, steel: 420, xp: 480, science: 140 }, bonus: { turns: 14 } }),
  M('b3', 'boss', 'Железный кулак', 'Бронегруппа противника во главе с Challenger 2.', { arena: 'factory', weather: 'fog', diff: 1.4, fuel: 26, reqLevel: 18, reqRadar: 6, enemies: [E('challenger', 10, 'boss'), E('merkava', 9, 'guardian')], reward: { credits: 2600, scrap: 380, steel: 720, xp: 800, science: 240 }, bonus: { turns: 18 } }),
  M('r4', 'recon', 'Рейд в тыл', 'Глубокий рейд за линию фронта.', { arena: 'coast', weather: 'fog', diff: 1.2, fuel: 11, reqLevel: 12, reqRadar: 4, enemies: [E('cv90', 8, 'skirmisher'), E('t80', 7, 'assault')], reward: { credits: 520, scrap: 76, steel: 150, xp: 190, science: 34 }, bonus: { turns: 8 } }),
  M('d4', 'defense', 'Битва за мост', 'Три волны современной техники.', { arena: 'hills', weather: 'rain', diff: 1.25, fuel: 16, reqLevel: 14, reqRadar: 4, armorBonus: 0.12, enemies: [E('t80', 8, 'assault'), E('jagd', 8, 'skirmisher'), E('abrams', 8, 'guardian')], reward: { credits: 980, scrap: 140, steel: 280, xp: 320, science: 55 }, bonus: { noLoss: true } }),
  M('t4', 'trial', 'Испытание тяжёлых', 'Только тяжёлые танки, отряд до двух машин.', { arena: 'factory', weather: 'clear', diff: 1.15, fuel: 12, reqLevel: 14, reqRadar: 3, reqTraining: 5, rules: { classes: ['heavy'], maxSquad: 2 }, enemies: [E('tiger', 8, 'guardian'), E('pershing', 8, 'assault')], reward: { credits: 560, scrap: 90, steel: 160, xp: 260, science: 180 }, bonus: { noLoss: true } }),
  M('c4', 'capture', 'Прорыв линии', 'Три рубежа обороны за 22 хода.', { arena: 'desert', weather: 'sand', diff: 1.2, fuel: 18, reqLevel: 16, reqRadar: 5, turnLimit: 22, enemies: [E('t90', 8, 'assault'), E('su100', 9, 'skirmisher'), E('leo', 8, 'guardian')], reward: { credits: 1250, scrap: 180, steel: 360, xp: 400, science: 70 }, bonus: { turns: 17 } }),
  M('b4', 'boss', 'Командир фронта', 'Т-14 «Армата» с усиленной бронёй.', { arena: 'factory', weather: 'clear', diff: 1.35, fuel: 28, reqLevel: 22, reqRadar: 7, enemies: [E('t14', 12, 'boss')], reward: { credits: 3400, scrap: 480, steel: 900, xp: 1000, science: 300 }, bonus: { turns: 16 } }),
  M('b5', 'boss', 'Последний бой', 'Штаб противника: командир и его гвардия.', { arena: 'hills', weather: 'fog', diff: 1.4, fuel: 34, reqLevel: 28, reqRadar: 9, enemies: [E('t14', 14, 'boss'), E('challenger', 12, 'guardian'), E('pzh', 12, 'skirmisher')], reward: { credits: 6000, scrap: 800, steel: 1500, xp: 1800, science: 500 }, bonus: { turns: 22 } }),
];
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const ROLES = {
  assault: 'Штурмовик', guardian: 'Защитник', engineer: 'Инженер', skirmisher: 'Разведчик', boss: 'Командир',
};

// ---------- Прогресс ----------
/** Накопленный опыт, необходимый для достижения уровня L (уровень 1 — 0 XP). */
export const xpForLevel = (level) => { let sum = 0; for (let l = 1; l < level; l++) sum += 100 + 60 * (l - 1); return sum; };
export const levelFromXp = (xp) => { let l = 1; while (l < MAX_COMMANDER_LEVEL && xp >= xpForLevel(l + 1)) l++; return l; };

export const QUEST_TEMPLATES = [
  { tpl: 'battles', name: 'Боевой выход', desc: (n) => `Завершите сражений: ${n}`, goals: [1, 2, 3], reward: (n) => ({ credits: 70 * n, scrap: 8 * n, xp: 25 * n }) },
  { tpl: 'wins', name: 'Удержать рубеж', desc: (n) => `Одержите побед: ${n}`, goals: [1, 2, 3], reward: (n) => ({ credits: 90 * n, steel: 25 * n, xp: 35 * n }) },
  { tpl: 'build', name: 'Инженерная готовность', desc: (n) => `Начните строительство или улучшение: ${n}`, goals: [1, 2], reward: (n) => ({ credits: 80 * n, steel: 30 * n, xp: 25 * n }) },
  { tpl: 'produce', name: 'Пополнение парка', desc: () => 'Запустите производство танка', goals: [1], reward: () => ({ credits: 120, scrap: 20, xp: 40 }) },
  { tpl: 'upgrade', name: 'Техническая модернизация', desc: (n) => `Улучшите танки: ${n}`, goals: [1, 2], reward: (n) => ({ steel: 40 * n, scrap: 12 * n, xp: 30 * n }) },
  { tpl: 'research', name: 'Научный прорыв', desc: () => 'Начните исследование', goals: [1], reward: () => ({ credits: 100, science: 25, xp: 40 }) },
  { tpl: 'recon', name: 'Дозорный', desc: () => 'Победите в разведке', goals: [1], reward: () => ({ credits: 110, fuel: 4, xp: 40 }) },
  { tpl: 'boss', name: 'Охотник за гигантами', desc: () => 'Победите сильного противника', goals: [1], reward: () => ({ credits: 260, steel: 70, xp: 90 }), minLevel: 8 },
];

export const ACHIEVEMENTS = [
  { id: 'first-blood', name: 'Первая кровь', desc: 'Одержите первую победу', metric: 'wins', goal: 1, reward: { credits: 100 } },
  { id: 'fighter', name: 'В строю', desc: 'Завершите 10 сражений', metric: 'battles', goal: 10, reward: { credits: 200, scrap: 40 } },
  { id: 'veteran', name: 'Ветеран фронта', desc: 'Одержите 25 побед', metric: 'wins', goal: 25, reward: { credits: 600, steel: 150 } },
  { id: 'legend', name: 'Легенда рубежа', desc: 'Одержите 100 побед', metric: 'wins', goal: 100, reward: { credits: 2500, steel: 600, scrap: 200 } },
  { id: 'collector', name: 'Коллекционер', desc: 'Соберите 8 танков', metric: 'tanks', goal: 8, reward: { credits: 500, steel: 120 } },
  { id: 'armada', name: 'Бронетанковая армада', desc: 'Соберите 20 танков', metric: 'tanks', goal: 20, reward: { credits: 2000, steel: 500 } },
  { id: 'builder', name: 'Главный инженер', desc: 'Завершите 10 строительств', metric: 'built', goal: 10, reward: { credits: 400, steel: 100 } },
  { id: 'fortress', name: 'Крепость', desc: 'Доведите штаб до 5 уровня', metric: 'hq', goal: 5, reward: { credits: 700, steel: 200, scrap: 60 } },
  { id: 'scientist', name: 'Научный директор', desc: 'Изучите 8 технологий', metric: 'researched', goal: 8, reward: { credits: 600, science: 120 } },
  { id: 'giant-slayer', name: 'Убийца гигантов', desc: 'Победите сильного противника', metric: 'bossWins', goal: 1, reward: { credits: 800, steel: 200, scrap: 80 } },
  { id: 'colonel', name: 'Полковник', desc: 'Достигните 10 уровня командира', metric: 'commander', goal: 10, reward: { credits: 1200, steel: 300 } },
  { id: 'mechanic', name: 'Механик-энтузиаст', desc: 'Улучшите танки 10 раз', metric: 'upgrades', goal: 10, reward: { credits: 350, scrap: 70 } },
];

// ---------- Обучение и ежедневный бонус ----------
export const TUTORIAL = [
  { id: 'welcome', title: 'Примите командование', text: 'Ваша база готова к работе. Сверху — ресурсы: кредиты, сталь, металлолом, топливо и научные данные. Они копятся сами, даже когда вы не в игре.', screen: 'base', reward: { credits: 100, steel: 40 } },
  { id: 'build', title: 'Улучшите здание', text: 'Откройте «Стройка», выберите здание и нажмите «Улучшить». Стройка идёт по реальному времени. Для начала подойдёт Завод — он даёт сталь.', screen: 'build', reward: { credits: 100, steel: 100 } },
  { id: 'research', title: 'Начните исследование', text: 'Откройте «Наука» и запустите любое доступное исследование, например «Усиленные сплавы». Исследования дают постоянные бонусы всей технике.', screen: 'research', reward: { science: 60, credits: 80 } },
  { id: 'tank', title: 'Пополните парк', text: 'В «Ангаре» выпустите новый танк или улучшите T-34. Машины разных классов играют по-разному: сравните их кнопкой «Сравнить».', screen: 'hangar', reward: { steel: 80, scrap: 30 } },
  { id: 'battle', title: 'Выиграйте первый бой', text: 'В «Бою» выберите «Разведку рубежа» и нажмите «Начать бой». Атакуйте, а когда энергия кончается — используйте «Защиту», она возвращает заряд.', screen: 'battle', reward: { credits: 200, xp: 60, fuel: 10 } },
  { id: 'quest', title: 'Заберите награду за задание', text: 'В «Заданиях» выполняйте ежедневные цели и забирайте награды. Выполните любое задание и нажмите «Забрать».', screen: 'quests', reward: { credits: 300, steel: 100, scrap: 40 } },
];
export const DAILY_BONUS = [
  { credits: 100, fuel: 5 }, { credits: 150, steel: 60 }, { credits: 200, scrap: 40, fuel: 5 }, { credits: 250, steel: 120 },
  { credits: 300, science: 40, fuel: 8 }, { credits: 400, steel: 150, scrap: 60 }, { credits: 800, steel: 300, scrap: 120, science: 80, fuel: 15 },
];

// ---------- Недельные события (ротация по номеру недели, Пн 00:00 UTC) ----------
const WEEK = 7 * 86_400_000;
export const WEEKLY_EVENTS = [
  { id: 'recon-week', name: 'Неделя разведки', desc: 'Награды за разведывательные операции увеличены в 1,5 раза.', types: ['recon'], mul: 1.5 },
  { id: 'siege-week', name: 'Осадная неделя', desc: 'Оборона и захват территории дают на 40% больше.', types: ['defense', 'capture'], mul: 1.4 },
  { id: 'hunt-week', name: 'Охота на гигантов', desc: 'Награды за бои с сильными противниками увеличены в 1,5 раза.', types: ['boss'], mul: 1.5 },
  { id: 'science-week', name: 'Научная неделя', desc: 'Испытания приносят на 60% больше наград.', types: ['trial'], mul: 1.6 },
];
export const weekIndex = (ms) => Math.floor((ms - 4 * 86_400_000) / WEEK); // неделя начинается в понедельник
export const weekEndsAt = (ms) => (weekIndex(ms) + 1) * WEEK + 4 * 86_400_000;
export const eventForWeek = (ms) => WEEKLY_EVENTS[((weekIndex(ms) % WEEKLY_EVENTS.length) + WEEKLY_EVENTS.length) % WEEKLY_EVENTS.length];
export const WEEKLY_GOAL = { wins: 8, reward: { credits: 1500, steel: 400, scrap: 150, science: 100, xp: 200 } };

// ---------- Рефералы ----------
export const REFERRAL = {
  qualifyLevel: 3, maxCounted: 100,
  perFriend: { credits: 400, steel: 150, scrap: 50, fuel: 10 },
  welcome: { credits: 300, steel: 100, fuel: 20 },
  milestones: [
    { at: 3, reward: { credits: 1000, science: 100 } },
    { at: 10, reward: { credits: 3000, steel: 800, scrap: 300 } },
    { at: 25, reward: { credits: 8000, steel: 2000, science: 500 } },
  ],
};

// ---------- Звания командира ----------
export const RANKS = [
  [1, 'Рядовой'], [2, 'Ефрейтор'], [4, 'Младший сержант'], [6, 'Сержант'], [8, 'Старший сержант'], [10, 'Старшина'], [12, 'Прапорщик'],
  [15, 'Младший лейтенант'], [18, 'Лейтенант'], [21, 'Старший лейтенант'], [24, 'Капитан'], [28, 'Майор'], [32, 'Подполковник'],
  [36, 'Полковник'], [40, 'Генерал-майор'], [44, 'Генерал-лейтенант'], [47, 'Генерал-полковник'], [50, 'Генерал армии'],
];
export const rankFor = (level) => { let r = RANKS[0][1]; for (const [at, name] of RANKS) if (level >= at) r = name; return r; };

// ---------- Экипаж и навыки ----------
export const CREW = { xpPerPoint: 100, maxPoints: 15, respecPerPoint: 150, xpWin: 40, xpLoss: 15 };
export const SKILLS = [
  { id: 'gunnery', name: 'Меткий наводчик', desc: '+3% к огневой мощи за ранг', max: 5, effect: { attackPct: 3 } },
  { id: 'plates', name: 'Бронепластины', desc: '+3% к броне за ранг', max: 5, effect: { armorPct: 3 } },
  { id: 'vitality', name: 'Живучесть', desc: '+4% к прочности за ранг', max: 5, effect: { hpPct: 4 } },
  { id: 'driver', name: 'Механик-водитель', desc: '+2 к мобильности за ранг', max: 5, effect: { mobilityFlat: 2 } },
  { id: 'medic', name: 'Ремонтник', desc: '+12% к силе ремонта за ранг', max: 3, effect: { repairPct: 12 } },
];
/** Особый навык класса (шестой в дереве). */
export const CLASS_SKILLS = {
  light: { id: 'evasion', name: 'Манёвр', desc: '+2% к уклонению за ранг', max: 5, effect: { evadeBonus: 0.02 } },
  medium: { id: 'allround', name: 'Универсал', desc: '+2% к огню и броне за ранг', max: 5, effect: { attackPct: 2, armorPct: 2 } },
  heavy: { id: 'bracing', name: 'Усиленная стойка', desc: 'Оборона гасит на 4% больше за ранг', max: 5, effect: { guardBonus: 0.04 } },
  td: { id: 'ambush', name: 'Засада', desc: 'Первый выстрел на 6% сильнее за ранг', max: 5, effect: { ambushBonus: 0.06 } },
  arty: { id: 'splash', name: 'Осколочный залп', desc: '+8% урона по остальным целям залпа за ранг', max: 5, effect: { splashBonus: 0.08 } },
};
export const skillsFor = (cls) => [...SKILLS, CLASS_SKILLS[cls]];

// ---------- PvP и сезоны ----------
export const PVP = { startRating: 1000, dailyTickets: 6, window: 250, maxWindow: 400, kPlayer: 28, kBot: 14, turnLimit: 24, minLevel: 2,
  win: { credits: 220, steel: 60, scrap: 20, xp: 40 }, loss: { credits: 50, xp: 10 }, botMul: 0.6 };
export const PVP_TIERS = [
  { id: 'bronze', name: 'Бронза', min: 0, reward: { credits: 500, steel: 100 } },
  { id: 'silver', name: 'Серебро', min: 1100, reward: { credits: 1200, steel: 300, scrap: 100 } },
  { id: 'gold', name: 'Золото', min: 1300, reward: { credits: 2500, steel: 600, scrap: 200 } },
  { id: 'platinum', name: 'Платина', min: 1500, reward: { credits: 4500, steel: 1000, science: 200 } },
  { id: 'diamond', name: 'Алмаз', min: 1800, reward: { credits: 8000, steel: 2000, science: 500 } },
];
export const tierFor = (rating) => { let t = PVP_TIERS[0]; for (const x of PVP_TIERS) if (rating >= x.min) t = x; return t; };
export const seasonKey = (ms) => new Date(ms).toISOString().slice(0, 7);
export const seasonEndsAt = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
export const SEASON_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const seasonTitle = (key) => `${SEASON_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

// ---------- Бесплатный сезонный пропуск ----------
export const PASS = { levels: 30, xpPerLevel: 100, xp: { win: 10, loss: 5, pvp: 15, quest: 20, weekly: 100, tutorial: 0 } };
const passReward = (l) => {
  const r = { credits: 150 + 30 * l };
  if (l % 2 === 0) r.steel = 60 + 12 * l;
  if (l % 3 === 0) r.scrap = 20 + 5 * l;
  if (l % 5 === 0) r.science = 20 + 4 * l;
  if (l % 4 === 0) r.fuel = 10;
  return r;
};
export const PASS_REWARDS = Array.from({ length: PASS.levels }, (_, i) => {
  const level = i + 1; const reward = passReward(level);
  const extra = { 10: { cosmetic: 'camo:night' }, 20: { cosmetic: 'emblem:dragon' }, 30: { cosmetic: 'camo:gold', title: true } }[level];
  return { level, reward, ...(extra || {}) };
});

// ---------- Косметика (не влияет на силу) ----------
export const CAMOS = [
  { id: 'default', name: 'Заводской', req: null, text: 'Доступен сразу' },
  { id: 'desert', name: 'Пустыня', req: { metric: 'commander', goal: 5 }, text: 'Командир 5 уровня' },
  { id: 'forest', name: 'Лесной', req: { metric: 'commander', goal: 10 }, text: 'Командир 10 уровня' },
  { id: 'arctic', name: 'Арктика', req: { metric: 'wins', goal: 25 }, text: '25 побед в операциях' },
  { id: 'night', name: 'Ночной', req: { metric: 'passLevel', goal: 10 }, text: 'Пропуск: 10 уровень' },
  { id: 'gold', name: 'Золотой', req: { metric: 'passLevel', goal: 30 }, text: 'Пропуск: 30 уровень' },
];
export const EMBLEMS = [
  { id: 'none', name: 'Без эмблемы', req: null, text: 'Доступно сразу' },
  { id: 'star', name: 'Звезда', req: { metric: 'wins', goal: 1 }, text: 'Первая победа' },
  { id: 'skull', name: 'Череп', req: { metric: 'bossWins', goal: 1 }, text: 'Победа над сильным противником' },
  { id: 'wolf', name: 'Волк', req: { metric: 'commander', goal: 15 }, text: 'Командир 15 уровня' },
  { id: 'eagle', name: 'Орёл', req: { metric: 'pvpBest', goal: 1100 }, text: 'Рейтинг дуэлей 1100' },
  { id: 'crown', name: 'Корона', req: { metric: 'wins', goal: 100 }, text: '100 побед в операциях' },
  { id: 'dragon', name: 'Дракон', req: { metric: 'passLevel', goal: 20 }, text: 'Пропуск: 20 уровень' },
];

// ---------- Кланы ----------
export const CLAN = { minLevel: 5, maxMembers: 30, goalPerMember: 300, minName: 3, maxName: 20,
  points: { recon: 5, defense: 8, capture: 8, trial: 6, boss: 15, pvp: 10 },
  reward: { credits: 1000, steel: 300, scrap: 100, science: 80 } };
export const clanGoal = (members) => CLAN.goalPerMember * Math.max(1, Math.min(members, CLAN.maxMembers));

// ---------- Напоминания бота ----------
export const NOTIFY_TYPES = ['builds', 'fuel', 'bonus', 'event'];
export const REMIND = { bonusHourUtc: 16, eventHourUtc: 8, activeDays: 3, eventActiveDays: 7 };
