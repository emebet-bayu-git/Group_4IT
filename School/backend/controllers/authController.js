import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'

export async function login(req, res, next) {
  const { identifier, studentId, password } = req.body ?? {}
  const normalizedId = String(identifier ?? studentId ?? '').trim()
  const normalizedEmail = normalizedId.toLowerCase()
  const normalizedUsername = normalizedId.toLowerCase()
  const numericId = Number(normalizedId)

  const isNumericId = /^\d+$/.test(normalizedId) && Number.isSafeInteger(numericId) && numericId > 0
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  const isUsername = /^[a-zA-Z0-9._-]{3,60}$/.test(normalizedId)
  if ((!isNumericId && !isEmail && !isUsername) || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Enter a valid email address, username, or school ID and password.' })
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-with-')) {
    return res.status(500).json({ message: 'Server authentication is not configured. Set JWT_SECRET to a unique random value of at least 32 characters in backend/.env, then restart the API.' })
  }

  try {
    const [users] = await pool.execute(
      `SELECT id, full_name, password, role, avatar_path, is_active, failed_login_attempts,
              locked_until, token_version, registration_source
       FROM users
       WHERE email = ? OR username = ? OR (? = TRUE AND id = ?)
       ORDER BY (email = ? OR username = ?) DESC
       LIMIT 1`,
      [normalizedEmail, normalizedUsername, isNumericId, isNumericId ? numericId : 0,
        normalizedEmail, normalizedUsername]
    )
    const user = users[0]
    if (!user || !user.is_active || !['admin', 'registrar'].includes(user.registration_source)) {
      return res.status(403).json({ message: 'Account not authorized or pending admin registration' })
    }
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return res.status(423).json({ message: 'This account is temporarily locked after failed sign-in attempts.' })
    }
    if (user.locked_until) {
      await pool.execute('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id])
    }
    if (!(await bcrypt.compare(password, user.password))) {
      const [policies] = await pool.execute(
        'SELECT max_failed_logins, lockout_minutes FROM system_security_policy WHERE id = 1'
      )
      const policy = policies[0] ?? { max_failed_logins: 5, lockout_minutes: 15 }
      await pool.execute(
        `UPDATE users SET
         locked_until = IF(failed_login_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL),
         failed_login_attempts = failed_login_attempts + 1
         WHERE id = ?`,
        [policy.max_failed_logins, policy.lockout_minutes, user.id]
      )
      return res.status(401).json({ message: 'Invalid email or school ID and password.' })
    }
    await pool.execute('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id])
    const role = user.role
    if (!['Super Admin', 'School Admin', 'Registrar', 'Teacher', 'Student', 'Headmaster', 'Vice Principal', 'Supervisor'].includes(role)) {
      return res.status(403).json({ message: 'This account role cannot access the SIMS dashboard.' })
    }

    const [policies] = await pool.execute(
      'SELECT session_timeout_minutes FROM system_security_policy WHERE id = 1'
    )
    const sessionTimeoutMinutes = Number(policies[0]?.session_timeout_minutes) || 480
    const token = jwt.sign(
      { sub: String(user.id), role: user.role, name: user.full_name, ver: user.token_version },
      process.env.JWT_SECRET,
      { expiresIn: `${sessionTimeoutMinutes}m` }
    )
    return res.json({
      token,
      role,
      systemRole: user.role,
      name: user.full_name,
      identifier: String(user.id),
      avatarPath: user.avatar_path,
    })
  } catch (error) {
    return next(error)
  }
}
