import type {Tank} from '../types';
const palettes=['#788b52','#9b7651','#657b46','#a2a06a','#637a62','#788d55','#6e815d','#5c7552','#7c7770','#7b8661','#9b8357','#6f8171','#71856b','#687a68','#6b766a','#8b8a72'];
const turrets=[
  'M91 67 Q100 43 139 42 Q170 43 179 64 L171 83 Q130 94 88 82Z',
  'M91 61 L105 34 Q132 26 165 35 L181 57 L176 86 Q130 98 84 84Z',
  'M91 66 L103 42 Q130 31 163 42 L178 66 L170 87 Q130 96 87 84Z',
  'M89 67 L104 45 L158 42 L178 60 L170 82 L92 83Z',
  'M93 66 L111 42 L155 40 L174 59 L169 82 L91 84Z',
  'M91 66 L111 39 L160 39 L183 61 L172 84 L89 83Z',
  'M91 66 L105 42 L159 39 L182 57 L173 82 L91 84Z',
  'M91 66 L110 38 L161 39 L184 58 L174 83 L89 84Z',
  'M86 66 Q95 39 137 38 Q174 39 183 64 L174 86 Q130 96 82 83Z',
  'M89 65 L105 41 L159 39 L181 60 L170 84 L88 84Z',
  'M90 67 Q102 44 139 44 Q168 44 178 64 L169 83 Q130 92 87 83Z',
  'M88 66 L105 38 L159 40 L180 62 L170 86 L87 84Z',
  'M90 67 L108 39 L165 39 L185 60 L176 82 L88 83Z',
  'M90 67 L108 39 L162 39 L184 60 L174 83 L89 83Z',
  'M86 66 L105 39 L160 39 L185 62 L174 85 L84 84Z',
  'M90 66 L112 38 L164 40 L185 62 L175 85 L87 84Z'
];
export function TankArt({tank,large=false}:{tank:Tank;large?:boolean}){
 const s=tank.shape%16,c=palettes[s],modern=s>=3&&s<=7||s>=12,heavy=[1,2,8,11,13,14,15].includes(s),wheels=heavy?7:6;
 const barrel=s===1?104:s===8?96:s===14?112:88;
 const hull=modern?'M29 91 L52 68 L207 68 L231 91 L218 119 L43 119Z':'M25 94 L43 69 Q130 52 217 69 L235 98 L218 119 L42 119Z';
 return <svg className={large?'tank-art tank-large':'tank-art'} viewBox="0 0 260 150" role="img" aria-label={`Иллюстрация ${tank.name}`}>
  <defs><linearGradient id={`body${s}`} x2="0" y2="1"><stop stopColor={c}/><stop offset="1" stopColor="#344236"/></linearGradient><linearGradient id={`metal${s}`}><stop stopColor="#b4bd94"/><stop offset="1" stopColor="#475445"/></linearGradient><linearGradient id={`top${s}`} x2="0" y2="1"><stop stopColor="#d1d5a2"/><stop offset="1" stopColor={c}/></linearGradient></defs>
  <ellipse cx="130" cy="127" rx="108" ry="12" fill="#111711" opacity=".38"/>
  <path d={hull} fill="#252d27" stroke="#141b16" strokeWidth="4"/>
  <path d="M39 96 Q130 77 221 96 L208 113 Q130 128 52 113Z" fill={`url(#body${s})`} stroke="#202a21" strokeWidth="2"/>
  {Array.from({length:wheels},(_,i)=><g key={i}><circle cx={54+i*(152/(wheels-1))} cy="105" r={heavy?10:9} fill="#68745f" stroke="#202921" strokeWidth="4"/><circle cx={54+i*(152/(wheels-1))} cy="105" r="3" fill="#c0bd91"/><path d={`M${54+i*(152/(wheels-1))} 99v12`} stroke="#39473a" strokeWidth="2"/></g>)}
  {modern?<path d="M42 92 58 74 78 75 75 104 55 109 42 102Z M185 75 205 74 220 92 218 102 205 109 185 104Z" fill="#4a5948" stroke="#263328" strokeWidth="2"/>:<path d="M48 82 64 75 69 99 49 104Z M191 75 210 82 211 104 191 99Z" fill="#56644f" stroke="#263328" strokeWidth="2"/>}
  <path d={turrets[s]} fill={`url(#top${s})`} stroke="#29342a" strokeWidth="3"/>
  <path d={`M${130+(s%5)-2} 59 L${130+(s%5)} ${heavy?35:39} L${130+barrel} ${heavy?29:34} L${130+barrel+3} ${heavy?37:42} L${151+(s%4)} 64Z`} fill="#414b40" stroke="#222b23" strokeWidth="3"/>
  <path d={`M${130+barrel-4} ${heavy?30:35}l12 -2v7l-12 2Z`} fill="#252e27"/>
  <path d="M111 53 Q130 42 149 53 L151 62 Q130 69 109 62Z" fill={`url(#metal${s})`} opacity=".95"/>
  <rect x={s%2?105:111} y="54" width="13" height="6" rx="2" fill="#d4c58a" opacity=".85"/>
  <path d={modern?'M74 76l-10 12m122-12 10 12':'M72 80l-16 9m129-10 15 8'} stroke="#d0c38a" strokeWidth="4" opacity=".75"/>
  {s===1||s===8?<path d="M101 48 94 39 101 35 109 44 M158 46l8-8 8 4-8 9" fill="#58634f" stroke="#29342a" strokeWidth="2"/>:null}
  {modern?<path d="M89 88h82M93 93h74" stroke="#c1c99a" strokeWidth="2" opacity=".38"/>:<path d="M38 96 Q130 77 222 96" fill="none" stroke="#c5b77e" strokeWidth="2" opacity=".55"/>}
  <path d="M125 43v-7m0 0 15-7" stroke="#d6d1a2" strokeWidth="2" opacity=".7"/>
 </svg>;
}
