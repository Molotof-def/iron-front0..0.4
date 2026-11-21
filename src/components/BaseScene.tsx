import type { BuildingId, BuildingView } from '../types';

interface Plot { id: BuildingId; x: number; y: number; w: number; h: number; name: string }
const PLOTS: Plot[] = [
  { id: 'radar', x: 335, y: 12, w: 130, h: 84, name: 'РЛС' },
  { id: 'hangar', x: 88, y: 64, w: 150, h: 90, name: 'Ангар' },
  { id: 'factory', x: 562, y: 64, w: 150, h: 90, name: 'Завод' },
  { id: 'hq', x: 320, y: 138, w: 160, h: 104, name: 'Штаб' },
  { id: 'storage', x: 88, y: 226, w: 150, h: 88, name: 'Склад' },
  { id: 'lab', x: 562, y: 226, w: 150, h: 88, name: 'Лаборатория' },
  { id: 'repair', x: 200, y: 338, w: 150, h: 84, name: 'Ремонт' },
  { id: 'training', x: 450, y: 338, w: 150, h: 84, name: 'Полигон' },
];
const ROADS = 'M400 190 L400 96 M400 190 L238 120 M400 190 L562 120 M400 190 L238 270 M400 190 L562 270 M400 190 L275 338 M400 190 L525 338';
const PATROL = 'M238 120 L400 190 L562 120';
const PATROL2 = 'M275 338 L400 190 L525 338';

function Glyph({ id, w, h }: { id: BuildingId; w: number; h: number }) {
  switch (id) {
    case 'hq': return (<g><rect width={w} height={h} rx="6" className="b-main" /><rect x="14" y="14" width={w - 28} height={h - 28} rx="3" className="b-inner" /><path d={`M${w / 2} 18v-12`} className="b-line" /><path d={`M${w / 2} 6l16 5-16 5z`} className="b-amber" /><path d={`M${w / 2 - 14} ${h / 2}h28M${w / 2} ${h / 2 - 14}v28`} className="b-line" /></g>);
    case 'hangar': return (<g><rect width={w} height={h} rx="5" className="b-main" />{[0, 1, 2].map((i) => <rect key={i} x={14 + i * ((w - 28) / 3)} y="12" width={(w - 28) / 3 - 6} height={h - 24} rx="4" className="b-inner" />)}</g>);
    case 'factory': return (<g><rect width={w} height={h} rx="5" className="b-main" /><rect x="12" y="14" width={w - 56} height={h - 28} rx="3" className="b-inner" /><rect x={w - 34} y="10" width="9" height="30" className="b-line-fill" /><rect x={w - 20} y="16" width="9" height="24" className="b-line-fill" /><circle className="smoke" cx={w - 29} cy="6" r="5" /><circle className="smoke s2" cx={w - 15} cy="10" r="4" /></g>);
    case 'storage': return (<g><rect width={w} height={h} rx="5" className="b-main" />{[0, 1, 2, 3].map((i) => <rect key={i} x={10 + (i % 2) * ((w - 30) / 2 + 10)} y={10 + Math.floor(i / 2) * ((h - 30) / 2 + 10)} width={(w - 30) / 2} height={(h - 30) / 2} rx="2" className="b-inner" />)}</g>);
    case 'lab': return (<g><rect width={w} height={h} rx="5" className="b-main" /><circle cx={w / 2} cy={h / 2} r={h / 2 - 14} className="b-inner" /><circle cx={w / 2} cy={h / 2} r="7" className="b-amber" /><rect x="10" y="10" width="26" height="14" rx="2" className="b-line-fill" /></g>);
    case 'repair': return (<g><rect width={w} height={h} rx="5" className="b-main" /><rect x="12" y="14" width={w - 24} height={h - 28} rx="3" className="b-inner" /><path d={`M${w / 2 - 16} ${h / 2 + 10}l32-20M${w / 2 - 8} ${h / 2 - 6}l16 12`} className="b-amber-line" /></g>);
    case 'training': return (<g><rect width={w} height={h} rx="5" className="b-main" /><ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 16} ry={h / 2 - 14} className="b-inner" /><circle cx={w / 2 + 28} cy={h / 2} r="5" className="b-amber" /><circle cx={w / 2 - 28} cy={h / 2} r="5" className="b-amber" /></g>);
    case 'radar': return (<g><rect width={w} height={h} rx="5" className="b-main" /><circle cx={w / 2} cy={h / 2} r={h / 2 - 12} className="b-inner" /><g className="sweep" style={{ transformOrigin: `${w / 2}px ${h / 2}px` }}><path d={`M${w / 2} ${h / 2}L${w / 2 + h / 2 - 12} ${h / 2}`} className="b-amber-line" /></g></g>);
    default: return null;
  }
}

interface Props { buildings: BuildingView[]; names: Record<string, string>; selected: string | null; onSelect: (id: BuildingId) => void }

/** Тактическая карта базы: здания, дороги, патрули и индикаторы строительства. */
export function BaseScene({ buildings, names, selected, onSelect }: Props) {
  const byId = Object.fromEntries(buildings.map((b) => [b.id, b])) as Record<BuildingId, BuildingView>;
  return (
    <svg className="scene" viewBox="0 0 800 440" role="group" aria-label="Карта базы" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" className="grid-line" /></pattern>
      </defs>
      <rect width="800" height="440" className="scene-bg" />
      <rect width="800" height="440" fill="url(#grid)" />
      <path d={ROADS} className="road" />
      <g className="patrol p1"><rect width="20" height="10" rx="2" /><rect x="8" y="-2" width="14" height="4" rx="1" /></g>
      <g className="patrol p2"><rect width="20" height="10" rx="2" /><rect x="8" y="-2" width="14" height="4" rx="1" /></g>
      <path d={PATROL} className="hidden-path" /><path d={PATROL2} className="hidden-path" />
      {PLOTS.map((p) => {
        const b = byId[p.id];
        if (!b) return null;
        const built = b.level > 0;
        const building = Boolean(b.queued);
        return (
          <g
            key={p.id} className={`plot ${built ? 'built' : 'empty'} ${building ? 'working' : ''} ${selected === p.id ? 'sel' : ''}`}
            transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-label={`${names[p.id] ?? p.name}, уровень ${b.level}`}
            onClick={() => onSelect(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } }}
          >
            {built ? <Glyph id={p.id} w={p.w} h={p.h} /> : <rect width={p.w} height={p.h} rx="5" className="b-empty" />}
            {building && <rect width={p.w} height={p.h} rx="5" className="b-working" />}
            <g transform={`translate(8 ${p.h + 16})`}>
              <text className="plot-name">{p.name}</text>
            </g>
            <g transform={`translate(${p.w - 4} 4)`}>
              <circle r="13" className={`lvl ${building ? 'lvl-up' : ''}`} />
              <text className="lvl-t" textAnchor="middle" dy="4.5">{built ? b.level : '+'}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
