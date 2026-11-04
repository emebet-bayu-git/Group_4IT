import { pool } from './db.js'

async function ensureColumn(column, definition) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = ?
     LIMIT 1`,
    [column]
  )
  if (!rows.length) await pool.query(`ALTER TABLE users ADD COLUMN \`${column}\` ${definition}`)
}

export async function ensureAuthenticationSchema() {
  const [databaseRows] = await pool.query('SELECT DATABASE() AS databaseName')
  const databaseName = databaseRows[0]?.databaseName
  if (!databaseName) throw new Error('No MySQL database is selected. Set DB_NAME in backend/.env.')

  const [userTable] = await pool.execute(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'users' LIMIT 1`
  )
  if (!userTable.length) {
    throw new Error(`The "${databaseName}" database has no users table. Import backend/schema.sql first.`)
  }

  await ensureColumn('is_active', 'BOOLEAN NOT NULL DEFAULT TRUE')
  await ensureColumn('failed_login_attempts', 'INT UNSIGNED NOT NULL DEFAULT 0')
  await ensureColumn('locked_until', 'DATETIME NULL')
  await ensureColumn('password_changed_at', 'DATETIME NULL')
  await ensureColumn('token_version', 'INT UNSIGNED NOT NULL DEFAULT 0')
  await ensureColumn('registration_source', "ENUM('admin', 'registrar', 'pending') NOT NULL DEFAULT 'pending'")
  await ensureColumn('registered_by', 'INT NULL')
  await ensureColumn('username', 'VARCHAR(60) NULL')
  await ensureColumn('phone', 'VARCHAR(40) NULL')
  await ensureColumn('department', 'VARCHAR(100) NULL')
  await ensureColumn('avatar_path', 'VARCHAR(500) NULL')
  const [usernameIndex] = await pool.execute(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'users'
       AND index_name = 'uq_users_username' LIMIT 1`
  )
  if (!usernameIndex.length) {
    await pool.query('ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)')
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS system_security_policy (
    id TINYINT PRIMARY KEY,
    min_password_length TINYINT UNSIGNED NOT NULL DEFAULT 8,
    require_password_mixed_case BOOLEAN NOT NULL DEFAULT FALSE,
    require_password_number BOOLEAN NOT NULL DEFAULT FALSE,
    max_failed_logins TINYINT UNSIGNED NOT NULL DEFAULT 5,
    lockout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,
    session_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 480
  )`)
  await pool.execute('INSERT IGNORE INTO system_security_policy (id) VALUES (1)')

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_key VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  const [legacyMigration] = await pool.execute(
    `SELECT 1 FROM schema_migrations
     WHERE migration_key = 'admin_workspace_legacy_registration_source' LIMIT 1`
  )
  if (!legacyMigration.length) {
    await pool.query(
      `UPDATE users SET registration_source = 'admin'
       WHERE is_active = TRUE AND registration_source = 'pending'`
    )
    await pool.execute(
      `INSERT INTO schema_migrations (migration_key)
       VALUES ('admin_workspace_legacy_registration_source')`
    )
  }
}
