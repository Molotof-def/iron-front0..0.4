// Локальное хранилище для разработки без PostgreSQL (JSON-файл или память).
// В production не используется: без DATABASE_URL сервер отвечает 503.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function createFileStore(path, { createState, summarize }) {
  let data = { players: {} };
  if (path && existsSync(path)) {
    try { data = JSON.parse(readFileSync(path, 'utf8')); } catch { data = { players: {} }; }
  }
  let chain = Promise.resolve();
  const persist = () => {
    if (!path) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.tmp`, JSON.stringify(data));
    renameSync(`${path}.tmp`, path);
  };
  return {
    kind: path ? 'file' : 'memory',
    transact(id, profile, fn) {
      const run = chain.then(async () => {
        let row = data.players[id];
        if (!row) {
          row = data.players[id] = { state: createState(null, profile), audit: [] };
        }
        const draft = structuredClone(row.state);
        const out = await fn(draft);
        if (out.state) { row.state = out.state; }
        for (const a of out.audit || []) { row.audit.push({ ...a, at: Date.now() }); if (row.audit.length > 200) row.audit.shift(); }
        persist();
        return out.result;
      });
      chain = run.catch(() => undefined);
      return run;
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
