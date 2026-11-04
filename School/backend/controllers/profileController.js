import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import jwt from 'jsonwebtoken'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../config/db.js'

const avatarDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/staff-avatars')

export async function getStaffProfile(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name AS name, email, phone, department, role, avatar_path AS avatarPath
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Your account could not be found.' })
    return res.json(rows[0])
  } catch (error) {
    return next(error)
  }
}

export async function updateStaffProfile(req, res, next) {
  const body = req.body ?? {}
  const allowedFields = ['name', 'email', 'phone', 'department', 'currentPassword', 'newPassword']
  if (Object.keys(body).some((field) => !allowedFields.includes(field))) {
    return res.status(400).json({ message: 'The profile contains an unsupported field.' })
  }

  const assignments = []
  const values = []
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
      return res.status(400).json({ message: 'Name is required and must be at most 100 characters.' })
    }
    assignments.push('full_name = ?')
    values.push(body.name.trim())
  }
  if (Object.hasOwn(body, 'email')) {
    if (typeof body.email !== 'string'
      || body.email.trim().length > 100
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return res.status(400).json({ message: 'Provide a valid email address of at most 100 characters.' })
    }
    assignments.push('email = ?')
    values.push(body.email.trim().toLowerCase())
  }
  if (Object.hasOwn(body, 'phone')) {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : null
    if (phone === null || phone.length > 40 || (phone && (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, '').length < 7))) {
      return res.status(400).json({ message: 'Provide a valid phone number with at least 7 digits.' })
    }
    assignments.push('phone = ?')
    values.push(phone || null)
  }
  if (Object.hasOwn(body, 'department')) {
    if (typeof body.department !== 'string' || body.department.trim().length > 100) {
      return res.status(400).json({ message: 'Department must be at most 100 characters.' })
    }
    assignments.push('department = ?')
    values.push(body.department.trim() || null)
  }
  if (req.file) {
    const isJpeg = req.file.mimetype === 'image/jpeg'
      && req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff
    const isPng = req.file.mimetype === 'image/png'
      && req.file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    if (!isJpeg && !isPng) {
      return res.status(400).json({ message: 'Upload a valid JPEG or PNG image.' })
    }
  }

  const changingPassword = Object.hasOwn(body, 'newPassword')
  if (changingPassword !== Object.hasOwn(body, 'currentPassword')) {
    return res.status(400).json({ message: 'Enter your current password and a new password to change credentials.' })
  }
  if (changingPassword) {
    if (typeof body.currentPassword !== 'string' || !body.currentPassword
      || typeof body.newPassword !== 'string' || !body.newPassword) {
      return res.status(400).json({ message: 'Enter your current password and a new password to change credentials.' })
    }
    try {
      const [[account]] = await pool.execute(
        'SELECT password FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      )
      if (!account || !(await bcrypt.compare(body.currentPassword, account.password))) {
        return res.status(401).json({ message: 'Your current password is incorrect.' })
      }

      const [[policy]] = await pool.execute(
        `SELECT min_password_length AS minPasswordLength,
                require_password_mixed_case AS requireMixedCase,
                require_password_number AS requireNumber
         FROM system_security_policy WHERE id = 1`
      )
      if (!policy) throw new Error('The system security policy is missing.')
      const newPassword = body.newPassword
      const meetsPolicy = newPassword.length >= Number(policy.minPasswordLength)
        && newPassword.length <= 72
        && (!policy.requireMixedCase || (/[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword)))
        && (!policy.requireNumber || /\d/.test(newPassword))
      if (!meetsPolicy) {
        return res.status(400).json({ message: 'The new password does not meet the configured password policy.' })
      }
      assignments.push('password = ?', 'password_changed_at = NOW()', 'failed_login_attempts = 0', 'locked_until = NULL', 'token_version = token_version + 1')
      values.push(await bcrypt.hash(newPassword, 10))
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') return next(error)
      return next(error)
    }
  }

  if (!assignments.length && !req.file) {
    return res.status(400).json({ message: 'Update at least one profile field.' })
  }

  let newAvatarPath
  let avatarPersisted = false
  try {
    let oldAvatarPath
    if (req.file) {
      const [[currentProfile]] = await pool.execute(
        'SELECT avatar_path AS avatarPath FROM users WHERE id = ? LIMIT 1',
        [req.user.id]
      )
      if (!currentProfile) return res.status(404).json({ message: 'Your account could not be found.' })
      oldAvatarPath = currentProfile.avatarPath
      await fs.mkdir(avatarDirectory, { recursive: true })
      const extension = req.file.mimetype === 'image/png' ? '.png' : '.jpg'
      const filename = `${req.user.id}-${crypto.randomUUID()}${extension}`
      await fs.writeFile(path.join(avatarDirectory, filename), req.file.buffer, { flag: 'wx' })
      newAvatarPath = `/uploads/staff-avatars/${filename}`
      assignments.push('avatar_path = ?')
      values.push(newAvatarPath)
    }
    values.push(req.user.id)
    await pool.execute(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, values)
    avatarPersisted = Boolean(newAvatarPath)
    const [rows] = await pool.execute(
      `SELECT id, full_name AS name, email, phone, department, role,
              avatar_path AS avatarPath, token_version AS tokenVersion
       FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Your account could not be found.' })
    const profile = rows[0]
    let token
    if (changingPassword) {
      const [[policy]] = await pool.execute(
        'SELECT session_timeout_minutes AS sessionTimeoutMinutes FROM system_security_policy WHERE id = 1'
      )
      const sessionTimeoutMinutes = Number(policy?.sessionTimeoutMinutes) || 480
      token = jwt.sign(
        { sub: String(profile.id), role: profile.role, name: profile.name, ver: profile.tokenVersion },
        process.env.JWT_SECRET,
        { expiresIn: `${sessionTimeoutMinutes}m` }
      )
    }
    delete profile.tokenVersion
    if (oldAvatarPath && oldAvatarPath !== profile.avatarPath) {
      const oldFilename = path.basename(oldAvatarPath)
      if (/^\d+-[a-f0-9-]+\.(?:jpg|png)$/.test(oldFilename)) {
        fs.unlink(path.join(avatarDirectory, oldFilename)).catch((error) => {
          if (error.code !== 'ENOENT') console.error('Unable to remove previous staff profile image:', error.message)
        })
      }
    }
    return res.json({ profile, ...(token ? { token } : {}) })
  } catch (error) {
    if (newAvatarPath && !avatarPersisted) {
      fs.unlink(path.join(avatarDirectory, path.basename(newAvatarPath))).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') console.error('Unable to remove an unsaved staff profile image:', cleanupError.message)
      })
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A user with this email address already exists.' })
    }
    return next(error)
  }
}
