import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../config/db.js'
import { DEFAULT_TEMPORARY_PASSWORD } from '../utils/accountDefaults.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const studentPhotoDirectory = path.resolve(directory, '../../uploads/students')
const roles = ['Super Admin', 'School Admin', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor', 'Teacher', 'Student']
const permissions = ['users', 'setup', 'security', 'health', 'delegations', 'archive']

export async function getSystemStatus(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT setting_key AS settingKey, setting_value AS settingValue
       FROM school_settings
       WHERE setting_key IN ('is_system_active', 'closure_message')`
    )
    const settings = Object.fromEntries(rows.map((row) => [row.settingKey, row.settingValue]))
    res.json({
      isSystemActive: settings.is_system_active !== 'false',
      closureMessage: settings.closure_message || '',
    })
  } catch (error) {
    next(error)
  }
}

export async function toggleSystemStatus(req, res, next) {
  const isSystemActive = req.body?.isSystemActive
  const closureMessage = typeof req.body?.closureMessage === 'string'
    ? req.body.closureMessage.trim().slice(0, 500)
    : ''

  if (typeof isSystemActive !== 'boolean') {
    return res.status(400).json({ message: 'Provide a valid system status.' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(
      `INSERT INTO school_settings (setting_key, setting_value, school_id)
       VALUES ('is_system_active', ?, 1)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [isSystemActive ? 'true' : 'false']
    )
    await connection.execute(
      `INSERT INTO school_settings (setting_key, setting_value, school_id)
       VALUES ('closure_message', ?, 1)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [closureMessage]
    )
    await connection.commit()
    res.json({ isSystemActive, closureMessage })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
}

export async function getSystemAccess(req, res, next) {
  if (req.user.role === 'Super Admin') return res.json({ isSuperAdmin: true, role: req.user.role, permissions })
  try {
    const [rows] = await pool.execute(
      `SELECT permissions FROM admin_delegations
       WHERE delegated_user_id = ? AND revoked_at IS NULL
         AND starts_at <= NOW() AND expires_at > NOW()`,
      [req.user.id]
    )
    const granted = new Set()
    for (const row of rows) {
      try {
        const values = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions
        if (Array.isArray(values)) values.forEach((value) => { if (permissions.includes(value)) granted.add(value) })
      } catch {
        continue
      }
    }
    return res.json({ isSuperAdmin: false, role: req.user.role, permissions: [...granted] })
  } catch (error) { return next(error) }
}

async function getAssignedSchoolId(userId) {
  const [[schoolAdmin]] = await pool.execute(
    'SELECT school_id FROM users WHERE id = ? AND role = ? LIMIT 1',
    [userId, 'School Admin']
  )
  if (validId(schoolAdmin?.school_id)) return schoolAdmin.school_id
  const [assignments] = await pool.execute(
    'SELECT school_id FROM school_admin_assignments WHERE user_id = ? ORDER BY assigned_at DESC LIMIT 1',
    [userId]
  )
  return assignments[0]?.school_id
}

async function validateTeacherClassAssignments(executor, schoolId, assignments) {
  if (!Array.isArray(assignments) || assignments.length < 1 || assignments.length > 100) {
    return { error: 'Assign at least one class section to the teacher.' }
  }
  const normalized = assignments.map((item) => ({
    sectionId: Number(item?.sectionId),
    subject: typeof item?.subject === 'string' ? item.subject.trim() : '',
  }))
  if (normalized.some((item) => !validId(item.sectionId) || !item.subject || item.subject.length > 100)
    || new Set(normalized.map((item) => `${item.sectionId}:${item.subject.toLowerCase()}`)).size !== normalized.length) {
    return { error: 'Each assigned class needs a valid section and subject, without duplicates.' }
  }
  const sectionIds = [...new Set(normalized.map((item) => item.sectionId))]
  const [sections] = await executor.execute(
    `SELECT id FROM school_sections
     WHERE school_id = ? AND is_active = TRUE AND id IN (${sectionIds.map(() => '?').join(', ')})`,
    [schoolId, ...sectionIds]
  )
  if (sections.length !== sectionIds.length) return { error: 'Choose active class sections from your assigned school.' }
  return { assignments: normalized }
}

async function replaceTeacherClassAssignments(executor, teacherId, schoolId, assignments) {
  const [existingAssignments] = await executor.execute(
    `SELECT assignment.id, assignment.section_id AS sectionId, assignment.subject
     FROM teacher_class_assignments assignment
     WHERE assignment.teacher_id = ? AND assignment.school_id = ?`,
    [teacherId, schoolId]
  )
  const existingByKey = new Map(existingAssignments.map((assignment) => [
    `${assignment.sectionId}:${assignment.subject.toLowerCase()}`,
    assignment,
  ]))
  const desiredKeys = new Set(assignments.map((assignment) => (
    `${assignment.sectionId}:${assignment.subject.toLowerCase()}`
  )))
  for (const assignment of existingAssignments) {
    const key = `${assignment.sectionId}:${assignment.subject.toLowerCase()}`
    if (!desiredKeys.has(key)) {
      await executor.execute('DELETE FROM teacher_class_assignments WHERE id = ?', [assignment.id])
    } else {
      const desired = assignments.find((item) => `${item.sectionId}:${item.subject.toLowerCase()}` === key)
      if (desired.subject !== assignment.subject) {
        await executor.execute(
          'UPDATE teacher_class_assignments SET subject = ? WHERE id = ?',
          [desired.subject, assignment.id]
        )
      }
    }
  }
  await executor.execute('DELETE FROM teacher_subject_assignments WHERE teacher_id = ? AND school_id = ?', [teacherId, schoolId])
  for (const assignment of assignments) {
    const [[section]] = await executor.execute(
      'SELECT grade_level AS gradeLevel FROM school_sections WHERE id = ? AND school_id = ? LIMIT 1',
      [assignment.sectionId, schoolId]
    )
    const [subjectResult] = await executor.execute(
      `INSERT INTO school_subjects (school_id, name) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [schoolId, assignment.subject]
    )
    await executor.execute(
      `INSERT INTO teacher_subject_assignments
         (teacher_id, school_id, subject_id, grade_level, section_id)
       VALUES (?, ?, ?, ?, ?)`,
      [teacherId, schoolId, subjectResult.insertId, section.gradeLevel, assignment.sectionId]
    )
    if (!existingByKey.has(`${assignment.sectionId}:${assignment.subject.toLowerCase()}`)) {
      await executor.execute(
        `INSERT INTO teacher_class_assignments (teacher_id, school_id, section_id, subject)
         VALUES (?, ?, ?, ?)`,
        [teacherId, schoolId, assignment.sectionId, assignment.subject]
      )
    }
  }
}

async function getTeacherClassAssignments(executor, teacherId, schoolId) {
  const [rows] = await executor.execute(
    `SELECT assignment.section_id AS sectionId, section.grade_level AS gradeLevel,
            section.section_name AS sectionName, assignment.subject
     FROM teacher_class_assignments assignment
     JOIN school_sections section ON section.id = assignment.section_id
     WHERE assignment.teacher_id = ? AND assignment.school_id = ?
     ORDER BY section.grade_level, section.section_name, assignment.subject`,
    [teacherId, schoolId]
  )
  return rows
}

