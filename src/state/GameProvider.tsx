import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { haptic } from '../lib/telegram';
import type { GameConfig, GameView } from '../types';

export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }
interface Ctx {
  config: GameConfig; view: GameView; busy: boolean; toasts: Toast[]; unread: number;
  now: () => number; tick: number;
  act: (action: string, payload?: Record<string, unknown>, okText?: string) => Promise<GameView | null>;
  refresh: () => Promise<void>; markSeen: () => void; dismiss: (id: number) => void; notify: (kind: Toast['kind'], text: string) => void;
}
const GameCtx = createContext<Ctx | null>(null);
export const useGame = (): Ctx => {
  const c = useContext(GameCtx);
  if (!c) throw new Error('GameProvider отсутствует');
  return c;
};

const SEEN_KEY = 'ironfront.seenEvent';
const readSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };

type Boot = { phase: 'loading' } | { phase: 'error'; code: string; message: string } | { phase: 'ready'; config: GameConfig; view: GameView };

export function GameProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);
  const [seen, setSeen] = useState(readSeen);
  const offset = useRef(0);
  const toastId = useRef(1);
  const inflight = useRef(false);
  const acting = useRef(false);
  const lastRefresh = useRef(0);

  const applyView = useCallback((view: GameView) => {
    offset.current = view.serverTime - Date.now();
    setBoot((b) => (b.phase === 'ready' ? { ...b, view } : b));
  }, []);
  const notify = useCallback((kind: Toast['kind'], text: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const load = useCallback(async () => {
    try {
      const [config, view] = await Promise.all([api.config(), api.state()]);
      offset.current = view.serverTime - Date.now();
      setBoot({ phase: 'ready', config, view });
    } catch (e) {
      const err = e as ApiError;
      setBoot({ phase: 'error', code: err.code || 'error', message: err.message || 'Не удалось загрузить игру.' });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    if (inflight.current || Date.now() - lastRefresh.current < 1500) return;
    inflight.current = true; lastRefresh.current = Date.now();
    try { applyView(await api.state()); } catch { /* повторим на следующем тике */ } finally { inflight.current = false; }
  }, [applyView]);

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}, okText?: string) => {
    if (acting.current) return null;
    acting.current = true; setBusy(true);
    try {
      const view = await api.act(action, payload);
      applyView(view);
      haptic('success');
      if (okText) notify('ok', okText);
      return view;
    } catch (e) {
      const err = e as ApiError;
      haptic('error');
      if (err.code === 'duplicate_request') void refresh();
      else notify('err', err.message || 'Ошибка запроса.');
      return null;
    } finally { acting.current = false; setBusy(false); }
  }, [applyView, notify, refresh]);

  // Секундный такт интерфейса; таймеры показываются по серверным часам со сдвигом.
  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = window.setInterval(() => setTick((t) => t + 1), reduce ? 1000 : 1000);
    return () => window.clearInterval(id);
  }, []);
  const now = useCallback(() => Date.now() + offset.current, []);

  // Когда серверный таймер истёк — запрашиваем актуальное состояние.
  const view = boot.phase === 'ready' ? boot.view : null;
  useEffect(() => {
    if (!view) return;
    const t = now();
    const ends = [...view.buildQueue, ...view.produceQueue, ...view.researchQueue].map((q) => q.endsAt);
    if (ends.some((e) => e <= t)) void refresh();
  }, [tick, view, now, refresh]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const markSeen = useCallback(() => {
    if (!view) return;
    const top = view.events[0]?.id ?? 0;
    setSeen(top);
    try { localStorage.setItem(SEEN_KEY, String(top)); } catch { /* ignore */ }
  }, [view]);

  const value = useMemo<Ctx | null>(() => {
    if (boot.phase !== 'ready') return null;
    const unread = boot.view.events.filter((e) => e.id > seen).length;
    return { config: boot.config, view: boot.view, busy, toasts, unread, now, tick, act, refresh, markSeen, dismiss, notify };
  }, [boot, busy, toasts, seen, now, tick, act, refresh, markSeen, dismiss, notify]);

  if (boot.phase === 'loading') return <div className="boot"><div className="boot-mark">IRON FRONT</div><div className="boot-bar"><i /></div><p>Связь с командованием…</p></div>;
  if (boot.phase === 'error' || !value) {
    const err = boot.phase === 'error' ? boot : { code: 'error', message: 'Ошибка' };
    return (
      <div className="boot">
        <div className="boot-mark">IRON FRONT</div>
        <p className="boot-err">{err.code === 'unauthorized' ? 'Откройте игру через Telegram-бота: вход подтверждается подписью Telegram.' : err.message}</p>
        <button className="btn btn-primary" onClick={() => { setBoot({ phase: 'loading' }); void load(); }}>Повторить</button>
      </div>
    );
  }
  return <GameCtx.Provider value={value}>{children}</GameCtx.Provider>;
}
