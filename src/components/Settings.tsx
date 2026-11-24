import { useState } from 'react';
import { Panel } from './ui';
import { applySettings, getSettings, saveSettings, sfx } from '../lib/settings';
import { useGame } from '../state/GameProvider';
import type { NotifyTypes } from '../types';

const Switch = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}><i /></button>
);

/** Настройки интерфейса (хранятся на устройстве). */
export function SettingsPanel() {
  const [s, setS] = useState(getSettings());
  const set = (patch: Partial<typeof s>) => { const next = { ...s, ...patch }; setS(next); saveSettings(next); applySettings(); if (patch.sfx) sfx('claim'); };
  return (
    <Panel title="Настройки" icon="wrench">
      <div className="toggle-row"><div><b>Звуковые эффекты</b><p className="muted small">Выстрелы, награды, победа.</p></div><Switch on={s.sfx} onChange={(v) => set({ sfx: v })} label="Звуковые эффекты" /></div>
      <div className="toggle-row"><div><b>Фоновая музыка</b><p className="muted small">Тихий атмосферный фон.</p></div><Switch on={s.music} onChange={(v) => set({ music: v })} label="Фоновая музыка" /></div>
      <div className="toggle-row"><div><b>Крупный шрифт</b><p className="muted small">Увеличивает текст и кнопки.</p></div><Switch on={s.large} onChange={(v) => set({ large: v })} label="Крупный шрифт" /></div>
      <p className="muted small">Язык интерфейса: русский. Анимации отключаются автоматически, если в системе включено «уменьшение движения».</p>
    </Panel>
  );
}

const LABELS: [keyof NotifyTypes, string, string][] = [
  ['builds', 'Готовность построек, танков и исследований', 'Сообщение, когда что-то достроилось.'],
  ['fuel', 'Топливо восстановлено', 'Когда бак снова полон.'],
  ['bonus', 'Забытый ежедневный бонус', 'Напоминание около 19:00 по Москве, если бонус не забран.'],
  ['event', 'Начало события недели', 'В понедельник утром.'],
];
/** Уведомления бота: общий выключатель и типы. */
export function NotifyPanel() {
  const { view, act, busy } = useGame();
  return (
    <Panel title="Уведомления бота" icon="bell">
      <div className="toggle-row">
        <div><b>Уведомления в Telegram</b><p className="muted small">Бот пишет в личные сообщения. Нажмите /start в чате с ботом и не блокируйте его.</p></div>
        <Switch on={view.notify} disabled={busy} onChange={(v) => void act('profile/notify', { enabled: v }, v ? 'Уведомления включены' : 'Уведомления выключены')} label="Уведомления в Telegram" />
      </div>
      {view.notify && LABELS.map(([k, t, d]) => (
        <div className="toggle-row" key={k}><div><b>{t}</b><p className="muted small">{d}</p></div>
          <Switch on={view.notifyTypes[k]} disabled={busy} onChange={(v) => void act('profile/notify', { types: { [k]: v } })} label={t} /></div>
      ))}
    </Panel>
  );
}
