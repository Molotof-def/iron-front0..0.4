import { Icon } from './Icon';
import { Btn, Panel } from './ui';
import { useGame } from '../state/GameProvider';
import { num } from '../lib/format';
import type { TankCfg, TankView } from '../types';

/** Экипаж машины: очки опыта дают навыки, у каждого класса есть особый навык. */
export function CrewPanel({ cfg, v }: { cfg: TankCfg; v: TankView }) {
  const { config, act, busy } = useGame();
  if (!v.crew) return null;
  const c = v.crew;
  const list = config.skills[cfg.class];
  return (
    <Panel title="Экипаж" icon="profile" className="crew" right={<span className="chip chip-amber">Очков: {c.free}</span>}>
      <p className="muted small">Опыт экипажа: {num(c.xp)}{c.nextAt ? ` · следующее очко на ${num(c.nextAt)}` : ' · максимум очков'}. Опыт даёт каждый бой (победа — больше).</p>
      <ul className="skills">
        {list.map((s, i) => {
          const rank = c.skills[s.id] || 0;
          const special = i === list.length - 1;
          return (
            <li key={s.id} className={special ? 'special' : ''}>
              <div className="sk-main"><b>{s.name}{special && <em className="sk-tag">класс</em>}</b><small className="muted">{s.desc}</small>
                <span className="pips2" aria-label={`Ранг ${rank} из ${s.max}`}>{Array.from({ length: s.max }, (_, k) => <i key={k} className={k < rank ? 'on' : ''} />)}</span></div>
              <button className="sk-plus" aria-label={`Улучшить ${s.name}`} disabled={busy || c.free < 1 || rank >= s.max} onClick={() => act('tank/skill', { tankId: cfg.id, skill: s.id })}><Icon name="plus" size={16} /></button>
            </li>
          );
        })}
      </ul>
      {c.spent > 0 && <Btn variant="ghost" icon="repair" disabled={busy} onClick={() => act('tank/respec', { tankId: cfg.id }, 'Навыки сброшены')}>Сбросить навыки ({num(c.spent * config.crew.respecPerPoint)} кр.)</Btn>}
    </Panel>
  );
}
