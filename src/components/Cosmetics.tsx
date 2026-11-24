import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { TankArt } from './TankArt';
import { Btn, Panel } from './ui';
import { useGame } from '../state/GameProvider';

/** Оформление техники: камуфляжи и эмблемы за достижения. Только внешний вид. */
export function CosmeticsPanel() {
  const { view, config, act, busy } = useGame();
  const owned = view.tanks.filter((t) => t.owned);
  const [tankId, setTankId] = useState(owned[0]?.id ?? 't34');
  const tv = owned.find((t) => t.id === tankId) ?? owned[0];
  const cfg = config.tanks.find((t) => t.id === tv?.id);
  const [camo, setCamo] = useState(tv?.cosmetic?.camo ?? 'default');
  const [emblem, setEmblem] = useState(tv?.cosmetic?.emblem ?? 'none');
  useEffect(() => { setCamo(tv?.cosmetic?.camo ?? 'default'); setEmblem(tv?.cosmetic?.emblem ?? 'none'); }, [tv?.id, tv?.cosmetic?.camo, tv?.cosmetic?.emblem]);
  if (!tv || !cfg) return null;
  const changed = camo !== (tv.cosmetic?.camo ?? 'default') || emblem !== (tv.cosmetic?.emblem ?? 'none');
  return (
    <Panel title="Оформление техники" icon="star" className="cosmetics">
      <div className="cos-preview"><TankArt cls={cfg.class} shape={cfg.shape} rarity={cfg.rarity} size={250} camoId={camo === 'default' ? undefined : camo} emblemId={emblem === 'none' ? undefined : emblem} idle /></div>
      <label className="field">Машина
        <select value={tankId} onChange={(e) => setTankId(e.target.value)}>{owned.map((t) => <option key={t.id} value={t.id}>{config.tanks.find((x) => x.id === t.id)?.name}</option>)}</select>
      </label>
      <h4>Камуфляж</h4>
      <ul className="swatches">
        {config.camos.map((c) => { const st = view.cosmetics.camos.find((x) => x.id === c.id)!; return (
          <li key={c.id}><button className={`sw ${camo === c.id ? 'on' : ''} ${st.unlocked ? '' : 'locked'}`} disabled={!st.unlocked} onClick={() => setCamo(c.id)} aria-pressed={camo === c.id}>
            <b>{c.name}</b><small>{st.unlocked ? 'Открыт' : <><Icon name="lock" size={11} /> {c.text}</>}</small></button></li>
        ); })}
      </ul>
      <h4>Эмблема</h4>
      <ul className="swatches">
        {config.emblems.map((c) => { const st = view.cosmetics.emblems.find((x) => x.id === c.id)!; return (
          <li key={c.id}><button className={`sw ${emblem === c.id ? 'on' : ''} ${st.unlocked ? '' : 'locked'}`} disabled={!st.unlocked} onClick={() => setEmblem(c.id)} aria-pressed={emblem === c.id}>
            <b>{c.name}</b><small>{st.unlocked ? 'Открыта' : <><Icon name="lock" size={11} /> {c.text}</>}</small></button></li>
        ); })}
      </ul>
      <Btn variant="amber" block icon="check" disabled={busy || !changed} onClick={() => act('cosmetic/equip', { tankId, camo, emblem }, 'Оформление применено')}>Применить</Btn>
      <p className="muted small">Оформление видно соперникам в дуэлях, но не влияет на характеристики.</p>
    </Panel>
  );
}
