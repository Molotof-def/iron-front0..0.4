// Локальное хранилище для разработки без PostgreSQL (JSON-файл или память).
// В production не используется: без DATABASE_URL сервер отвечает 503.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameError } from '../game/engine.mjs';

export function createFileStore(path, { createState, summarize, qualifyLevel = 3 }) {
  let data = { players: {}, referrals: {}, clans: {}, members: {}, clanSeq: 1 };
  if (path && existsSync(path)) {
    try { data = { ...data, ...JSON.parse(readFileSync(path, 'utf8')) }; } catch { /* начинаем заново */ }
  }
  let chain = Promise.resolve();
  const persist = () => {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify(data));
    renameSync(`${path}.tmp`, path);
  };
  const sumOf = (id) => summarize(data.players[id].state);
  const pointsOf = (id, week) => (data.players[id] && sumOf(id).clanWeek === week ? sumOf(id).clanPoints : 0);
  const publicOpp = (id) => { const s = sumOf(id); return { id, nickname: s.nickname, level: s.level, rating: s.rating, defense: data.players[id].state.pvp?.defense || [] }; };

  return {
    kind: path ? 'file' : 'memory',
    transact(id, profile, fn) {
      const run = chain.then(async () => {
        let row = data.players[id];
        if (!row) row = data.players[id] = { state: createState(null, profile), audit: [] };
        const draft = structuredClone(row.state);
        const out = await fn(draft);
        if (out.state) {
          row.state = out.state;
          if (summarize(out.state).level >= qualifyLevel && data.referrals[id]) data.referrals[id].qualified = true;
        }
        for (const a of out.audit || []) { row.audit.push({ ...a, at: Date.now() }); if (row.audit.length > 200) row.audit.shift(); }
        persist();
        return out.result;
      });
      chain = run.catch(() => undefined);
      return run;
    },
    async recordReferral(invitee, referrer) {
      if (invitee === referrer || !data.players[referrer] || data.players[invitee] || data.referrals[invitee]) return false;
      data.referrals[invitee] = { referrer, qualified: false }; persist(); return true;
    },
    async referralOf(invitee) { return data.referrals[invitee]?.referrer ?? null; },
    async referralStats(referrer) {
      const mine = Object.values(data.referrals).filter((r) => r.referrer === referrer);
      return { invited: mine.length, qualified: mine.filter((r) => r.qualified).length };
    },
    async dueForNotify(now, limit = 40) {
      return Object.keys(data.players).filter((id) => Number(id) > 0 && sumOf(id).notifyEnabled && sumOf(id).nextEventAt != null && sumOf(id).nextEventAt <= now).slice(0, limit);
    },
    async pvpCandidates(userId, rating, window, limit = 4) {
      return Object.keys(data.players).filter((id) => Number(id) > 0 && id !== userId && sumOf(id).hasDefense && Math.abs(sumOf(id).rating - rating) <= window).slice(0, limit).map(publicOpp);
    },
    async pvpOpponent(id) { return data.players[id] && Number(id) > 0 && sumOf(id).hasDefense ? publicOpp(id) : null; },

    async clanOf(userId) { return data.members[userId] ?? null; },
    async clanInfo(clanId, week) {
      const c = data.clans[clanId]; if (!c) return null;
      const ids = Object.keys(data.members).filter((u) => data.members[u] === clanId).sort((a, b) => (data.players[a] ? 0 : 1) - (data.players[b] ? 0 : 1));
      const members = ids.filter((u) => data.players[u]).map((u) => ({ id: u, nickname: sumOf(u).nickname, level: sumOf(u).level, points: pointsOf(u, week) })).sort((a, b) => b.points - a.points || b.level - a.level);
      return { id: clanId, name: c.name, tag: c.tag, leader: c.leader, members, total: members.reduce((a, b) => a + b.points, 0) };
    },
    async clanList(week, query = '', limit = 20) {
      const q = query.toLowerCase();
      return Object.entries(data.clans).filter(([, c]) => !q || c.name.toLowerCase().includes(q) || c.tag.toLowerCase() === q)
        .map(([id, c]) => {
          const ids = Object.keys(data.members).filter((u) => data.members[u] === id);
          return { id, name: c.name, tag: c.tag, members: ids.length, points: ids.reduce((a, u) => a + pointsOf(u, week), 0) };
        }).sort((a, b) => b.points - a.points || b.members - a.members).slice(0, limit);
    },
    async clanCreate(userId, name, tag) {
      const taken = Object.values(data.clans).some((c) => c.name.toLowerCase() === name.toLowerCase() || c.tag.toUpperCase() === tag.toUpperCase());
      if (taken || data.members[userId]) throw new GameError('clan_conflict', 'Название или тег клана уже заняты, либо вы уже состоите в клане.', 409);
      const id = String(data.clanSeq++);
      data.clans[id] = { name, tag, leader: userId }; data.members[userId] = id; persist(); return id;
    },
    async clanJoin(userId, clanId, maxMembers) {
      if (!data.clans[clanId]) throw new GameError('not_found', 'Клан не найден.', 404);
      if (data.members[userId]) throw new GameError('already_member', 'Вы уже состоите в клане.', 409);
      if (Object.values(data.members).filter((c) => c === clanId).length >= maxMembers) throw new GameError('clan_full', 'В клане нет свободных мест.', 409);
      data.members[userId] = clanId; persist(); return true;
    },
    async clanLeave(userId) {
      const clanId = data.members[userId];
      if (!clanId) throw new GameError('not_member', 'Вы не состоите в клане.', 409);
      delete data.members[userId];
      const rest = Object.keys(data.members).filter((u) => data.members[u] === clanId);
      if (!rest.length) delete data.clans[clanId]; else if (data.clans[clanId].leader === userId) data.clans[clanId].leader = rest[0];
      persist(); return true;
    },

    async leaderboard(limit = 20) {
      return Object.values(data.players).map((r) => summarize(r.state))
        .sort((a, b) => b.xp - a.xp || b.wins - a.wins).slice(0, limit)
        .map((s) => ({ nickname: s.nickname, level: s.level, xp: s.xp, wins: s.wins }));
    },
    async rankOf(id) {
      const mine = data.players[id] && summarize(data.players[id].state);
      if (!mine) return null;
      return 1 + Object.values(data.players).filter((r) => summarize(r.state).xp > mine.xp).length;
    },
  };
}