async function hasUnarchivedGrades(executor, assignmentIds) {
  if (!assignmentIds.length) return false
  const [rows] = await executor.execute(
    `SELECT grade.assignment_id
     FROM student_grades grade
     LEFT JOIN permanent_academic_records archived
       ON archived.assignment_id = grade.assignment_id
       AND archived.student_id = grade.student_id
       AND archived.academic_year_id = grade.academic_year_id
       AND archived.term_id = grade.term_id
     WHERE grade.assignment_id IN (${assignmentIds.map(() => '?').join(', ')})
       AND archived.id IS NULL
     LIMIT 1`,
    assignmentIds
  )
  return rows.length > 0
}

function validId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0 && Number.isSafeInteger(Number(value))
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function formatSemesterName(name) {
  if (!name) return null
  const trimmed = String(name).trim()
  const match = trimmed.match(/^(?:term|semester|semister)\s*(.*)$/i)
  return match ? `Semester ${match[1]}`.trim() : trimmed
}

async function getPolicy() {
  const [rows] = await pool.execute('SELECT * FROM system_security_policy WHERE id = 1')
  if (!rows.length) throw new Error('Security policy is missing. Run backend/admin_workspace.sql.')
  return rows[0]
}

function passwordMeetsPolicy(password, policy) {
  return typeof password === 'string'
    && password.length >= policy.min_password_length
    && password.length <= 72
    && (!policy.require_password_mixed_case || (/[a-z]/.test(password) && /[A-Z]/.test(password)))
    && (!policy.require_password_number || /\d/.test(password))
}

