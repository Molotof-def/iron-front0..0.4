import { useState } from 'react';
import { Icon } from './Icon';
import { Bar, Btn, Panel, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { costEntries, duration, num } from '../lib/format';
import { haptic, tg } from '../lib/telegram';
import type { Cost } from '../types';

const Reward = ({ r }: { r: Cost & { xp?: number } }) => (
  <ul className="reward-list small">
    {costEntries(r).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}
    {r.xp ? <li><Icon name="star" size={13} className="res-xp" />{r.xp} XP</li> : null}
  </ul>
);

/** Событие недели и недельная цель. */
export function WeeklyPanel() {
  const { view, config, act, busy, now } = useGame();
  const w = view.weekly;
  const done = w.progress >= w.goal;
  return (
    <Panel title="Событие недели" icon="flag" className="weekly" right={<span className="muted small"><Icon name="clock" size={13} /> {duration(Math.max(0, (w.endsAt - now()) / 1000))}</span>}>
      <div className="event-card">
        <b>{w.event.name}</b>
        <span className="chip chip-amber">×{w.event.mul}</span>
      </div>
      <p className="muted small">{w.event.desc}</p>
      <p className="muted small">Подходят: {w.event.types.map((t) => config.missionTypes[t].name).join(', ')}.</p>
      <h4>Недельная цель: {w.goal} побед</h4>
      <Bar value={w.progress} max={w.goal} tone={done ? 'amber' : 'olive'} label="Недельная цель" />
      <div className="req-row"><span className="small">{Math.min(w.progress, w.goal)}/{w.goal}</span><Reward r={w.reward} /></div>
      <Btn variant={done && !w.claimed ? 'amber' : 'ghost'} block icon={w.claimed ? 'check' : 'trophy'} disabled={busy || !done || w.claimed} onClick={() => act('weekly/claim', {}, 'Награда недели получена')}>
        {w.claimed ? 'Получено' : done ? 'Забрать награду' : 'Выигрывайте операции'}
      </Btn>
    </Panel>
  );
}

const SHARE_TEXT = 'Присоединяйся к IRON FRONT — танковой стратегии в Telegram! Строй базу, собирай танки и побеждай.';

/** Реферальная система: ссылка, статистика, награды за друзей и вехи. */
export function ReferralPanel() {
  const { view, config, act, busy, notify } = useGame();
  const r = view.referral;
  const [copied, setCopied] = useState(false);
  const link = r.link;
  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); haptic('success'); window.setTimeout(() => setCopied(false), 1800); }
    catch { notify('info', 'Не удалось скопировать — выделите ссылку вручную.'); }
  };
  const share = () => {
    if (!link) return;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(SHARE_TEXT)}`;
    const w = tg() as { openTelegramLink?: (u: string) => void } | undefined;
    if (w?.openTelegramLink) w.openTelegramLink(url); else window.open(url, '_blank', 'noopener');
  };
  return (
    <Panel title="Друзья и награды" icon="profile" className="referral" right={<span className="chip">{r.qualified} в строю</span>}>
      <p className="muted small">Пригласите друга по своей ссылке: он получит стартовый бонус, а вы — награду, когда он дорастёт до {config.referral.qualifyLevel} уровня командира.</p>
      {link ? (
        <>
          <div className="linkbox"><code>{link}</code></div>
          <div className="two"><Btn variant="primary" icon="check" onClick={copy}>{copied ? 'Скопировано' : 'Копировать'}</Btn><Btn variant="amber" icon="arrow" onClick={share}>Отправить другу</Btn></div>
        </>
      ) : <p className="problem"><Icon name="info" size={14} />Ссылка появится, когда игра открыта из Telegram-бота.</p>}
      <dl className="kv small-kv">
        <div><dt>Перешли по ссылке</dt><dd>{r.invited}</dd></div>
        <div><dt>Достигли {config.referral.qualifyLevel} ур.</dt><dd>{r.qualified}</dd></div>
      </dl>
      <h4>Награда за каждого друга</h4>
      <Reward r={config.referral.perFriend} />
      <ul className="miles">
        {r.milestones.map((m) => (
          <li key={m.at} className={m.claimed ? 'claimed' : m.reached ? 'ready' : ''}>
            <span className="m-n">{m.at}</span><span className="m-t">друзей</span><Reward r={m.reward} />{m.claimed && <Icon name="check" size={15} />}
          </li>
        ))}
      </ul>
      <Btn variant={r.claimable > 0 || r.milestones.some((m) => m.reached && !m.claimed) ? 'amber' : 'ghost'} block icon="trophy" disabled={busy || (r.claimable === 0 && !r.milestones.some((m) => m.reached && !m.claimed))}
        onClick={() => act('referral/claim', {}, 'Награды за друзей получены')}>
        {r.claimable > 0 ? `Забрать награды (друзей: ${r.claimable})` : 'Забрать награды'}
      </Btn>
      {r.welcomed && <p className="muted small"><Icon name="check" size={13} /> Вы пришли по приглашению — приветственный бонус уже получен.</p>}
    </Panel>
  );
}

/** Включение и выключение уведомлений бота. */
export function NotifyPanel() {
  const { view, act, busy } = useGame();
  return (
    <Panel title="Уведомления бота" icon="bell">
      <div className="toggle-row">
        <div><b>Сообщения о готовности</b><p className="muted small">Бот напишет в Telegram, когда достроится здание, выпустится танк или завершится исследование.</p></div>
        <button className={`switch ${view.notify ? 'on' : ''}`} role="switch" aria-checked={view.notify} disabled={busy}
          onClick={() => act('profile/notify', { enabled: !view.notify }, view.notify ? 'Уведомления выключены' : 'Уведомления включены')}><i /></button>
      </div>
      <p className="muted small">Чтобы сообщения приходили, нажмите /start в чате с ботом и не блокируйте его.</p>
    </Panel>
  );
}
