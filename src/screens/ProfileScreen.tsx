import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { ClanPanel } from '../components/Clan';
import { CosmeticsPanel } from '../components/Cosmetics';
import { NotifyPanel, SettingsPanel } from '../components/Settings';
import { ReferralPanel } from '../components/Social';
import { RankingsPanel } from '../components/Rankings';
import { Tabs } from '../components/Tabs';
import { Bar, Btn, Panel } from '../components/ui';
import { useGame } from '../state/GameProvider';
import { num, timeAgo } from '../lib/format';
import type { LeaderRow } from '../types';

const BONUS_LABEL: [string, string, string][] = [
  ['armorPct', 'Броня', '%'], ['attackPct', 'Огневая мощь', '%'], ['hpPct', 'Прочность', '%'], ['mobilityFlat', 'Мобильность', ''],
  ['buildSpeed', 'Скорость строительства', '%'], ['tankTimePct', 'Время производства', '%'], ['steelPct', 'Сталь', '%'], ['scrapPct', 'Металлолом', '%'],
  ['creditPct', 'Кредиты', '%'], ['sciencePct', 'Научные данные', '%'], ['fuelRegenPct', 'Восстановление топлива', '%'], ['storagePct', 'Хранилища', '%'],
  ['rewardPct', 'Награды операций', '%'], ['xpPct', 'Опыт командира', '%'], ['fuelCostPct', 'Расход топлива', '%'], ['powerFlat', 'Электроэнергия', ''],
];

type PTab = 'cmd' | 'rank' | 'friends' | 'clan' | 'look' | 'set';

export function ProfileScreen() {
  const { view, act, busy, now, markSeen } = useGame();
  const [tab, setTab] = useState<PTab>('cmd');
  const [name, setName] = useState(view.nickname);
  const [board, setBoard] = useState<{ top: LeaderRow[]; rank: number | null } | null>(null);
  useEffect(() => { void api.leaderboard().then(setBoard).catch(() => setBoard(null)); }, [view.commander.xp]);
  useEffect(() => { markSeen(); }, [markSeen]);
  const bonuses = BONUS_LABEL.filter(([k]) => view.bonuses[k]);
  const winRate = view.stats.battles ? Math.round((view.stats.wins / view.stats.battles) * 100) : 0;
  const xpMax = Math.max(1, view.commander.xpNext - view.commander.xpBase);

  return (
    <div className="screen">
      <Tabs<PTab> value={tab} onChange={setTab} tabs={[
        { id: 'cmd', label: 'Командир', icon: 'profile' }, { id: 'rank', label: 'Рейтинги', icon: 'trophy' }, { id: 'friends', label: 'Друзья', icon: 'star', badge: view.referral.claimable || null },
        { id: 'clan', label: 'Клан', icon: 'flag' }, { id: 'look', label: 'Оформление', icon: 'wrench' }, { id: 'set', label: 'Настройки', icon: 'info' },
      ]} />
      {tab === 'rank' && <div className="profile-grid one"><RankingsPanel /></div>}
      {tab === 'friends' && <div className="profile-grid"><ReferralPanel /></div>}
      {tab === 'clan' && <div className="profile-grid"><ClanPanel /></div>}
      {tab === 'look' && <div className="profile-grid"><CosmeticsPanel /></div>}
      {tab === 'set' && <div className="profile-grid"><SettingsPanel /><NotifyPanel /></div>}
      {tab === 'cmd' && <div className="profile-grid">
      <Panel title="Командир" icon="profile">
        <div className="commander">
          <div className="badge">{view.commander.level}</div>
          <div><h2>{view.nickname}</h2><p className="amber">{view.commander.rank}</p><p className="muted">Уровень командира {view.commander.level} · место в рейтинге: {board?.rank ?? '—'}</p></div>
        </div>
        <Bar value={view.commander.xp - view.commander.xpBase} max={xpMax} label="Опыт" />
        <p className="muted small">{num(view.commander.xp - view.commander.xpBase)} / {num(xpMax)} XP до следующего уровня</p>
        <form className="nick" onSubmit={(e) => { e.preventDefault(); void act('profile/nickname', { nickname: name }, 'Позывной изменён'); }}>
          <label className="field">Позывной<input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} /></label>
          <Btn type="submit" variant="ghost" disabled={busy || name.trim() === view.nickname}>Сохранить</Btn>
        </form>
        {view.legacy && <p className="muted small">Прогресс из версии 0.4.0 перенесён. Старое сохранение осталось нетронутым в базе.</p>}
      </Panel>

      <Panel title="Статистика" icon="trophy">
        <dl className="kv">
          <div><dt>Сражений</dt><dd>{num(view.stats.battles)}</dd></div>
          <div><dt>Побед</dt><dd>{num(view.stats.wins)}</dd></div>
          <div><dt>Поражений</dt><dd>{num(view.stats.losses)}</dd></div>
          <div><dt>Доля побед</dt><dd>{winRate}%</dd></div>
          <div><dt>Построено</dt><dd>{num(view.stats.built)}</dd></div>
          <div><dt>Выпущено танков</dt><dd>{num(view.stats.produced)}</dd></div>
          <div><dt>Улучшений техники</dt><dd>{num(view.stats.upgrades)}</dd></div>
          <div><dt>Исследований</dt><dd>{num(view.stats.researched)}</dd></div>
        </dl>
        <h4>Постоянные бонусы</h4>
        {bonuses.length === 0 ? <p className="muted">Изучайте технологии, чтобы получать постоянные бонусы.</p> : (
          <ul className="bonus">{bonuses.map(([k, n, u]) => <li key={k}><span>{n}</span><b>{view.bonuses[k] > 0 ? '+' : ''}{view.bonuses[k]}{u}</b></li>)}</ul>
        )}
      </Panel>

      <Panel title="Рейтинг командиров" icon="star">
        {!board ? <p className="muted">Загрузка…</p> : (
          <ol className="board">{board.top.map((r, i) => <li key={`${r.nickname}-${i}`} className={r.nickname === view.nickname ? 'me' : ''}><span>{i + 1}</span><b>{r.nickname}</b><small>ур. {r.level} · {r.wins} поб.</small></li>)}</ol>
        )}
      </Panel>

      <Panel title="История событий" icon="bell">
        <ul className="events">{view.events.map((e) => <li key={e.id} className={`ev ev-${e.kind}`}><span>{e.text}</span><time>{timeAgo(e.t, now())}</time></li>)}</ul>
      </Panel>
      </div>}
    </div>
  );
}