function isProtectedDefaultAdminUser(user) {
  const protectedEmail = String(process.env.DEFAULT_ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase()
  return Boolean(user?.email) && user.email.toLowerCase() === protectedEmail
}

export async function listUsers(req, res, next) {
  try {
    let rows
    if (req.user.role === 'School Admin') {
      const schoolId = await getAssignedSchoolId(req.user.id)
      if (!validId(schoolId)) {
        return res.status(403).json({ message: 'Your account is not assigned to a school. Contact a Super Admin.' })
      }
      ;[rows] = await pool.execute(
        `SELECT id, full_name AS name, email, role, grade_level AS gradeLevel,
                is_active AS isActive, failed_login_attempts AS failedLoginAttempts,
                locked_until AS lockedUntil, created_at AS createdAt
         FROM users WHERE school_id = ? ORDER BY id DESC LIMIT 500`,
        [schoolId]
      )
    } else {
      ;[rows] = await pool.execute(
        `SELECT id, full_name AS name, email, role, grade_level AS gradeLevel,
                is_active AS isActive, failed_login_attempts AS failedLoginAttempts,
                locked_until AS lockedUntil, created_at AS createdAt
         FROM users
         WHERE role = 'School Admin'
         ORDER BY id DESC
         LIMIT 500`
      )
    }
    res.json(rows)
  } catch (error) { next(error) }
}

export async function listSchoolAdmins(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name AS name, email, role, grade_level AS gradeLevel,
              is_active AS isActive, failed_login_attempts AS failedLoginAttempts,
              locked_until AS lockedUntil, created_at AS createdAt
       FROM users
       WHERE role = 'School Admin'
       ORDER BY id DESC
       LIMIT 500`
    )

    if (!rows.length) return res.json([])

    const ids = rows.map((row) => row.id)
    const placeholders = ids.map(() => '?').join(', ')
    const [assignments] = await pool.execute(
      `SELECT u.id AS userId, s.id, s.name, s.code, s.status,
              s.region, s.zone, s.wereda
       FROM users u
       LEFT JOIN school_admin_assignments saa ON saa.user_id = u.id
       LEFT JOIN schools s ON s.id = COALESCE(saa.school_id, u.school_id)
       WHERE u.role = 'School Admin' AND u.id IN (${placeholders})
       ORDER BY s.name, s.id`,
      ids
    )

    const schoolsByUser = new Map()
    assignments.forEach((school) => {
      const current = schoolsByUser.get(school.userId) || []
      if (school.id) {
        current.push({
          id: school.id,
          name: school.name,
          code: school.code,
          status: school.status,
          region: school.region || '',
          zone: school.zone || '',
          woreda: school.wereda || '',
        })
      }
      schoolsByUser.set(school.userId, current)
    })

    res.json(rows.map((row) => ({
      ...row,
      assignedSchools: schoolsByUser.get(row.id) || [],
    })))
  } catch (error) {
    next(error)
  }
}

export async function listSchoolStaff(req, res, next) {
  try {
    const schoolId = await getAssignedSchoolId(req.user.id)
    if (!validId(schoolId)) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const [rows] = await pool.execute(
      `SELECT users.id, users.full_name AS name, users.email, users.username, users.role,
              users.department, users.subjects,
              teachers.woreda_employee_id AS woredaEmployeeId,
              teachers.phone_number AS phoneNumber,
              teachers.specialization, teachers.qualification_degree AS qualificationDegree,
              users.is_active AS isActive, users.created_at AS createdAt
       FROM users
       LEFT JOIN teachers ON teachers.id = users.id AND teachers.school_id = users.school_id
      WHERE users.school_id = ? AND users.role IN ('Teacher', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor')
       ORDER BY users.role, users.full_name, users.id DESC`,
      [schoolId]
    )
    return res.json(rows)
  } catch (error) { return next(error) }
}

export async function getSchoolStaffMember(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid staff ID.' })
  try {
    const schoolId = await getAssignedSchoolId(req.user.id)
    if (!validId(schoolId)) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const [rows] = await pool.execute(
      `SELECT users.id, users.full_name AS name, users.email, users.username, users.role,
              users.department, users.subjects,
              teachers.woreda_employee_id AS woredaEmployeeId,
              teachers.phone_number AS phoneNumber,
              teachers.specialization, teachers.qualification_degree AS qualificationDegree,
              users.is_active AS isActive, users.created_at AS createdAt
       FROM users
       LEFT JOIN teachers ON teachers.id = users.id AND teachers.school_id = users.school_id
      WHERE users.id = ? AND users.school_id = ?
        AND users.role IN ('Teacher', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor')
       LIMIT 1`,
      [req.params.id, schoolId]
    )
    if (!rows.length) return res.status(404).json({ message: 'Staff member not found in your school.' })
    return res.json({
      ...rows[0],
      classAssignments: rows[0].role === 'Teacher'
        ? await getTeacherClassAssignments(pool, rows[0].id, schoolId)
        : [],
    })
  } catch (error) { return next(error) }
}

export async function updateSchoolStaffMember(req, res, next) {
  const { id } = req.params
  const body = req.body ?? {}
  if (!validId(id)) return res.status(400).json({ message: 'Provide a valid staff ID.' })
  if (Object.hasOwn(body, 'role') || Object.hasOwn(body, 'classAssignments') || Object.hasOwn(body, 'subjects')) {
    return res.status(403).json({ message: 'Manage staff roles through Role Assign and teacher workloads through the Vice Principal workload module.' })
  }
  const fields = ['name', 'email', 'department', 'isActive']
  if (!fields.some((field) => Object.hasOwn(body, field))) {
    return res.status(400).json({ message: 'Provide at least one staff field to update.' })
  }
  if (Object.hasOwn(body, 'name') && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)) {
    return res.status(400).json({ message: 'Staff name is required and must be at most 100 characters.' })
  }
  if (Object.hasOwn(body, 'email') && (typeof body.email !== 'string'
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) || body.email.trim().length > 100)) {
    return res.status(400).json({ message: 'Provide a valid email address of at most 100 characters.' })
  }
  if (Object.hasOwn(body, 'department') && (typeof body.department !== 'string' || body.department.trim().length > 100)) {
    return res.status(400).json({ message: 'Department must be at most 100 characters.' })
  }
  if (Object.hasOwn(body, 'isActive') && typeof body.isActive !== 'boolean') {
    return res.status(400).json({ message: 'Account status must be active or inactive.' })
  }

  let connection
  try {
    const schoolId = await getAssignedSchoolId(req.user.id)
    if (!validId(schoolId)) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const [targets] = await pool.execute(
      `SELECT id, role, department, subjects FROM users
        WHERE id = ? AND school_id = ? AND role IN ('Teacher', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor') LIMIT 1`,
      [id, schoolId]
    )
    if (!targets.length) return res.status(404).json({ message: 'Staff member not found in your school.' })
    const updatedRole = targets[0].role
    const updatedDepartment = body.department ?? targets[0].department
    const changingTeacherProfile = Object.hasOwn(body, 'department')
    if (updatedRole === 'Teacher' && changingTeacherProfile && !String(updatedDepartment || '').trim()) {
      return res.status(400).json({ message: 'Teacher specialization is required.' })
    }
    const assignments = []
    const values = []
    if (Object.hasOwn(body, 'name')) { assignments.push('full_name = ?'); values.push(body.name.trim()) }
    if (Object.hasOwn(body, 'email')) { assignments.push('email = ?'); values.push(body.email.trim().toLowerCase()) }
    if (Object.hasOwn(body, 'department')) { assignments.push('department = ?'); values.push(body.department.trim() || null) }
    if (Object.hasOwn(body, 'isActive')) {
      assignments.push('is_active = ?', 'token_version = token_version + 1')
      values.push(body.isActive)
      if (body.isActive) assignments.push('failed_login_attempts = 0, locked_until = NULL')
    }
    values.push(id, schoolId)
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute(`UPDATE users SET ${assignments.join(', ')} WHERE id = ? AND school_id = ?`, values)
    await connection.execute(
      `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
       VALUES (?, ?, 'staff.updated', 'users', ?)`,
      [req.user.id, req.user.role, JSON.stringify({ userId: Number(id), schoolId, changes: Object.keys(body) })]
    )
    await connection.commit()
    return res.json({ message: 'Staff member updated.' })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A user with this email address already exists.' })
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function deleteSchoolStaffMember(req, res, next) {
  const { id } = req.params
  if (!validId(id)) return res.status(400).json({ message: 'Provide a valid staff ID.' })
  try {
    const schoolId = await getAssignedSchoolId(req.user.id)
    if (!validId(schoolId)) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [targets] = await connection.execute(
        `SELECT id FROM users
         WHERE id = ? AND school_id = ?
           AND role IN ('Teacher', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor')
         LIMIT 1`,
        [id, schoolId]
      )
      if (!targets.length) {
        await connection.rollback()
        return res.status(404).json({ message: 'Staff member not found in your school.' })
      }

      const knownRelatedTables = ['teacher_workloads', 'section_advisors', 'user_school_assignments']
      const candidateColumns = ['user_id', 'staff_id', 'member_id', 'teacher_id', 'advisor_id']
      for (const tableName of knownRelatedTables) {
        const [tableRows] = await connection.execute(
          `SELECT column_name, is_nullable
           FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = ?
           AND column_name IN ('user_id', 'staff_id', 'member_id', 'teacher_id', 'advisor_id')`,
          [tableName]
        )
        for (const column of tableRows) {
          const columnName = String(column.column_name).replace(/[^a-zA-Z0-9_]/g, '')
          if (!candidateColumns.includes(columnName)) continue
          if (column.is_nullable === 'YES') {
            await connection.execute(`UPDATE \`${tableName}\` SET \`${columnName}\` = NULL WHERE \`${columnName}\` = ?`, [id])
          } else {
            await connection.execute(`DELETE FROM \`${tableName}\` WHERE \`${columnName}\` = ?`, [id])
          }
        }
      }

      const [foreignKeys] = await connection.execute(
        `SELECT kcu.table_name, kcu.column_name, c.is_nullable
         FROM information_schema.key_column_usage kcu
         JOIN information_schema.columns c
           ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
         WHERE kcu.referenced_table_schema = DATABASE()
           AND kcu.referenced_table_name = 'users'
           AND kcu.referenced_column_name = 'id'
           AND kcu.table_schema = DATABASE()`
      )
      for (const foreignKey of foreignKeys) {
        const tableName = String(foreignKey.table_name).replace(/[^a-zA-Z0-9_]/g, '')
        const columnName = String(foreignKey.column_name).replace(/[^a-zA-Z0-9_]/g, '')
        if (!tableName || !columnName) continue
        if (foreignKey.is_nullable === 'YES') {
          await connection.execute(`UPDATE \`${tableName}\` SET \`${columnName}\` = NULL WHERE \`${columnName}\` = ?`, [id])
        } else {
          await connection.execute(`DELETE FROM \`${tableName}\` WHERE \`${columnName}\` = ?`, [id])
        }
      }

      const [result] = await connection.execute(
        `DELETE FROM users
         WHERE id = ? AND school_id = ?
           AND role IN ('Teacher', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor')`,
        [id, schoolId]
      )
      if (!result.affectedRows) {
        await connection.rollback()
        return res.status(404).json({ message: 'Staff member not found in your school.' })
      }
      await connection.execute(
        `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
         VALUES (?, ?, 'staff.deleted', 'users', ?)`,
        [req.user.id, req.user.role, JSON.stringify({ userId: Number(id), schoolId })]
      )
      await connection.commit()
      return res.json({ message: 'Staff member permanently deleted.' })
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  } catch (error) { return next(error) }
}

export async function createWoredaTeacher(req, res, next) {
  const body = req.body ?? {}
  const employeeId = typeof body.woredaEmployeeId === 'string' ? body.woredaEmployeeId.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const phone = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
  const gender = body.gender
  const specialization = typeof body.specialization === 'string' ? body.specialization.trim() : ''
  const qualification = typeof body.qualificationDegree === 'string' ? body.qualificationDegree.trim() : ''
  const credential = typeof body.usernameOrEmail === 'string' ? body.usernameOrEmail.trim() : ''
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credential)
  const isUsername = /^[a-zA-Z0-9._-]{3,60}$/.test(credential)
  if (!employeeId || employeeId.length > 50 || !name || name.length > 100
    || phone.length < 5 || phone.length > 40 || !['Male', 'Female'].includes(gender)
    || !specialization || specialization.length > 100
    || !qualification || qualification.length > 100 || (!isEmail && !isUsername)) {
    return res.status(400).json({
      message: 'Enter the Woreda employee ID, full name, valid phone number, gender, specialization, qualification, and a valid email address or username.',
    })
  }
  try {
    const schoolId = await getAssignedSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your School Admin account is not assigned to a school.' })
    }
    const [[school]] = await pool.execute(
      "SELECT id FROM schools WHERE id = ? AND status = 'active' LIMIT 1",
      [schoolId]
    )
    if (!school) return res.status(403).json({ message: 'Your assigned school is not active.' })
    const passwordHash = await bcrypt.hash(DEFAULT_TEMPORARY_PASSWORD, 10)
    const email = isEmail ? credential.toLowerCase() : `teacher-${crypto.randomUUID()}@accounts.school.local`
    const username = isEmail ? null : credential.toLowerCase()
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [userResult] = await connection.execute(
        `INSERT INTO users
           (full_name, email, username, phone, gender, password, role, grade_level, is_active,
            registration_source, registered_by, school_id, department, subjects, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, 'Teacher', 'N/A', TRUE, 'admin', ?, ?, ?, ?, TRUE)`,
        [name, email, username, phone, gender, passwordHash, req.user.id, schoolId, specialization, specialization]
      )
      await connection.execute(
        `INSERT INTO teachers
           (id, school_id, woreda_employee_id, phone_number, specialization, qualification_degree)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userResult.insertId, schoolId, employeeId, phone, specialization, qualification]
      )
      await connection.execute(
        `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
         VALUES (?, ?, 'teacher.woreda_onboarded', 'teachers', ?)`,
        [req.user.id, req.user.role, JSON.stringify({
          teacherId: userResult.insertId, schoolId, woredaEmployeeId: employeeId,
        })]
      )
      await connection.commit()
      return res.status(201).json({
        id: Number(userResult.insertId),
        name,
        woredaEmployeeId: employeeId,
        gender,
        usernameOrEmail: isEmail ? email : username,
        mustChangePassword: true,
        message: 'Teacher onboarded. The temporary password must be changed on first sign-in.',
      })
    } catch (error) {
      await connection.rollback()
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'The Woreda employee ID or system credential is already in use.' })
      }
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    return next(error)
  }
}

export async function createUser(req, res, next) {
  const { name, email, role } = req.body ?? {}
  const isRegistrar = role === 'Registrar'
  const employeeId = typeof req.body?.employeeId === 'string' ? req.body.employeeId.trim() : ''
  const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : ''
  const gender = req.body?.gender
  const usernameOrEmail = typeof req.body?.usernameOrEmail === 'string'
    ? req.body.usernameOrEmail.trim()
    : ''
  let schoolId = req.body?.schoolId ?? req.body?.school_id
  if (schoolId === '') schoolId = undefined
  const submittedName = isRegistrar ? req.body?.fullName ?? name : name
  const cleanName = typeof submittedName === 'string' ? submittedName.trim() : ''
  const credential = isRegistrar ? usernameOrEmail : typeof email === 'string' ? email.trim() : ''
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credential)
  const isUsername = /^[a-zA-Z0-9._-]{3,60}$/.test(credential)
  const cleanEmail = isRegistrar
    ? isEmail ? credential.toLowerCase() : ''
    : typeof email === 'string' ? email.trim().toLowerCase() : ''
  const cleanUsername = isRegistrar && isUsername && !isEmail ? credential.toLowerCase() : null
  if (role === 'Student') {
    return res.status(403).json({ message: 'Student accounts must be created through the Registrar student registration workflow.' })
  }
  if (['Teacher', 'Registrar', 'Vice Principal'].includes(role) && req.user.role !== 'School Admin') {
    return res.status(403).json({ message: 'Only a School Admin can create staff accounts for an assigned school.' })
  }
  if (role === 'Teacher') {
    return res.status(400).json({ message: 'Use Woreda-Deployed Teacher Registration to create teacher accounts.' })
  }
  if (role === 'Vice Principal') {
    return res.status(400).json({ message: 'Assign the Vice Principal role to an existing staff account through Role Assign.' })
  }
  const allowedRoles = req.user.role === 'Super Admin'
    ? ['School Admin']
    : ['Registrar']
  if (!cleanName || cleanName.length > 100) {
    return res.status(400).json({ message: 'A name is required and must be at most 100 characters.' })
  }
  if (isRegistrar) {
    if (!employeeId || employeeId.length > 50
      || phoneNumber.length > 40 || phoneNumber.replace(/\D/g, '').length < 7
      || !['Male', 'Female'].includes(gender)
      || (!isEmail && !isUsername)
      || (isEmail && credential.length > 100)) {
      return res.status(400).json({
        message: 'Enter a valid full name, employee ID, phone number, gender, and email address or username.',
      })
    }
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 100) {
    return res.status(400).json({ message: 'Provide a valid email address of at most 100 characters.' })
  }
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: 'Select a role you are permitted to register.' })
  }
  if (Array.isArray(req.body?.classAssignments) && req.body.classAssignments.length > 0) {
    return res.status(403).json({ message: 'Teacher workloads can only be managed through the Vice Principal workload module.' })
  }
  try {
    if (req.user.role === 'School Admin') {
      const assignedSchoolId = await getAssignedSchoolId(req.user.id)
      if (!validId(assignedSchoolId)) {
        return res.status(403).json({ message: 'Your account is not assigned to a school. Contact a Super Admin.' })
      }
      if (schoolId !== undefined && String(schoolId) !== String(assignedSchoolId)) {
        return res.status(403).json({ message: 'You can only register users for your assigned school.' })
      }
      schoolId = assignedSchoolId
    }
    if (!validId(schoolId)) {
      return res.status(400).json({ message: 'An assigned school ID is required.' })
    }
    const [schools] = await pool.execute(
      "SELECT id FROM schools WHERE id = ? AND status = 'active' LIMIT 1",
      [schoolId]
    )
    if (!schools.length) return res.status(400).json({ message: 'Select an active school.' })
    if (isRegistrar) {
      const [existingEmployee] = await pool.execute(
        "SELECT id FROM users WHERE school_id = ? AND employee_id = ? AND role = 'Registrar' LIMIT 1",
        [schoolId, employeeId]
      )
      if (existingEmployee.length) {
        return res.status(409).json({ message: 'An account with that employee ID already exists at this school.' })
      }
    }
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const passwordHash = await bcrypt.hash(DEFAULT_TEMPORARY_PASSWORD, 10)
      const accountEmail = cleanEmail || `registrar-${crypto.randomUUID()}@accounts.school.local`
      const [result] = await connection.execute(
        `INSERT INTO users
          (full_name, email, username, phone, employee_id, gender, password, role, grade_level,
           is_active, registration_source, registered_by, school_id, section, department, subjects,
           student_number, must_change_password)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'admin', ?, ?, ?, ?, ?, ?, TRUE)`,
        [
          cleanName,
          accountEmail,
          cleanUsername,
          isRegistrar ? phoneNumber : null,
          isRegistrar ? employeeId : null,
          isRegistrar ? gender : null,
          passwordHash,
          role,
          'N/A',
          req.user.id,
          schoolId,
          null,
          null,
          null,
          null,
        ]
      )
      if (role === 'School Admin') {
        await connection.execute(
          'INSERT INTO school_admin_assignments (school_id, user_id, assigned_by) VALUES (?, ?, ?)',
          [schoolId, result.insertId, req.user.id]
        )
      }
      await connection.execute(
        `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
         VALUES (?, ?, 'user.registered', 'users', ?)`,
        [req.user.id, req.user.role, JSON.stringify({ userId: result.insertId, role, schoolId })]
      )
      await connection.commit()
      return res.status(201).json({
        id: result.insertId,
        name: cleanName,
        email: cleanEmail || null,
        username: cleanUsername,
        employeeId: isRegistrar ? employeeId : null,
        phoneNumber: isRegistrar ? phoneNumber : null,
        gender: isRegistrar ? gender : null,
        role,
        schoolId: Number(schoolId),
        gradeLevel: 'N/A',
        section: null,
        department: null,
        subjects: null,
        classAssignments: [],
        studentNumber: null,
        isActive: true,
      })
    } catch (error) {
      await connection.rollback()
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'That email, username, or employee ID is already registered.' })
      }
      throw error
    } finally {
      connection.release()
    }
  } catch (error) {
    return next(error)
  }
}

export async function updateUser(req, res, next) {
  const id = req.params.id
  const { role, isActive } = req.body ?? {}
  if (!validId(id) || (role !== undefined && !roles.includes(role))
    || (isActive !== undefined && typeof isActive !== 'boolean')
    || (role === undefined && isActive === undefined)) {
    return res.status(400).json({ message: 'Provide a valid role and/or account status.' })
  }
  if (Number(id) === req.user.id && (role !== undefined || isActive === false)) {
    return res.status(400).json({ message: 'You cannot change your own role or disable your own account.' })
  }
  try {
    const [targets] = await pool.execute('SELECT id, role, email, school_id AS schoolId FROM users WHERE id = ? LIMIT 1', [id])
    if (!targets.length) return res.status(404).json({ message: 'User not found.' })
    if (isProtectedDefaultAdminUser(targets[0])) {
      return res.status(403).json({ message: 'The default Super Admin account is protected and cannot be modified.' })
    }
    if (req.user.role === 'Super Admin' && role !== undefined) {
      return res.status(403).json({ message: 'Super Admins may create School Admin accounts; staff roles must be assigned through School Admin workflows.' })
    }
    if (req.user.role === 'School Admin') {
      if (role === undefined || isActive !== undefined
        || !['Headmaster', 'Vice Principal', 'Supervisor'].includes(role)
        || !['Teacher', 'Registrar'].includes(targets[0].role)) {
        return res.status(403).json({ message: 'School Admins may assign leadership roles only to teachers and registrars.' })
      }
      const schoolId = await getAssignedSchoolId(req.user.id)
      if (!validId(schoolId) || Number(targets[0].schoolId) !== Number(schoolId)) {
        return res.status(403).json({ message: 'You can only manage staff assigned to your school.' })
      }
    }
    if (req.user.role !== 'Super Admin' && (targets[0].role === 'Super Admin' || role === 'Super Admin')) {
      return res.status(403).json({ message: 'Delegated administrators cannot change Super Admin accounts or roles.' })
    }
    if (targets[0].role === 'Super Admin' && (role !== undefined || isActive === false)) {
      const [admins] = await pool.execute(
        `SELECT COUNT(*) AS total FROM users WHERE role = 'Super Admin' AND is_active = TRUE`
      )
      if (Number(admins[0].total) <= 1) {
        return res.status(409).json({ message: 'The last active Super Admin cannot be changed or disabled.' })
      }
    }
    const assignments = []
    const values = []
    if (role !== undefined) { assignments.push('role = ?'); values.push(role) }
    if (isActive !== undefined) {
      assignments.push('is_active = ?')
      assignments.push('token_version = token_version + 1')
      values.push(isActive)
      if (isActive) assignments.push('failed_login_attempts = 0, locked_until = NULL')
    }
    values.push(id)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`, values)
      if (role !== undefined) {
        await connection.execute(
          `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
           VALUES (?, ?, 'user.role_updated', 'users', ?)`,
          [req.user.id, req.user.role, JSON.stringify({ userId: Number(id), previousRole: targets[0].role, role })]
        )
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    return res.json({ message: 'User account updated.' })
  } catch (error) { next(error) }
}

export async function assignStaffLeadershipRole(req, res, next) {
  const { id } = req.params
  const { role } = req.body ?? {}
  const leadershipRoles = ['Headmaster', 'Vice Principal', 'Supervisor']
  const eligibleStaffRoles = ['Teacher', 'Registrar', ...leadershipRoles]
  if (!validId(id) || !leadershipRoles.includes(role)) {
    return res.status(400).json({ message: 'Select a valid leadership role and staff member.' })
  }

  try {
    const schoolId = await getAssignedSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your account is not assigned to a school. Contact a Super Admin.' })
    }

    const [targets] = await pool.execute(
      'SELECT id, role, email, school_id AS schoolId FROM users WHERE id = ? LIMIT 1',
      [id]
    )
    if (!targets.length) return res.status(404).json({ message: 'Staff member not found.' })
    const target = targets[0]
    if (isProtectedDefaultAdminUser(target) || Number(target.schoolId) !== Number(schoolId)
      || !eligibleStaffRoles.includes(target.role)) {
      return res.status(403).json({ message: 'You can only assign leadership roles to staff in your own school.' })
    }

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute('UPDATE users SET role = ? WHERE id = ?', [role, id])
      await connection.execute(
        `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
         VALUES (?, ?, 'user.role_updated', 'users', ?)`,
        [req.user.id, req.user.role, JSON.stringify({ userId: Number(id), previousRole: target.role, role })]
      )
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }

    return res.json({ message: 'Leadership role assigned successfully.', userId: Number(id), role })
  } catch (error) {
    return next(error)
  }
}

