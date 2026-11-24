import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { Icon } from './Icon';
import { TankArt } from './TankArt';
import { Bar, Btn, ClassBadge, Panel, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { costEntries, duration, num } from '../lib/format';
import type { Opponent } from '../types';

/** Дуэли: асинхронные бои против защитных отрядов других игроков и тренировочных противников. */
export function DuelBoard() {
  const { view, config, act, busy, notify, now } = useGame();
  const pv = view.pvp;
  const [opps, setOpps] = useState<Opponent[] | null>(null);
  const [picked, setPicked] = useState<string[]>(view.squad.slice(0, view.base.squadLimit));
  const owned = view.tanks.filter((t) => t.owned);
  const locked = view.commander.level < pv.minLevel;

  const load = useCallback(async () => {
    try { setOpps((await api.opponents()).opponents); } catch (e) { notify('err', (e as ApiError).message || 'Не удалось загрузить соперников.'); }
  }, [notify]);
  useEffect(() => { if (!locked) void load(); }, [locked, load, pv.ticketsLeft]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < view.base.squadLimit ? [...p, id] : p));
  const tierPct = pv.nextTier ? Math.max(0, Math.min(100, ((pv.rating - (config.pvpTiers.find((t) => t.id === pv.tier.id)?.min ?? 0)) / (pv.nextTier.at - (config.pvpTiers.find((t) => t.id === pv.tier.id)?.min ?? 0))) * 100)) : 100;
  const defenseNames = pv.defense.map((d) => config.tanks.find((t) => t.id === d.tankId)?.name).filter(Boolean).join(', ');

  if (locked) return <Panel title="Дуэли" icon="battle"><p className="muted">Дуэли открываются с {pv.minLevel} уровня командира. Сейчас у вас {view.commander.level}.</p></Panel>;

  return (
    <div className="duel-grid">
      <Panel title={`Дуэли · ${pv.seasonTitle}`} icon="trophy" className="duel-head" right={<span className="muted small"><Icon name="clock" size={13} /> до конца сезона {duration(Math.max(0, (pv.seasonEndsAt - now()) / 1000))}</span>}>
        <div className="rating">
          <div className={`tier tier-${pv.tier.id}`}>{pv.tier.name}</div>
          <div className="rating-n">{pv.rating}</div>
        </div>
        <Bar value={tierPct} max={100} tone="amber" label="До следующей лиги" />
        <p className="muted small">{pv.nextTier ? `До лиги «${pv.nextTier.name}»: ${pv.nextTier.at - pv.rating}` : 'Высшая лига!'} · лучший рейтинг {pv.bestEver} · побед {pv.wins}, поражений {pv.losses}</p>
        <div className="tickets" aria-label={`Жетонов ${pv.ticketsLeft} из ${pv.ticketsMax}`}>{Array.from({ length: pv.ticketsMax }, (_, i) => <i key={i} className={i < pv.ticketsLeft ? 'on' : ''} />)}<span className="small muted">Жетоны: {pv.ticketsLeft}/{pv.ticketsMax} (обновляются раз в сутки)</span></div>
        {pv.prev && !pv.prev.claimed && (
          <div className="season-claim">
            <b>Итоги сезона «{pv.prev.title}»: {pv.prev.tier.name}</b>
            <ul className="reward-list small">{costEntries(pv.prev.tier.reward).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}</ul>
            <Btn variant="amber" block icon="trophy" disabled={busy} onClick={() => act('pvp/season-claim', {}, 'Награда сезона получена')}>Забрать награду сезона</Btn>
          </div>
        )}
        <p className="muted small">Рейтинг сбрасывается раз в месяц (сохраняется половина прироста). Награды зависят от лиги. Победа над реальным игроком даёт больше рейтинга, чем над тренировочным противником.</p>
      </Panel>

      <Panel title="Ваш отряд" icon="hangar" className="duel-squad" right={<span className="muted small">{picked.length}/{view.base.squadLimit}</span>}>
        <ul className="squad-list">
          {owned.map((t) => {
            const c = config.tanks.find((x) => x.id === t.id)!; const on = picked.includes(t.id);
            return (
              <li key={t.id}><button className={`sq ${on ? 'on' : ''}`} onClick={() => toggle(t.id)} aria-pressed={on}>
                <TankArt cls={c.class} shape={c.shape} size={64} camoId={t.cosmetic?.camo === 'default' ? undefined : t.cosmetic?.camo} emblemId={t.cosmetic?.emblem === 'none' ? undefined : t.cosmetic?.emblem} />
                <span className="sq-txt"><b>{c.name}</b><small>Ур. {t.level} · {t.stats.hp} HP · {t.stats.attack} атк</small></span><ClassBadge cls={c.class} />
                <span className="sq-check">{on ? <Icon name="check" size={16} /> : null}</span></button></li>
            );
          })}
        </ul>
        <p className="muted small">Защитный отряд (против вас сражаются другие игроки): {defenseNames || '—'}. Сила: {num(pv.power)}.</p>
        <Btn variant="ghost" icon="shield" disabled={busy || picked.length < 1} onClick={() => act('pvp/defense', { squad: picked }, 'Защитный отряд обновлён')}>Сделать выбранный отряд защитным</Btn>
      </Panel>

      <Panel title="Соперники" icon="battle" className="duel-opps" right={<button className="link" onClick={() => void load()}>Обновить</button>}>
        {!opps ? <p className="muted">Подбор соперников…</p> : (
          <ul className="opps">
            {opps.map((o) => (
              <li key={o.id} className="opp">
                <div className="opp-head"><b>{o.nickname}</b>{o.bot && <em className="rec">тренировочный</em>}<span className="chip">ур. {o.level}</span><span className="chip chip-amber">{o.rating}</span></div>
                <div className="opp-units">{o.units.map((u, i) => (
                  <div key={i} className="opp-unit"><TankArt cls={u.cls} shape={u.shape} size={78} enemy camoId={undefined} /><small>{u.name}</small><small className="muted">ур. {u.level} · {u.hp} HP</small></div>
                ))}</div>
                <div className="req-row"><span className="muted small">Сила {num(o.power)}{o.bot ? ' · награда ×0.6' : ''}</span>
                  <Btn variant="amber" icon="battle" disabled={busy || pv.ticketsLeft < 1 || picked.length < 1} onClick={() => act('pvp/start', { opponentId: o.id, squad: picked })}>В бой</Btn></div>
              </li>
            ))}
          </ul>
        )}
        {pv.ticketsLeft < 1 && <p className="problem"><Icon name="lock" size={14} />Жетоны на сегодня закончились.</p>}
      </Panel>
    </div>
  );
}
