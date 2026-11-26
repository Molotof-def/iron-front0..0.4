// HTTP-маршруты игры: /api/game/*. Вся логика — в game/engine.mjs.
import * as D from './game/data.mjs';
import * as E from './game/engine.mjs';
import { buildConfig, buildView } from './game/view.mjs';
import { createHash, timingSafeEqual } from 'node:crypto';

const AUDITED = new Set(['raid/start', 'campaign/claim', 'clan/war-claim', 'tank/module', 'item/craft', 'pvp/start', 'pvp/season-claim', 'pvp/defense', 'pass/claim', 'clan/claim', 'tank/skill', 'tank/respec', 'cosmetic/equip', 'referral/claim', 'weekly/claim', 'profile/notify', 'build/start', 'build/cancel', 'tank/produce', 'tank/produce-cancel', 'tank/upgrade', 'research/start',
  'research/cancel', 'battle/start', 'battle/claim', 'quest/claim', 'achievement/claim', 'profile/nickname']);

export function summarize(state) {
  return { nickname: state.nickname, xp: state.xp, level: E.commanderLevel(state), wins: state.stats.wins, nextEventAt: E.nextEventAt(state), notifyEnabled: Boolean(state.notify?.enabled), rating: state.pvp?.rating ?? 1000, hasDefense: (state.pvp?.defense?.length ?? 0) > 0, clanPoints: state.clan?.points ?? 0, clanWeek: state.clan?.week ?? -1, clanPrevPoints: state.clan?.prevPoints ?? 0, clanPrevWeek: state.clan?.prevWeek ?? -1, raidBest: state.raid?.best ?? 0 };
}