export async function resetUserPassword(req, res, next) {
  const id = req.params.id
  const password = req.body?.password
  if (!validId(id)) return res.status(400).json({ message: 'Invalid user ID.' })
  try {
    const [target] = await pool.execute('SELECT role, email FROM users WHERE id = ? LIMIT 1', [id])
    if (!target.length) return res.status(404).json({ message: 'User not found.' })
    if (isProtectedDefaultAdminUser(target[0])) {
      return res.status(403).json({ message: 'The default Super Admin account password is protected.' })
    }
    if (req.user.role !== 'Super Admin' && target[0].role === 'Super Admin') {
      return res.status(403).json({ message: 'Delegated administrators cannot reset Super Admin passwords.' })
    }
    const policy = await getPolicy()
    if (!passwordMeetsPolicy(password, policy)) {
      return res.status(400).json({ message: `Password must be at least ${policy.min_password_length} characters and meet the configured security policy.` })
    }
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.execute(
      'UPDATE users SET password = ?, must_change_password = TRUE, password_changed_at = NOW(), failed_login_attempts = 0, locked_until = NULL, token_version = token_version + 1 WHERE id = ?',
      [hash, id]
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'User not found.' })
    res.json({ message: 'Password reset. The user must change it at next sign-in.' })
  } catch (error) { next(error) }
}

