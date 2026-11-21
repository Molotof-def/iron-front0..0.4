import { useEffect, useState } from 'react';
import { BaseScene } from '../components/BaseScene';
import { Icon } from '../components/Icon';
import { Btn, CostList, Panel, TimerBar } from '../components/ui';
import { useGame } from '../state/GameProvider';
import { useNav } from '../state/nav';
import { duration, focusPanel } from '../lib/format';
import type { BuildingId, BuildingView } from '../types';

function effectText(id: BuildingId, lvl: number, view: ReturnType<typeof useGame>['view']): string[] {
  const b = view.bonuses;
  switch (id) {
    case 'hq': return [`Очередей строительства: ${lvl >= 8 ? 3 : lvl >= 4 ? 2 : 1}`, `Электроэнергия: ${40 + 14 * (lvl - 1) + b.powerFlat}`, `Кредиты: ${Math.round(40 * lvl * (1 + b.creditPct / 100))}/ч`, `Скорость строительства: +${3 * (lvl - 1)}%`];
    case 'hangar': return [`Вместимость парка: ${5 + 2 * lvl} танков`, `Линий производства: ${lvl >= 8 ? 3 : lvl >= 4 ? 2 : 1}`, `Размер отряда: ${lvl >= 5 ? 3 : lvl >= 2 ? 2 : 1}`];
    case 'factory': return [`Сталь: ${Math.round(30 * lvl * (1 + b.steelPct / 100))}/ч`, `Металлолом: ${Math.round(12 * lvl * (1 + b.scrapPct / 100))}/ч`];
    case 'storage': return [`Лимит стали: ${Math.round((2000 + 1500 * lvl) * (1 + b.storagePct / 100))}`, `Лимит лома: ${Math.round((1000 + 800 * lvl) * (1 + b.storagePct / 100))}`, `Лимит топлива: ${Math.round((60 + 12 * lvl) * (1 + b.storagePct / 100))}`];
    case 'lab': return [`Научные данные: ${Math.round(4 * lvl * (1 + b.sciencePct / 100))}/ч`, `Лабораторий: ${lvl >= 6 ? 2 : 1}`, `Скорость исследований: +${4 * (lvl - 1)}%`];
    case 'repair': return [`Бесплатных ремонтов в бою: ${Math.ceil(lvl / 3)}`, `Сила полевого ремонта: +${8 * lvl}%`];
    case 'training': return [`Предел уровня техники: ${3 + lvl}`, `Опыт командира: +${3 * lvl}%`, 'Открывает испытания'];
    case 'radar': return [lvl >= 3 ? 'Видны роли и параметры врага' : lvl >= 1 ? 'Видны названия вражеской техники' : 'Виден только состав', `Операции до уровня РЛС ${lvl}`];
    default: return [];
  }
}

export function BuildScreen() {
  const { view, config, act, busy } = useGame();
  const { focus, go } = useNav();
  const [sel, setSel] = useState<BuildingId>((focus as BuildingId) || 'hq');
  useEffect(() => { if (focus) setSel(focus as BuildingId); }, [focus]);
  const names = Object.fromEntries(config.buildings.map((b) => [b.id, b.name]));
  const cfg = config.buildings.find((b) => b.id === sel)!;
  const b = view.buildings.find((x) => x.id === sel) as BuildingView;

  return (
    <div className="screen build-grid">
      <Panel title="Строительство" icon="build" className="scene-panel" right={<span className="muted small">Очереди {view.buildQueue.length}/{view.base.buildSlots}</span>}>
        <BaseScene buildings={view.buildings} names={names} selected={sel} onSelect={(id) => { setSel(id); focusPanel('build-detail'); }} />
      </Panel>

      <Panel id="build-detail" title={cfg.name} icon="build" className="detail" right={<span className="chip">Ур. {b.level}/{cfg.maxLevel}</span>}>
        <p className="muted">{cfg.desc}</p>
        <p className="muted small"><Icon name="power" size={13} /> Потребление энергии: {cfg.power * Math.max(b.level, 0)} (+{cfg.power} за уровень)</p>
        <h4>Сейчас</h4>
        <ul className="bullets">{b.level === 0 ? <li>Здание не построено</li> : effectText(sel, b.level, view).map((t) => <li key={t}>{t}</li>)}</ul>
        {b.queued && (<><h4>Идёт улучшение до уровня {b.queued.toLevel}</h4><TimerBar startedAt={b.queued.startedAt} endsAt={b.queued.endsAt} /><Btn variant="ghost" icon="x" disabled={busy} onClick={() => act('build/cancel', { queueId: b.queued!.id }, 'Строительство отменено, возвращено 70% ресурсов')}>Отменить</Btn></>)}
        {b.next && !b.queued && (
          <>
            <h4>Следующий уровень {b.next.level}</h4>
            <ul className="bullets next">{effectText(sel, b.next.level, view).map((t) => <li key={t}>{t}</li>)}</ul>
            <div className="req-row"><CostList cost={b.next.cost} have={view.resources} /><span className="muted"><Icon name="clock" size={13} /> {duration(b.next.seconds)}</span></div>
            <p className="muted small">Требуется штаб {b.next.reqHq} ур.{b.next.reqCommander ? `, командир ${b.next.reqCommander} ур.` : ''}</p>
            {b.problem && <p className="problem"><Icon name="lock" size={14} />{b.problem.message}</p>}
            <Btn variant="amber" block disabled={busy || Boolean(b.problem)} icon={b.level === 0 ? 'build' : 'up'} onClick={() => act('build/start', { buildingId: sel }, `${cfg.name}: строительство начато`)}>{b.level === 0 ? 'Построить' : 'Улучшить'}</Btn>
          </>
        )}
        {!b.next && <p className="ok-note"><Icon name="check" size={14} /> Достигнут максимальный уровень</p>}
      </Panel>

      <Panel title="Все здания" icon="base" className="all-buildings">
        <ul className="blist">
          {view.buildings.map((x) => {
            const c = config.buildings.find((y) => y.id === x.id)!;
            return (
              <li key={x.id}>
                <button className={`brow ${sel === x.id ? 'on' : ''}`} onClick={() => { setSel(x.id); focusPanel('build-detail'); }}>
                  <span className="b-ico"><Icon name={x.id === 'hq' ? 'base' : x.id === 'storage' ? 'steel' : x.id === 'factory' ? 'scrap' : x.id === 'lab' ? 'research' : x.id === 'radar' ? 'radar' : x.id === 'repair' ? 'wrench' : x.id === 'training' ? 'battle' : 'hangar'} size={18} /></span>
                  <span className="b-txt"><b>{c.name}</b><small>{c.category}</small></span>
                  <span className={`chip ${x.queued ? 'chip-amber' : ''}`}>{x.queued ? `→ ${x.queued.toLevel}` : x.level === 0 ? 'Нет' : `Ур. ${x.level}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <Btn variant="ghost" icon="base" onClick={() => go('base')}>На базу</Btn>
      </Panel>
    </div>
  );
}
