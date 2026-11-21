// Собственный компактный набор иконок (24×24, обводка) — без внешних библиотек.
const P: Record<string, string> = {
  base: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  hangar: 'M2 15h20M4 15l1.5-4h9l2 2h2.5l1 2M9 11V8h4v3M13 9.5h6M5 18.5a1 1 0 100 .01M10 18.5a1 1 0 100 .01M15 18.5a1 1 0 100 .01',
  build: 'M14.5 6.5l3 3M4 20l8.5-8.5M12.5 11.5L10 9l4-5 5 3-2 4z',
  research: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7.5 15h9',
  battle: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  quests: 'M9 6h11M9 12h11M9 18h11M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2',
  profile: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4',
  power: 'M13 2L5 14h6l-1 8 8-12h-6z',
  fuel: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
  science: 'M12 12m-1.5 0a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M12 4c4 0 7 3.6 7 8s-3 8-7 8M12 4C8 4 5 7.6 5 12s3 8 7 8M3 12h18',
  steel: 'M4 17l3-8h10l3 8zM9 9l-1-3h8l-1 3',
  scrap: 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  credits: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.5 9.5C10 8.5 11 8 12 8c1.5 0 2.5.8 2.5 2s-1 1.6-2.5 2-2.5.9-2.5 2 1 2 2.5 2c1 0 2-.5 2.5-1.5',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 118 0v3',
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5M6 11l6-6 6 6',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  attack: 'M5 19l9-9M14 10l5-5v-1h-1l-5 5M5 19l-1 1M8 16l2 2',
  speed: 'M4 17a8 8 0 1116 0M12 17l4-6',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z',
  star: 'M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z',
  trophy: 'M7 4h10v5a5 5 0 01-10 0zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M12 14v4M8 21h8M9 18h6',
  radar: 'M12 12l6-6M12 3a9 9 0 109 9M12 7a5 5 0 105 5M12 12h.01',
  wrench: 'M15 6a4 4 0 00-5 5L4 17l3 3 6-6a4 4 0 005-5l-3 2-2-2z',
  repair: 'M12 5v14M5 12h14M7 7l10 10',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h.01',
  flag: 'M5 21V4M5 5h12l-2 4 2 4H5',
  arrow: 'M5 12h14M13 6l6 6-6 6',
};
export type IconName = keyof typeof P;
export function Icon({ name, size = 18, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? P.info} />
    </svg>
  );
}