export async function unlockUser(req, res, next) {
  const id = req.params.id
  if (!validId(id)) return res.status(400).json({ message: 'Invalid user ID.' })
  try {
    const [target] = await pool.execute('SELECT role, email FROM users WHERE id = ? LIMIT 1', [id])
    if (!target.length) return res.status(404).json({ message: 'User not found.' })
    if (isProtectedDefaultAdminUser(target[0])) {
      return res.status(403).json({ message: 'The default Super Admin account is protected and cannot be unlocked.' })
    }
    if (req.user.role !== 'Super Admin' && target[0].role === 'Super Admin') {
      return res.status(403).json({ message: 'Delegated administrators cannot unlock Super Admin accounts.' })
    }
    const [result] = await pool.execute(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      [id]
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'User not found.' })
    res.json({ message: 'Account unlocked.' })
  } catch (error) { next(error) }
}

export async function getDashboardStats(req, res, next) {
  try {
    const schoolId = await getAssignedSchoolId(req.user.id)
    if (!validId(schoolId)) return res.status(403).json({ message: 'Your account is not assigned to a school.' })

    const [periodRows] = await pool.execute(
            `SELECT year.id AS academicYearId, semester.id AS semesterId,
              year.name AS academicYear, semester.name AS semester
       FROM academic_years year
       LEFT JOIN academic_terms semester ON semester.academic_year_id = year.id
         AND semester.school_id = year.school_id AND semester.is_current = TRUE
       WHERE year.school_id = ? AND year.is_active = TRUE
       ORDER BY year.start_date DESC, semester.start_date DESC LIMIT 1`,
      [schoolId]
    )
    const [[studentCount]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM students
       WHERE school_id = ? AND status <> 'Archived'`,
      [schoolId]
    )
    const [[teacherCount]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM users
       WHERE school_id = ? AND role = 'Teacher' AND is_active = TRUE`,
      [schoolId]
    )
    const [enrollmentRows] = await pool.execute(
      `SELECT COALESCE(grade, grade_level) AS gradeLevel, COUNT(*) AS total
       FROM students
       WHERE school_id = ? AND status = 'Active'
       GROUP BY COALESCE(grade, grade_level)`,
      [schoolId]
    )
    const [genderRows] = await pool.execute(
      `SELECT gender, COUNT(*) AS total FROM students
       WHERE school_id = ? AND status = 'Active' AND gender IN ('Male', 'Female')
       GROUP BY gender`,
      [schoolId]
    )
    const [sections] = periodRows[0]?.semesterId
      ? await pool.execute(
        `SELECT section.id, section.grade_level AS gradeLevel, section.section_name AS sectionName
         FROM school_sections section
         WHERE section.school_id = ? AND section.is_active = TRUE
           AND section.academic_year_id = ? AND section.academic_term_id = ?
         ORDER BY section.grade_level, section.section_name`,
        [schoolId, periodRows[0].academicYearId, periodRows[0].semesterId]
      )
      : [[]]
    const gradeLevels = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
    const enrollmentByGrade = gradeLevels.map((gradeLevel) => ({
      grade: gradeLevel,
      students: Number(enrollmentRows.find((row) => row.gradeLevel === gradeLevel)?.total || 0),
    }))
    const genderDistribution = ['Female', 'Male'].map((name) => ({
      name,
      value: Number(genderRows.find((row) => row.gender === name)?.total || 0),
    }))
    const sectionsByGrade = gradeLevels.map((gradeLevel) => ({
      gradeLevel,
      sections: sections.filter((section) => section.gradeLevel === gradeLevel).map((section) => ({
        id: section.id,
        sectionName: section.sectionName,
      })),
    }))
    const period = periodRows[0]
      ? { academicYear: periodRows[0].academicYear, semester: formatSemesterName(periodRows[0].semester) }
      : null

    return res.json({
      academicPeriod: period,
      totalRegisteredStudents: Number(studentCount.total),
      totalActiveTeachers: Number(teacherCount.total),
      totalActiveSections: sections.length,
      enrollmentByGrade,
      genderDistribution,
      sectionsByGrade,
    })
  } catch (error) {
    return next(error)
  }
}

