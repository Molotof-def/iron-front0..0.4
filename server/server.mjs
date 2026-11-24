import http from 'node:http';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve, extname, normalize, sep } from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { validateInitData, devUser, createRateLimiter } from './auth.mjs';
import { runMigrations } from './db/migrations.mjs';
import { createPgStore } from './store/pg-store.mjs';
import { createFileStore } from './store/file-store.mjs';
import { withEnsure } from './store/with-ensure.mjs';
import { createGameApi, summarize } from './api.mjs';
import { createNotifier } from './notifier.mjs';
import { createState } from './game/legacy.mjs';

const root = process.cwd();
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MINI_APP_URL = process.env.MINI_APP_URL || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const PUBLIC_URL = process.env.RENDER_EXTERNAL_URL || '';
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || (TOKEN ? createHash('sha256').update(`iron-front-webhook:${TOKEN}`).digest('hex') : '');
const USE_WEBHOOK = process.env.NODE_ENV === 'production' && Boolean(PUBLIC_URL) && Boolean(WEBHOOK_SECRET) && Boolean(TOKEN);
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH !== 'false';
// Ускорение таймеров только для локальной проверки; в production всегда 1.
const TIME_SCALE = IS_PROD ? 1 : Math.min(600, Math.max(1, Number(process.env.GAME_TIME_SCALE) || 1));
const VERSION = '2.3.0';
const MAX_BODY = 256 * 1024;
// pg подключается только при наличии DATABASE_URL, поэтому локальная разработка работает и без базы.
const Pool = DATABASE_URL ? (await import('pg')).default.Pool : null;
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
}) : null;

