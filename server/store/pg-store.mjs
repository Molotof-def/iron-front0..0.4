// Хранилище состояния игроков в PostgreSQL. Каждая операция выполняется в транзакции
// со строгой блокировкой строки игрока (SELECT ... FOR UPDATE), поэтому параллельные запросы
// одного игрока обрабатываются строго по очереди и не могут продублировать награды.
export function createPgStore(pool, { createState, summarize, qualifyLevel = 3 }) {
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
            `INSERT INTO iron_players (telegram_id, nickname, state, xp, level, wins, imported_legacy, next_event_at, notify_enabled)
             VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9) ON CONFLICT (telegram_id) DO NOTHING`,
            [id, sum.nickname, JSON.stringify(initial), sum.xp, sum.level, sum.wins, Boolean(legacy), sum.nextEventAt, sum.notifyEnabled],
          );
          if (legacy) await client.query(`INSERT INTO iron_events (telegram_id, action, payload) VALUES ($1, 'legacy_import', '{}'::jsonb)`, [id]);
          found = await client.query('SELECT state FROM iron_players WHERE telegram_id = $1 FOR UPDATE', [id]);
        }
        const out = await fn(found.rows[0].state);
        if (out.state) {
          const sum = summarize(out.state);
          await client.query(
            `UPDATE iron_players SET state = $2::jsonb, nickname = $3, xp = $4, level = $5, wins = $6,
               next_event_at = $7, notify_enabled = $8, updated_at = NOW() WHERE telegram_id = $1`,
            [id, JSON.stringify(out.state), sum.nickname, sum.xp, sum.level, sum.wins, sum.nextEventAt, sum.notifyEnabled],
          );
          // Друг засчитывается пригласившему после достижения нужного уровня командира.
          if (sum.level >= qualifyLevel) await client.query('UPDATE iron_referrals SET qualified = TRUE WHERE invitee = $1 AND NOT qualified', [id]);
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
    /** Записывает приглашение, только если приглашённый — совершенно новый игрок, а пригласивший существует. */
    async recordReferral(invitee, referrer) {
      const r = await pool.query(
        `INSERT INTO iron_referrals (invitee, referrer)
         SELECT $1::bigint, $2::bigint
         WHERE $1::bigint <> $2::bigint
           AND EXISTS (SELECT 1 FROM iron_players WHERE telegram_id = $2::bigint)
           AND NOT EXISTS (SELECT 1 FROM iron_players WHERE telegram_id = $1::bigint)
           AND NOT EXISTS (SELECT 1 FROM player_saves WHERE telegram_id = $1::bigint)
         ON CONFLICT (invitee) DO NOTHING RETURNING invitee`,
        [invitee, referrer],
      );
      return r.rowCount > 0;
    },
    async referralOf(invitee) {
      const r = await pool.query('SELECT referrer FROM iron_referrals WHERE invitee = $1', [invitee]);
      return r.rows[0] ? String(r.rows[0].referrer) : null;
    },
    async referralStats(referrer) {
      const r = await pool.query('SELECT COUNT(*)::int AS invited, COUNT(*) FILTER (WHERE qualified)::int AS qualified FROM iron_referrals WHERE referrer = $1', [referrer]);
      return r.rows[0] || { invited: 0, qualified: 0 };
    },
    /** Игроки (реальные Telegram-аккаунты), у которых наступил срок завершения таймера и включены уведомления. */
    async dueForNotify(now, limit = 40) {
      const r = await pool.query(
        'SELECT telegram_id FROM iron_players WHERE notify_enabled AND next_event_at IS NOT NULL AND next_event_at <= $1 AND telegram_id > 0 ORDER BY next_event_at LIMIT $2',
        [now, limit],
      );
      return r.rows.map((x) => String(x.telegram_id));
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
