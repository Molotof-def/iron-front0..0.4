// HTTP-маршруты игры: /api/game/*. Вся логика — в game/engine.mjs.
import * as E from './game/engine.mjs';
import { buildConfig, buildView } from './game/view.mjs';
import { createHash } from 'node:crypto';

const AUDITED = new Set(['build/start', 'build/cancel', 'tank/produce', 'tank/produce-cancel', 'tank/upgrade', 'research/start',
  'research/cancel', 'battle/start', 'battle/claim', 'quest/claim', 'achievement/claim', 'profile/nickname']);

export function summarize(state) {
  return { nickname: state.nickname, xp: state.xp, level: E.commanderLevel(state), wins: state.stats.wins };
}

export function createGameApi({ store, authenticate, limiter, timeScale = 1, clock = Date.now, rng = Math.random, log = console }) {
  const config = buildConfig();
  const configJson = JSON.stringify({ ok: true, config });
  const etag = `"${createHash('sha1').update(configJson).digest('hex').slice(0, 16)}"`;

  const errorOut = (error) => {
    if (error instanceof E.GameError) return { status: error.status, body: { error: error.code, message: error.message } };
    throw error;
  };

  /** Возвращает { status, body, headers? } или null, если маршрут не относится к игре. */
  return async function handle(req, url, readBody) {
    const path = url.pathname;
    if (!path.startsWith('/api/game/')) return null;
    const route = path.slice('/api/game/'.length);

    if (route === 'config' && req.method === 'GET') {
      if (req.headers['if-none-match'] === etag) return { status: 304, body: null, headers: { ETag: etag } };
      return { status: 200, raw: configJson, headers: { ETag: etag, 'Cache-Control': 'public, max-age=300' } };
    }

    const user = authenticate(req);
    if (!user) return { status: 401, body: { error: 'unauthorized', message: 'Telegram-авторизация отсутствует или устарела. Откройте игру из Telegram.' } };
    if (!store) return { status: 503, body: { error: 'database_not_configured', message: 'База данных не подключена.' } };
    if (!limiter(user.id, clock())) return { status: 429, body: { error: 'rate_limited', message: 'Слишком много запросов. Подождите пару секунд.' } };
    const profile = { firstName: user.firstName, username: user.username };

    try {
      if (route === 'state' && req.method === 'GET') {
        const view = await store.transact(user.id, profile, async (state) => {
          const now = clock();
          const next = structuredClone(state);
          E.settle(next, now);
          return { state: next, result: buildView(next, now, { timeScale }) };
        });
        return { status: 200, body: { ok: true, view } };
      }
      if (route === 'leaderboard' && req.method === 'GET') {
        const [top, rank] = await Promise.all([store.leaderboard(20), store.rankOf(user.id)]);
        return { status: 200, body: { ok: true, top, rank } };
      }
      if (req.method === 'POST') {
        const action = route;
        if (!E.ACTION_NAMES.includes(action)) return { status: 404, body: { error: 'not_found', message: 'Неизвестный маршрут.' } };
        const body = await readBody(req);
        const view = await store.transact(user.id, profile, async (state) => {
          const now = clock();
          const next = E.perform(state, action, body, { now, rng, timeScale, requestId: body.requestId });
          const audit = AUDITED.has(action) ? [{ action, payload: auditPayload(action, body) }] : [];
          return { state: next, audit, result: buildView(next, now, { timeScale }) };
        });
        log.log(`[game] ${action} user=${user.id.length > 3 ? `…${user.id.slice(-3)}` : user.id}`);
        return { status: 200, body: { ok: true, view } };
      }
      return { status: 405, body: { error: 'method_not_allowed', message: 'Метод не поддерживается.' } };
    } catch (error) {
      return errorOut(error);
    }
  };
}

/** В журнал попадают только идентификаторы объектов: никаких токенов, initData и текстов пользователя. */
function auditPayload(action, body) {
  const pick = {};
  for (const k of ['buildingId', 'tankId', 'techId', 'missionId', 'questId', 'achievementId', 'queueId', 'battleId']) {
    if (typeof body[k] === 'string') pick[k] = body[k].slice(0, 40);
  }
  if (Array.isArray(body.squad)) pick.squad = body.squad.filter((x) => typeof x === 'string').slice(0, 5).map((x) => x.slice(0, 24));
  return pick;
}
