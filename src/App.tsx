import { Icon } from './components/Icon';
import { ToastHost } from './components/ui';
import { BaseScreen } from './screens/BaseScreen';
import { BattleScreen } from './screens/BattleScreen';
import { BuildScreen } from './screens/BuildScreen';
import { HangarScreen } from './screens/HangarScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { QuestsScreen } from './screens/QuestsScreen';
import { ResearchScreen } from './screens/ResearchScreen';
import { GameProvider, useGame } from './state/GameProvider';
import { NavProvider, useNav } from './state/nav';
import { RES_ORDER, RES_LABEL, compact } from './lib/format';
import { ResIcon } from './components/ui';
import type { Screen } from './types';

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'base', label: 'База', icon: 'base' },
  { id: 'hangar', label: 'Ангар', icon: 'hangar' },
  { id: 'build', label: 'Стройка', icon: 'build' },
  { id: 'research', label: 'Наука', icon: 'research' },
  { id: 'battle', label: 'Бой', icon: 'battle' },
  { id: 'quests', label: 'Задания', icon: 'quests' },
  { id: 'profile', label: 'Профиль', icon: 'profile' },
];
const FULL_LABEL: Record<Screen, string> = { base: 'База', hangar: 'Ангар', build: 'Строительство', research: 'Исследования', battle: 'Сражения', quests: 'Задания', profile: 'Профиль' };

function Shell() {
  const { view, config, unread } = useGame();
  const { screen, go } = useNav();
  const readyAchievements = config.achievements.filter((a) => { const st = view.achievements.find((x) => x.id === a.id); return Boolean(st && !st.claimed && st.value >= a.goal); }).length;
  const claimable = view.quests.filter((q) => !q.claimed && q.progress >= q.goal).length + readyAchievements;
  const battleBadge = view.battle ? (view.battle.status === 'active' ? '!' : '★') : '';
  const badge = (id: Screen): string => (id === 'quests' && claimable ? String(claimable) : id === 'battle' ? battleBadge : id === 'profile' && unread ? String(Math.min(unread, 9)) : '');

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Навигация">
        <div className="brand"><span className="brand-mark">IF</span><div><b>IRON FRONT</b><small>Командный центр</small></div></div>
        <nav>
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${screen === n.id ? 'on' : ''}`} onClick={() => go(n.id)} aria-current={screen === n.id ? 'page' : undefined}>
              <Icon name={n.icon} size={19} /><span>{FULL_LABEL[n.id]}</span>{badge(n.id) && <em className="nbadge">{badge(n.id)}</em>}
            </button>
          ))}
        </nav>
        <div className="side-foot"><span>{view.nickname}</span><small>Уровень командира {view.commander.level}</small></div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-id"><span className="lvl-badge">{view.commander.level}</span><b>{view.nickname}</b></div>
          <ul className="resbar" aria-label="Ресурсы">
            {RES_ORDER.map((k) => (
              <li key={k} title={RES_LABEL[k]} className={k === 'fuel' || k === 'steel' || k === 'scrap' ? '' : ''}>
                <ResIcon k={k} size={15} /><b>{compact(view.resources[k])}</b>
                {k !== 'credits' && k !== 'science' && <small>/{compact(view.caps[k])}</small>}
              </li>
            ))}
          </ul>
        </header>
        <main className="content" key={screen}>
          {screen === 'base' && <BaseScreen />}
          {screen === 'hangar' && <HangarScreen />}
          {screen === 'build' && <BuildScreen />}
          {screen === 'research' && <ResearchScreen />}
          {screen === 'battle' && <BattleScreen />}
          {screen === 'quests' && <QuestsScreen />}
          {screen === 'profile' && <ProfileScreen />}
        </main>
      </div>

      <nav className="bottomnav" aria-label="Основная навигация">
        {NAV.map((n) => (
          <button key={n.id} className={`bn-item ${screen === n.id ? 'on' : ''}`} onClick={() => go(n.id)} aria-current={screen === n.id ? 'page' : undefined}>
            <Icon name={n.icon} size={22} /><span>{n.label}</span>{badge(n.id) && <em className="nbadge">{badge(n.id)}</em>}
          </button>
        ))}
      </nav>
      <ToastHost />
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </GameProvider>
  );
}
