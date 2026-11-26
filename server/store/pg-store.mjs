// Хранилище состояния игроков в PostgreSQL. Каждая операция выполняется в транзакции
// со строгой блокировкой строки игрока (SELECT ... FOR UPDATE), поэтому параллельные запросы
// одного игрока обрабатываются строго по очереди и не могут продублировать награды.
//
// getLevel() возвращает уровень применённой схемы БД. Дополнительные функции (уведомления, рефералы, дуэли, кланы)
// включаются только если соответствующая миграция применена; иначе основная игра продолжает работать без них.
import { GameError } from '../game/engine.mjs';

const unavailable = () => new GameError('feature_unavailable', 'Функция временно недоступна. Попробуйте позже.', 503);

export function createPgStore(pool, { createState, summarize, qualifyLevel = 3, getLevel = () => 99 }) {
  /** Колонки для записи состояния в зависимости от уровня схемы. */
  const columns = (lvl, sum, state) => {
    const c = [['nickname', sum.nickname], ['state', JSON.stringify(state), '::jsonb'], ['xp', sum.xp], ['level', sum.level], ['wins', sum.wins]];
    if (lvl >= 3) c.push(['next_event_at', sum.nextEventAt], ['notify_enabled', sum.notifyEnabled]);
    if (lvl >= 4) c.push(['rating', sum.rating], ['has_defense', sum.hasDefense], ['clan_points', sum.clanPoints], ['clan_week', sum.clanWeek]);
    if (lvl >= 5) c.push(['clan_prev_points', sum.clanPrevPoints], ['clan_prev_week', sum.clanPrevWeek]);
    return c;
  };
  const tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };
  const dup = (error) => error && error.code === '23505';

  return {
    kind: 'postgres',
    async transact(id, profile, fn) {
      const lvl = getLevel();
      return tx(async (client) => {
        let found = await client.query('SELECT state FROM iron_players WHERE telegram_id = $1 FOR UPDATE', [id]);
        if (!found.rows.length) {
          const legacyRow = await client.query('SELECT save_data FROM player_saves WHERE telegram_id = $1', [id]);
          const legacy = legacyRow.rows[0]?.save_data ?? null;
          const initial = createState(legacy, profile);
          const c = columns(lvl, summarize(initial), initial);
          const names = ['telegram_id', ...c.map((x) => x[0]), 'imported_legacy'];
          const marks = ['$1', ...c.map((x, i) => `$${i + 2}${x[2] || ''}`), `$${c.length + 2}`];
          await client.query(
            `INSERT INTO iron_players (${names.join(', ')}) VALUES (${marks.join(', ')}) ON CONFLICT (telegram_id) DO NOTHING`,
            [id, ...c.map((x) => x[1]), Boolean(legacy)],
          );
          if (legacy) await client.query(`INSERT INTO iron_events (telegram_id, action, payload) VALUES ($1, 'legacy_import', '{}'::jsonb)`, [id]);
          found = await client.query('SELECT state FROM iron_players WHERE telegram_id = $1 FOR UPDATE', [id]);
        }
        const out = await fn(found.rows[0].state);
        if (out.state) {
          const sum = summarize(out.state);
          const c = columns(lvl, sum, out.state);
          await client.query(
            `UPDATE iron_players SET ${c.map((x, i) => `${x[0]} = $${i + 2}${x[2] || ''}`).join(', ')}, updated_at = NOW() WHERE telegram_id = $1`,
            [id, ...c.map((x) => x[1])],
          );
          // Друг засчитывается пригласившему после достижения нужного уровня командира.
          if (lvl >= 3 && sum.level >= qualifyLevel) await client.query('UPDATE iron_referrals SET qualified = TRUE WHERE invitee = $1 AND NOT qualified', [id]);
        }
        for (const a of out.audit || []) {
          await client.query('INSERT INTO iron_events (telegram_id, action, payload) VALUES ($1, $2, $3::jsonb)', [id, a.action, JSON.stringify(a.payload || {})]);
        }
        return out.result;
      });
    },

    // ----- рефералы -----
    /** Записывает приглашение, только если приглашённый — совершенно новый игрок, а пригласивший существует. */
    async recordReferral(invitee, referrer) {
      if (getLevel() < 3) return false;
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
      if (getLevel() < 3) return null;
      const r = await pool.query('SELECT referrer FROM iron_referrals WHERE invitee = $1', [invitee]);
      return r.rows[0] ? String(r.rows[0].referrer) : null;
    },
    async referralStats(referrer) {
      if (getLevel() < 3) return { invited: 0, qualified: 0 };
      const r = await pool.query('SELECT COUNT(*)::int AS invited, COUNT(*) FILTER (WHERE qualified)::int AS qualified FROM iron_referrals WHERE referrer = $1', [referrer]);
      return r.rows[0] || { invited: 0, qualified: 0 };
    },
    /** Игроки (реальные Telegram-аккаунты), у которых наступил срок события и включены уведомления. */
    async dueForNotify(now, limit = 40) {
      if (getLevel() < 3) return [];
      const r = await pool.query(
        'SELECT telegram_id FROM iron_players WHERE notify_enabled AND next_event_at IS NOT NULL AND next_event_at <= $1 AND telegram_id > 0 ORDER BY next_event_at LIMIT $2',
        [now, limit],
      );
      return r.rows.map((x) => String(x.telegram_id));
    },

    // ----- дуэли -----
    async pvpCandidates(userId, rating, window, limit = 4) {
      if (getLevel() < 4) return [];
      const r = await pool.query(
        `SELECT telegram_id, nickname, level, rating, state->'pvp'->'defense' AS defense FROM iron_players
         WHERE telegram_id > 0 AND telegram_id <> $1 AND has_defense AND rating BETWEEN $2 AND $3
         ORDER BY random() LIMIT $4`,
        [userId, rating - window, rating + window, limit],
      );
      return r.rows.map((x) => ({ id: String(x.telegram_id), nickname: x.nickname, level: x.level, rating: x.rating, defense: x.defense || [] }));
    },
    async pvpOpponent(id) {
      if (getLevel() < 4) return null;
      const r = await pool.query(
        `SELECT telegram_id, nickname, level, rating, state->'pvp'->'defense' AS defense FROM iron_players WHERE telegram_id = $1 AND telegram_id > 0 AND has_defense`, [id]);
      const x = r.rows[0];
      return x ? { id: String(x.telegram_id), nickname: x.nickname, level: x.level, rating: x.rating, defense: x.defense || [] } : null;
    },

    // ----- кланы -----
    async clanOf(userId) {
      if (getLevel() < 4) return null;
      const r = await pool.query('SELECT clan_id FROM iron_clan_members WHERE telegram_id = $1', [userId]);
      return r.rows[0] ? String(r.rows[0].clan_id) : null;
    },
    async clanInfo(clanId, week) {
      if (getLevel() < 4) return null;
      const c = await pool.query('SELECT id, name, tag, leader FROM iron_clans WHERE id = $1', [clanId]);
      if (!c.rows[0]) return null;
      const m = await pool.query(
        `SELECT m.telegram_id, p.nickname, p.level, CASE WHEN p.clan_week = $2 THEN p.clan_points ELSE 0 END AS points
         FROM iron_clan_members m JOIN iron_players p ON p.telegram_id = m.telegram_id
         WHERE m.clan_id = $1 ORDER BY points DESC, p.level DESC LIMIT 50`,
        [clanId, week],
      );
      const members = m.rows.map((x) => ({ id: String(x.telegram_id), nickname: x.nickname, level: x.level, points: x.points }));
      return { id: String(c.rows[0].id), name: c.rows[0].name, tag: c.rows[0].tag, leader: String(c.rows[0].leader), members, total: members.reduce((a, b) => a + b.points, 0) };
    },
    async clanList(week, query = '', limit = 20) {
      if (getLevel() < 4) return [];
      const r = await pool.query(
        `SELECT c.id, c.name, c.tag, COUNT(m.telegram_id)::int AS members,
                COALESCE(SUM(CASE WHEN p.clan_week = $1 THEN p.clan_points ELSE 0 END), 0)::int AS points
         FROM iron_clans c
         LEFT JOIN iron_clan_members m ON m.clan_id = c.id
         LEFT JOIN iron_players p ON p.telegram_id = m.telegram_id
         WHERE ($2::text = '' OR LOWER(c.name) LIKE '%' || LOWER($2::text) || '%' OR UPPER(c.tag) = UPPER($2::text))
         GROUP BY c.id ORDER BY points DESC, members DESC LIMIT $3`,
        [week, query, limit],
      );
      return r.rows.map((x) => ({ id: String(x.id), name: x.name, tag: x.tag, members: x.members, points: x.points }));
    },
    async clanCreate(userId, name, tag) {
      if (getLevel() < 4) throw unavailable();
      try {
        return await tx(async (client) => {
          const c = await client.query('INSERT INTO iron_clans (name, tag, leader) VALUES ($1, $2, $3) RETURNING id', [name, tag, userId]);
          await client.query('INSERT INTO iron_clan_members (telegram_id, clan_id) VALUES ($1, $2)', [userId, c.rows[0].id]);
          return String(c.rows[0].id);
        });
      } catch (error) {
        if (dup(error)) throw new GameError('clan_conflict', 'Название или тег клана уже заняты, либо вы уже состоите в клане.', 409);
        throw error;
      }
    },
    async clanJoin(userId, clanId, maxMembers) {
      if (getLevel() < 4) throw unavailable();
      try {
        return await tx(async (client) => {
          const c = await client.query('SELECT id FROM iron_clans WHERE id = $1 FOR UPDATE', [clanId]);
          if (!c.rows[0]) throw new GameError('not_found', 'Клан не найден.', 404);
          const n = await client.query('SELECT COUNT(*)::int AS n FROM iron_clan_members WHERE clan_id = $1', [clanId]);
          if (n.rows[0].n >= maxMembers) throw new GameError('clan_full', 'В клане нет свободных мест.', 409);
          await client.query('INSERT INTO iron_clan_members (telegram_id, clan_id) VALUES ($1, $2)', [userId, clanId]);
          return true;
        });
      } catch (error) {
        if (dup(error)) throw new GameError('already_member', 'Вы уже состоите в клане.', 409);
        throw error;
      }
    },
    async clanLeave(userId) {
      if (getLevel() < 4) throw unavailable();
      return tx(async (client) => {
        const m = await client.query('DELETE FROM iron_clan_members WHERE telegram_id = $1 RETURNING clan_id', [userId]);
        if (!m.rows[0]) throw new GameError('not_member', 'Вы не состоите в клане.', 409);
        const clanId = m.rows[0].clan_id;
        const left = await client.query('SELECT telegram_id FROM iron_clan_members WHERE clan_id = $1 ORDER BY joined_at, telegram_id LIMIT 1', [clanId]);
        if (!left.rows[0]) await client.query('DELETE FROM iron_clans WHERE id = $1', [clanId]);
        else await client.query('UPDATE iron_clans SET leader = $2 WHERE id = $1 AND leader = $3', [clanId, left.rows[0].telegram_id, userId]);
        return true;
      });
    },

    /** Итоги клановой войны за прошлую неделю: место клана среди всех кланов. */
    async clanWar(clanId, prevWeek) {
      if (getLevel() < 5) return null;
      const r = await pool.query(
        `WITH totals AS (
           SELECT m.clan_id, COALESCE(SUM(CASE WHEN p.clan_prev_week = $1 THEN p.clan_prev_points ELSE 0 END), 0)::int AS pts
           FROM iron_clan_members m JOIN iron_players p ON p.telegram_id = m.telegram_id GROUP BY m.clan_id)
         SELECT (SELECT COUNT(*) FROM totals t2 WHERE t2.pts > t.pts)::int + 1 AS rank, t.pts, (SELECT COUNT(*) FROM totals)::int AS clans
         FROM totals t WHERE t.clan_id = $2`,
        [prevWeek, clanId],
      );
      return r.rows[0] ? { rank: r.rows[0].rank, pts: r.rows[0].pts, clans: r.rows[0].clans } : null;
    },

    // ----- рейтинги (топ-100) -----
    async top(kind, limit = 100) {
      const lvl = getLevel();
      if (kind === 'xp') return (await this.leaderboard(limit)).map((r) => ({ nickname: r.nickname, level: r.level, value: r.xp }));
      if (lvl < 4) return [];
      const sql = kind === 'pvp'
        ? `SELECT nickname, level, rating AS value FROM iron_players WHERE telegram_id > 0 AND has_defense AND COALESCE((state->'pvp'->>'played')::int, 0) > 0 ORDER BY rating DESC, telegram_id LIMIT $1`
        : `SELECT nickname, level, (state->'raid'->>'best')::int AS value FROM iron_players WHERE telegram_id > 0 AND COALESCE((state->'raid'->>'best')::int, 0) > 0 ORDER BY value DESC, telegram_id LIMIT $1`;
      const r = await pool.query(sql, [limit]);
      return r.rows.map((x) => ({ nickname: x.nickname, level: x.level, value: Number(x.value) }));
    },
    async topRank(kind, value) {
      if (getLevel() < 4 && kind !== 'xp') return null;
      const sql = kind === 'pvp'
        ? `SELECT COUNT(*)::int + 1 AS rank FROM iron_players WHERE telegram_id > 0 AND has_defense AND COALESCE((state->'pvp'->>'played')::int, 0) > 0 AND rating > $1`
        : kind === 'raid'
          ? `SELECT COUNT(*)::int + 1 AS rank FROM iron_players WHERE telegram_id > 0 AND COALESCE((state->'raid'->>'best')::int, 0) > $1`
          : `SELECT COUNT(*)::int + 1 AS rank FROM iron_players WHERE telegram_id > 0 AND xp > $1`;
      const r = await pool.query(sql, [value]);
      return r.rows[0]?.rank ?? null;
    },

    /** Сводка для владельца: игроки, активность, воронка, возвращаемость. Каждый запрос независим. */
    async adminStats() {
      const one = async (sql) => { try { return (await pool.query(sql)).rows[0]; } catch (e) { return { error: String(e.message).slice(0, 120) }; } };
      const players = await one(`SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')::int AS new_day,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_week,
          COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '1 day')::int AS active_day,
          COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '7 days')::int AS active_week,
          COUNT(*) FILTER (WHERE COALESCE((state->'stats'->>'battles')::int, 0) > 0)::int AS fought,
          COUNT(*) FILTER (WHERE COALESCE((state->'tutorial'->>'done')::boolean, FALSE))::int AS tutorial_done,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 day')::int AS d1_eligible,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '1 day' AND updated_at >= created_at + INTERVAL '1 day')::int AS d1_returned,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')::int AS d7_eligible,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days' AND updated_at >= created_at + INTERVAL '7 days')::int AS d7_returned
        FROM iron_players WHERE telegram_id > 0`);
      const levels = await (async () => { try { return (await pool.query('SELECT level, COUNT(*)::int AS n FROM iron_players WHERE telegram_id > 0 GROUP BY level ORDER BY level LIMIT 60')).rows; } catch { return []; } })();
      const extra = getLevel() >= 4 ? await one(`SELECT (SELECT COUNT(*) FROM iron_clans)::int AS clans, (SELECT COUNT(*) FROM iron_clan_members)::int AS clan_members, (SELECT COUNT(*) FROM iron_referrals)::int AS referrals`) : {};
      return { schemaLevel: getLevel(), players, levels, ...extra };
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
