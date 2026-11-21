import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Btn, CostList, Modal, Panel, ResIcon } from './ui';
import { useGame } from '../state/GameProvider';
import { useNav } from '../state/nav';
import { costEntries, num } from '../lib/format';
import type { Cost } from '../types';

const Reward = ({ r }: { r: Cost & { xp?: number } }) => (
  <ul className="reward-list small">
    {costEntries(r).map(([k, v]) => <li key={k}><ResIcon k={k} size={13} />{num(v)}</li>)}
    {r.xp ? <li><Icon name="star" size={13} className="res-xp" />{r.xp} XP</li> : null}
  </ul>
);

/** Плавающая подсказка обучения: показывает текущий шаг, ведёт на нужный экран и выдаёт награду. */
export function TutorialBar() {
  const { view, config, act, busy } = useGame();
  const { screen, go } = useNav();
  const t = view.tutorial;
  const [min, setMin] = useState(t.step > 0);
  const [askSkip, setAskSkip] = useState(false);
  // Подсказка сворачивается при смене шага или экрана, чтобы не перекрывать кнопки.
  useEffect(() => { if (t.step > 0 || screen !== 'base') setMin(true); }, [t.step, screen]);
  if (t.done) return null;
  const step = config.tutorial[t.step];
  if (!step) return null;
  const here = screen === step.screen;
  const action = t.ready
    ? <Btn variant="amber" icon="trophy" disabled={busy} onClick={() => act('tutorial/claim', {}, 'Награда за обучение получена')}>Забрать</Btn>
    : here ? null : <Btn variant="primary" icon="arrow" onClick={() => go(step.screen)}>Перейти</Btn>;
  return (
    <>
      <aside className={`tut-bar ${min ? 'min' : ''} ${t.ready ? 'ready' : ''}`} aria-label="Обучение">
        <div className="tut-head">
          <button className="tut-title" onClick={() => setMin((m) => !m)} aria-expanded={!min}>
            <span className="tut-badge">{t.step + 1}/{t.total}</span>
            <b>{step.title}</b>
            <Icon name={min ? 'up' : 'x'} size={14} />
          </button>
          {action}
        </div>
        {!min && (
          <div className="tut-body">
            <p>{step.text}</p>
            {here && !t.ready && <span className="tut-here"><Icon name="info" size={14} /> Выполните действие на этом экране</span>}
            <Reward r={step.reward} />
            <button className="link" onClick={() => setAskSkip(true)}>Пропустить обучение</button>
          </div>
        )}
      </aside>
      <Modal open={askSkip} title="Пропустить обучение?" onClose={() => setAskSkip(false)}>
        <p>Награды за оставшиеся шаги вы не получите. Справка всегда доступна по кнопке «?» вверху.</p>
        <div className="modal-actions"><Btn variant="ghost" onClick={() => setAskSkip(false)}>Продолжить</Btn><Btn variant="danger" onClick={() => { setAskSkip(false); void act('tutorial/skip', {}); }}>Пропустить</Btn></div>
      </Modal>
    </>
  );
}

/** Чек-лист обучения на экране базы. */
export function TutorialPanel() {
  const { view, config, act, busy } = useGame();
  const { go } = useNav();
  const t = view.tutorial;
  if (t.done) return null;
  return (
    <Panel title="Курс молодого бойца" icon="flag" className="tut-panel" right={<span className="chip chip-amber">{t.step}/{t.total}</span>}>
      <ol className="tut-steps">
        {config.tutorial.map((s, i) => (
          <li key={s.id} className={i < t.step ? 'done' : i === t.step ? 'cur' : ''}>
            <span className="ts-ico">{i < t.step ? <Icon name="check" size={14} /> : i + 1}</span>
            <span className="ts-txt"><b>{s.title}</b>{i === t.step && <small>{s.text}</small>}</span>
          </li>
        ))}
      </ol>
      {config.tutorial[t.step] && (t.ready
        ? <Btn variant="amber" block icon="trophy" disabled={busy} onClick={() => act('tutorial/claim', {}, 'Награда за обучение получена')}>Забрать награду</Btn>
        : <Btn variant="primary" block icon="arrow" onClick={() => go(config.tutorial[t.step].screen)}>Перейти к шагу</Btn>)}
    </Panel>
  );
}

