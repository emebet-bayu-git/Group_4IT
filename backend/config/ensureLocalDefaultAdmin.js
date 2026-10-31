import bcrypt from 'bcryptjs'
import { pool } from './db.js'

export async function ensureLocalDefaultAdmin() {
  if (process.env.NODE_ENV === 'production') return

  const email = String(process.env.DEFAULT_ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase()
  const password = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
    throw new Error('DEFAULT_ADMIN_EMAIL or DEFAULT_ADMIN_PASSWORD is invalid.')
  }

  const [policies] = await pool.execute(
    'SELECT min_password_length, require_password_mixed_case, require_password_number FROM system_security_policy WHERE id = 1'
  )
  const policy = policies[0] ?? {
    min_password_length: 8,
    require_password_mixed_case: false,
    require_password_number: false,
  }
  const meetsPolicy = password.length >= policy.min_password_length
    && (!policy.require_password_mixed_case || (/[a-z]/.test(password) && /[A-Z]/.test(password)))
    && (!policy.require_password_number || /\d/.test(password))
  if (!meetsPolicy) {
    throw new Error('The local default admin password does not meet the configured password policy.')
  }

  const [migration] = await pool.execute(
    "SELECT 1 FROM schema_migrations WHERE migration_key = 'local_default_admin_initialized' LIMIT 1"
  )
  if (migration.length) return

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    let [schoolRow] = await connection.execute(
      'SELECT id FROM schools WHERE code = ? LIMIT 1 FOR UPDATE',
      ['default-school']
    )
    let schoolId = schoolRow[0]?.id
    if (!schoolId) {
      const [insertResult] = await connection.execute(
        `INSERT INTO schools (name, code, status, address)
         VALUES ('Default School', 'default-school', 'active', 'Central Administration')`
      )
      schoolId = insertResult.insertId
    }

    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1 FOR UPDATE',
      [email]
    )
    const passwordHash = await bcrypt.hash(password, 10)
    if (existing.length) {
      await connection.execute(
        `UPDATE users SET full_name = 'System Administrator', password = ?, role = 'Super Admin',
         grade_level = 'N/A', is_active = TRUE, registration_source = 'admin',
         registered_by = NULL, failed_login_attempts = 0, locked_until = NULL, school_id = ?
         WHERE id = ?`,
        [passwordHash, schoolId, existing[0].id]
      )
      console.log(`Initialized local Super Admin account ${email}; its credentials will not be reset on later startups.`)
    } else {
      const [result] = await connection.execute(
        `INSERT INTO users
          (full_name, email, password, role, grade_level, is_active, registration_source, school_id)
         VALUES (?, ?, ?, 'Super Admin', 'N/A', TRUE, 'admin', ?)` ,
        ['System Administrator', email, passwordHash, schoolId]
      )
      console.log(`Created local Super Admin account ID ${result.insertId} for ${email}.`)
    }
    await connection.execute(
      "INSERT INTO schema_migrations (migration_key) VALUES ('local_default_admin_initialized')"
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
