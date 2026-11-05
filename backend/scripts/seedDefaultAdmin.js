import '../config/loadEnv.js'
import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'

const email = String(process.env.DEFAULT_ADMIN_EMAIL || '').trim().toLowerCase()
const password = process.env.DEFAULT_ADMIN_PASSWORD || ''

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Set a valid DEFAULT_ADMIN_EMAIL in backend/.env before running this command.')
  process.exitCode = 1
} else if (password.length < 8 || password.length > 72) {
  console.error('Set DEFAULT_ADMIN_PASSWORD to a password between 8 and 72 characters in backend/.env.')
  process.exitCode = 1
} else {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    )
    if (existing.length) {
      console.log(`Admin account ${email} already exists; no changes were made.`)
    } else {
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
        console.error('DEFAULT_ADMIN_PASSWORD does not meet the configured system password policy.')
        process.exitCode = 1
      } else {
        const [result] = await pool.execute(
          `INSERT INTO users
            (full_name, email, password, role, grade_level, is_active, registration_source, must_change_password)
           VALUES (?, ?, ?, 'Super Admin', 'N/A', TRUE, 'admin', FALSE)`,
          ['System Administrator', email, await bcrypt.hash(password, 10)]
        )
        console.log(`Created Super Admin account ID ${result.insertId} for ${email}.`)
      }
    }
  } catch (error) {
    console.error('Unable to seed the default administrator:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
