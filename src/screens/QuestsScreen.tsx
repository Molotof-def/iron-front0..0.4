import { useState } from 'react';
import { Icon } from '../components/Icon';
import { PassPanel } from '../components/Pass';
import { Tabs } from '../components/Tabs';
import { Bar, Btn, Panel, ResIcon } from '../components/ui';
import { WeeklyPanel } from '../components/Social';
import { useGame } from '../state/GameProvider';
import { costEntries, duration, num } from '../lib/format';
import type { Cost } from '../types';

function Reward({ r }: { r: Cost & { xp?: number } }) {
  return (
    <ul className="reward-list small">
      {costEntries(r).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}
      {r.xp ? <li><Icon name="star" size={13} className="res-xp" />{r.xp} XP</li> : null}
    </ul>
  );
}

type QTab = 'daily' | 'pass' | 'event';

export function QuestsScreen() {
  const { view, config, act, busy, now } = useGame();
  const [tab, setTab] = useState<QTab>('daily');
  const passReady = view.pass.level - view.pass.claimed.length;
  const left = Math.max(0, (view.questsResetAt - now()) / 1000);
  return (
    <div className="screen">
      <Tabs<QTab> value={tab} onChange={setTab} tabs={[
        { id: 'daily', label: 'Задания', icon: 'quests' }, { id: 'pass', label: 'Пропуск', icon: 'star', badge: passReady > 0 ? passReady : null }, { id: 'event', label: 'Событие', icon: 'flag' },
      ]} />
      {tab === 'pass' && <PassPanel />}
      {tab === 'event' && <div className="quests-grid"><WeeklyPanel /></div>}
      {tab === 'daily' && <div className="quests-grid">
      <Panel title="Ежедневные задания" icon="quests" right={<span className="muted small"><Icon name="clock" size={13} /> Обновление через {duration(left)}</span>}>
        <ul className="qlist">
          {view.quests.map((q) => {
            const done = q.progress >= q.goal;
            return (
              <li key={q.id} className={`quest ${q.claimed ? 'claimed' : done ? 'ready' : ''}`}>
                <div className="q-main"><b>{q.name}</b><span className="muted">{q.desc}</span><Reward r={q.reward} /></div>
                <div className="q-side">
                  <span className="small">{q.progress}/{q.goal}</span>
                  <Bar value={q.progress} max={q.goal} tone={done ? 'amber' : 'olive'} label={q.name} />
                  <Btn variant={done && !q.claimed ? 'amber' : 'ghost'} disabled={busy || !done || q.claimed} icon={q.claimed ? 'check' : 'trophy'} onClick={() => act('quest/claim', { questId: q.id }, 'Награда за задание получена')}>{q.claimed ? 'Получено' : done ? 'Забрать' : 'В процессе'}</Btn>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Прогресс заданий считает сервер. Новые задания появляются каждые сутки (UTC).</p>
      </Panel>

      <Panel title="Достижения" icon="trophy" right={<span className="muted small">{view.achievements.filter((a) => a.claimed).length}/{config.achievements.length}</span>}>
        <ul className="alist">
          {config.achievements.map((a) => {
            const st = view.achievements.find((x) => x.id === a.id)!;
            const done = st.value >= a.goal;
            return (
              <li key={a.id} className={`ach ${st.claimed ? 'claimed' : done ? 'ready' : ''}`}>
                <div className="a-ico"><Icon name={st.claimed ? 'check' : 'trophy'} size={18} /></div>
                <div className="a-main"><b>{a.name}</b><span className="muted small">{a.desc}</span><Bar value={st.value} max={a.goal} tone={done ? 'amber' : 'steel'} label={a.name} /><span className="muted small">{Math.min(st.value, a.goal)}/{a.goal}</span></div>
                <div className="a-side"><Reward r={a.reward} /><Btn variant={done && !st.claimed ? 'amber' : 'ghost'} disabled={busy || !done || st.claimed} onClick={() => act('achievement/claim', { achievementId: a.id }, `Достижение «${a.name}» получено`)}>{st.claimed ? 'Получено' : done ? 'Забрать' : '…'}</Btn></div>
              </li>
            );
          })}
        </ul>
      </Panel>
      </div>}
    </div>
  );
}