/** Ежедневный бонус за вход с серией на 7 дней. */
export function DailyBonusPanel() {
  const { view, config, act, busy } = useGame();
  const b = view.bonus;
  const pos = b.streak === 0 ? 0 : ((b.streak - 1) % 7) + 1;
  const doneDays = b.available && pos === 7 ? 0 : pos;
  return (
    <Panel title="Ежедневный бонус" icon="star" right={<span className="muted small">Серия: {b.streak} дн.</span>}>
      <ol className="bonus-days">
        {config.dailyBonus.map((r, i) => {
          const day = i + 1;
          const got = day <= doneDays;
          return (
            <li key={day} className={`${got ? 'got' : ''} ${b.available && day === b.nextDay ? 'next' : ''}`}>
              <small>{day}</small>{got ? <Icon name="check" size={14} /> : <ResIcon k={(costEntries(r)[0]?.[0]) ?? 'credits'} size={14} />}
            </li>
          );
        })}
      </ol>
      {b.available ? <><div className="req-row"><CostList cost={config.dailyBonus[b.nextDay - 1]} have={view.resources} compact /><span className="muted small">День {b.nextDay} из 7</span></div>
        <Btn variant="amber" block icon="trophy" disabled={busy} onClick={() => act('bonus/claim', {}, 'Бонус получен')}>Забрать бонус</Btn></>
        : <p className="muted small">Сегодняшний бонус получен. Возвращайтесь завтра, чтобы не потерять серию — на 7-й день награда максимальная.</p>}
    </Panel>
  );
}

/** «Пока вас не было» — показывается при возвращении в игру, если произошли события. */
export function AwayModal() {
  const { away, clearAway, markSeen } = useGame();
  return (
    <Modal open={away.length > 0} title="Пока вас не было" onClose={() => { clearAway(); markSeen(); }}>
      <ul className="events">{away.map((e) => <li key={e.id} className={`ev ev-${e.kind}`}><span>{e.text}</span></li>)}</ul>
      <Btn block variant="primary" onClick={() => { clearAway(); markSeen(); }}>Понятно</Btn>
    </Modal>
  );
}

const HELP: { icon: string; title: string; lines: string[] }[] = [
  { icon: 'credits', title: 'Ресурсы', lines: ['Кредиты — основная валюта: строительство, производство, исследования.', 'Сталь и металлолом — материалы для зданий, танков и улучшений. Их производит Завод. Лимит хранения растёт со Складом.', 'Топливо — тратится на каждую операцию и восстанавливается само со временем.', 'Научные данные нужны для исследований, их даёт лаборатория и операции.'] },
  { icon: 'build', title: 'Здания и энергия', lines: ['Штаб определяет уровень базы: другие здания нельзя улучшить выше уровня штаба минус один.', 'У каждого здания есть потребление энергии. Если энергии не хватает (кнопка на базе подсветится красным), Завод и лаборатория работают медленнее — улучшайте Штаб.', 'Строительство идёт по реальному времени, даже когда вы закрыли игру.'] },
  { icon: 'hangar', title: 'Танки и классы', lines: ['Лёгкие — быстрые, чаще уклоняются. Средние — универсальные. Тяжёлые — броня и прочность. ПТ-САУ — мощный первый выстрел. Артиллерия — игнорирует броню и бьёт по всем.', 'Улучшайте машины в Ангаре; предел уровня растёт с Учебным полигоном.', 'Отряд до 3 машин: бой идёт по очереди, павшую машину заменяет следующая.'] },
  { icon: 'battle', title: 'Как проходит бой', lines: ['Атака тратит 1 энергию, Залп — 3, Прицел — 1, Ремонт — 2. Защита смягчает удар и даёт +1 энергию. Каждый ход энергия +1.', 'Ремонтный комплекс даёт бесплатные ремонты. РЛС раскрывает данные о противнике.', 'Награда зависит от результата: быстрая победа или победа без потерь дают +20%, первая победа — ещё +50% кредитов и опыта.'] },
  { icon: 'research', title: 'Исследования и задания', lines: ['Каждое исследование даёт постоянный бонус и может открывать новую технику.', 'Каждый день — три новых задания и ежедневный бонус. За 7 дней подряд награда растёт.'] },
];
export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <Modal open={open} title="Справка командира" onClose={onClose}>
      <ul className="help">
        {HELP.map((h, i) => (
          <li key={h.title} className={openIdx === i ? 'on' : ''}>
            <button className="help-q" onClick={() => setOpenIdx(openIdx === i ? -1 : i)} aria-expanded={openIdx === i}><Icon name={h.icon} size={16} /><b>{h.title}</b><Icon name={openIdx === i ? 'up' : 'arrow'} size={14} /></button>
            {openIdx === i && <ul className="help-a">{h.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
