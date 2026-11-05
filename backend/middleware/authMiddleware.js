import jwt from 'jsonwebtoken'
import { pool } from '../config/db.js'

export async function authenticateUser(req, res, next) {
  const authorization = req.get('authorization') || ''
  const [scheme, token] = authorization.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' })
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-with-')) {
    return res.status(500).json({ message: 'Server authentication is not configured. Set JWT_SECRET to a unique random value of at least 32 characters in backend/.env, then restart the API.' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (!payload || typeof payload !== 'object' || !payload.sub) {
      return res.status(401).json({ message: 'Invalid authentication token.' })
    }
    const userId = Number(payload.sub)
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(401).json({ message: 'Invalid authentication token.' })
    }
    const [users] = await pool.execute(
      `SELECT u.id, u.full_name, u.role, u.is_active, u.token_version,
              u.must_change_password,
              p.session_timeout_minutes
       FROM users u CROSS JOIN system_security_policy p
       WHERE u.id = ? AND p.id = 1 LIMIT 1`,
      [userId]
    )
    if (!users.length || !users[0].is_active) {
      return res.status(401).json({ message: 'This account is unavailable. Sign in again or contact your administrator.' })
    }
    if (Number(payload.ver) !== Number(users[0].token_version)
      || !Number.isInteger(payload.iat)
      || Date.now() >= (payload.iat + Number(users[0].session_timeout_minutes) * 60) * 1000) {
      return res.status(401).json({ message: 'Your session has expired. Sign in again.' })
    }
    req.user = {
      id: users[0].id,
      role: users[0].role,
      name: users[0].full_name,
      mustChangePassword: Boolean(users[0].must_change_password),
    }
    if (req.user.mustChangePassword
      && !(req.baseUrl === '/api/auth' && req.path === '/change-password')) {
      return res.status(403).json({
        message: 'You must change your temporary password before accessing the SIMS.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      })
    }
    return next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired authentication token.' })
    }
    return next(error)
  }
}

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' })
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: `This action requires one of the following roles: ${allowedRoles.join(', ')}` })
    }
    return next()
  }
}

export function requireAdmin(req, res, next) {
  return authenticateUser(req, res, () => {
    if (!['Super Admin', 'School Admin', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor', 'Teacher'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Administrator access required.' })
    }
    return next()
  })
}

export function requireSchoolAdmin(req, res, next) {
  return authenticateUser(req, res, () => {
    if (req.user.role !== 'School Admin') {
      return res.status(403).json({ message: 'School administrator access required.' })
    }
    return next()
  })
}
