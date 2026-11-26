import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Tabs } from './Tabs';
import { Panel } from './ui';
import { useGame } from '../state/GameProvider';
import type { TopRow } from '../types';

type Kind = 'pvp' | 'raid' | 'xp';
const META: Record<Kind, { title: string; unit: string }> = { pvp: { title: 'Дуэли (рейтинг сезона)', unit: '' }, raid: { title: 'Бесконечный рейд (волны)', unit: ' волн' }, xp: { title: 'Опыт командиров', unit: ' XP' } };

/** Таблицы лидеров: топ-100 по дуэлям, рейду и опыту. */
export function RankingsPanel() {
  const { view, notify } = useGame();
  const [kind, setKind] = useState<Kind>('pvp');
  const [data, setData] = useState<{ rows: TopRow[]; me: { rank: number | null; value: number } } | null>(null);
  useEffect(() => {
    setData(null);
    api.top(kind).then(setData).catch((e) => notify('err', (e as ApiError).message || 'Не удалось загрузить рейтинг.'));
  }, [kind, notify, view.pvp.rating, view.raid.best]);
  return (
    <Panel title={META[kind].title} icon="trophy" className="rankings">
      <Tabs<Kind> value={kind} onChange={setKind} tabs={[{ id: 'pvp', label: 'Дуэли', icon: 'battle' }, { id: 'raid', label: 'Рейд', icon: 'flag' }, { id: 'xp', label: 'Опыт', icon: 'star' }]} />
      {!data ? <p className="muted">Загрузка…</p> : (
        <>
          <p className="muted small">Ваше место: <b className="amber">{data.me.rank ?? '—'}</b> · ваш результат: {data.me.value}{META[kind].unit}</p>
          {data.rows.length === 0 ? <p className="muted">Пока никто не попал в рейтинг. Станьте первым!</p> : (
            <ol className="board top100">{data.rows.map((r) => (
              <li key={r.rank} className={r.nickname === view.nickname ? 'me' : ''}><span>{r.rank}</span><b>{r.nickname}</b><small>ур. {r.level} · {r.value}{META[kind].unit}</small></li>
            ))}</ol>
          )}
        </>
      )}
    </Panel>
  );
}
