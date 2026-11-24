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
  {
    version: 3,
    name: 'notifications_and_referrals',
    sql: `
      ALTER TABLE iron_players ADD COLUMN IF NOT EXISTS next_event_at BIGINT;
      ALTER TABLE iron_players ADD COLUMN IF NOT EXISTS notify_enabled BOOLEAN NOT NULL DEFAULT TRUE;
      CREATE INDEX IF NOT EXISTS iron_players_notify_idx ON iron_players (next_event_at) WHERE next_event_at IS NOT NULL AND notify_enabled;
      CREATE TABLE IF NOT EXISTS iron_referrals (
        invitee BIGINT PRIMARY KEY,
        referrer BIGINT NOT NULL,
        qualified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS iron_referrals_referrer_idx ON iron_referrals (referrer);
    `,
  },
  {
    version: 4,
    name: 'pvp_seasons_clans',
    sql: `
      ALTER TABLE iron_players ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 1000;
      ALTER TABLE iron_players ADD COLUMN IF NOT EXISTS has_defense BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE iron_players ADD COLUMN IF NOT EXISTS clan_points INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE iron_players ADD COLUMN IF NOT EXISTS clan_week INTEGER NOT NULL DEFAULT -1;
      CREATE INDEX IF NOT EXISTS iron_players_pvp_idx ON iron_players (rating) WHERE has_defense;
      CREATE TABLE IF NOT EXISTS iron_clans (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(24) NOT NULL,
        tag VARCHAR(8) NOT NULL,
        leader BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS iron_clans_name_idx ON iron_clans (LOWER(name));
      CREATE UNIQUE INDEX IF NOT EXISTS iron_clans_tag_idx ON iron_clans (UPPER(tag));
      CREATE TABLE IF NOT EXISTS iron_clan_members (
        telegram_id BIGINT PRIMARY KEY,
        clan_id BIGINT NOT NULL REFERENCES iron_clans(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS iron_clan_members_clan_idx ON iron_clan_members (clan_id);
    `,
  },
];

/** Версии, без которых игра работать не может. Остальные — дополнительные функции: при сбое игра продолжает работать без них. */
const REQUIRED_VERSION = 2;

const LOCK_KEY = 872_001; // произвольный ключ advisory-lock: два экземпляра не мигрируют одновременно

/** Применяет недостающие миграции. Возвращает достигнутый уровень схемы. Сбой обязательной миграции — исключение. */
export async function runMigrations(pool, log = console) {
  const client = await pool.connect();
  let level = 0;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) { level = m.version; continue; }
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
        await client.query('COMMIT');
        level = m.version;
        log.log(`[db] миграция ${m.version} (${m.name}) применена`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        if (m.version <= REQUIRED_VERSION) throw error;
        log.error(`[db] дополнительная миграция ${m.version} (${m.name}) не применена, часть функций отключена: ${String(error.message).slice(0, 200)}`);
        break;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
  return level;
}
