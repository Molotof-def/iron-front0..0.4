import { useMemo } from 'react';
import { BaseScene } from '../components/BaseScene';
import { DailyBonusPanel, TutorialPanel } from '../components/Guide';
import { Icon } from '../components/Icon';
import { Bar, Btn, Panel, TimerBar } from '../components/ui';
import { useGame } from '../state/GameProvider';
import { useNav } from '../state/nav';
import { num, timeAgo } from '../lib/format';

export function BaseScreen() {
  const { view, config, now, markSeen } = useGame();
  const { go } = useNav();
  const names = useMemo(() => Object.fromEntries(config.buildings.map((b) => [b.id, b.name])), [config]);
  const tank = (id: string) => config.tanks.find((t) => t.id === id)?.name ?? id;
  const tech = (id: string) => config.techs.find((t) => t.id === id)?.name ?? id;

  const active = [
    ...view.buildQueue.map((q) => ({ key: q.id, icon: 'build', title: `${names[q.building]} → ур. ${q.toLevel}`, q, go: () => go('build', q.building) })),
    ...view.produceQueue.map((q) => ({ key: q.id, icon: 'hangar', title: `Производство: ${tank(q.tankId)}`, q, go: () => go('hangar', q.tankId) })),
    ...view.researchQueue.map((q) => ({ key: q.id, icon: 'research', title: `Исследование: ${tech(q.techId)}`, q, go: () => go('research', q.techId) })),
  ].sort((a, b) => a.q.endsAt - b.q.endsAt);

  // «Что делать дальше»: подсказки строятся на данных сервера.
  const hints: { icon: string; text: string; to: () => void }[] = [];
  const claimable = view.quests.filter((q) => !q.claimed && q.progress >= q.goal).length;
  if (view.battle?.status === 'active') hints.push({ icon: 'battle', text: 'Бой ждёт вашего решения', to: () => go('battle') });
  else if (view.battle) hints.push({ icon: 'trophy', text: 'Заберите награду за завершённый бой', to: () => go('battle') });
  if (claimable) hints.push({ icon: 'quests', text: `Заданий к получению награды: ${claimable}`, to: () => go('quests') });
  if (view.buildQueue.length < view.base.buildSlots) {
    const can = view.buildings.find((b) => b.next && !b.problem && !b.queued);
    if (can) hints.push({ icon: 'build', text: `Свободна строительная очередь — можно улучшить: ${names[can.id]}`, to: () => go('build', can.id) });
  }
  if (view.researchQueue.length < view.base.researchSlots && view.techs.some((t) => !t.done && !t.queued && !t.problem)) hints.push({ icon: 'research', text: 'Лаборатория простаивает — выберите исследование', to: () => go('research') });
  if (view.produceQueue.length < view.base.productionSlots && view.tanks.some((t) => !t.owned && !t.producing && !t.problem)) hints.push({ icon: 'hangar', text: 'Линия производства свободна — выпустите новую машину', to: () => go('hangar') });
  if (view.resources.fuel >= view.caps.fuel * 0.9 && !view.battle) hints.push({ icon: 'fuel', text: 'Топливо почти на максимуме — самое время для операции', to: () => go('battle') });
  if (!hints.length) hints.push({ icon: 'info', text: 'Копите ресурсы для следующего улучшения штаба', to: () => go('build', 'hq') });

  const xpPct = view.commander.xpNext > view.commander.xpBase ? view.commander.xp - view.commander.xpBase : 1;
  const xpMax = Math.max(1, view.commander.xpNext - view.commander.xpBase);

  return (
    <div className="screen base-grid">
      <Panel className="hero" >
        <div className="hero-top">
          <div>
            <p className="eyebrow">Военная база</p>
            <h2>База «{view.nickname}»</h2>
            <p className="muted">Уровень базы {view.base.level} · командир {view.commander.level} ур.</p>
          </div>
          <div className="power" title="Электроэнергия: при дефиците замедляется производство">
            <Icon name="power" size={16} />
            <span className={view.power.efficiency < 1 ? 'warn' : ''}>{view.power.used}/{view.power.produced}</span>
            <small>{view.power.efficiency < 1 ? `Дефицит · выработка ${Math.round(view.power.efficiency * 100)}%` : 'Энергия в норме'}</small>
          </div>
        </div>
        <div className="xp"><Bar value={xpPct} max={xpMax} tone="olive" label="Опыт командира" /><span>{num(view.commander.xp - view.commander.xpBase)} / {num(xpMax)} XP</span></div>
      </Panel>

      <Panel title="Территория базы" icon="base" className="scene-panel" right={<span className="muted small">Нажмите на здание</span>}>
        <BaseScene buildings={view.buildings} names={names} selected={null} onSelect={(id) => go('build', id)} />
      </Panel>

      <div className="side-col">
        <TutorialPanel />
        <DailyBonusPanel />
        <Panel title="Что происходит сейчас" icon="clock">
          {active.length === 0 && <p className="muted">Все очереди свободны. Запустите строительство, исследование или производство.</p>}
          <ul className="jobs">
            {active.map((a) => (
              <li key={a.key}>
                <button className="job" onClick={a.go}><Icon name={a.icon} size={16} /><span>{a.title}</span></button>
                <TimerBar startedAt={a.q.startedAt} endsAt={a.q.endsAt} label={a.title} />
              </li>
            ))}
          </ul>
          <p className="muted small slots">Очереди: строительство {view.buildQueue.length}/{view.base.buildSlots} · производство {view.produceQueue.length}/{view.base.productionSlots} · исследования {view.researchQueue.length}/{view.base.researchSlots}</p>
        </Panel>

        <Panel title="Что делать дальше" icon="flag">
          <ul className="hints">{hints.slice(0, 4).map((h) => <li key={h.text}><button onClick={h.to}><Icon name={h.icon} size={16} /><span>{h.text}</span><Icon name="arrow" size={14} /></button></li>)}</ul>
        </Panel>

        <div className="quick">
          <Btn variant="ghost" icon="hangar" onClick={() => go('hangar')}>Ангар</Btn>
          <Btn variant="ghost" icon="research" onClick={() => go('research')}>Исследования</Btn>
          <Btn variant="amber" icon="battle" onClick={() => go('battle')}>В бой</Btn>
        </div>
      </div>

      <Panel title="Уведомления" icon="bell" className="events-panel" right={<button className="link" onClick={markSeen}>Прочитано</button>}>
        <ul className="events">
          {view.events.slice(0, 6).map((e) => (
            <li key={e.id} className={`ev ev-${e.kind}`}><span>{e.text}</span><time>{timeAgo(e.t, now())}</time></li>
          ))}
        </ul>
      </Panel>

      <Panel title="Производство и запасы" icon="steel" className="rates-panel">
        <ul className="rates">
          {(['credits', 'steel', 'scrap', 'science', 'fuel'] as const).map((k) => (
            <li key={k}><span>{{ credits: 'Кредиты', steel: 'Сталь', scrap: 'Металлолом', science: 'Научные данные', fuel: 'Топливо' }[k]}</span><b>+{view.rates[k]}/ч</b></li>
          ))}
        </ul>
        <p className="muted small">Склад: сталь до {num(view.caps.steel)}, лом до {num(view.caps.scrap)}, топливо до {num(view.caps.fuel)}. Ресурсы копятся и в офлайне.</p>
      </Panel>
    </div>
  );
}
