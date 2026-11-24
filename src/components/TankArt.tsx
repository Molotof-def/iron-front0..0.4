import type { TankClass } from '../types';

const PALETTES = [
  ['#6b7d3f', '#4b5a2b', '#303b1c'], ['#7a7556', '#5b5841', '#3b392c'], ['#66717a', '#49525a', '#2e353a'], ['#86744a', '#645537', '#463c24'],
  ['#557066', '#3f5249', '#2a362f'], ['#76624f', '#564639', '#392f28'], ['#656b49', '#4a4e35', '#33351f'], ['#6d767c', '#4e565b', '#363c3f'],
];
const ENEMY = ['#8a5650', '#5f3b36', '#3a2724'];
/** Косметические камуфляжи: меняют краску и узор, на силу не влияют. */
const CAMO_STYLE: Record<string, { pal: string[]; kind: number }> = {
  desert: { pal: ['#b79c63', '#8f7a4b', '#5e4f30'], kind: 1 }, forest: { pal: ['#4f6b3a', '#38502b', '#233619'], kind: 1 },
  arctic: { pal: ['#cfd6d9', '#a5aeb3', '#7b858a'], kind: 2 }, night: { pal: ['#2f3a52', '#1f283b', '#121824'], kind: 3 }, gold: { pal: ['#e8bd52', '#b88a2a', '#7a5a18'], kind: 0 },
};
const EMBLEM_PATH: Record<string, string> = {
  star: 'M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z',
  skull: 'M12 3a8 8 0 00-5 14v3h10v-3A8 8 0 0012 3zM9 10a1.8 1.8 0 100 3.6A1.8 1.8 0 009 10zm6 0a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z',
  wolf: 'M3 3l5 4h8l5-4-1 9-4 3v5l-4-2-4 2v-5l-4-3z', eagle: 'M12 4l3 4 7-3-3 7-4 1 2 6-5-3-5 3 2-6-4-1-3-7 7 3z',
  dragon: 'M4 18c4-1 6-5 6-9l4 2 6-6c0 6-3 11-8 13l-3 4z', crown: 'M3 18l-1-11 6 5 4-8 4 8 6-5-1 11z',
};
const EMBLEM_POS: Record<TankClass, [number, number, number]> = { light: [104, 56, 0.42], medium: [101, 49, 0.5], heavy: [100, 40, 0.58], td: [104, 62, 0.5], arty: [106, 60, 0.46] };
const RARITY_GLOW: Record<string, string> = { Обычная: '#8a959b', Редкая: '#4f93c9', Эпическая: '#a370d6', Легендарная: '#e0932a' };

interface Props {
  cls: TankClass; shape: number; rarity?: string; size?: number; enemy?: boolean; dead?: boolean; className?: string;
  /** Доля прочности 0..1: при низкой появляется дым и огонь. */
  hpRatio?: number;
  /** Счётчик выстрелов: при каждом изменении проигрывается вспышка у дула. */
  fire?: number;
  /** Лёгкое «дыхание» техники для витрины. */
  idle?: boolean;
  /** Косметика: камуфляж и эмблема (не влияют на параметры). */
  camoId?: string; emblemId?: string;
}

interface Part { g: string; c2: string; c3: string; v: number; camo: number; fire: number }

