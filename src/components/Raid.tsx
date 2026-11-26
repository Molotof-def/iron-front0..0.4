import { useState } from 'react';
import { Icon } from './Icon';
import { SquadPick } from './SquadPick';
import { Btn, Panel, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { costEntries, num } from '../lib/format';

const rewardFor = (w: number) => ({ credits: 60 * w + 4 * w * w, steel: 20 * w, scrap: 8 * w, science: 2 * w });

/** Бесконечный рейд: волны врагов, отряд получает полевой ремонт между волнами. */
export function RaidBoard() {
  const { view, config, act, busy } = useGame();
  const r = view.raid;
  const [picked, setPicked] = useState<string[]>(view.squad.slice(0, view.base.squadLimit));
  const locked = view.commander.level < r.minLevel;
  const left = Math.max(0, r.attempts - r.used);
  const problem = locked ? `Рейд открывается с ${r.minLevel} уровня командира.` : left < 1 ? 'Попытки на сегодня закончились.' : picked.length < 1 ? 'Выберите хотя бы одну машину.' : view.resources.fuel < r.fuel ? `Не хватает топлива: нужно ${r.fuel}.` : null;
  const sample = [5, 10, 15];
  return (
    <div className="story-grid">
      <Panel title="Бесконечный рейд" icon="flag" right={<span className="chip chip-amber">Рекорд: {r.best} волн</span>}>
        <p className="muted">Волна за волной на вас идёт всё более сильный противник. Каждая пятая волна — командир. Между волнами отряд получает {Math.round(config.raid.healPct * 100)}% прочности и полную энергию. Награда зависит от числа пройденных волн, отступить можно в любой момент без потери награды.</p>
        <div className="tickets" aria-label={`Попыток ${left} из ${r.attempts}`}>{Array.from({ length: r.attempts }, (_, i) => <i key={i} className={i < left ? 'on' : ''} />)}<span className="small muted">Попытки: {left}/{r.attempts} в сутки · {r.fuel} топлива</span></div>
        <h4>Примеры наград</h4>
        <ul className="raid-rewards">{sample.map((w) => <li key={w}><b>{w} волн</b><ul className="reward-list small">{costEntries({ ...rewardFor(w) }).slice(0, 3).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}</ul></li>)}</ul>
        <p className="muted small">Рекорд сезона сбрасывается раз в месяц вместе с рейтингом. Таблица лидеров: Профиль → Рейтинги.</p>
      </Panel>
      <Panel title={`Отряд (${picked.length}/${view.base.squadLimit})`} icon="hangar">
        <SquadPick picked={picked} onChange={setPicked} limit={view.base.squadLimit} />
        {problem && <p className="problem"><Icon name="lock" size={14} />{problem}</p>}
        <Btn variant="amber" block icon="battle" disabled={busy || Boolean(problem)} onClick={() => act('raid/start', { squad: picked })}>Начать рейд (−{r.fuel} топлива)</Btn>
      </Panel>
    </div>
  );
}
