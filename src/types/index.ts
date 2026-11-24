// Типы API IRON FRONT v2. Источник правды — сервер (server/game/view.mjs).
export type ResourceKey = 'credits' | 'scrap' | 'steel' | 'fuel' | 'science';
export type Resources = Record<ResourceKey, number>;
export type TankClass = 'light' | 'medium' | 'heavy' | 'td' | 'arty';
export type Rarity = 'Обычная' | 'Редкая' | 'Эпическая' | 'Легендарная';
export type BuildingId = 'hq' | 'hangar' | 'factory' | 'storage' | 'lab' | 'repair' | 'training' | 'radar';
export type MissionType = 'recon' | 'defense' | 'capture' | 'trial' | 'boss';
export type Problem = { code: string; message: string } | null;
export type Cost = Partial<Resources>;
export type Stats4 = { hp: number; armor: number; attack: number; mobility: number };

export interface ClassCfg { name: string; short: string; role: string; desc: string }
export interface BuildingCfg { id: BuildingId; name: string; category: string; desc: string; maxLevel: number; power: number }
export interface TankCfg {
  id: string; name: string; country: string; class: TankClass; rarity: Rarity; tier: number; shape: number;
  desc: string; history: string; base: Stats4; cost: Cost; reqHangar: number; reqLevel: number; reqTech: string | null;
}
export interface TechCfg { id: string; branch: string; name: string; desc: string; req: string | null; lab: number; cost: Cost }
export interface AchievementCfg { id: string; name: string; desc: string; goal: number; reward: Cost & { xp?: number } }
export interface GameConfig {
  version: number; classes: Record<TankClass, ClassCfg>; buildings: BuildingCfg[]; tanks: TankCfg[]; techs: TechCfg[];
  branches: Record<string, string>; missionTypes: Record<MissionType, { name: string; desc: string }>;
  arenas: Record<string, { name: string; desc: string }>; weather: Record<string, { name: string; desc: string }>;
  roles: Record<string, string>; achievements: AchievementCfg[]; resources: ResourceKey[]; levelGrowth: number;
  tutorial: TutorialStepCfg[]; dailyBonus: (Cost & { xp?: number })[];
  referral: { qualifyLevel: number; perFriend: Cost; welcome: Cost };
  ranks: [number, string][]; crew: { xpPerPoint: number; maxPoints: number; respecPerPoint: number };
  skills: Record<TankClass, { id: string; name: string; desc: string; max: number }[]>;
  camos: { id: string; name: string; text: string }[]; emblems: { id: string; name: string; text: string }[];
  pass: { levels: number; xpPerLevel: number; rewards: { level: number; reward: Cost & { xp?: number }; cosmetic?: string; title?: boolean }[] };
  pvpTiers: { id: string; name: string; min: number; reward: Cost }[];
  pvp: { dailyTickets: number; minLevel: number; win: Cost & { xp?: number }; loss: Cost & { xp?: number } };
  clan: { minLevel: number; maxMembers: number; goalPerMember: number; reward: Cost; minName: number; maxName: number };
}
export interface TutorialStepCfg { id: string; title: string; text: string; screen: Screen; reward: Cost & { xp?: number } }

export interface QueueItem { id: string; startedAt: number; endsAt: number }
export interface BuildQueueItem extends QueueItem { building: BuildingId; toLevel: number; cost: Cost }
export interface ProduceQueueItem extends QueueItem { tankId: string; cost: Cost }
export interface ResearchQueueItem extends QueueItem { techId: string; cost: Cost }

export interface BuildingView {
  id: BuildingId; level: number; queued: BuildQueueItem | null; problem: Problem;
  next: { level: number; cost: Cost; seconds: number; reqHq: number; reqCommander: number } | null;
}
export interface CrewInfo { xp: number; points: number; spent: number; free: number; skills: Record<string, number>; nextAt: number | null }
export interface TankView {
  crew: CrewInfo | null; cosmetic: { camo: string; emblem: string } | null;
  id: string; owned: boolean; level: number; stats: Stats4; nextStats: Stats4 | null; upgradeCost: Cost | null;
  upgradeProblem: Problem; produceSeconds: number; producing: ProduceQueueItem | null; problem: Problem;
}
export interface TechView { id: string; done: boolean; queued: ResearchQueueItem | null; seconds: number; problem: Problem }
export interface EnemyIntel { name: string; class: TankClass; level: number; shape: number; tankId?: string; role?: string; hp?: number; attack?: number; armor?: number }
export interface MissionView {
  id: string; type: MissionType; name: string; desc: string; arena: string; weather: string; fuel: number;
  reqLevel: number; reqRadar: number; reqTraining: number; turnLimit: number; clears: number; locked: boolean;
  rules: { classes?: TankClass[]; maxSquad?: number; minClasses?: number } | null;
  bonus: { turns?: number; noLoss?: boolean }; reward: Cost & { xp: number }; problem: Problem; intel: number;
  enemyCount: number; enemies?: EnemyIntel[];
}
export interface BattleUnit {
  tankId: string; name: string; cls: TankClass; role: string | null; hp: number; maxHp: number; attack: number;
  armor: number; mobility: number; energy: number; shield: boolean; aim: number;
}
export interface RewardView extends Cost { xp: number; bonus: boolean; firstClear: boolean; rating?: number; event?: boolean }
export interface BattleView {
  title: string; pvp: { opponent: { id: string; nickname: string; level: number; rating: number; bot: boolean } } | null;
  id: string; missionId: string; status: 'active' | 'won' | 'lost' | 'retreated'; turn: number; turnLimit: number;
  arena: string; weather: string; squad: BattleUnit[]; active: number; enemies: BattleUnit[]; foe: number;
  freeRepairs: number; log: string[]; reward: RewardView | null; claimed: boolean;
}
export interface QuestView { id: string; name: string; desc: string; goal: number; progress: number; claimed: boolean; reward: Cost & { xp?: number } }
export interface GameEvent { id: number; t: number; kind: string; text: string }

