import '../config/loadEnv.js'
import bcrypt from 'bcryptjs'
import { pool } from '../config/db.js'
import { DEFAULT_TEMPORARY_PASSWORD } from '../utils/accountDefaults.js'

const identifier = String(process.argv[2] || '').trim()
const normalizedIdentifier = identifier.toLowerCase()
const numericId = /^\d+$/.test(identifier) && Number.isSafeInteger(Number(identifier))
  ? Number(identifier)
  : 0

if (!identifier) {
  console.error('Usage: npm --prefix backend run reset:temporary-password -- <email|username|user-id>')
  process.exitCode = 1
} else {
  try {
    const [users] = await pool.execute(
      `SELECT id, email, username FROM users
       WHERE LOWER(email) = ? OR LOWER(username) = ? OR (? > 0 AND id = ?)
       LIMIT 2`,
      [normalizedIdentifier, normalizedIdentifier, numericId, numericId]
    )
    if (users.length !== 1) {
      throw new Error(users.length ? 'Identifier matched more than one account.' : 'Account not found.')
    }

    const passwordHash = await bcrypt.hash(DEFAULT_TEMPORARY_PASSWORD, 10)
    await pool.execute(
      `UPDATE users
       SET password = ?, must_change_password = TRUE, password_changed_at = NULL,
           failed_login_attempts = 0, locked_until = NULL
       WHERE id = ?`,
      [passwordHash, users[0].id]
    )
    console.log(`Reset temporary password for account ID ${users[0].id}; password change is required at next sign-in.`)
  } catch (error) {
    console.error('Unable to reset the account temporary password:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
