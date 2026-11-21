import type { TankClass } from '../types';

const PALETTES = [
  ['#5a6b3a', '#44522b', '#2f3a1d'], ['#6e6a52', '#555240', '#3b392c'], ['#59626a', '#444c53', '#2e353a'], ['#7a6a43', '#5f5233', '#463c24'],
  ['#4f6258', '#3d4d44', '#2a362f'], ['#6b5a4a', '#52443a', '#392f28'], ['#5b5f45', '#474a35', '#33351f'], ['#626a6f', '#4c5357', '#363c3f'],
];
const RARITY_GLOW: Record<string, string> = { Обычная: '#8a959b', Редкая: '#4f93c9', Эпическая: '#a370d6', Легендарная: '#e0932a' };

interface Props { cls: TankClass; shape: number; rarity?: string; size?: number; enemy?: boolean; dead?: boolean; className?: string }

/** Векторная карточка танка. Силуэт зависит от класса, оттенок и детали — от модели. */
export function TankArt({ cls, shape, rarity, size = 160, enemy = false, dead = false, className }: Props) {
  const idx = shape < 0 ? 2 : shape;
  const [c1, c2, c3] = enemy ? ['#6a4a45', '#523833', '#3a2724'] : PALETTES[idx % PALETTES.length];
  const v = idx % 3; // вариации ствола и башни
  const glow = rarity ? RARITY_GLOW[rarity] : 'transparent';
  const gid = `g${idx}${cls}${enemy ? 'e' : ''}`;
  return (
    <svg className={className} width={size} height={size * 0.56} viewBox="0 0 200 112" role="img" aria-label="Танк" style={{ opacity: dead ? 0.35 : 1, filter: dead ? 'grayscale(1)' : undefined }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
      </defs>
      <ellipse cx="100" cy="100" rx="82" ry="6" fill="#000" opacity="0.35" />
      {rarity && <ellipse cx="100" cy="98" rx="70" ry="4" fill={glow} opacity="0.22" />}
      <g transform={enemy ? 'translate(200 0) scale(-1 1)' : undefined}>
        {cls === 'light' && <Light g={gid} c2={c2} c3={c3} v={v} />}
        {cls === 'medium' && <Medium g={gid} c2={c2} c3={c3} v={v} />}
        {cls === 'heavy' && <Heavy g={gid} c2={c2} c3={c3} v={v} />}
        {cls === 'td' && <Td g={gid} c2={c2} c3={c3} v={v} />}
        {cls === 'arty' && <Arty g={gid} c2={c2} c3={c3} v={v} />}
      </g>
    </svg>
  );
}

interface PartProps { g: string; c2: string; c3: string; v: number }
const Tracks = ({ x, w, y = 80, h = 18, wheels, c3 }: { x: number; w: number; y?: number; h?: number; wheels: number; c3: string }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#1a1d1f" stroke="#0c0e0f" />
    {Array.from({ length: wheels }, (_, i) => (
      <circle key={i} cx={x + h / 2 + (i * (w - h)) / (wheels - 1)} cy={y + h / 2} r={h / 2 - 3} fill={c3} stroke="#0c0e0f" />
    ))}
  </g>
);
const Light = ({ g, c2, c3, v }: PartProps) => (
  <g>
    <Tracks x={52} w={100} y={82} h={14} wheels={5} c3={c3} />
    <path d="M56 82l8-14h72l12 14z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.5" />
    <path d="M86 68l6-13h26l8 13z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.5" />
    <rect x="118" y={60 + v} width={34 + v * 6} height="3.2" rx="1.5" fill={c3} />
    <circle cx="104" cy="62" r="2.4" fill={c2} />
  </g>
);
const Medium = ({ g, c2, c3, v }: PartProps) => (
  <g>
    <Tracks x={40} w={124} wheels={6} c3={c3} />
    <path d="M44 80l10-16h96l14 16z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.6" />
    <path d="M74 64l8-18h38l12 18z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.6" />
    <rect x="124" y={50 + v} width={42 + v * 6} height="4.5" rx="2" fill={c3} />
    <rect x="120" y="48" width="8" height="9" rx="2" fill={c2} stroke={c3} />
    <circle cx="100" cy="52" r="3" fill={c3} />
  </g>
);
const Heavy = ({ g, c2, c3, v }: PartProps) => (
  <g>
    <Tracks x={34} w={134} y={78} h={22} wheels={7} c3={c3} />
    <path d="M38 78l8-20h108l16 20z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.8" />
    <path d="M66 58l10-22h52l14 22z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.8" />
    <rect x="132" y={40 + v} width={36 + v * 5} height="7" rx="2.5" fill={c3} />
    <rect x={164 + v * 5} y={38.5 + v} width="6" height="10" rx="2" fill={c2} stroke={c3} />
    <rect x="128" y="38" width="10" height="13" rx="2" fill={c2} stroke={c3} />
    <circle cx="98" cy="44" r="3.5" fill={c3} />
  </g>
);
const Td = ({ g, c2, c3, v }: PartProps) => (
  <g>
    <Tracks x={42} w={120} y={82} h={16} wheels={6} c3={c3} />
    <path d="M44 82l6-18 20-10h70l18 28z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.7" />
    <path d="M74 54l8-8h40l8 8z" fill={c2} stroke={c3} strokeWidth="1.4" />
    <rect x="140" y={61 + v} width={46 + v * 5} height="4.6" rx="2" fill={c3} />
    <rect x="136" y={59 + v} width="8" height="9" rx="2" fill={c2} stroke={c3} />
  </g>
);
const Arty = ({ g, c2, c3, v }: PartProps) => (
  <g>
    <Tracks x={40} w={122} y={82} h={16} wheels={6} c3={c3} />
    <path d="M44 82l8-14h98l12 14z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.7" />
    <path d="M60 68V44h56l8 24z" fill={`url(#${g})`} stroke={c3} strokeWidth="1.7" />
    <path d="M70 44v-6h36v6" fill="none" stroke={c3} strokeWidth="1.5" />
    <g transform="rotate(-22 112 54)"><rect x="112" y="51" width={50 + v * 6} height="5.5" rx="2" fill={c3} /><rect x="108" y="48" width="12" height="12" rx="2" fill={c2} stroke={c3} /></g>
    <rect x="46" y="64" width="12" height="6" rx="1" fill={c2} stroke={c3} />
  </g>
);