/** Векторная карточка танка. Силуэт зависит от класса; оттенок, камуфляж и детали — от модели. */
export function TankArt({ cls, shape, rarity, size = 160, enemy = false, dead = false, className, hpRatio = 1, fire = 0, idle = false, camoId, emblemId }: Props) {
  const idx = shape < 0 ? 2 : shape;
  const skin = !enemy && camoId ? CAMO_STYLE[camoId] : undefined;
  const [c1, c2, c3] = enemy ? ENEMY : skin ? skin.pal : PALETTES[idx % PALETTES.length];
  const v = idx % 3;
  const camo = skin ? skin.kind : idx % 4;
  const glow = rarity ? RARITY_GLOW[rarity] : 'transparent';
  const gid = `g${idx}${cls}${enemy ? 'e' : ''}${camoId ?? ''}`;
  const p: Part = { g: gid, c2, c3, v, camo, fire };
  return (
    <svg className={`tank-art ${className ?? ''}`} width={size} height={size * 0.56} viewBox="0 0 200 112" role="img" aria-label="Танк"
      style={{ opacity: dead ? 0.4 : 1, filter: dead ? 'grayscale(1)' : undefined }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c1} /><stop offset="0.55" stopColor={c2} /><stop offset="1" stopColor={c3} /></linearGradient>
        <linearGradient id={`${gid}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
      </defs>
      <ellipse cx="100" cy="101" rx="84" ry="5.5" fill="#000" opacity="0.4" />
      {rarity && rarity !== 'Обычная' && <ellipse cx="100" cy="99" rx="72" ry="4" fill={glow} opacity="0.28" />}
      <g transform={enemy ? 'translate(200 0) scale(-1 1)' : undefined}>
        <g className={idle ? 'tank-idle' : undefined}>
          {cls === 'light' && <Light {...p} />}
          {cls === 'medium' && <Medium {...p} />}
          {cls === 'heavy' && <Heavy {...p} />}
          {cls === 'td' && <Td {...p} />}
          {cls === 'arty' && <Arty {...p} />}
          {emblemId && EMBLEM_PATH[emblemId] && (
            <g transform={`translate(${EMBLEM_POS[cls][0]} ${EMBLEM_POS[cls][1]}) scale(${EMBLEM_POS[cls][2]}) translate(-12 -12)`} opacity="0.92">
              <path d={EMBLEM_PATH[emblemId]} fill="#f2e8c8" stroke="#1b1708" strokeWidth="1.2" strokeLinejoin="round" />
            </g>
          )}
        </g>
        {(hpRatio < 0.45 || dead) && <Smoke heavy={hpRatio < 0.2 || dead} />}
      </g>
    </svg>
  );
}

const Smoke = ({ heavy }: { heavy: boolean }) => (
  <g aria-hidden="true">
    {[0, 1, 2].map((i) => <circle key={i} className="dmg-smoke" style={{ animationDelay: `${i * 0.7}s` }} cx={70 + i * 9} cy="58" r={5 + i} fill="#222a2e" />)}
    {heavy && <ellipse className="dmg-fire" cx="82" cy="62" rx="5" ry="7" fill="#e39a2d" />}
  </g>
);

const Muzzle = ({ x, y, fire }: { x: number; y: number; fire: number }) => (fire > 0 ? (
  <g transform={`translate(${x} ${y})`}>
    <g key={fire} className="muzzle" style={{ transformOrigin: '0px 0px' }}>
      <polygon points="0,0 16,-7 11,0 16,7" fill="#ffcf6a" /><polygon points="0,0 9,-3.5 6,0 9,3.5" fill="#fff4cf" /><circle cx="3" cy="0" r="4" fill="#e39a2d" opacity="0.8" />
    </g>
  </g>
) : null);

/** Гусеничный ход: корпус гусеницы, звенья, опорные катки со ступицами. */
function Tracks({ x, w, y, h, wheels, c3 }: { x: number; w: number; y: number; h: number; wheels: number; c3: string }) {
  const r = h / 2 - 2.2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#14181a" stroke="#07090a" strokeWidth="1.2" />
      <rect x={x + 2} y={y + 1.6} width={w - 4} height={h - 3.2} rx={(h - 3) / 2} fill="none" stroke="#2c3438" strokeWidth="1.4" strokeDasharray="2.2 1.6" />
      {Array.from({ length: wheels }, (_, i) => {
        const cx = x + h / 2 + (i * (w - h)) / (wheels - 1);
        const cy = y + h / 2;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r} fill={c3} stroke="#07090a" strokeWidth="1" />
            <circle cx={cx} cy={cy} r={r * 0.55} fill="#1d2326" /><circle cx={cx} cy={cy} r={r * 0.2} fill="#5a666c" />
          </g>
        );
      })}
    </g>
  );
}

/** Камуфляжные пятна по корпусу: узор зависит от модели. */
function Camo({ id, kind, c3, path }: { id: string; kind: number; c3: string; path: string }) {
  if (kind === 0) return null;
  const cp = `${id}cp`;
  return (
    <g>
      <clipPath id={cp}><path d={path} /></clipPath>
      <g clipPath={`url(#${cp})`} fill={c3} opacity="0.5">
        {kind === 1 && (<><ellipse cx="80" cy="74" rx="16" ry="6" /><ellipse cx="124" cy="70" rx="14" ry="5" /><ellipse cx="102" cy="62" rx="12" ry="4" /></>)}
        {kind === 2 && (<><rect x="70" y="50" width="6" height="40" transform="rotate(25 73 70)" /><rect x="96" y="50" width="6" height="40" transform="rotate(25 99 70)" /><rect x="122" y="50" width="6" height="40" transform="rotate(25 125 70)" /></>)}
        {kind === 3 && (<><circle cx="76" cy="72" r="6" /><circle cx="110" cy="66" r="7" /><circle cx="138" cy="74" r="5" /><circle cx="94" cy="58" r="4" /></>)}
      </g>
    </g>
  );
}

const Grille = ({ x, y, n, c }: { x: number; y: number; n: number; c: string }) => (
  <g stroke={c} strokeWidth="1.1" opacity="0.8">{Array.from({ length: n }, (_, i) => <line key={i} x1={x + i * 3} y1={y} x2={x + i * 3} y2={y + 6} />)}</g>
);
const Hatch = ({ cx, cy, c2, c3 }: { cx: number; cy: number; c2: string; c3: string }) => (
  <g><ellipse cx={cx} cy={cy} rx="5.5" ry="2.4" fill={c2} stroke={c3} strokeWidth="1" /><ellipse cx={cx} cy={cy - 0.4} rx="3.2" ry="1.3" fill={c3} /></g>
);

const Light = ({ g, c2, c3, v, camo, fire }: Part) => {
  const hull = 'M56 80 L63 66 L139 66 L151 80Z';
  return (
    <g>
      <Tracks x={50} w={104} y={79} h={16} wheels={5} c3={c3} />
      <path d={hull} fill={`url(#${g})`} stroke={c3} strokeWidth="1.6" />
      <path d="M63 66 L139 66" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" />
      <Camo id={g} kind={camo} c3={c3} path={hull} />
      <Grille x={66} y={69} n={5} c={c3} />
      <path d="M86 66 L93 53 L120 53 L127 66Z" fill={`url(#${g}t)`} stroke={c3} strokeWidth="1.6" />
      <Hatch cx={104} cy={54.5} c2={c2} c3={c3} />
      <rect x="125" y={58 + v * 0.6} width={36 + v * 5} height="3.4" rx="1.5" fill={c3} /><rect x="122" y={56.8 + v * 0.6} width="10" height="6" rx="2" fill={c2} stroke={c3} />
      <line x1="98" y1="53" x2="96" y2="40" stroke="#9aa6ab" strokeWidth="0.9" />
      <Muzzle x={161 + v * 5} y={59.7 + v * 0.6} fire={fire} />
    </g>
  );
};
const Medium = ({ g, c2, c3, v, camo, fire }: Part) => {
  const hull = 'M42 80 L54 64 L152 64 L166 80Z';
  return (
    <g>
      <Tracks x={38} w={130} y={79} h={18} wheels={6} c3={c3} />
      <path d={hull} fill={`url(#${g})`} stroke={c3} strokeWidth="1.7" />
      <path d="M54 64 L152 64" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.3" />
      <Camo id={g} kind={camo} c3={c3} path={hull} />
      <Grille x={58} y={67} n={7} c={c3} />
      <path d="M72 64 L81 46 L121 46 L132 64Z" fill={`url(#${g}t)`} stroke={c3} strokeWidth="1.7" />
      <Hatch cx={96} cy={47.5} c2={c2} c3={c3} /><circle cx="113" cy="49" r="3" fill={c2} stroke={c3} />
      <rect x="128" y={51 + v * 0.5} width={42 + v * 6} height="4.6" rx="2" fill={c3} /><rect x="122" y={48.6 + v * 0.5} width="12" height="9.4" rx="2.4" fill={c2} stroke={c3} />
      <rect x={150 + v * 3} y={50.2 + v * 0.5} width="4" height="6.2" rx="1" fill={c3} />
      <line x1="90" y1="46" x2="86" y2="30" stroke="#9aa6ab" strokeWidth="1" />
      <Muzzle x={170 + v * 6} y={53.3 + v * 0.5} fire={fire} />
    </g>
  );
};
const Heavy = ({ g, c2, c3, v, camo, fire }: Part) => {
  const hull = 'M34 78 L46 58 L156 58 L172 78Z';
  return (
    <g>
      <Tracks x={30} w={142} y={76} h={22} wheels={7} c3={c3} />
      <path d={hull} fill={`url(#${g})`} stroke={c3} strokeWidth="1.9" />
      <path d="M46 58 L156 58" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.4" />
      <Camo id={g} kind={camo} c3={c3} path={hull} />
      <Grille x={52} y={62} n={8} c={c3} />
      <path d="M62 58 L73 36 L134 36 L148 58Z" fill={`url(#${g}t)`} stroke={c3} strokeWidth="1.9" />
      <path d="M73 36 L134 36" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.2" />
      <Hatch cx={94} cy={38} c2={c2} c3={c3} /><circle cx="116" cy="40" r="3.6" fill={c2} stroke={c3} />
      <rect x="132" y={38 + v * 0.5} width={38 + v * 5} height="7.4" rx="2.6" fill={c3} /><rect x="127" y={35.5 + v * 0.5} width="12" height="13" rx="2.6" fill={c2} stroke={c3} />
      <rect x={167 + v * 5} y={36.6 + v * 0.5} width="7" height="10.4" rx="2" fill={c2} stroke={c3} />
      <line x1="84" y1="36" x2="80" y2="20" stroke="#9aa6ab" strokeWidth="1.1" />
      <Muzzle x={174 + v * 5} y={41.7 + v * 0.5} fire={fire} />
    </g>
  );
};
const Td = ({ g, c2, c3, v, camo, fire }: Part) => {
  const hull = 'M40 82 L48 62 L72 52 L144 52 L170 82Z';
  return (
    <g>
      <Tracks x={38} w={128} y={80} h={17} wheels={6} c3={c3} />
      <path d={hull} fill={`url(#${g})`} stroke={c3} strokeWidth="1.8" />
      <path d="M72 52 L144 52" stroke="#fff" strokeOpacity="0.2" strokeWidth="1.3" />
      <Camo id={g} kind={camo} c3={c3} path={hull} />
      <path d="M78 52 L84 44 L124 44 L130 52Z" fill={c2} stroke={c3} strokeWidth="1.5" />
      <Hatch cx={100} cy={45.5} c2={c2} c3={c3} />
      <rect x="146" y={59 + v * 0.5} width={44 + v * 4} height="4.6" rx="2" fill={c3} /><rect x="140" y={56.6 + v * 0.5} width="9" height="9.4" rx="2" fill={c2} stroke={c3} />
      <rect x={176 + v * 4} y={57.6 + v * 0.5} width="7" height="7" rx="1.4" fill={c2} stroke={c3} />
      <Grille x={54} y={66} n={6} c={c3} />
      <Muzzle x={190 + v * 4} y={61.3 + v * 0.5} fire={fire} />
    </g>
  );
};
const Arty = ({ g, c2, c3, v, camo, fire }: Part) => {
  const hull = 'M42 82 L52 66 L150 66 L164 82Z';
  const cab = 'M58 66 V40 H118 L128 66Z';
  return (
    <g>
      <Tracks x={38} w={128} y={80} h={17} wheels={6} c3={c3} />
      <path d={hull} fill={`url(#${g})`} stroke={c3} strokeWidth="1.8" />
      <path d={cab} fill={`url(#${g}t)`} stroke={c3} strokeWidth="1.8" />
      <Camo id={g} kind={camo} c3={c3} path={`${hull} ${cab}`} />
      <rect x="66" y="46" width="34" height="14" rx="2" fill="#0f1416" opacity="0.55" /><path d="M66 46 H100 M66 53 H100" stroke={c3} strokeWidth="1" />
      <path d="M70 40 V34 H108 V40" fill="none" stroke={c3} strokeWidth="1.6" />
      <g transform="rotate(-22 118 54)">
        <rect x="116" y="50.6" width={52 + v * 6} height="5.6" rx="2" fill={c3} /><rect x="108" y="46.5" width="14" height="13.6" rx="2.4" fill={c2} stroke={c3} />
        <rect x={158 + v * 6} y="49.4" width="8" height="8" rx="1.6" fill={c2} stroke={c3} />
      </g>
      <rect x="44" y="68" width="14" height="6" rx="1" fill={c2} stroke={c3} />
      <Muzzle x={164 + v * 11} y={34.7 - v * 4.5} fire={fire} />
    </g>
  );
};
