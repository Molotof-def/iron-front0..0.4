import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { TankArt } from '../components/TankArt';
import { Bar, Btn, ClassBadge, Modal, Panel, ResIcon } from '../components/ui';
import { useGame } from '../state/GameProvider';
import { RES_LABEL, costEntries, num } from '../lib/format';
import type { BattleUnit, MissionType, MissionView, TankView } from '../types';

const TYPE_ICON: Record<MissionType, string> = { recon: 'radar', defense: 'shield', capture: 'flag', trial: 'star', boss: 'trophy' };
const ACTIONS: { id: string; name: string; icon: string; cost: string; hint: string }[] = [
  { id: 'attack', name: 'Атака', icon: 'attack', cost: '1', hint: 'Выстрел по врагу' },
  { id: 'overdrive', name: 'Залп', icon: 'power', cost: '3', hint: 'Мощный удар' },
  { id: 'aim', name: 'Прицел', icon: 'battle', cost: '1', hint: '+18 к следующему выстрелу' },
  { id: 'guard', name: 'Защита', icon: 'shield', cost: '+1', hint: 'Смягчает удар, +1 энергия' },
  { id: 'repair', name: 'Ремонт', icon: 'repair', cost: '2', hint: 'Восстановить прочность' },
];

export function BattleScreen() {
  const { view } = useGame();
  if (view.battle) return <BattleArena />;
  return <MissionBoard />;
}

function rulesProblem(m: MissionView, picked: string[], tanks: TankView[], cfgClass: (id: string) => string, limit: number): string | null {
  if (!picked.length) return 'Выберите хотя бы одну машину.';
  const max = Math.min(limit, m.rules?.maxSquad ?? 99);
  if (picked.length > max) return `Отряд ограничен: ${max}.`;
  const classes = new Set(picked.map(cfgClass));
  if (m.rules?.classes && [...classes].some((c) => !m.rules!.classes!.includes(c as never))) return 'Состав не подходит под условия испытания.';
  if (m.rules?.minClasses && classes.size < m.rules.minClasses) return `Нужно минимум ${m.rules.minClasses} класса техники.`;
  if (picked.some((id) => !tanks.find((t) => t.id === id)?.owned)) return 'Выбрана недоступная машина.';
  return null;
}