export async function getSetup(req, res, next) {
  try {
    const isSchoolAdmin = req.user.role === 'School Admin'
    const schoolId = isSchoolAdmin ? await getAssignedSchoolId(req.user.id) : null
    if (isSchoolAdmin && !validId(schoolId)) {
      return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    }
    const [years] = await pool.execute(
      `SELECT y.id, y.name, y.start_date AS startDate, y.end_date AS endDate,
              y.is_active AS isActive
       FROM academic_years y ${isSchoolAdmin ? 'WHERE y.school_id = ?' : ''} ORDER BY y.start_date DESC`,
      isSchoolAdmin ? [schoolId] : []
    )
    const [terms] = await pool.execute(
      `SELECT t.id, t.academic_year_id AS academicYearId, t.name,
              t.start_date AS startDate, t.end_date AS endDate, t.is_active AS isActive,
              t.is_current AS isCurrent
       FROM academic_terms t ${isSchoolAdmin ? 'WHERE t.school_id = ?' : ''} ORDER BY t.start_date`,
      isSchoolAdmin ? [schoolId] : []
    )
    const [sections] = await pool.execute(
      `SELECT id, grade_level AS gradeLevel, section_name AS sectionName,
              is_active AS isActive FROM school_sections ${isSchoolAdmin ? 'WHERE school_id = ?' : ''} ORDER BY grade_level, section_name`,
      isSchoolAdmin ? [schoolId] : []
    )
    let school
    if (isSchoolAdmin) {
      const [rows] = await pool.execute(
        `SELECT id AS school_id, name AS school_name, code AS school_code, region, zone, wereda,
                contact_details, contact, stamp_path, logo_path, signature_path
         FROM schools WHERE id = ? LIMIT 1`,
        [schoolId]
      )
      if (!rows.length) return res.status(404).json({ message: 'Assigned school not found.' })
      school = rows[0]
    } else {
      const [settings] = await pool.execute('SELECT setting_key AS settingKey, setting_value AS settingValue FROM school_settings')
      school = Object.fromEntries(settings.map((item) => [item.settingKey, item.settingValue]))
    }
    return res.json({ years, terms, sections, school })
  } catch (error) { next(error) }
}