let dbReady = false;
let dbError = '';
let botState = TOKEN ? 'starting' : 'not_configured';
let botUsername = process.env.BOT_USERNAME || '';
let lastBotError = '';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8',
};

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        reject(Object.assign(new Error('request_too_large'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolveBody(body ? JSON.parse(body) : {}); }
      catch { reject(Object.assign(new Error('invalid_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const validateTelegramInitData = (initData) => validateInitData(initData, TOKEN);
function authenticatedUser(req) {
  const raw = req.headers['x-telegram-init-data'];
  const user = validateTelegramInitData(Array.isArray(raw) ? raw[0] : raw);
  if (user) return user;
  return devUser(req.headers['x-dev-user'], { production: IS_PROD, allow: ALLOW_DEV_AUTH });
}
let migrating = null;
let schemaLevel = 0; // достигнутый уровень схемы БД; от него зависят дополнительные функции
async function ensureDatabase() {
  if (!pool) return false;
  if (dbReady) return true;
  migrating ??= runMigrations(pool).finally(() => { migrating = null; });
  schemaLevel = await migrating;
  dbReady = true;
  dbError = '';
  return true;
}
function validSave(save) {
  return save && typeof save === 'object' && save.version === 1 &&
    Number.isFinite(save.credits) && Number.isFinite(save.steel) && Number.isFinite(save.science) &&
    Number.isFinite(save.level) && save.tanks && typeof save.tanks === 'object' &&
    save.buildings && typeof save.buildings === 'object' && Array.isArray(save.research) &&
    JSON.stringify(save).length <= MAX_BODY;
}

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram API ${response.status}`);
  return data.result;
}
const greeting = name => `⚙️ Добро пожаловать в IRON FRONT, ${name}!\n\nТвой штаб уже готов к работе. Собирай бронетехнику, развивай базу, изучай технологии и выходи на тактические операции.\n\nУдачи на рубеже, командир!`;
async function handleTelegramUpdate(update) {
  const msg = update?.message;
  if (!msg?.text) return;
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(msg.text)) {
    // Реферальная ссылка вида /start ref_<id>: личность приглашённого берётся из Telegram (msg.from.id), а не из текста.
    const ref = /^\/start(?:@\w+)?\s+ref_(\d{3,15})$/i.exec(msg.text.trim());
    let invited = false;
    if (ref && gameStore?.recordReferral && msg.from?.id) {
      try { invited = await gameStore.recordReferral(String(msg.from.id), ref[1]); } catch (error) { console.warn('[referral]', String(error.message).slice(0, 120)); }
    }
    const reply = { chat_id: msg.chat.id, text: greeting(msg.from?.first_name || 'командир') + (invited ? '\n\n🤝 Вас пригласил друг — бонус за приглашение ждёт в игре!' : '') };
    if (MINI_APP_URL) reply.reply_markup = { inline_keyboard: [[{ text: '🎮 Открыть IRON FRONT', web_app: { url: MINI_APP_URL } }]] };
    await telegram('sendMessage', reply);
  } else if (/^\/(help|about)(?:@\w+)?$/i.test(msg.text)) {
    await telegram('sendMessage', { chat_id: msg.chat.id, text: 'IRON FRONT — танковая стратегия. Используй /start, чтобы получить приветствие и открыть штаб.' });
  }
}
async function startBot() {
  if (!TOKEN || process.env.DISABLE_BOT_POLLING === 'true') {
    if (!TOKEN) console.log('[bot] TELEGRAM_BOT_TOKEN не задан — бот не запущен.');
    return;
  }
  try { botUsername = botUsername || (await telegram('getMe')).username || ''; } catch (error) { console.warn('[bot] getMe:', String(error.message).slice(0, 120)); }
  if (USE_WEBHOOK) {
    try {
      await telegram('setWebhook', { url: `${PUBLIC_URL.replace(/\/$/, '')}/api/telegram/webhook`, secret_token: WEBHOOK_SECRET, allowed_updates: ['message'], drop_pending_updates: false });
      botState = 'webhook';
      console.log('[bot] Telegram webhook настроен.');
    } catch (error) {
      botState = 'error';
      lastBotError = String(error?.message || error).slice(0, 240);
      console.error('[bot] Не удалось настроить webhook:', lastBotError);
    }
    return;
  }
  let offset = 0;
  try { await telegram('deleteWebhook', { drop_pending_updates: false }); }
  catch (error) { console.warn('[bot] Не удалось переключить бота на long polling:', error.message); }
  while (true) {
    try {
      if (botState !== 'connected') {
        const me = await telegram('getMe');
        console.log(`[bot] Подключён @${me.username}`);
        botState = 'connected';
        lastBotError = '';
      }
      const updates = await telegram('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(update);
      }
    } catch (error) {
      botState = 'error';
      lastBotError = String(error?.message || error).slice(0, 240);
      console.error('[bot]', lastBotError);
      await new Promise(resolveDelay => setTimeout(resolveDelay, 5_000));
    }
  }
}

const storeDeps = { createState, summarize, qualifyLevel: 3 };
let gameStore = null;
if (pool) {
  const pgStore = createPgStore(pool, { ...storeDeps, getLevel: () => schemaLevel });
  gameStore = withEnsure(pgStore, ensureDatabase);
} else if (!IS_PROD) {
  gameStore = createFileStore(resolve(root, 'data', 'dev-store.json'), storeDeps);
  console.log('[game] DATABASE_URL не задан — используется локальный файл data/dev-store.json (только для разработки).');
}
const gameApi = createGameApi({
  store: gameStore, authenticate: authenticatedUser, botUsername: () => botUsername || null, limiter: createRateLimiter({ windowMs: 10_000, max: 60 }), timeScale: TIME_SCALE,
});

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.CORS_ORIGIN || '';
  if (origin && (!allowedOrigin || allowedOrigin.split(',').map(x => x.trim()).includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Telegram-Init-Data,X-Dev-User');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      let database = pool ? 'checking' : 'not_configured';
      if (pool) {
        try { await ensureDatabase(); await pool.query('SELECT 1'); database = 'connected'; }
        catch (error) { database = 'error'; dbError = String(error.message).slice(0, 180); }
      }
      return send(res, 200, { ok: true, service: 'iron-front-api', version: VERSION, game: gameStore ? gameStore.kind : 'unavailable', devAuth: !IS_PROD && ALLOW_DEV_AUTH, timeScale: TIME_SCALE, telegramBot: botState, telegramConfigured: Boolean(TOKEN), miniAppUrlConfigured: Boolean(MINI_APP_URL), database, databaseError: process.env.NODE_ENV === 'production' ? undefined : dbError });
    }
    if (url.pathname === '/api/telegram/webhook' && req.method === 'POST') {
      if (!USE_WEBHOOK || !TOKEN) return send(res, 404, { error: 'not_found' });
      const supplied = String(req.headers['x-telegram-bot-api-secret-token'] || '');
      const expected = Buffer.from(WEBHOOK_SECRET);
      const actual = Buffer.from(supplied);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return send(res, 401, { error: 'webhook_unauthorized' });
      const update = await readBody(req);
      await handleTelegramUpdate(update);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/auth' && req.method === 'POST') {
      const body = await readBody(req);
      const user = validateTelegramInitData(body.initData);
      if (!user) return send(res, 401, { error: 'telegram_auth_invalid', message: 'Не удалось проверить Telegram. Открой игру из Telegram.' });
      return send(res, 200, { ok: true, user: { id: user.id, username: user.username, firstName: user.firstName } });
    }
    const gameResult = await gameApi(req, url, readBody);
    if (gameResult) {
      if (gameResult.status === 304) { res.writeHead(304, gameResult.headers); return res.end(); }
      if (gameResult.raw) { res.writeHead(gameResult.status, { 'Content-Type': 'application/json; charset=utf-8', ...gameResult.headers }); return res.end(gameResult.raw); }
      return send(res, gameResult.status, gameResult.body, gameResult.headers);
    }
    // Устаревший API v0.4.0: сохранён для совместимости со старыми клиентами. Игровое состояние v2 хранится
    // отдельно и определяется сервером; данные из PUT на него больше не влияют.
    if (url.pathname === '/api/save' && (req.method === 'GET' || req.method === 'PUT')) {
      const user = authenticatedUser(req);
      if (!user) return send(res, 401, { error: 'unauthorized', message: 'Telegram-авторизация отсутствует или устарела.' });
      if (!pool) return send(res, 503, { error: 'database_not_configured', message: 'База данных ещё не подключена.' });
      await ensureDatabase();
      if (req.method === 'GET') {
        const result = await pool.query('SELECT save_data, updated_at FROM player_saves WHERE telegram_id = $1', [user.id]);
        return send(res, 200, { ok: true, save: result.rows[0]?.save_data ?? null, updatedAt: result.rows[0]?.updated_at ?? null });
      }
      const body = await readBody(req);
      if (!validSave(body.save)) return send(res, 400, { error: 'invalid_save', message: 'Формат сохранения не прошёл проверку.' });
      await pool.query(`INSERT INTO player_saves (telegram_id, username, first_name, save_data, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW())
        ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name, save_data = EXCLUDED.save_data, updated_at = NOW()`,
      [user.id, user.username, user.firstName, JSON.stringify(body.save)]);
      return send(res, 200, { ok: true, savedAt: new Date().toISOString() });
    }

    // In production the same Node service serves the built Mini App and its API.
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      const dist = resolve(root, 'dist');
      const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
      const candidate = resolve(dist, requested || 'index.html');
      const safePath = candidate.startsWith(dist + sep) || candidate === resolve(dist, 'index.html');
      const file = safePath && existsSync(candidate) ? candidate : resolve(dist, 'index.html');
      if (existsSync(file)) {
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
        return createReadStream(file).pipe(res);
      }
    }
    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[api]', error);
    if (!error.status || error.status >= 500) console.error(`[server] ${req.method} ${url?.pathname ?? ''}:`, String(error?.stack || error).split('\n').slice(0, 4).join(' | ').slice(0, 600));
    return send(res, error.status || 500, { error: error.status === 400 ? 'invalid_request' : 'internal_error', message: error.status ? error.message : 'Внутренняя ошибка сервера.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] IRON FRONT ${VERSION} listening on ${PORT}`);
  ensureDatabase().catch((error) => { dbError = String(error.message).slice(0, 180); console.error('[db] миграции не выполнены:', dbError); });
  startBot();
  startNotifier();
});

// Уведомления о завершённых таймерах: раз в 30 секунд, только при настроенном боте и базе.
function startNotifier() {
  if (!TOKEN || !gameStore || process.env.DISABLE_NOTIFICATIONS === 'true') return;
  const send = (chatId, text) => {
    const payload = { chat_id: chatId, text: `${text}\n\nШтаб ждёт вашего приказа, командир!`, disable_notification: false };
    if (MINI_APP_URL) payload.reply_markup = { inline_keyboard: [[{ text: '🎮 Открыть IRON FRONT', web_app: { url: MINI_APP_URL } }]] };
    return telegram('sendMessage', payload);
  };
  const notifier = createNotifier({ store: gameStore, send });
  let busy = false;
  setInterval(async () => {
    if (busy) return; busy = true;
    try { await notifier.tick(); } catch (error) { console.error('[notify]', String(error.message).slice(0, 160)); } finally { busy = false; }
  }, 30_000).unref();
}

async function shutdown() {
  server.close();
  if (pool) await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
