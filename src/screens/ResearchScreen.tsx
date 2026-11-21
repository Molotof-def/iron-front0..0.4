import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { Btn, CostList, Panel, TimerBar } from '../components/ui';
import { useGame } from '../state/GameProvider';
import { useNav } from '../state/nav';
import { duration, focusPanel } from '../lib/format';

const BRANCH_ICON: Record<string, string> = { armor: 'shield', weapons: 'attack', engines: 'speed', production: 'scrap', logistics: 'fuel', base: 'base' };

export function ResearchScreen() {
  const { view, config, act, busy } = useGame();
  const { focus } = useNav();
  const [sel, setSel] = useState<string>(focus || 'arm1');
  useEffect(() => { if (focus) setSel(focus); }, [focus]);
  const tv = (id: string) => view.techs.find((t) => t.id === id)!;
  const cur = config.techs.find((t) => t.id === sel)!;
  const v = tv(sel);
  const unlocks = config.tanks.filter((t) => t.reqTech === sel).map((t) => t.name);
  const req = cur.req ? config.techs.find((t) => t.id === cur.req) : null;

  return (
    <div className="screen research-grid">
      <Panel title="Дерево технологий" icon="research" className="tree-panel" right={<span className="muted small">Лаборатории {view.researchQueue.length}/{view.base.researchSlots}</span>}>
        <div className="tree">
          {Object.entries(config.branches).map(([bid, bname]) => (
            <div className="branch" key={bid}>
              <h4><Icon name={BRANCH_ICON[bid] ?? 'info'} size={15} />{bname}</h4>
              <ol>
                {config.techs.filter((t) => t.branch === bid).map((t, i) => {
                  const s = tv(t.id);
                  const state = s.done ? 'done' : s.queued ? 'busy' : s.problem?.code === 'prereq' || s.problem?.code === 'lab_level' ? 'locked' : 'open';
                  return (
                    <li key={t.id} className={i > 0 ? 'linked' : ''}>
                      <button className={`node node-${state} ${sel === t.id ? 'on' : ''}`} onClick={() => { setSel(t.id); focusPanel('tech-detail'); }} aria-label={t.name}>
                        <span className="node-ico">{s.done ? <Icon name="check" size={15} /> : s.queued ? <Icon name="clock" size={15} /> : state === 'locked' ? <Icon name="lock" size={14} /> : <Icon name={BRANCH_ICON[bid] ?? 'info'} size={15} />}</span>
                        <span className="node-name">{t.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </Panel>

      <Panel id="tech-detail" title={cur.name} icon="research" className="detail" right={<span className="chip">{config.branches[cur.branch]}</span>}>
        <p>{cur.desc}</p>
        {unlocks.length > 0 && <p className="muted small">Открывает технику: {unlocks.join(', ')}</p>}
        <ul className="bullets">
          <li>Нужен исследовательский центр {cur.lab} ур.</li>
          {req && <li className={tv(req.id).done ? 'okli' : ''}>Сначала: «{req.name}»</li>}
          <li>Время: {duration(v.seconds)}</li>
        </ul>
        {v.done ? <p className="ok-note"><Icon name="check" size={14} /> Технология изучена, бонус действует постоянно</p> : v.queued ? (
          <><TimerBar startedAt={v.queued.startedAt} endsAt={v.queued.endsAt} /><Btn variant="ghost" icon="x" disabled={busy} onClick={() => act('research/cancel', { queueId: v.queued!.id }, 'Исследование отменено')}>Отменить</Btn></>
        ) : (
          <>
            <div className="req-row"><CostList cost={cur.cost} have={view.resources} /></div>
            {v.problem && <p className="problem"><Icon name="lock" size={14} />{v.problem.message}</p>}
            <Btn variant="amber" block icon="research" disabled={busy || Boolean(v.problem)} onClick={() => act('research/start', { techId: sel }, `Исследование начато: ${cur.name}`)}>Исследовать</Btn>
          </>
        )}
      </Panel>
    </div>
  );
}
