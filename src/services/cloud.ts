import type { SaveData } from '../types';

type TelegramWindow = Window & {
  Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };
};

export function getTelegramInitData(): string {
  return (window as TelegramWindow).Telegram?.WebApp?.initData || '';
}

async function api<T>(path: string, initData: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(options.headers || {}),
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `API error ${response.status}`);
  return result as T;
}

export async function loadCloudSave(initData: string): Promise<SaveData | null> {
  await api<{ ok: boolean; user: { id: string } }>('/api/auth', initData, {
    method: 'POST', body: JSON.stringify({ initData }),
  });
  const result = await api<{ ok: boolean; save: SaveData | null }>('/api/save', initData);
  return result.save;
}

let writeQueue: Promise<unknown> = Promise.resolve();
export function writeCloudSave(initData: string, save: SaveData): Promise<void> {
  writeQueue = writeQueue.catch(() => undefined).then(() =>
    api('/api/save', initData, { method: 'PUT', body: JSON.stringify({ save }) }),
  );
  return writeQueue.then(() => undefined);
}
