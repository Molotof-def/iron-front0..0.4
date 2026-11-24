import { useEffect } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
import { useGame } from '../state/GameProvider';
import { RES_LABEL, costEntries, duration, num, pct } from '../lib/format';
import { haptic } from '../lib/telegram';
import { sfx } from '../lib/settings';
import type { Cost, ResourceKey, TankClass } from '../types';

export function Panel({ title, icon, right, children, className = '', id }: { title?: ReactNode; icon?: string; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`panel ${className}`}>
      {(title || right) && (
        <header className="panel-head">
          <h3>{icon && <Icon name={icon} size={16} />}{title}</h3>
          {right && <div className="panel-right">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'amber' | 'ghost' | 'danger'; block?: boolean; icon?: string };
export function Btn({ variant = 'primary', block, icon, className = '', children, onClick, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`btn btn-${variant} ${block ? 'btn-block' : ''} ${className}`}
      onClick={(e) => { haptic('tap'); sfx('tap'); onClick?.(e); }}
    >
      {icon && <Icon name={icon} size={16} />}{children}
    </button>
  );
}

export function Bar({ value, max, tone = 'olive', label }: { value: number; max: number; tone?: 'olive' | 'amber' | 'red' | 'steel'; label?: string }) {
  return (
    <div className={`bar bar-${tone}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={Math.round(max)} aria-label={label}>
      <i style={{ width: `${pct(value, max)}%` }} />
    </div>
  );
}

/** Прогресс серверного таймера: оставшееся время считается по серверным часам. */
export function TimerBar({ startedAt, endsAt, label }: { startedAt: number; endsAt: number; label?: string }) {
  const { now, tick } = useGame();
  void tick;
  const t = now();
  const left = Math.max(0, endsAt - t);
  return (
    <div className="timer">
      <Bar value={t - startedAt} max={endsAt - startedAt} tone="amber" label={label} />
      <span className="timer-text">{left <= 0 ? 'Завершается…' : duration(left / 1000)}</span>
    </div>
  );
}

export function ResIcon({ k, size = 14 }: { k: ResourceKey; size?: number }) {
  return <Icon name={k} size={size} className={`res-ico res-${k}`} />;
}

export function CostList({ cost, have, compact }: { cost: Cost; have: Record<ResourceKey, number>; compact?: boolean }) {
  const items = costEntries(cost);
  if (!items.length) return <span className="muted">Бесплатно</span>;
  return (
    <ul className={`cost ${compact ? 'cost-compact' : ''}`}>
      {items.map(([k, v]) => (
        <li key={k} className={have[k] >= v ? '' : 'lack'} title={RES_LABEL[k]}>
          <ResIcon k={k} size={13} />{num(v)}
        </li>
      ))}
    </ul>
  );
}

export function ClassBadge({ cls }: { cls: TankClass }) {
  const { config } = useGame();
  return <span className={`cls cls-${cls}`} title={config.classes[cls].name}>{config.classes[cls].short}</span>;
}

export function StatRow({ icon, label, value, next, max }: { icon: string; label: string; value: number; next?: number | null; max: number }) {
  return (
    <div className="stat">
      <span className="stat-l"><Icon name={icon} size={14} />{label}</span>
      <Bar value={value} max={max} tone="steel" label={label} />
      <span className="stat-v">{num(value)}{next != null && next > value && <em className="up"> +{num(next - value)}</em>}</span>
    </div>
  );
}

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head"><h3>{title}</h3><button className="icon-btn" aria-label="Закрыть" onClick={onClose}><Icon name="x" /></button></header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismiss } = useGame();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          <Icon name={t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'x' : 'info'} size={16} />{t.text}
        </button>
      ))}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
