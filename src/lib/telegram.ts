interface TgWebApp {
  initData: string; ready(): void; expand(): void; disableVerticalSwipes?(): void;
  setHeaderColor?(c: string): void; setBackgroundColor?(c: string): void;
  HapticFeedback?: { impactOccurred(s: string): void; notificationOccurred(s: string): void; selectionChanged(): void };
  colorScheme?: string;
}
declare global { interface Window { Telegram?: { WebApp?: TgWebApp } } }

export const tg = (): TgWebApp | undefined => window.Telegram?.WebApp;
export const initData = (): string => tg()?.initData || '';
export const insideTelegram = (): boolean => Boolean(initData());

export function setupTelegram(): void {
  const w = tg();
  if (!w) return;
  try { w.ready(); w.expand(); w.disableVerticalSwipes?.(); w.setHeaderColor?.('#0b0d0e'); w.setBackgroundColor?.('#0b0d0e'); } catch { /* старые клиенты */ }
}
type Kind = 'tap' | 'success' | 'error' | 'select';
export function haptic(kind: Kind): void {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'tap') h.impactOccurred('light');
    else if (kind === 'select') h.selectionChanged();
    else h.notificationOccurred(kind === 'success' ? 'success' : 'error');
  } catch { /* ignore */ }
}
