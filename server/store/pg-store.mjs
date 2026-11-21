// Хранилище состояния игроков в PostgreSQL. Каждая операция выполняется в транзакции
// со строгой блокировкой строки игрока (SELECT ... FOR UPDATE), поэтому параллельные запросы
// одного игрока обрабатываются строго по очереди и не могут продублировать награды.
export function createPgStore(pool, { createState, summarize }) {
  return {
    kind: 'postgres',
    async transact(id, profile, fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let found = await client.query('SELECT state FROM iron_players WHERE telegram_id = $1 FOR UPDATE', [id]);
        if (!found.rows.length) {
          const legacyRow = await client.query('SELECT save_data FROM player_saves WHERE telegram_id = $1', [id]);
          const legacy = legacyRow.rows[0]?.save_data ?? null;
          const initial = createState(legacy, profile);
          const sum = summarize(initial);
          await client.query(
            `INSERT INTO iron_players (telegram_id, nickname, state, xp, level, wins, imported_legacy)
             VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) ON CONFLICT (telegram_id) DO NOTHING`,
            [id, sum.nickname, JSON.stringify(initial), sum.xp, sum.level, sum.wins, Boolean(legacy)],
          );
          if (legacy) await client.query(`INSERT INTO iron_events (telegram_id, action, payload) VALUES ($1, 'legacy_import', '{}'::jsonb)`, [id]);
          found = await client.query('SELECT state FROM iron_players WHERE telegram_id = $1 FOR UPDATE', [id]);
        }
        const out = await fn(found.rows[0].state);
        if (out.state) {
          const sum = summarize(out.state);
          await client.query(
            `UPDATE iron_players SET state = $2::jsonb, nickname = $3, xp = $4, level = $5, wins = $6, updated_at = NOW() WHERE telegram_id = $1`,
            [id, JSON.stringify(out.state), sum.nickname, sum.xp, sum.level, sum.wins],
          );
        }
        for (const a of out.audit || []) {
          await client.query('INSERT INTO iron_events (telegram_id, action, payload) VALUES ($1, $2, $3::jsonb)', [id, a.action, JSON.stringify(a.payload || {})]);
        }
        await client.query('COMMIT');
        return out.result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async leaderboard(limit = 20) {
      const r = await pool.query('SELECT nickname, level, xp, wins FROM iron_players ORDER BY xp DESC, wins DESC, telegram_id ASC LIMIT $1', [limit]);
      return r.rows.map((row) => ({ nickname: row.nickname, level: row.level, xp: Number(row.xp), wins: row.wins }));
    },
    async rankOf(id) {
      const r = await pool.query(
        `SELECT 1 + COUNT(*) AS rank FROM iron_players WHERE xp > (SELECT xp FROM iron_players WHERE telegram_id = $1)`, [id]);
      return Number(r.rows[0]?.rank || 0) || null;
    },
  };
}
