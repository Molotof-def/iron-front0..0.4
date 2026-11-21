import { initData } from '../lib/telegram';
import type { GameConfig, GameView, LeaderRow } from '../types';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

function devUserId(): string {
  try {
    let id = localStorage.getItem('ironfront.devUser');
    if (!id) { id = `dev-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('ironfront.devUser', id); }
    return id;
  } catch { return 'dev-session'; }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const data = initData();
  if (data) h['X-Telegram-Init-Data'] = data;
  else h['X-Dev-User'] = devUserId(); // принимается сервером только вне production
  return h;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('network', 'Нет связи с сервером. Проверьте интернет.', 0);
  }
  let json: { error?: string; message?: string } & Record<string, unknown> = {};
  try { json = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) throw new ApiError(json.error || 'error', json.message || 'Ошибка сервера.', res.status);
  return json as T;
}

const requestId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const api = {
  config: () => request<{ config: GameConfig }>('GET', '/api/game/config').then((r) => r.config),
  state: () => request<{ view: GameView }>('GET', '/api/game/state').then((r) => r.view),
  act: (action: string, payload: Record<string, unknown>) =>
    request<{ view: GameView }>('POST', `/api/game/${action}`, { ...payload, requestId: requestId() }).then((r) => r.view),
  leaderboard: () => request<{ top: LeaderRow[]; rank: number | null }>('GET', '/api/game/leaderboard'),
};