function MissionBoard() {
  const { view, config, act, busy } = useGame();
  const [selId, setSelId] = useState<string>(() => view.missions.find((m) => !m.locked)?.id ?? 'r1');
  const [picked, setPicked] = useState<string[]>(view.squad);
  const [filter, setFilter] = useState<MissionType | 'all'>('all');
  const m = view.missions.find((x) => x.id === selId) as MissionView;
  const cls = (id: string) => config.tanks.find((t) => t.id === id)!.class;
  const problem = m.locked ? m.problem?.message ?? null : rulesProblem(m, picked, view.tanks, cls, view.base.squadLimit) ?? (view.resources.fuel < m.fuel ? `Не хватает топлива: нужно ${m.fuel}.` : null);
  const owned = view.tanks.filter((t) => t.owned);
  const list = view.missions.filter((x) => filter === 'all' || x.type === filter);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const limit = Math.min(view.base.squadLimit, m.rules?.maxSquad ?? 99);

  return (
    <div className="screen battle-grid">
      <Panel title="Операции" icon="battle" className="missions" right={<span className="chip"><ResIcon k="fuel" size={13} /> {num(view.resources.fuel)}/{view.caps.fuel}</span>}>
        <div className="filters">{(['all', 'recon', 'defense', 'capture', 'trial', 'boss'] as const).map((k) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k === 'all' ? 'Все' : config.missionTypes[k].name}</button>)}</div>
        <ul className="mlist">
          {list.map((x) => (
            <li key={x.id}>
              <button className={`mrow ${selId === x.id ? 'on' : ''} ${x.locked ? 'locked' : ''} t-${x.type}`} onClick={() => { setSelId(x.id); if (window.innerWidth < 1024) window.setTimeout(() => document.getElementById('mission-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30); }}>
                <span className="m-ico"><Icon name={x.locked ? 'lock' : TYPE_ICON[x.type]} size={18} /></span>
                <span className="m-txt"><b>{x.name}</b><small>{config.missionTypes[x.type].name}{x.clears > 0 ? ` · побед: ${x.clears}` : ''}</small></span>
                <span className="m-fuel"><ResIcon k="fuel" size={12} />{x.fuel}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={m.name} icon={TYPE_ICON[m.type]} className="mdetail" id="mission-detail" right={<span className="chip">{config.missionTypes[m.type].name}</span>}>
        <p className="muted">{m.desc}</p>
        <div className="env">
          <span><Icon name="flag" size={13} />{config.arenas[m.arena].name}</span>
          <span><Icon name="info" size={13} />{config.weather[m.weather].name}</span>
          {m.turnLimit > 0 && <span><Icon name="clock" size={13} />{m.turnLimit} ходов</span>}
        </div>
        <p className="muted small">{config.arenas[m.arena].desc} {config.weather[m.weather].desc}</p>

        <h4>Противник</h4>
        {m.locked ? <p className="problem"><Icon name="lock" size={14} />{m.problem?.message}</p> : (
          <ul className="foes">
            {m.enemies?.map((e, i) => (
              <li key={i}>
                <TankArt cls={e.class} shape={e.shape} size={86} enemy />
                <div><b>{e.name}</b>{e.level > 0 && <span className="muted small"> ур. {e.level}</span>}<div className="muted small">{config.classes[e.class].name}{e.role ? ` · ${config.roles[e.role]}` : ''}</div>
                  {e.hp != null && <div className="muted small">Прочн. {e.hp} · броня {e.armor} · огонь {e.attack}</div>}</div>
              </li>
            ))}
          </ul>
        )}
        {!m.locked && m.intel < 3 && <p className="muted small"><Icon name="radar" size={13} /> Улучшайте РЛС, чтобы видеть роли и параметры противника.</p>}

        <h4>Награда</h4>
        <ul className="reward-list">
          {costEntries(m.reward).map(([k, v]) => <li key={k}><ResIcon k={k} size={14} />{num(v)}</li>)}
          <li><Icon name="star" size={14} className="res-xp" />{m.reward.xp} XP</li>
        </ul>
        <p className="muted small">{m.bonus.turns ? `Бонус +20%: победа за ${m.bonus.turns} ходов или быстрее.` : m.bonus.noLoss ? 'Бонус +20%: победа без потерь.' : ''} Первая победа: +50% кредитов и опыта.</p>
        {m.rules && <p className="muted small">Условия: {[m.rules.classes && `только ${m.rules.classes.map((c) => config.classes[c].name.toLowerCase()).join(', ')}`, m.rules.maxSquad && `до ${m.rules.maxSquad} машин`, m.rules.minClasses && `минимум ${m.rules.minClasses} класса`].filter(Boolean).join('; ')}</p>}
      </Panel>

      <Panel title="Боевой отряд" icon="hangar" className="squad" right={<span className="muted small">{picked.length}/{limit}</span>}>
        <ul className="squad-list">
          {owned.map((t) => {
            const c = config.tanks.find((x) => x.id === t.id)!;
            const on = picked.includes(t.id);
            return (
              <li key={t.id}>
                <button className={`sq ${on ? 'on' : ''}`} onClick={() => toggle(t.id)} aria-pressed={on}>
                  <TankArt cls={c.class} shape={c.shape} size={72} />
                  <span className="sq-txt"><b>{c.name}</b><small>Ур. {t.level} · {t.stats.hp} HP · {t.stats.attack} атк</small></span>
                  <ClassBadge cls={c.class} />
                  <span className="sq-check">{on ? <Icon name="check" size={16} /> : null}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {problem && <p className="problem"><Icon name="lock" size={14} />{problem}</p>}
        <Btn variant="amber" block icon="battle" disabled={busy || Boolean(problem)} onClick={() => act('battle/start', { missionId: m.id, squad: picked })}>Начать бой (−{m.fuel} топлива)</Btn>
      </Panel>
    </div>
  );
}

function useHitFlash(hp: number, key: string): string {
  const prev = useRef({ hp, key });
  const [cls, setCls] = useState('');
  useEffect(() => {
    if (prev.current.key === key && hp < prev.current.hp) {
      setCls('hit');
      const t = window.setTimeout(() => setCls(''), 450);
      prev.current = { hp, key };
      return () => window.clearTimeout(t);
    }
    prev.current = { hp, key };
    return undefined;
  }, [hp, key]);
  return cls;
}

function UnitCard({ u, enemy, id }: { u: BattleUnit; enemy?: boolean; id: string }) {
  const { config } = useGame();
  const c = config.tanks.find((t) => t.id === u.tankId);
  const flash = useHitFlash(u.hp, id);
  return (
    <div className={`unit ${enemy ? 'enemy' : 'ally'} ${flash} ${u.hp <= 0 ? 'dead' : ''}`}>
      <div className="unit-head"><b>{u.name}</b><ClassBadge cls={u.cls} />{u.shield && <span className="chip chip-olive"><Icon name="shield" size={12} />Оборона</span>}{u.aim > 0 && <span className="chip chip-amber">Прицел</span>}</div>
      <TankArt cls={u.cls} shape={c?.shape ?? 0} size={170} enemy={enemy} dead={u.hp <= 0} />
      <Bar value={u.hp} max={u.maxHp} tone={enemy ? 'red' : 'olive'} label={`Прочность ${u.name}`} />
      <div className="unit-stats"><span>{u.hp}/{u.maxHp} HP</span><span>Броня {u.armor}</span><span>Огонь {u.attack}</span></div>
      {!enemy && <div className="pips" aria-label={`Энергия ${u.energy}`}>{[0, 1, 2].map((i) => <i key={i} className={i < u.energy ? 'on' : ''} />)}</div>}
    </div>
  );
}

function BattleArena() {
  const { view, config, act, busy } = useGame();
  const b = view.battle!;
  const mission = view.missions.find((m) => m.id === b.missionId);
  const [confirm, setConfirm] = useState(false);
  const logRef = useRef<HTMLUListElement>(null);
  useEffect(() => { logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight }); }, [b.log.length]);
  const me = b.squad[b.active]; const foe = b.enemies[b.foe];
  const done = b.status !== 'active';
  const can = (id: string): string | null => {
    if (id === 'attack' && me.energy < 1) return 'Нужна 1 энергия';
    if (id === 'aim' && me.energy < 1) return 'Нужна 1 энергия';
    if (id === 'overdrive' && me.energy < 3) return 'Нужно 3 энергии';
    if (id === 'repair') { if (me.hp >= me.maxHp) return 'Корпус цел'; if (b.freeRepairs <= 0 && me.energy < 2) return 'Нужно 2 энергии'; }
    return null;
  };
  const alive = b.enemies.filter((e) => e.hp > 0).length;

  return (
    <div className="screen arena-grid">
      <Panel title={mission?.name ?? 'Бой'} icon="battle" className="arena-head"
        right={<span className="chip">Ход {b.turn}{b.turnLimit ? `/${b.turnLimit}` : ''} · {config.weather[b.weather].name}</span>}>
        <div className="arena">
          <UnitCard u={me} id={`a${b.active}`} />
          <div className="vs"><span>VS</span><small>Врагов: {alive}</small></div>
          <UnitCard u={foe} enemy id={`e${b.foe}`} />
        </div>
        <div className="strip">
          {b.squad.map((u, i) => <span key={i} className={`mini ${i === b.active ? 'cur' : ''} ${u.hp <= 0 ? 'down' : ''}`}>{u.name}<Bar value={u.hp} max={u.maxHp} /></span>)}
        </div>
      </Panel>

      <Panel title="Команды" icon="power" className="controls">
        {done ? <Result /> : (
          <>
            <div className="actions-grid">
              {ACTIONS.map((a) => {
                const why = can(a.id);
                return (
                  <button key={a.id} className={`act act-${a.id}`} disabled={busy || Boolean(why)} title={why ?? a.hint}
                    onClick={() => act('battle/action', { battleId: b.id, action: a.id })}>
                    <Icon name={a.icon} size={20} /><b>{a.name}</b><small>{a.id === 'repair' && b.freeRepairs > 0 ? `free×${b.freeRepairs}` : a.cost}</small>
                  </button>
                );
              })}
            </div>
            <p className="muted small">Энергия восстанавливается на 1 каждый ход. Ремонтный комплекс даёт бесплатные ремонты: {b.freeRepairs}.</p>
            <Btn variant="danger" icon="x" disabled={busy} onClick={() => setConfirm(true)}>Отступить</Btn>
          </>
        )}
      </Panel>

      <Panel title="Журнал боя" icon="info" className="blog">
        <ul className="log" ref={logRef}>{b.log.map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}</ul>
      </Panel>

      <Modal open={confirm} title="Отступить?" onClose={() => setConfirm(false)}>
        <p>Отряд покинет поле боя. Топливо не возвращается, награды не будет.</p>
        <div className="modal-actions"><Btn variant="ghost" onClick={() => setConfirm(false)}>Остаться</Btn><Btn variant="danger" onClick={() => { setConfirm(false); void act('battle/action', { battleId: b.id, action: 'retreat' }); }}>Отступить</Btn></div>
      </Modal>
    </div>
  );
}

function Result() {
  const { view, act, busy } = useGame();
  const b = view.battle!;
  const r = b.reward;
  const title = b.status === 'won' ? 'Победа!' : b.status === 'retreated' ? 'Отступление' : 'Поражение';
  return (
    <div className={`result result-${b.status}`}>
      <h3>{title}</h3>
      <p className="muted">{b.status === 'won' ? `Задача выполнена за ${b.turn} ходов.` : b.status === 'retreated' ? 'Награда за операцию не предусмотрена.' : 'Часть опыта и ресурсов всё же получена.'}</p>
      {r && (
        <ul className="reward-list pop">
          {costEntries(r).map(([k, v]) => <li key={k} title={RES_LABEL[k]}><ResIcon k={k} size={15} />+{num(v)}</li>)}
          {r.xp > 0 && <li><Icon name="star" size={15} className="res-xp" />+{num(r.xp)} XP</li>}
        </ul>
      )}
      {r?.bonus && <p className="ok-note"><Icon name="check" size={14} /> Бонусное условие выполнено: +20%</p>}
      {r?.firstClear && <p className="ok-note"><Icon name="star" size={14} /> Первая победа: +50% кредитов и опыта</p>}
      <Btn variant="amber" block icon="trophy" disabled={busy} onClick={() => act('battle/claim', { battleId: b.id }, 'Награда получена')}>Забрать награду</Btn>
    </div>
  );
}

