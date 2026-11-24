import { Icon } from './Icon';

export interface TabDef<T extends string> { id: T; label: string; icon?: string; badge?: string | number | null }
/** Горизонтальные вкладки внутри экрана (без прокрутки: переносятся на следующую строку). */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon && <Icon name={t.icon} size={15} />}{t.label}{t.badge ? <em className="tab-badge">{t.badge}</em> : null}
        </button>
      ))}
    </div>
  );
}
