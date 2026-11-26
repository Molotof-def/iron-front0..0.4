import { Icon } from './Icon';
import { TankArt } from './TankArt';
import { ClassBadge } from './ui';
import { useGame } from '../state/GameProvider';

/** Выбор отряда: список машин из ангара с ограничением по размеру отряда. */
export function SquadPick({ picked, onChange, limit }: { picked: string[]; onChange: (ids: string[]) => void; limit: number }) {
  const { view, config } = useGame();
  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < limit ? [...picked, id] : picked);
  return (
    <ul className="squad-list">
      {view.tanks.filter((t) => t.owned).map((t) => {
        const c = config.tanks.find((x) => x.id === t.id)!; const on = picked.includes(t.id);
        return (
          <li key={t.id}><button className={`sq ${on ? 'on' : ''}`} onClick={() => toggle(t.id)} aria-pressed={on}>
            <TankArt cls={c.class} shape={c.shape} size={64} camoId={t.cosmetic?.camo === 'default' ? undefined : t.cosmetic?.camo} emblemId={t.cosmetic?.emblem === 'none' ? undefined : t.cosmetic?.emblem} />
            <span className="sq-txt"><b>{c.name}</b><small>Ур. {t.level} · {t.stats.hp} HP · {t.stats.attack} атк</small></span><ClassBadge cls={c.class} />
            <span className="sq-check">{on ? <Icon name="check" size={16} /> : null}</span></button></li>
        );
      })}
    </ul>
  );
}