export async function saveSetup(req, res, next) {
  const body = req.body ?? {}
  const { school = {} } = body
  const saveAcademic = ['years', 'terms', 'sections'].some((key) => Object.hasOwn(body, key))
  const { years = [], terms = [], sections = [] } = body
  if ((saveAcademic && (!Array.isArray(years) || !Array.isArray(terms) || !Array.isArray(sections)))
    || !school || typeof school !== 'object' || Array.isArray(school)) {
    return res.status(400).json({ message: 'Invalid school configuration.' })
  }
  if (saveAcademic && (years.some((item) => !/^\d{4}\/\d{4}$/.test(item.name || '')
    || !validDate(item.startDate) || !validDate(item.endDate) || item.startDate >= item.endDate)
    || years.filter((item) => item.isActive === true).length > 1
    || terms.some((item) => !validId(item.academicYearId) || !item.name?.trim()
      || !validDate(item.startDate) || !validDate(item.endDate) || item.startDate >= item.endDate)
    || terms.filter((item) => item.isActive === true).length > 1
    || sections.some((item) => !['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].includes(item.gradeLevel)
      || !/^[A-Za-z0-9 -]{1,30}$/.test(item.sectionName || '')))) {
    return res.status(400).json({ message: 'Check academic year, term dates, grade levels, and section names.' })
  }
  const isSchoolAdmin = req.user.role === 'School Admin'
  const allowedSettings = isSchoolAdmin
    ? ['school_name', 'region', 'zone', 'wereda', 'contact_details', 'contact', 'stamp_path', 'logo_path', 'signature_path']
    : ['school_id', 'region', 'wereda', 'school_name', 'stamp_path', 'logo_path']
  if (Object.entries(school).some(([key, value]) => !allowedSettings.includes(key)
    || typeof value !== 'string' || value.length > 1000)) {
    return res.status(400).json({ message: 'Invalid school metadata.' })
  }
  if (isSchoolAdmin && Object.hasOwn(school, 'school_name')
    && (!school.school_name.trim() || school.school_name.length > 150)) {
    return res.status(400).json({ message: 'School name is required and must be at most 150 characters.' })
  }
  if (isSchoolAdmin && (['region', 'zone', 'wereda'].some((key) => (school[key] || '').length > 100)
    || ['contact', 'contact_details'].some((key) => (school[key] || '').length > 255)
    || ['stamp_path', 'logo_path', 'signature_path'].some((key) => (school[key] || '').length > 500))) {
    return res.status(400).json({ message: 'School metadata exceeds the allowed field lengths.' })
  }
  let connection
  try {
    const schoolId = isSchoolAdmin ? await getAssignedSchoolId(req.user.id) : 1
    if (isSchoolAdmin && !validId(schoolId)) {
      return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    }
    if (isSchoolAdmin && saveAcademic) {
      for (const term of terms) {
        const [academicYears] = await pool.execute(
          'SELECT id FROM academic_years WHERE id = ? AND school_id = ? LIMIT 1',
          [term.academicYearId, schoolId]
        )
        if (!academicYears.length) {
          return res.status(400).json({ message: 'Terms must belong to an academic year in your assigned school.' })
        }
      }
    }
    connection = await pool.getConnection()
    await connection.beginTransaction()
    if (saveAcademic) {
      await connection.execute('UPDATE academic_years SET is_active = FALSE WHERE school_id = ?', [schoolId])
      await connection.execute('UPDATE academic_terms SET is_active = FALSE, is_current = FALSE WHERE school_id = ?', [schoolId])
      for (const year of years) {
        await connection.execute(
          `INSERT INTO academic_years (name, start_date, end_date, is_active, school_id)
           VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE start_date = VALUES(start_date),
           end_date = VALUES(end_date), is_active = VALUES(is_active)`,
          [year.name, year.startDate, year.endDate, year.isActive === true, schoolId]
        )
      }
      for (const term of terms) {
        await connection.execute(
          `INSERT INTO academic_terms (academic_year_id, name, start_date, end_date, is_active, is_current, school_id)
           VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE start_date = VALUES(start_date),
           end_date = VALUES(end_date), is_active = VALUES(is_active), is_current = VALUES(is_current)`,
          [term.academicYearId, term.name.trim(), term.startDate, term.endDate, term.isActive === true, term.isActive === true, schoolId]
        )
      }
      for (const section of sections) {
        await connection.execute(
          `INSERT INTO school_sections (grade_level, section_name, is_active, school_id) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE is_active = VALUES(is_active)`,
          [section.gradeLevel, section.sectionName.trim(), section.isActive !== false, schoolId]
        )
      }
    }
    if (isSchoolAdmin) {
      const schoolUpdates = []
      const schoolValues = []
      const addSchoolUpdate = (key, column, value = school[key]) => {
        if (!Object.hasOwn(school, key)) return
        schoolUpdates.push(`${column} = ?`)
        schoolValues.push(value)
      }
      addSchoolUpdate('school_name', 'name')
      addSchoolUpdate('region', 'region')
      addSchoolUpdate('zone', 'zone')
      addSchoolUpdate('wereda', 'wereda')
      if (Object.hasOwn(school, 'contact_details') || Object.hasOwn(school, 'contact')) {
        const contact = school.contact_details ?? school.contact ?? ''
        schoolUpdates.push('contact_details = ?', 'contact = ?')
        schoolValues.push(contact, contact)
      }
      if (Object.hasOwn(school, 'logo_path')) {
        schoolUpdates.push('logo_path = ?', 'logo_url = ?')
        schoolValues.push(school.logo_path, school.logo_path)
      }
      if (Object.hasOwn(school, 'stamp_path')) {
        schoolUpdates.push('stamp_path = ?', 'stamp_url = ?')
        schoolValues.push(school.stamp_path, school.stamp_path)
      }
      if (Object.hasOwn(school, 'signature_path')) {
        schoolUpdates.push('signature_path = ?')
        schoolValues.push(school.signature_path)
      }
      if (schoolUpdates.length) {
        await connection.execute(
          `UPDATE schools SET ${schoolUpdates.join(', ')} WHERE id = ?`,
          [...schoolValues, schoolId]
        )
      }
    } else {
      for (const [key, value] of Object.entries(school)) {
        await connection.execute(
          `INSERT INTO school_settings (setting_key, setting_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [key, value]
        )
      }
    }
    await connection.commit()
    res.json({ message: 'School configuration saved.' })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally { connection?.release() }
}

export async function uploadSchoolAsset(req, res, next) {
  const assetType = req.body?.assetType
  if (!req.file || !['logo', 'stamp', 'signature'].includes(assetType)) {
    if (req.file) await fs.unlink(req.file.path)
    return res.status(400).json({ message: 'Select a school logo, official stamp, or principal signature image.' })
  }
  const settingKey = assetType === 'logo' ? 'logo_path' : assetType === 'stamp' ? 'stamp_path' : 'signature_path'
  const publicPath = `/uploads/school-assets/${req.file.filename}`
  try {
    if (req.user.role === 'School Admin') {
      const schoolId = await getAssignedSchoolId(req.user.id)
      if (!validId(schoolId)) {
        await fs.unlink(req.file.path)
        return res.status(403).json({ message: 'Your account is not assigned to a school.' })
      }
      const columns = assetType === 'logo' ? ['logo_path', 'logo_url']
        : assetType === 'stamp' ? ['stamp_path', 'stamp_url'] : ['signature_path']
      const [result] = await pool.execute(
        `UPDATE schools SET ${columns[0]} = ?${columns[1] ? `, ${columns[1]} = ?` : ''} WHERE id = ?`,
        columns[1] ? [publicPath, publicPath, schoolId] : [publicPath, schoolId]
      )
      if (!result.affectedRows) {
        await fs.unlink(req.file.path)
        return res.status(404).json({ message: 'Assigned school not found.' })
      }
    } else {
      await pool.execute(
        `INSERT INTO school_settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [settingKey, publicPath]
      )
    }
    res.status(201).json({ settingKey, path: publicPath })
  } catch (error) {
    await fs.unlink(req.file.path).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('Unable to remove unreferenced school asset:', cleanupError.message)
    })
    next(error)
  }
}

export async function getSecurityPolicy(_req, res, next) {
  try { res.json(await getPolicy()) } catch (error) { next(error) }
}

export async function saveSecurityPolicy(req, res, next) {
  const policy = req.body ?? {}
  const valid = Number.isInteger(policy.min_password_length) && policy.min_password_length >= 8 && policy.min_password_length <= 64
    && typeof policy.require_password_mixed_case === 'boolean'
    && typeof policy.require_password_number === 'boolean'
    && Number.isInteger(policy.max_failed_logins) && policy.max_failed_logins >= 3 && policy.max_failed_logins <= 20
    && Number.isInteger(policy.lockout_minutes) && policy.lockout_minutes >= 1 && policy.lockout_minutes <= 1440
    && Number.isInteger(policy.session_timeout_minutes) && policy.session_timeout_minutes >= 5 && policy.session_timeout_minutes <= 480
  if (!valid) return res.status(400).json({ message: 'Security policy values are outside allowed limits.' })
  try {
    await pool.execute(
      `UPDATE system_security_policy SET min_password_length = ?, require_password_mixed_case = ?,
       require_password_number = ?, max_failed_logins = ?, lockout_minutes = ?, session_timeout_minutes = ?
       WHERE id = 1`,
      [policy.min_password_length, policy.require_password_mixed_case, policy.require_password_number,
        policy.max_failed_logins, policy.lockout_minutes, policy.session_timeout_minutes]
    )
    res.json({ message: 'Security policy saved.' })
  } catch (error) { next(error) }
}

export async function getHealth(_req, res, next) {
  try {
    const started = Date.now()
    await pool.query('SELECT 1')
    res.json({
      status: 'healthy',
      database: { status: 'connected', responseMs: Date.now() - started },
      process: { uptimeSeconds: Math.floor(process.uptime()), memoryBytes: process.memoryUsage().rss },
      host: { platform: os.platform(), cpus: os.cpus().length, freeMemoryBytes: os.freemem(), totalMemoryBytes: os.totalmem() },
    })
  } catch (error) { next(error) }
}

