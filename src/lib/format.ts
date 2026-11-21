import type { Cost, ResourceKey } from '../types';

export const RES_LABEL: Record<ResourceKey, string> = { credits: 'Кредиты', scrap: 'Металлолом', steel: 'Сталь', fuel: 'Топливо', science: 'Данные' };
export const RES_ORDER: ResourceKey[] = ['credits', 'steel', 'scrap', 'fuel', 'science'];

export const num = (n: number): string => Math.floor(n).toLocaleString('ru-RU');
export const compact = (n: number): string => (n >= 100_000 ? `${Math.round(n / 1000)}к` : n >= 10_000 ? `${(n / 1000).toFixed(1).replace('.0', '')}к` : num(n));

export function duration(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${String(m).padStart(2, '0')}м`;
  if (m > 0) return `${m}м ${String(s).padStart(2, '0')}с`;
  return `${s}с`;
}
export const costEntries = (c: Cost): [ResourceKey, number][] => RES_ORDER.filter((k) => (c[k] ?? 0) > 0).map((k) => [k, c[k] as number]);
export const canAfford = (have: Record<ResourceKey, number>, c: Cost): boolean => costEntries(c).every(([k, v]) => have[k] >= v);
export const pct = (v: number, max: number): number => (max <= 0 ? 0 : Math.max(0, Math.min(100, (v / max) * 100)));
export const rarityClass = (r: string): string => ({ Обычная: 'r-common', Редкая: 'r-rare', Эпическая: 'r-epic', Легендарная: 'r-legend' } as Record<string, string>)[r] || 'r-common';
export const timeAgo = (ms: number, now: number): string => {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} д назад`;
};
