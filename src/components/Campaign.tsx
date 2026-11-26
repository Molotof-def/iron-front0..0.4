import { useState } from 'react';
import { Icon } from './Icon';
import { SquadPick } from './SquadPick';
import { TankArt } from './TankArt';
import { Bar, Btn, Panel, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { costEntries, num } from '../lib/format';

/** Сюжетная кампания: три главы по шесть этапов, этапы открываются по порядку. */
export function CampaignBoard() {
  const { view, config, act, busy } = useGame();
  const stages = view.missions.filter((m) => m.chapter);
  const firstOpen = stages.find((m) => !m.locked && m.clears === 0) ?? stages.filter((m) => !m.locked).pop() ?? stages[0];
  const [selId, setSelId] = useState(firstOpen?.id ?? 'k1_1');
  const [picked, setPicked] = useState<string[]>(view.squad.slice(0, view.base.squadLimit));
  const m = stages.find((x) => x.id === selId) ?? stages[0];
  const limit = view.base.squadLimit;
  const problem = m.locked ? m.problem?.message ?? null : picked.length < 1 ? 'Выберите хотя бы одну машину.' : view.resources.fuel < m.fuel ? `Не хватает топлива: нужно ${m.fuel}.` : null;

  return (
    <div className="story-grid">
      <div className="story-col">
        {config.campaign.map((ch) => {
          const list = stages.filter((s) => s.chapter === ch.id);
          const cleared = list.filter((s) => s.clears > 0).length;
          const done = cleared === list.length; const claimed = view.campaign.claimed.includes(ch.id);
          return (
            <div key={ch.id}><Panel title={ch.title} icon="flag" className="chapter" right={<span className="chip">{cleared}/{list.length}</span>}>
              <p className="muted small">{ch.intro}</p>
              <Bar value={cleared} max={list.length} tone={done ? 'amber' : 'olive'} label={ch.title} />
              <ul className="stages">
                {list.map((st) => (
                  <li key={st.id}><button className={`stage ${selId === st.id ? 'on' : ''} ${st.locked ? 'locked' : ''} ${st.clears > 0 ? 'cleared' : ''}`} onClick={() => setSelId(st.id)}>
                    <span className="st-n">{st.clears > 0 ? <Icon name="check" size={14} /> : st.locked ? <Icon name="lock" size={13} /> : st.order}</span>
                    <span className="st-t"><b>{st.name}</b><small>{st.locked ? st.problem?.message : `${st.fuel} топлива`}</small></span></button></li>
                ))}
              </ul>
              {done && <div className="chapter-claim"><ul className="reward-list small">{costEntries(ch.reward).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}{ch.reward.xp ? <li><Icon name="star" size={13} className="res-xp" />{ch.reward.xp} XP</li> : null}</ul>
                <Btn variant={claimed ? 'ghost' : 'amber'} block icon={claimed ? 'check' : 'trophy'} disabled={busy || claimed} onClick={() => act('campaign/claim', { chapterId: ch.id }, 'Награда главы получена')}>{claimed ? 'Награда получена' : 'Забрать награду главы'}</Btn></div>}
            </Panel></div>
          );
        })}
      </div>
      {m && (
        <Panel title={`${m.name}`} icon="battle" className="story-detail" right={<span className="chip">Этап {m.order}</span>}>
          <blockquote className="story">{m.story}</blockquote>
          <div className="env"><span><Icon name="flag" size={13} />{config.arenas[m.arena].name}</span><span><Icon name="info" size={13} />{config.weather[m.weather].name}</span>{m.turnLimit > 0 && <span><Icon name="clock" size={13} />{m.turnLimit} ходов</span>}</div>
          {!m.locked && m.enemies && (
            <ul className="foes">{m.enemies.map((e, i) => (
              <li key={i}><TankArt cls={e.class} shape={e.shape} size={86} enemy /><div><b>{e.name}</b><span className="muted small"> ур. {e.level}</span><div className="muted small">{config.classes[e.class].name}{e.role ? ` · ${config.roles[e.role]}` : ''}</div></div></li>
            ))}</ul>
          )}
          <h4>Награда</h4>
          <ul className="reward-list">{costEntries(m.reward).map(([k, v]) => <li key={k}><ResIcon k={k} size={14} />{num(v)}</li>)}<li><Icon name="star" size={14} className="res-xp" />{m.reward.xp} XP</li></ul>
          <p className="muted small">{m.clears === 0 ? 'Первое прохождение: +50% кредитов и опыта.' : `Пройдено раз: ${m.clears}.`}</p>
          {!m.locked && <><h4>Отряд ({picked.length}/{limit})</h4><SquadPick picked={picked} onChange={setPicked} limit={limit} /></>}
          {problem && <p className="problem"><Icon name="lock" size={14} />{problem}</p>}
          <Btn variant="amber" block icon="battle" disabled={busy || Boolean(problem)} onClick={() => act('battle/start', { missionId: m.id, squad: picked })}>Начать этап (−{m.fuel} топлива)</Btn>
        </Panel>
      )}
    </div>
  );
}