export interface GameView {
  serverTime: number; timeScale: number; nickname: string;
  commander: { level: number; rank: string; xp: number; xpBase: number; xpNext: number };
  resources: Resources; caps: { steel: number; scrap: number; fuel: number }; rates: Resources;
  power: { produced: number; used: number; efficiency: number }; bonuses: Record<string, number>;
  base: {
    level: number; buildSlots: number; productionSlots: number; researchSlots: number;
    garage: { used: number; capacity: number }; squadLimit: number; maxTankLevel: number; freeRepairs: number; intel: number;
  };
  buildings: BuildingView[]; buildQueue: BuildQueueItem[]; produceQueue: ProduceQueueItem[]; researchQueue: ResearchQueueItem[];
  tanks: TankView[]; techs: TechView[]; missions: MissionView[]; squad: string[]; battle: BattleView | null;
  quests: QuestView[]; questsResetAt: number; achievements: { id: string; value: number; claimed: boolean }[];
  tutorial: { step: number; total: number; done: boolean; ready: boolean };
  bonus: { available: boolean; streak: number; nextDay: number };
  weekly: WeeklyView; notify: boolean; notifyTypes: NotifyTypes; referral: ReferralView;
  pvp: PvpView; pass: PassView; cosmetics: { camos: CosmeticState[]; emblems: CosmeticState[] }; clan: { points: number; claimed: boolean; week: number; goalPerMember: number };
  stats: { battles: number; wins: number; losses: number; built: number; researched: number; upgrades: number; produced: number; bossWins: number };
  events: GameEvent[]; legacy: { importedAt: number } | null;
}
export interface LeaderRow { nickname: string; level: number; xp: number; wins: number }
export type Screen = 'base' | 'hangar' | 'build' | 'research' | 'battle' | 'quests' | 'profile';

export interface WeeklyView {
  event: { id: string; name: string; desc: string; types: MissionType[]; mul: number };
  endsAt: number; progress: number; goal: number; claimed: boolean; reward: Cost & { xp?: number };
}
export interface ReferralView {
  invited: number; qualified: number; claimed: number; claimable: number; link: string | null; welcomed: boolean;
  milestones: { at: number; reward: Cost; reached: boolean; claimed: boolean }[];
}

export interface NotifyTypes { builds: boolean; fuel: boolean; bonus: boolean; event: boolean }
export interface CosmeticState { id: string; unlocked: boolean; progress: number; goal: number }
export interface DefenseUnit { tankId: string; level: number; hp: number; attack: number; armor: number; mobility: number; camo: string; emblem: string }
export interface PvpView {
  rating: number; tier: { id: string; name: string }; nextTier: { name: string; at: number } | null; bestEver: number;
  played: number; wins: number; losses: number; ticketsLeft: number; ticketsMax: number; season: string; seasonTitle: string; seasonEndsAt: number;
  minLevel: number; defenseIds: string[]; defense: DefenseUnit[]; power: number;
  prev: { season: string; title: string; rating: number; tier: { id: string; name: string; reward: Cost }; claimed: boolean } | null;
}
export interface PassView { season: string; seasonTitle: string; endsAt: number; xp: number; level: number; claimed: number[] }
export interface Opponent {
  id: string; nickname: string; level: number; rating: number; bot: boolean; power: number;
  units: { tankId: string; name: string; cls: TankClass; shape: number; level: number; hp: number; attack: number; armor: number; camo: string; emblem: string }[];
}
export interface ClanMember { nickname: string; level: number; points: number; leader: boolean; me: boolean }
export interface ClanInfo { id: string; name: string; tag: string; total: number; goal: number; maxMembers: number; members: ClanMember[]; weekEndsAt: number }
export interface ClanListRow { id: string; name: string; tag: string; members: number; points: number }
export interface ClanData { clan: ClanInfo | null; list: ClanListRow[]; minLevel: number; unavailable?: boolean }
