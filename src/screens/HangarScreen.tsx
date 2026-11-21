import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { TankArt } from '../components/TankArt';
import { Bar, Btn, ClassBadge, CostList, Empty, Modal, Panel, StatRow, TimerBar } from '../components/ui';
import { useGame } from '../state/GameProvider';
import { useNav } from '../state/nav';
import { duration, rarityClass } from '../lib/format';
import type { TankClass, TankCfg, TankView } from '../types';

type Filter = 'all' | 'owned' | 'available' | TankClass;
const FILTERS: [Filter, string][] = [['all', 'Все'], ['owned', 'В ангаре'], ['available', 'Доступны'], ['light', 'ЛТ'], ['medium', 'СТ'], ['heavy', 'ТТ'], ['td', 'ПТ'], ['arty', 'САУ']];
const MAXES = { hp: 300, armor: 70, attack: 100, mobility: 70 };

export function HangarScreen() {
  const { view, config, act } = useGame();
  const { focus } = useNav();
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<string>(focus || view.squad[0] || 't34');
  const [cmp, setCmp] = useState<string | null>(null);
  const [cmpOpen, setCmpOpen] = useState(false);
  useEffect(() => { if (focus) setSel(focus); }, [focus]);

  const rows = useMemo(() => config.tanks.map((c) => ({ c, v: view.tanks.find((t) => t.id === c.id) as TankView })), [config, view.tanks]);
  const shown = rows.filter(({ c, v }) => filter === 'all' || (filter === 'owned' ? v.owned : filter === 'available' ? !v.owned && !v.problem : c.class === filter))
    .sort((a, b) => Number(b.v.owned) - Number(a.v.owned) || a.c.tier - b.c.tier);
  const cur = rows.find((r) => r.c.id === sel) ?? rows[0];
  const other = cmp ? rows.find((r) => r.c.id === cmp) : null;
  const inSquad = view.squad.includes(cur.c.id);
  const toggleSquad = () => {
    const next = inSquad ? view.squad.filter((x) => x !== cur.c.id) : [...view.squad, cur.c.id];
    if (!next.length) return;
    void act('squad/set', { squad: next.slice(0, view.base.squadLimit) }, inSquad ? 'Машина убрана из отряда' : 'Машина добавлена в отряд');
  };

  return (
    <div className="screen hangar-grid">
      <Panel className="selected" title={cur.c.name} icon="hangar" right={<span className="muted small">Парк {view.base.garage.used}/{view.base.garage.capacity}</span>}>
        <div className={`showcase ${rarityClass(cur.c.rarity)}`}>
          <TankArt cls={cur.c.class} shape={cur.c.shape} rarity={cur.c.rarity} size={300} />
        </div>
        <div className="tags"><ClassBadge cls={cur.c.class} /><span className={`chip ${rarityClass(cur.c.rarity)}`}>{cur.c.rarity}</span><span className="chip">{cur.c.country}</span><span className="chip">Ур. техники {cur.c.tier}</span></div>
        <p className="muted">{cur.c.desc}</p>
        <p className="muted small">{config.classes[cur.c.class].role}: {config.classes[cur.c.class].desc}</p>
        <TankStats cfg={cur.c} v={cur.v} />
        {cur.v.owned ? <OwnedActions v={cur.v} cfg={cur.c} inSquad={inSquad} toggleSquad={toggleSquad} /> : <ProduceBlock v={cur.v} cfg={cur.c} />}
        <Btn variant="ghost" icon="info" onClick={() => { setCmp(cmp ?? rows.find((r) => r.c.id !== cur.c.id && r.v.owned)?.c.id ?? null); setCmpOpen(true); }}>Сравнить</Btn>
        <p className="muted small hist">{cur.c.history}</p>
      </Panel>

      <Panel className="collection" title="Коллекция" icon="star" right={<span className="muted small">{view.tanks.filter((t) => t.owned).length}/{config.tanks.length}</span>}>
        <div className="filters" role="tablist">{FILTERS.map(([k, n]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{n}</button>)}</div>
        {view.produceQueue.length > 0 && <div className="queue-box">{view.produceQueue.map((q) => <div key={q.id}><span className="small">Производство: {config.tanks.find((t) => t.id === q.tankId)?.name}</span><TimerBar startedAt={q.startedAt} endsAt={q.endsAt} /></div>)}</div>}
        {shown.length === 0 ? <Empty>В этой категории пока ничего нет.</Empty> : (
          <ul className="cards">
            {shown.map(({ c, v }) => (
              <li key={c.id}>
                <button className={`tcard ${sel === c.id ? 'on' : ''} ${rarityClass(c.rarity)} ${v.owned ? '' : 'unowned'}`} onClick={() => setSel(c.id)}>
                  <TankArt cls={c.class} shape={c.shape} size={112} />
                  <span className="tc-name">{c.name}</span>
                  <span className="tc-meta"><ClassBadge cls={c.class} />{v.owned ? <b>Ур. {v.level}</b> : v.producing ? <b className="amber">Строится</b> : v.problem ? <Icon name="lock" size={13} /> : <b className="olive">Доступен</b>}{view.squad.includes(c.id) && <Icon name="flag" size={13} className="in-squad" />}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Modal open={cmpOpen} title="Сравнение техники" onClose={() => setCmpOpen(false)}>
        <label className="field">Сравнить с:
          <select value={cmp ?? ''} onChange={(e) => setCmp(e.target.value)}>
            {rows.filter((r) => r.c.id !== cur.c.id).map((r) => <option key={r.c.id} value={r.c.id}>{r.c.name}{r.v.owned ? ` (ур. ${r.v.level})` : ''}</option>)}
          </select>
        </label>
        {other && (
          <table className="cmp"><thead><tr><th /><th>{cur.c.name}</th><th>{other.c.name}</th></tr></thead>
            <tbody>
              {(['hp', 'armor', 'attack', 'mobility'] as const).map((k) => {
                const a = cur.v.stats[k]; const b = other.v.stats[k];
                return <tr key={k}><td>{{ hp: 'Прочность', armor: 'Броня', attack: 'Огонь', mobility: 'Мобильность' }[k]}</td><td className={a > b ? 'win' : ''}>{a}</td><td className={b > a ? 'win' : ''}>{b}</td></tr>;
              })}
              <tr><td>Класс</td><td>{config.classes[cur.c.class].name}</td><td>{config.classes[other.c.class].name}</td></tr>
              <tr><td>Роль</td><td>{config.classes[cur.c.class].role}</td><td>{config.classes[other.c.class].role}</td></tr>
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}

function TankStats({ cfg, v }: { cfg: TankCfg; v: TankView }) {
  return (
    <div className="stats">
      <StatRow icon="heart" label="Прочность" value={v.stats.hp} next={v.nextStats?.hp} max={MAXES.hp} />
      <StatRow icon="shield" label="Броня" value={v.stats.armor} next={v.nextStats?.armor} max={MAXES.armor} />
      <StatRow icon="attack" label="Огневая мощь" value={v.stats.attack} next={v.nextStats?.attack} max={MAXES.attack} />
      <StatRow icon="speed" label="Мобильность" value={v.stats.mobility} next={v.nextStats?.mobility} max={MAXES.mobility} />
      {v.owned && <p className="muted small">Уровень {v.level}. Показатели учитывают исследования.</p>}
      {!v.owned && <p className="muted small">Базовые показатели {cfg.name} на 1 уровне с учётом исследований.</p>}
    </div>
  );
}

function OwnedActions({ v, cfg, inSquad, toggleSquad }: { v: TankView; cfg: TankCfg; inSquad: boolean; toggleSquad: () => void }) {
  const { view, act, busy } = useGame();
  return (
    <div className="actions">
      {v.upgradeCost ? (
        <>
          <div className="req-row"><CostList cost={v.upgradeCost} have={view.resources} /><span className="muted small">до ур. {v.level + 1}</span></div>
          {v.upgradeProblem && <p className="problem"><Icon name="lock" size={14} />{v.upgradeProblem.message}</p>}
          <Btn variant="amber" block icon="up" disabled={busy || Boolean(v.upgradeProblem)} onClick={() => act('tank/upgrade', { tankId: cfg.id }, `${cfg.name} улучшен`)}>Улучшить</Btn>
        </>
      ) : <p className="problem"><Icon name="lock" size={14} />Предел уровня ({view.base.maxTankLevel}). Улучшите учебный полигон.</p>}
      <Btn variant={inSquad ? 'ghost' : 'primary'} block icon="flag" disabled={busy || (inSquad && view.squad.length <= 1) || (!inSquad && view.squad.length >= view.base.squadLimit)} onClick={toggleSquad}>{inSquad ? 'Убрать из отряда' : 'В боевой отряд'}</Btn>
      <Bar value={view.squad.length} max={view.base.squadLimit} tone="steel" label="Отряд" />
      <span className="muted small">Отряд: {view.squad.length}/{view.base.squadLimit} машин</span>
    </div>
  );
}

function ProduceBlock({ v, cfg }: { v: TankView; cfg: TankCfg }) {
  const { view, config, act, busy } = useGame();
  const techName = cfg.reqTech ? config.techs.find((t) => t.id === cfg.reqTech)?.name : null;
  if (v.producing) return <div className="actions"><h4>Идёт производство</h4><TimerBar startedAt={v.producing.startedAt} endsAt={v.producing.endsAt} /><Btn variant="ghost" icon="x" disabled={busy} onClick={() => act('tank/produce-cancel', { queueId: v.producing!.id }, 'Производство отменено')}>Отменить</Btn></div>;
  return (
    <div className="actions">
      <div className="req-row"><CostList cost={cfg.cost} have={view.resources} /><span className="muted"><Icon name="clock" size={13} /> {duration(v.produceSeconds)}</span></div>
      <p className="muted small">Требуется: ангар {cfg.reqHangar} ур., командир {cfg.reqLevel} ур.{techName ? `, исследование «${techName}»` : ''}</p>
      {v.problem && <p className="problem"><Icon name="lock" size={14} />{v.problem.message}</p>}
      <Btn variant="amber" block icon="hangar" disabled={busy || Boolean(v.problem)} onClick={() => act('tank/produce', { tankId: cfg.id }, `${cfg.name}: производство запущено`)}>Произвести</Btn>
    </div>
  );
}
