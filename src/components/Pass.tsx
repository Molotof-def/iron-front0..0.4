import { Icon } from './Icon';
import { Bar, Btn, Panel, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { costEntries, duration, num } from '../lib/format';

/** Бесплатный сезонный пропуск: дорожка из 30 наград, опыт даёт игра. */
export function PassPanel() {
  const { view, config, act, busy, now } = useGame();
  const p = view.pass;
  const inLevel = p.xp - p.level * config.pass.xpPerLevel;
  const maxed = p.level >= config.pass.levels;
  return (
    <Panel title={`Сезонный пропуск · ${p.seasonTitle}`} icon="star" className="pass" right={<span className="muted small"><Icon name="clock" size={13} /> {duration(Math.max(0, (p.endsAt - now()) / 1000))}</span>}>
      <div className="pass-head">
        <div className="pass-lvl">{p.level}</div>
        <div className="pass-bar"><Bar value={maxed ? 1 : inLevel} max={maxed ? 1 : config.pass.xpPerLevel} tone="amber" label="Опыт пропуска" /><small className="muted">{maxed ? 'Все уровни пройдены' : `${inLevel}/${config.pass.xpPerLevel} опыта до уровня ${p.level + 1}`}</small></div>
      </div>
      <p className="muted small">Опыт пропуска: победа +10, поражение +5, дуэль +15, задание +20, недельная цель +100. Пропуск бесплатный, награды можно забрать до конца сезона.</p>
      <ul className="pass-list">
        {config.pass.rewards.map((r) => {
          const got = p.claimed.includes(r.level); const open = r.level <= p.level;
          return (
            <li key={r.level} className={`pass-row ${got ? 'got' : open ? 'open' : ''}`}>
              <span className="pr-lvl">{r.level}</span>
              <ul className="reward-list small">
                {costEntries(r.reward).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}
                {r.cosmetic && <li className="cosm"><Icon name="star" size={13} />{r.cosmetic.startsWith('camo') ? 'Камуфляж' : 'Эмблема'}</li>}
              </ul>
              <Btn variant={open && !got ? 'amber' : 'ghost'} disabled={busy || !open || got} icon={got ? 'check' : open ? 'trophy' : 'lock'} onClick={() => act('pass/claim', { level: r.level }, `Награда уровня ${r.level} получена`)}>{got ? '' : open ? 'Забрать' : ''}</Btn>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