export function createGameApi({ store, authenticate, limiter, timeScale = 1, clock = Date.now, rng = Math.random, log = console, botUsername = () => null, adminToken = '', getErrors = () => [] }) {
  const config = buildConfig();
  const configJson = JSON.stringify({ ok: true, config });
  const etag = `"${createHash('sha1').update(configJson).digest('hex').slice(0, 16)}"`;

  /** Необязательные запросы (рефералы, кланы, дуэли) не должны ронять основную игру. */
  const safe = async (fn, fallback) => {
    try { return await fn(); } catch (error) {
      if (error instanceof E.GameError) throw error;
      log.error?.(`[game] необязательный запрос не выполнен: ${String(error.message).slice(0, 160)}`);
      return fallback;
    }
  };
  const toOpponent = (o) => ({
    id: o.id, nickname: o.nickname, level: o.level, rating: o.rating, bot: Boolean(o.bot), power: E.defensePower(o.defense),
    units: o.defense.filter((u) => D.TANK_BY_ID[u.tankId]).map((u) => ({ tankId: u.tankId, name: D.TANK_BY_ID[u.tankId].name, cls: D.TANK_BY_ID[u.tankId].class, shape: D.TANK_BY_ID[u.tankId].shape, level: u.level, hp: u.hp, attack: u.attack, armor: u.armor, camo: u.camo || 'default', emblem: u.emblem || 'none' })),
  });
  const clanView = async (userId, query, now) => {
    const week = D.weekIndex(now);
    const id = await store.clanOf(userId);
    const info = id ? await store.clanInfo(id, week) : null;
    const list = info ? [] : await store.clanList(week, query, 20);
    const prevWeek = week - 1;
    let war = null;
    if (info) {
      const standings = await safe(() => store.clanList(week, '', 100), []);
      const live = standings.findIndex((c) => c.id === info.id);
      const prev = await safe(() => store.clanWar(info.id, prevWeek), null);
      war = { liveRank: live >= 0 ? live + 1 : null, clans: standings.length, prev: prev && { rank: prev.rank, pts: prev.pts, clans: prev.clans, band: D.warBand(prev.rank).name, reward: D.warBand(prev.rank).reward } };
    }
    const clan = info && {
      war,
      id: info.id, name: info.name, tag: info.tag, total: info.total, goal: D.clanGoal(info.members.length), maxMembers: D.CLAN.maxMembers,
      members: info.members.map((m) => ({ nickname: m.nickname, level: m.level, points: m.points, leader: m.id === info.leader, me: m.id === userId })),
      weekEndsAt: D.weekEndsAt(now),
    };
    return { clan, list };
  };

  const errorOut = (error) => {
    if (error instanceof E.GameError) return { status: error.status, body: { error: error.code, message: error.message } };
    throw error;
  };

  /** Возвращает { status, body, headers? } или null, если маршрут не относится к игре. */
  const sameToken = (a, b) => { const ha = createHash('sha256').update(String(a)).digest(); const hb = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(ha, hb); };
  return async function handle(req, url, readBody) {
    const path = url.pathname;
    if (path === '/api/admin/stats' && req.method === 'GET') {
      const given = req.headers['x-admin-token'];
      if (!adminToken || typeof given !== 'string' || !sameToken(given, adminToken)) return { status: 404, body: { error: 'not_found', message: 'Не найдено.' } };
      const stats = store ? await store.adminStats().catch((e) => ({ error: String(e.message).slice(0, 160) })) : { error: 'no_store' };
      const p = stats.players || {};
      const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
      return { status: 200, body: { ok: true, ...stats, funnel: { total: p.total, tutorial_done: p.tutorial_done, fought: p.fought, fought_pct: pct(p.fought, p.total) }, retention: { d1_pct: pct(p.d1_returned, p.d1_eligible), d7_pct: pct(p.d7_returned, p.d7_eligible) }, recentErrors: getErrors() } };
    }
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
    const bot = botUsername();
    const referralLink = bot && Number(user.id) > 0 ? `https://t.me/${bot}?start=ref_${user.id}` : null;

    try {
      if (route === 'state' && req.method === 'GET') {
        const [stats, by] = await Promise.all([safe(() => store.referralStats(user.id), { invited: 0, qualified: 0 }), safe(() => store.referralOf(user.id), null)]);
        const view = await store.transact(user.id, profile, async (state) => {
          const now = clock();
          const next = structuredClone(state);
          E.settle(next, now);
          if (by) E.applyReferralWelcome(next, now);
          E.markEventsSeen(next);
          return { state: next, result: buildView(next, now, { timeScale, referral: stats, referralLink }) };
        });
        return { status: 200, body: { ok: true, view } };
      }
      if (route === 'pvp/opponents' && req.method === 'GET') {
        const now = clock();
        const info = await store.transact(user.id, profile, async (state) => {
          const next = structuredClone(state);
          E.settle(next, now);
          return { state: next, result: { rating: next.pvp.rating, recent: next.pvp.recent.map((r) => r.id), left: Math.max(0, D.PVP.dailyTickets - next.pvp.used), bots: [0, 1, 2].map((i) => E.makeBot(next, i, now)) } };
        });
        let real = await safe(() => store.pvpCandidates(user.id, info.rating, D.PVP.window, 4), []);
        if (real.length < 2) real = await safe(() => store.pvpCandidates(user.id, info.rating, D.PVP.maxWindow, 4), real);
        real = real.filter((o) => o.defense.length && !info.recent.includes(o.id)).slice(0, 3);
        const bots = info.bots.slice(0, Math.max(2, 5 - real.length));
        return { status: 200, body: { ok: true, ticketsLeft: info.left, opponents: [...real, ...bots].map(toOpponent) } };
      }
      if (route === 'clan' && req.method === 'GET') {
        const q = String(url.searchParams.get('q') || '').replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 20);
        return { status: 200, body: { ok: true, ...(await safe(() => clanView(user.id, q, clock()), { clan: null, list: [], unavailable: true })), minLevel: D.CLAN.minLevel } };
      }
      if (route === 'top' && req.method === 'GET') {
        const kind = ['pvp', 'raid', 'xp'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'pvp';
        const me = await store.transact(user.id, profile, async (state) => ({ result: { value: kind === 'pvp' ? state.pvp.rating : kind === 'raid' ? state.raid.best : state.xp, played: state.pvp.played } }));
        const rows = await safe(() => store.top(kind, 100), []);
        const rank = (kind === 'pvp' && me.played === 0) || (kind === 'raid' && me.value === 0) ? null : await safe(() => store.topRank(kind, me.value), null);
        return { status: 200, body: { ok: true, kind, rows: rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, level: r.level, value: r.value })), me: { rank, value: me.value } } };
      }
      if (route === 'leaderboard' && req.method === 'GET') {
        const [top, rank] = await Promise.all([store.leaderboard(20), store.rankOf(user.id)]);
        return { status: 200, body: { ok: true, top, rank } };
      }
      if (req.method === 'POST' && route.startsWith('clan-')) {
        const body = await readBody(req);
        const now = clock();
        const level = await store.transact(user.id, profile, async (state) => ({ result: E.commanderLevel(state) }));
        if (level < D.CLAN.minLevel) return { status: 400, body: { error: 'commander_level', message: `Кланы доступны с ${D.CLAN.minLevel} уровня командира.` } };
        if (route === 'clan-create') {
          const name = String(body.name ?? '').replace(/\s+/g, ' ').trim(); const tag = String(body.tag ?? '').trim();
          if (!/^[\p{L}\p{N} _.-]+$/u.test(name) || name.length < D.CLAN.minName || name.length > D.CLAN.maxName) return { status: 400, body: { error: 'bad_name', message: `Название клана: ${D.CLAN.minName}–${D.CLAN.maxName} символов, буквы, цифры, пробел, _ . -` } };
          if (!/^[\p{L}\p{N}]{2,5}$/u.test(tag)) return { status: 400, body: { error: 'bad_tag', message: 'Тег клана: 2–5 букв или цифр.' } };
          await store.clanCreate(user.id, name, tag);
        } else if (route === 'clan-join') {
          if (!/^\d{1,15}$/.test(String(body.clanId ?? ''))) return { status: 400, body: { error: 'bad_request', message: 'Некорректный клан.' } };
          await store.clanJoin(user.id, String(body.clanId), D.CLAN.maxMembers);
        } else if (route === 'clan-leave') {
          await store.clanLeave(user.id);
        } else return { status: 404, body: { error: 'not_found', message: 'Неизвестный маршрут.' } };
        log.log(`[game] ${route}`);
        return { status: 200, body: { ok: true, ...(await clanView(user.id, '', now)), minLevel: D.CLAN.minLevel } };
      }
      if (req.method === 'POST') {
        const action = route;
        if (!E.ACTION_NAMES.includes(action)) return { status: 404, body: { error: 'not_found', message: 'Неизвестный маршрут.' } };
        const body = await readBody(req);
        const stats = await safe(() => store.referralStats(user.id), { invited: 0, qualified: 0 });
        let opponent = null; let clan = null;
        if (action === 'pvp/start' && /^\d{3,15}$/.test(String(body.opponentId ?? ''))) opponent = await safe(() => store.pvpOpponent(String(body.opponentId)), null);
        if (action === 'clan/claim') {
          const info = await safe(async () => { const id = await store.clanOf(user.id); return id ? store.clanInfo(id, D.weekIndex(clock())) : null; }, null);
          clan = info ? { inClan: true, total: info.total, members: info.members.length } : { inClan: false, total: 0, members: 0 };
        }
        let clanWar = null;
        if (action === 'clan/war-claim') {
          clanWar = await safe(async () => { const id = await store.clanOf(user.id); const r = id ? await store.clanWar(id, D.weekIndex(clock()) - 1) : null; return r ? { inClan: true, rank: r.rank } : { inClan: Boolean(id), rank: null }; }, { inClan: false, rank: null });
        }
        const view = await store.transact(user.id, profile, async (state) => {
          const now = clock();
          const next = E.perform(state, action, body, { now, rng, timeScale, requestId: body.requestId, referral: stats, opponent, clan, clanWar });
          const audit = AUDITED.has(action) ? [{ action, payload: auditPayload(action, body) }] : [];
          return { state: next, audit, result: buildView(next, now, { timeScale, referral: stats, referralLink }) };
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
