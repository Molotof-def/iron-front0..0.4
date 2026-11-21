// Версионированные миграции PostgreSQL. Только добавляют структуры: ничего не удаляют и не переписывают.
export const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline_player_saves',
    // Идентично таблице версии 0.4.0; на существующей базе ничего не меняет.
    sql: `
      CREATE TABLE IF NOT EXISTS player_saves (
        telegram_id BIGINT PRIMARY KEY,
        username VARCHAR(64) NOT NULL DEFAULT '',
        first_name VARCHAR(80) NOT NULL DEFAULT 'Командир',
        save_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS player_saves_updated_at_idx ON player_saves (updated_at DESC);
    `,
  },
  {
    version: 2,
    name: 'server_authoritative_game_state',
    sql: `
      CREATE TABLE IF NOT EXISTS iron_players (
        telegram_id BIGINT PRIMARY KEY,
        nickname VARCHAR(32) NOT NULL DEFAULT 'Командир',
        state JSONB NOT NULL,
        xp BIGINT NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        wins INTEGER NOT NULL DEFAULT 0,
        imported_legacy BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS iron_players_rank_idx ON iron_players (xp DESC, wins DESC);
      CREATE TABLE IF NOT EXISTS iron_events (
        id BIGSERIAL PRIMARY KEY,
        telegram_id BIGINT NOT NULL,
        action VARCHAR(48) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS iron_events_player_idx ON iron_events (telegram_id, created_at DESC);
    `,
  },
];

const LOCK_KEY = 872_001; // произвольный ключ advisory-lock: два экземпляра не мигрируют одновременно

export async function runMigrations(pool, log = console) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
        await client.query('COMMIT');
        log.log(`[db] миграция ${m.version} (${m.name}) применена`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}
