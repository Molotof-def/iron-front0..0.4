import { Icon } from './Icon';
import { Btn, CostList, Panel } from './ui';
import { useGame } from '../state/GameProvider';
import type { TankCfg, TankView } from '../types';

/** Модули машины: три слота, улучшаются за ресурсы; уровень модуля ограничен исследовательским центром. */
export function ModulesPanel({ cfg, v }: { cfg: TankCfg; v: TankView }) {
  const { view, config, act, busy } = useGame();
  if (!v.modules) return null;
  return (
    <Panel title="Модули" icon="wrench" className="modules">
      <ul className="mods">
        {v.modules.map((m) => {
          const def = config.modules.find((x) => x.id === m.id)!;
          return (
            <li key={m.id}>
              <div className="sk-main"><b>{def.name}</b><small className="muted">{def.desc}</small>
                <span className="pips2" aria-label={`Уровень ${m.level} из ${config.moduleMax}`}>{Array.from({ length: config.moduleMax }, (_, k) => <i key={k} className={k < m.level ? 'on' : ''} />)}</span>
                {m.cost && <CostList cost={m.cost} have={view.resources} compact />}
                {m.blocked && <small className="problem-s"><Icon name="lock" size={11} /> {m.blocked}</small>}</div>
              <Btn variant="primary" icon="up" disabled={busy || !m.cost || Boolean(m.blocked)} onClick={() => act('tank/module', { tankId: cfg.id, slot: m.id }, `${def.name}: улучшено`)}>{m.level >= config.moduleMax ? '' : 'Ул.'}</Btn>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Расходники: изготавливаются в ремонтном комплексе и применяются в бою. */
export function ItemsPanel() {
  const { view, config, act, busy } = useGame();
  const noRepair = view.buildings.find((b) => b.id === 'repair')?.level === 0;
  return (
    <Panel title="Расходники" icon="repair" className="items">
      {noRepair && <p className="problem"><Icon name="lock" size={14} />Нужен ремонтный комплекс (раздел «Стройка»).</p>}
      <ul className="mods">
        {config.items.map((it) => (
          <li key={it.id}>
            <div className="sk-main"><b>{it.name} <span className="chip">{view.items[it.id] ?? 0}/{it.max}</span></b><small className="muted">{it.desc}</small><CostList cost={it.cost} have={view.resources} compact /></div>
            <Btn variant="primary" icon="plus" disabled={busy || noRepair || (view.items[it.id] ?? 0) >= it.max} onClick={() => act('item/craft', { itemId: it.id }, `${it.name}: изготовлено`)}>Создать</Btn>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
