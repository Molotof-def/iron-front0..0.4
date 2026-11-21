import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

/** Проверка подписи Telegram WebApp initData (HMAC-SHA-256 по токену бота). Возвращает пользователя или null. */
export function validateInitData(initData, token, now = Date.now()) {
  if (!token || typeof initData !== 'string' || !initData || initData.length > 16_384) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const userRaw = params.get('user');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate) || !userRaw) return null;
  if (Math.abs(Math.floor(now / 1000) - authDate) > 86_400) return null;
  params.delete('hash');
  // Telegram включает поле `signature` в строку проверки HMAC. На случай старых клиентов принимаем и вариант без него:
  // оба варианта подписаны токеном вашего бота, так что стойкость проверки не снижается.
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const supplied = Buffer.from(hash, 'hex');
  const matches = (entries) => {
    const dcs = entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
    const calculated = createHmac('sha256', secretKey).update(dcs).digest();
    return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
  };
  const all = [...params.entries()];
  if (!matches([...all]) && !matches(all.filter(([k]) => k !== 'signature'))) return null;
  try {
    const user = JSON.parse(userRaw);
    if (!user?.id || !/^\d+$/.test(String(user.id))) return null;
    return { id: String(user.id), username: String(user.username || '').slice(0, 64), firstName: String(user.first_name || 'Командир').slice(0, 80) };
  } catch { return null; }
}

/** Локальная разработка: заголовок X-Dev-User. Никогда не работает в production. */
export function devUser(headerValue, { production, allow }) {
  if (production || !allow) return null;
  const name = String(headerValue || '');
  if (!/^[\w-]{3,40}$/.test(name)) return null;
  const n = parseInt(createHash('sha1').update(name).digest('hex').slice(0, 12), 16);
  return { id: `-${n}`, username: name, firstName: 'Командир', dev: true };
}

/** Простой ограничитель частоты запросов на игрока (скользящее окно, в памяти процесса). */
export function createRateLimiter({ windowMs = 10_000, max = 60 } = {}) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    return list.length <= max;
  };
}