export async function listDelegations(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT d.id, d.delegated_user_id AS userId, u.full_name AS userName,
              d.created_by AS createdBy, d.permissions, d.starts_at AS startsAt,
              d.expires_at AS expiresAt, d.revoked_at AS revokedAt
       FROM admin_delegations d JOIN users u ON u.id = d.delegated_user_id
       ORDER BY d.created_at DESC LIMIT 200`
    )
    res.json(rows)
  } catch (error) { next(error) }
}

export async function createDelegation(req, res, next) {
  const { userId, permissions: requestedPermissions, durationMinutes } = req.body ?? {}
  if (!validId(userId) || Number(userId) === req.user.id || !Array.isArray(requestedPermissions)
    || requestedPermissions.length < 1 || requestedPermissions.some((item) => !permissions.includes(item))
    || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) {
    return res.status(400).json({ message: 'Choose a different user, valid capabilities, and a duration up to 4 hours.' })
  }
  try {
    const [users] = await pool.execute('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1', [userId])
    if (!users.length || !users[0].is_active || users[0].role === 'Super Admin'
      || !['School Admin', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor'].includes(users[0].role)) {
      return res.status(400).json({ message: 'Delegation requires an active non-Super Admin account.' })
    }
    const [result] = await pool.execute(
      `INSERT INTO admin_delegations
        (delegated_user_id, created_by, permissions, starts_at, expires_at)
       VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [userId, req.user.id, JSON.stringify([...new Set(requestedPermissions)]), durationMinutes]
    )
    res.status(201).json({ id: result.insertId, message: 'Temporary delegation created.' })
  } catch (error) { next(error) }
}

export async function revokeDelegation(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid delegation ID.' })
  try {
    const [result] = await pool.execute(
      'UPDATE admin_delegations SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL',
      [req.params.id]
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Active delegation not found.' })
    res.json({ message: 'Delegation revoked.' })
  } catch (error) { next(error) }
}

export async function listArchivedStudents(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name AS name, u.grade_level AS gradeLevel, s.section,
              s.academic_year AS academicYear, s.status, s.created_at AS createdAt
       FROM users u JOIN student_records s ON s.user_id = u.id
       WHERE u.role = 'Student' AND s.status = 'Archived' ORDER BY u.id DESC`
    )
    res.json(rows)
  } catch (error) { next(error) }
}

export async function listGraduatedStudents(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name AS name, u.grade_level AS gradeLevel,
              s.section, s.academic_year AS academicYear, s.graduated_at AS graduatedAt
       FROM users u JOIN student_records s ON s.user_id = u.id
       WHERE u.role = 'Student' AND s.status = 'Active' AND s.graduated_at IS NOT NULL
       ORDER BY s.graduated_at DESC`
    )
    res.json(rows)
  } catch (error) { next(error) }
}

export async function listGraduationCandidates(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name AS name, u.grade_level AS gradeLevel,
              s.section, s.academic_year AS academicYear
       FROM users u JOIN student_records s ON s.user_id = u.id
       WHERE u.role = 'Student' AND u.is_active = TRUE AND u.grade_level = 'Grade 12'
         AND s.status = 'Active' AND s.graduated_at IS NULL
       ORDER BY u.full_name`
    )
    res.json(rows)
  } catch (error) { next(error) }
}

export async function markStudentGraduated(req, res, next) {
  const id = req.params.id
  if (!validId(id) || req.body?.confirmation !== `GRADUATED ${id}`) {
    return res.status(400).json({ message: `Explicit confirmation must be GRADUATED ${id}.` })
  }
  try {
    const [result] = await pool.execute(
      `UPDATE student_records s JOIN users u ON u.id = s.user_id
       SET s.graduated_at = NOW()
       WHERE u.id = ? AND u.role = 'Student' AND u.grade_level = 'Grade 12'
         AND u.is_active = TRUE AND s.status = 'Active' AND s.graduated_at IS NULL`,
      [id]
    )
    if (!result.affectedRows) {
      return res.status(409).json({ message: 'Only an active Grade 12 student not previously marked as graduated can be marked graduated.' })
    }
    res.json({ message: 'Student marked graduated. You may now archive the record.' })
  } catch (error) { next(error) }
}

export async function archiveStudent(req, res, next) {
  const id = req.params.id
  if (!validId(id) || req.body?.confirmation !== `ARCHIVE ${id}`) {
    return res.status(400).json({ message: `Explicit confirmation must be ARCHIVE ${id}.` })
  }
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, u.grade_level, s.section, s.academic_year
       FROM users u JOIN student_records s ON s.user_id = u.id
       WHERE u.id = ? AND u.role = 'Student' AND s.status = 'Active'
         AND s.graduated_at IS NOT NULL LIMIT 1`,
      [id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Only a marked-graduated active student record can be archived.' })
    const student = rows[0]
    const verificationCode = crypto.randomBytes(16).toString('hex')
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute(
        `INSERT INTO transcript_verifications
          (student_id, student_name, grade_level, section, academic_year, verification_code, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE student_name = VALUES(student_name), grade_level = VALUES(grade_level),
         section = VALUES(section), academic_year = VALUES(academic_year), verification_code = VALUES(verification_code),
         archived_at = NOW(), purged_at = NULL`,
        [student.id, student.full_name, student.grade_level, student.section, student.academic_year, verificationCode]
      )
      await connection.execute('UPDATE student_records SET status = ? WHERE user_id = ?', ['Archived', id])
      await connection.execute('UPDATE users SET is_active = FALSE WHERE id = ?', [id])
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally { connection.release() }
    res.json({ message: 'Student archived. Transcript verification remains available.', verificationCode })
  } catch (error) { next(error) }
}

export async function purgeArchivedStudent(req, res, next) {
  const id = req.params.id
  if (!validId(id) || req.body?.confirmation !== `PURGE ${id}`) {
    return res.status(400).json({ message: `Explicit confirmation must be PURGE ${id}.` })
  }
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [records] = await connection.execute(
      `SELECT u.id, s.photo_path AS photoPath FROM users u JOIN student_records s ON s.user_id = u.id
       JOIN transcript_verifications v ON v.student_id = u.id
       WHERE u.id = ? AND u.role = 'Student' AND s.status = 'Archived' LIMIT 1`,
      [id]
    )
    if (!records.length) {
      await connection.rollback()
      return res.status(409).json({ message: 'Only archived students with a transcript verification record can be purged.' })
    }
    await connection.execute('UPDATE transcript_verifications SET purged_at = NOW() WHERE student_id = ?', [id])
    await connection.execute('DELETE FROM student_records WHERE user_id = ?', [id])
    await connection.execute('DELETE FROM users WHERE id = ?', [id])
    await connection.commit()
    if (records[0].photoPath) {
      const photoName = path.basename(records[0].photoPath)
      try {
        await fs.unlink(path.join(studentPhotoDirectory, photoName))
      } catch (error) {
        if (error.code !== 'ENOENT') console.error('Unable to remove purged student photo:', error.message)
      }
    }
    res.json({ message: 'Student data purged; minimal transcript verification record retained.' })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally { connection?.release() }
}

export async function verifyTranscript(req, res, next) {
  const code = String(req.params.code ?? '')
  if (!/^[a-f0-9]{32}$/.test(code)) return res.status(400).json({ message: 'Invalid verification code.' })
  try {
    const [rows] = await pool.execute(
      `SELECT student_id AS studentId, student_name AS studentName, grade_level AS gradeLevel,
              section, academic_year AS academicYear, archived_at AS archivedAt,
              purged_at AS purgedAt
       FROM transcript_verifications WHERE verification_code = ? LIMIT 1`,
      [code]
    )
    if (!rows.length) return res.status(404).json({ message: 'No transcript verification record found.' })
    res.json({ verified: true, record: rows[0] })
  } catch (error) { next(error) }
}
