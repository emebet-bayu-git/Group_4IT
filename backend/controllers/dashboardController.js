import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { pool } from '../config/db.js'

const studentPhotoDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/students')
const studentGrades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const legacyAcademicOptions = {
  years: ['2026/2027', '2027/2028'],
  sections: studentGrades.flatMap((gradeLevel) => (
    ['Section A', 'Section B', 'Section C'].map((sectionName) => ({ gradeLevel, sectionName }))
  )),
}

async function getConfiguredAcademicOptions(executor = pool, schoolId = null) {
  const yearScope = schoolId ? ' WHERE school_id = ?' : ''
  const scopeValues = schoolId ? [schoolId] : []
  const [activeYears] = await executor.execute(
    `SELECT name FROM academic_years WHERE is_active = TRUE${schoolId ? ' AND school_id = ?' : ''} ORDER BY start_date DESC`,
    scopeValues
  )
  const [[yearCount]] = await executor.execute(`SELECT COUNT(*) AS total FROM academic_years${yearScope}`, scopeValues)
  const [activeSections] = await executor.execute(
    `SELECT grade_level AS gradeLevel, section_name AS sectionName
     FROM school_sections WHERE is_active = TRUE${schoolId ? ' AND school_id = ?' : ''} ORDER BY grade_level, section_name`,
    scopeValues
  )
  const [[sectionCount]] = await executor.execute(`SELECT COUNT(*) AS total FROM school_sections${yearScope}`, scopeValues)
  return {
    years: activeYears.length ? activeYears.map((row) => row.name) : Number(yearCount.total) ? [] : legacyAcademicOptions.years,
    sections: activeSections.length ? activeSections : Number(sectionCount.total) ? [] : legacyAcademicOptions.sections,
  }
}

async function removeUploadedPhoto(file) {
  if (!file) return
  try {
    await fs.unlink(file.path)
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to remove unreferenced student photo:', error.message)
  }
}

async function removeStoredStudentPhoto(photoUrl) {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith('/uploads/students/')) return
  const fileName = path.basename(photoUrl)
  if (!fileName) return
  try {
    await fs.unlink(path.join(studentPhotoDirectory, fileName))
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to remove unreferenced student photo:', error.message)
  }
}

async function getAccountSchoolId(userId) {
  const [[user]] = await pool.execute('SELECT school_id FROM users WHERE id = ? LIMIT 1', [userId])
  if (user?.school_id) return user.school_id
  const [assignments] = await pool.execute(
    'SELECT school_id FROM school_admin_assignments WHERE user_id = ? ORDER BY assigned_at DESC LIMIT 1',
    [userId]
  )
  return assignments[0]?.school_id
}

function validId(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0 && Number.isSafeInteger(Number(value))
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function listStudents(req, res, next) {
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const [rows] = await pool.execute(
          `SELECT student.user_id AS id, student.full_name AS name, student.email,
                  COALESCE(student.grade, student.grade_level) AS className, student.section, student.gender,
                  COALESCE(student.phone_number, student.phone) AS phone,
                  COALESCE(student.dob, student.date_of_birth) AS dateOfBirth,
                  student.guardian_name AS guardianName,
                  COALESCE(student.guardian_relation, student.relationship) AS guardianRelationship,
                  student.guardian_phone AS guardianPhone,
            student.guardian_email AS guardianEmail, student.address, student.photo_path AS photoUrl,
                  student.parent_photo_url AS parentPhotoUrl,
                  student.academic_year AS academicYear,
                  COALESCE(student.emergency_contact_phone, student.emergency_contact) AS emergencyContact,
                  student.emergency_contact_name AS emergencyContactName,
                  student.registration_date AS registrationDate,
            student.status, student.created_at AS createdAt
           FROM students student
          LEFT JOIN users account ON account.id = student.user_id AND account.school_id = student.school_id
           WHERE student.school_id = ?
           ORDER BY student.created_at DESC`,
      [schoolId]
    )
    return res.json(rows)
  } catch (error) {
    return next(error)
  }
}

export async function getStudent(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid student ID.' })
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const [rows] = await pool.execute(
      `SELECT student.user_id AS id, student.full_name AS fullName, student.email,
              COALESCE(student.dob, student.date_of_birth) AS dob, student.gender,
              COALESCE(student.grade, student.grade_level) AS grade, student.section,
              student.previous_school AS previousSchool, student.region, student.zone,
              student.woreda, student.kebele, student.house_no AS houseNo,
              COALESCE(student.phone_number, student.phone) AS phoneNumber,
              student.guardian_name AS guardianName,
              COALESCE(student.guardian_relation, student.relationship) AS guardianRelation,
              student.guardian_phone AS guardianPhone, student.guardian_email AS guardianEmail,
              student.emergency_contact_name AS emergencyContactName,
              COALESCE(student.emergency_contact_phone, student.emergency_contact) AS emergencyContactPhone,
              student.address, student.photo_path AS photoUrl,
              student.parent_photo_url AS parentPhotoUrl,
              student.academic_year AS academicYear, student.registration_date AS registrationDate,
              student.status
       FROM students student
       WHERE student.user_id = ? AND student.school_id = ?
       LIMIT 1`,
      [req.params.id, schoolId]
    )
    if (!rows.length) return res.status(404).json({ message: 'Student not found in your school.' })
    return res.json({ ...rows[0], studentId: String(rows[0].id) })
  } catch (error) {
    return next(error)
  }
}

export async function updateStudent(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid student ID.' })
  const cleanupUploadedPhotos = () => Promise.all([req.file, req.parentPhotoFile].filter(Boolean).map(removeUploadedPhoto))
  let connection
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) {
      await cleanupUploadedPhotos()
      return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    }
    const [existingRows] = await pool.execute(
      `SELECT student.*, account.full_name AS accountName
       FROM students student
       JOIN users account ON account.id = student.user_id AND account.school_id = student.school_id
       WHERE student.user_id = ? AND student.school_id = ? AND account.role = 'Student'
       LIMIT 1`,
      [req.params.id, schoolId]
    )
    if (!existingRows.length) {
      await cleanupUploadedPhotos()
      return res.status(404).json({ message: 'Student not found in your school.' })
    }
    const existing = existingRows[0]
    const body = req.body ?? {}
    const field = (name, oldValue, fallback = '') => (
      typeof body[name] === 'string' ? body[name].trim() : String(existing[oldValue] ?? fallback)
    )
    const fullName = field('fullName', 'full_name', existing.accountName)
    const dob = field('dob', 'dob', existing.date_of_birth)
    const gender = field('gender', 'gender')
    const grade = field('grade', 'grade', existing.grade_level)
    const section = field('section', 'section')
    const previousSchool = field('previousSchool', 'previous_school')
    const region = field('region', 'region')
    const zone = field('zone', 'zone')
    const woreda = field('woreda', 'woreda')
    const kebele = field('kebele', 'kebele')
    const houseNo = field('houseNo', 'house_no')
    const phoneNumber = field('phoneNumber', 'phone_number', existing.phone)
    const guardianName = field('guardianName', 'guardian_name')
    const guardianRelation = field('guardianRelation', 'guardian_relation', existing.relationship)
    const guardianPhone = field('guardianPhone', 'guardian_phone')
    const guardianEmail = field('guardianEmail', 'guardian_email')
    const emergencyContactName = field('emergencyContactName', 'emergency_contact_name')
    const emergencyContactPhone = field('emergencyContactPhone', 'emergency_contact_phone', existing.emergency_contact)
    const academicYear = field('academicYear', 'academic_year')
    const registrationDate = field('registrationDate', 'registration_date', new Date(existing.created_at).toISOString().slice(0, 10))
    const email = field('email', 'email')
    const address = [region, zone, woreda, kebele, houseNo].filter(Boolean).join(', ') || existing.address || ''
    const password = typeof body.password === 'string' ? body.password : ''
    const requiredFields = [fullName, dob, gender, grade, section, previousSchool, region, zone, woreda, kebele,
      phoneNumber, guardianName, guardianRelation, guardianPhone, emergencyContactName, emergencyContactPhone,
      academicYear, registrationDate]
    if (requiredFields.some((value) => !value)) {
      await cleanupUploadedPhotos()
      return res.status(400).json({ message: 'Complete all required student and guardian fields.' })
    }
    if (fullName.length > 100 || previousSchool.length > 200 || houseNo.length > 40
      || [region, zone, woreda, kebele].some((value) => value.length > 100)
      || [phoneNumber, guardianPhone, emergencyContactPhone].some((value) => value.length > 40 || value.replace(/\D/g, '').length < 7)
      || guardianName.length > 150 || guardianRelation.length > 50 || guardianEmail.length > 100
      || emergencyContactName.length > 150 || section.length > 30 || academicYear.length > 20
      || email.length > 100 || address.length > 1000) {
      await cleanupUploadedPhotos()
      return res.status(400).json({ message: 'One or more student details exceed the allowed length or format.' })
    }
    if ((email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      || (guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail))) {
      await cleanupUploadedPhotos()
      return res.status(400).json({ message: 'Enter valid student and guardian email addresses.' })
    }
    const academicOptions = await getConfiguredAcademicOptions(pool, schoolId)
    if (!studentGrades.includes(grade) || !['Female', 'Male'].includes(gender)
      || !academicOptions.sections.some((item) => item.gradeLevel === grade && item.sectionName === section)
      || !academicOptions.years.includes(academicYear)) {
      await cleanupUploadedPhotos()
      return res.status(400).json({ message: 'Select a valid grade, section, and academic year.' })
    }
    const parsedDob = new Date(`${dob}T00:00:00Z`)
    const parsedRegistrationDate = new Date(`${registrationDate}T00:00:00Z`)
    if (!validDate(dob) || Number.isNaN(parsedDob.getTime()) || parsedDob.toISOString().slice(0, 10) !== dob
      || !validDate(registrationDate) || Number.isNaN(parsedRegistrationDate.getTime())
      || parsedRegistrationDate.toISOString().slice(0, 10) !== registrationDate) {
      await cleanupUploadedPhotos()
      return res.status(400).json({ message: 'Enter valid date of birth and registration dates.' })
    }
    let passwordHash
    if (password) {
      const policies = await pool.execute(
        'SELECT min_password_length, require_password_mixed_case, require_password_number FROM system_security_policy WHERE id = 1'
      )
      const policy = policies[0][0] ?? { min_password_length: 8, require_password_mixed_case: false, require_password_number: false }
      const passwordValid = password.length >= policy.min_password_length && password.length <= 72
        && (!policy.require_password_mixed_case || (/[a-z]/.test(password) && /[A-Z]/.test(password)))
        && (!policy.require_password_number || /\d/.test(password))
      if (!passwordValid) {
        await cleanupUploadedPhotos()
        return res.status(400).json({ message: `Student password must be at least ${policy.min_password_length} characters and meet the configured security policy.` })
      }
      passwordHash = await bcrypt.hash(password, 10)
    }
    const photoPath = req.file ? `/uploads/students/${req.file.filename}` : existing.photo_path
    const parentPhotoUrl = req.parentPhotoFile
      ? `/uploads/students/${req.parentPhotoFile.filename}`
      : existing.parent_photo_url
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute(
      `UPDATE users SET full_name = ?, grade_level = ?${passwordHash ? ', password = ?' : ''}
       WHERE id = ? AND school_id = ? AND role = 'Student'`,
      passwordHash
        ? [fullName, grade, passwordHash, req.params.id, schoolId]
        : [fullName, grade, req.params.id, schoolId]
    )
    await connection.execute(
      `UPDATE students SET full_name = ?, email = ?, dob = ?, date_of_birth = ?, gender = ?,
         grade = ?, grade_level = ?, section = ?, previous_school = ?, region = ?, zone = ?,
         woreda = ?, kebele = ?, house_no = ?, phone_number = ?, phone = ?, guardian_name = ?,
         guardian_relation = ?, relationship = ?, guardian_phone = ?, guardian_email = ?,
         emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact = ?,
         address = ?, photo_path = ?, parent_photo_url = ?, academic_year = ?, registration_date = ?
       WHERE user_id = ? AND school_id = ?`,
      [fullName, email || null, dob, dob, gender, grade, grade, section, previousSchool,
        region, zone, woreda, kebele, houseNo || null, phoneNumber, phoneNumber, guardianName,
        guardianRelation, guardianRelation, guardianPhone, guardianEmail || null,
        emergencyContactName, emergencyContactPhone, emergencyContactPhone, address,
        photoPath, parentPhotoUrl, academicYear, registrationDate, req.params.id, schoolId]
    )
    await connection.execute(
      `UPDATE student_records SET date_of_birth = ?, gender = ?, phone = ?, guardian_name = ?,
         relationship = ?, guardian_phone = ?, guardian_email = ?, address = ?, section = ?,
         academic_year = ?, photo_path = ? WHERE user_id = ?`,
      [dob, gender, phoneNumber, guardianName, guardianRelation, guardianPhone, guardianEmail || null,
        address, section, academicYear, photoPath, req.params.id]
    )
    await connection.commit()
    if (req.file && existing.photo_path) await removeStoredStudentPhoto(existing.photo_path)
    if (req.parentPhotoFile && existing.parent_photo_url) await removeStoredStudentPhoto(existing.parent_photo_url)
    return res.json({ id: Number(req.params.id), studentId: String(req.params.id), name: fullName, className: grade, section, gender, status: existing.status })
  } catch (error) {
    if (connection) await connection.rollback()
    await cleanupUploadedPhotos()
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A user with this email address already exists.' })
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function deleteStudent(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid student ID.' })
  let connection
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [students] = await connection.execute(
      `SELECT photo_path AS photoPath, parent_photo_url AS parentPhotoUrl
       FROM students WHERE user_id = ? AND school_id = ? LIMIT 1 FOR UPDATE`,
      [req.params.id, schoolId]
    )
    if (!students.length) {
      await connection.rollback()
      return res.status(404).json({ message: 'Student not found in your school.' })
    }
    const [result] = await connection.execute(
      "DELETE FROM users WHERE id = ? AND school_id = ? AND role = 'Student'",
      [req.params.id, schoolId]
    )
    if (!result.affectedRows) {
      await connection.rollback()
      return res.status(404).json({ message: 'Student account not found in your school.' })
    }
    await connection.commit()
    await Promise.all([students[0].photoPath, students[0].parentPhotoUrl].map(removeStoredStudentPhoto))
    return res.json({ message: 'Student deleted.' })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function getAcademicOptions(req, res, next) {
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    res.json(await getConfiguredAcademicOptions(pool, schoolId))
  } catch (error) { next(error) }
}

export async function getStudentProfile(req, res, next) {
  if (req.user.role !== 'Student') {
    return res.status(403).json({ message: 'Student profile access is only available to student accounts.' })
  }
  try {
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name AS name, u.email, u.grade_level AS className,
              s.section, s.gender, s.phone, s.date_of_birth AS dateOfBirth,
              s.guardian_name AS guardianName, s.relationship AS guardianRelationship,
              s.guardian_phone AS guardianPhone, s.guardian_email AS guardianEmail,
              s.address, s.photo_path AS photoUrl, s.academic_year AS academicYear,
              COALESCE(s.status, 'Active') AS status
       FROM users u
       LEFT JOIN student_records s ON s.user_id = u.id
       WHERE u.id = ? AND u.role = 'Student'
       LIMIT 1`,
      [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ message: 'Student profile not found.' })
    return res.json(rows[0])
  } catch (error) {
    return next(error)
  }
}

export async function registerStudent(req, res, next) {
  const body = req.body ?? {}
  const cleanupUploadedPhotos = () => Promise.all([req.file, req.parentPhotoFile].filter(Boolean).map(removeUploadedPhoto))
  const fields = [
    'fullName', 'firstName', 'lastName', 'dob', 'gender', 'email', 'phoneNumber', 'phone',
    'previousSchool', 'guardianName', 'guardianRelation', 'relationship', 'guardianPhone',
    'guardianEmail', 'emergencyContactName', 'emergencyContactPhone', 'emergencyContact',
    'region', 'zone', 'woreda', 'kebele', 'houseNo', 'address', 'grade', 'className',
    'section', 'academicYear', 'registrationDate', 'password',
  ]
  const values = Object.fromEntries(fields.map((field) => [
    field,
    typeof body[field] === 'string'
      ? field === 'password' ? body[field] : body[field].trim()
      : '',
  ]))
  const fullName = values.fullName || [values.firstName, values.lastName].filter(Boolean).join(' ')
  const grade = values.grade || values.className
  const phoneNumber = values.phoneNumber || values.phone
  const guardianRelation = values.guardianRelation || values.relationship
  const emergencyContactPhone = values.emergencyContactPhone || values.emergencyContact
  const registrationDate = values.registrationDate || new Date().toISOString().slice(0, 10)
  const address = values.address || [values.region, values.zone, values.woreda, values.kebele, values.houseNo].filter(Boolean).join(', ')
  const requiredFields = [
    fullName, values.dob, values.gender, phoneNumber, values.previousSchool,
    values.guardianName, guardianRelation, values.guardianPhone,
    values.emergencyContactName, emergencyContactPhone,
    values.region, values.zone, values.woreda, values.kebele,
    grade, values.section, values.academicYear, registrationDate, values.password,
  ]
  if (requiredFields.some((field) => !field)) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: 'Complete all required student and login fields.' })
  }
  const maximumLengths = {
    email: 100, phoneNumber: 40, previousSchool: 200, guardianName: 150,
    guardianRelation: 50, relationship: 50, guardianPhone: 40, guardianEmail: 100,
    emergencyContactName: 150, emergencyContactPhone: 40, emergencyContact: 40,
    region: 100, zone: 100, woreda: 100, kebele: 100, houseNo: 40, address: 1000,
    section: 30, academicYear: 20,
  }
  if (Object.entries(maximumLengths).some(([field, limit]) => values[field].length > limit)) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: 'One or more student details exceed the allowed length.' })
  }
  if (fullName.length > 100
    || [phoneNumber, values.guardianPhone, emergencyContactPhone].some((phone) => phone.replace(/\D/g, '').length < 7)) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: 'Enter a full name of at most 100 characters and valid contact numbers.' })
  }
  if ((values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    || (values.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.guardianEmail))) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: 'Enter valid student and guardian email addresses.' })
  }
  let policies
  try {
    ;[policies] = await pool.execute(
      'SELECT min_password_length, require_password_mixed_case, require_password_number FROM system_security_policy WHERE id = 1'
    )
  } catch (error) {
    await cleanupUploadedPhotos()
    return next(error)
  }
  const policy = policies[0] ?? { min_password_length: 8, require_password_mixed_case: false, require_password_number: false }
  const passwordValid = values.password.length >= policy.min_password_length && values.password.length <= 72
    && (!policy.require_password_mixed_case || (/[a-z]/.test(values.password) && /[A-Z]/.test(values.password)))
    && (!policy.require_password_number || /\d/.test(values.password))
  if (!passwordValid) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: `Student password must be at least ${policy.min_password_length} characters and meet the configured security policy.` })
  }
  let academicOptions
  let schoolId
  try {
    schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) {
      await cleanupUploadedPhotos()
      return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    }
    academicOptions = await getConfiguredAcademicOptions(pool, schoolId)
  } catch (error) {
    await cleanupUploadedPhotos()
    return next(error)
  }
  if (!['Female', 'Male'].includes(values.gender)
    || !studentGrades.includes(grade)
    || !academicOptions.sections.some((section) => section.gradeLevel === grade && section.sectionName === values.section)
    || !academicOptions.years.includes(values.academicYear)
    || !/^\d{4}\/\d{4}$/.test(values.academicYear)) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: 'Select a valid grade and gender.' })
  }
  const parsedDate = new Date(`${values.dob}T00:00:00Z`)
  const parsedRegistrationDate = new Date(`${registrationDate}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dob) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== values.dob
    || !/^\d{4}-\d{2}-\d{2}$/.test(registrationDate) || Number.isNaN(parsedRegistrationDate.getTime()) || parsedRegistrationDate.toISOString().slice(0, 10) !== registrationDate) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: 'Enter valid date of birth and registration dates.' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const passwordHash = await bcrypt.hash(values.password, 10)
    const loginEmail = `student_${randomUUID().replaceAll('-', '')}@school.local`
    const [result] = await connection.execute(
      `INSERT INTO users
        (full_name, email, password, role, grade_level, registration_source, registered_by, school_id)
             VALUES (?, ?, ?, 'Student', ?, ?, ?, ?)`,
      [
        fullName,
        loginEmail,
        passwordHash,
        grade,
        req.user.role === 'Registrar' ? 'registrar' : 'admin',
        req.user.id,
        schoolId,
      ]
    )
    await connection.execute(
      `INSERT INTO students (
         user_id, school_id, full_name, email, dob, date_of_birth, gender, grade,
         grade_level, section, previous_school, region, zone, woreda, kebele, house_no,
         phone_number, phone, guardian_name, guardian_relation, relationship,
         guardian_phone, guardian_email, emergency_contact_name, emergency_contact_phone,
         emergency_contact, address, photo_path, parent_photo_url, academic_year, registration_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        schoolId,
        fullName,
        values.email || null,
        values.dob,
        values.dob,
        values.gender,
        grade,
        grade,
        values.section,
        values.previousSchool,
        values.region,
        values.zone,
        values.woreda,
        values.kebele,
        values.houseNo || null,
        phoneNumber,
        phoneNumber,
        values.guardianName,
        guardianRelation,
        guardianRelation,
        values.guardianPhone,
        values.guardianEmail || null,
        values.emergencyContactName,
        emergencyContactPhone,
        emergencyContactPhone,
        address,
        req.file ? `/uploads/students/${req.file.filename}` : null,
        req.parentPhotoFile ? `/uploads/students/${req.parentPhotoFile.filename}` : null,
        values.academicYear,
        registrationDate,
      ]
    )
    await connection.execute(
      `INSERT INTO student_records (
         user_id, date_of_birth, gender, phone, guardian_name, relationship,
         guardian_phone, guardian_email, address, section, academic_year, photo_path
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.insertId,
        values.dob,
        values.gender,
        phoneNumber,
        values.guardianName,
        guardianRelation,
        values.guardianPhone,
        values.guardianEmail || null,
        address,
        values.section,
        values.academicYear,
        req.file ? `/uploads/students/${req.file.filename}` : null,
      ]
    )
    await connection.commit()
    return res.status(201).json({
      id: result.insertId,
      studentId: String(result.insertId),
      name: fullName,
      email: values.email || null,
      className: grade,
      section: values.section,
      gender: values.gender,
      status: 'Active',
    })
  } catch (error) {
    if (connection) await connection.rollback()
    await cleanupUploadedPhotos()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'A user with this email address already exists.' })
    }
    return next(error)
  } finally {
    connection?.release()
  }
}

const bulkTemplateFields = [
  { header: 'Full Name', key: 'full_name', width: 28 },
  { header: 'Date of Birth (YYYY-MM-DD)', key: 'dob', width: 24 },
  { header: 'Gender (Female/Male)', key: 'gender', width: 22 },
  { header: 'Grade', key: 'grade', width: 16 },
  { header: 'Section', key: 'section', width: 18 },
  { header: 'Previous School', key: 'previous_school', width: 28 },
  { header: 'Region', key: 'region', width: 18 },
  { header: 'Zone', key: 'zone', width: 18 },
  { header: 'Woreda', key: 'woreda', width: 18 },
  { header: 'Kebele', key: 'kebele', width: 18 },
  { header: 'House Number (optional)', key: 'house_no', width: 22 },
  { header: 'Phone Number', key: 'phone_number', width: 20 },
  { header: 'Email (optional)', key: 'email', width: 28 },
  { header: 'Guardian Name', key: 'guardian_name', width: 28 },
  { header: 'Guardian Relation', key: 'guardian_relation', width: 22 },
  { header: 'Guardian Phone', key: 'guardian_phone', width: 20 },
  { header: 'Guardian Email (optional)', key: 'guardian_email', width: 30 },
  { header: 'Emergency Contact Name', key: 'emergency_contact_name', width: 30 },
  { header: 'Emergency Contact Phone', key: 'emergency_contact_phone', width: 28 },
  { header: 'Registration Date (YYYY-MM-DD)', key: 'registration_date', width: 30 },
  { header: 'Academic Year', key: 'academic_year', width: 18 },
  { header: 'Temporary Password', key: 'temporary_password', width: 24 },
]

const bulkHeaderAliases = {
  name: 'full_name',
  student_name: 'full_name',
  date_of_birth: 'dob',
  birth_date: 'dob',
  phone: 'phone_number',
  parent_name: 'guardian_name',
  parent_relation: 'guardian_relation',
  parent_phone: 'guardian_phone',
  emergency_name: 'emergency_contact_name',
  emergency_phone: 'emergency_contact_phone',
  password: 'temporary_password',
}

function normalizeBulkHeader(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return bulkHeaderAliases[normalized] || normalized
}

function bulkCellText(value) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    if (value.result !== undefined) return bulkCellText(value.result)
    if (value.text !== undefined) return String(value.text).trim()
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text).join('').trim()
  }
  return String(value).trim()
}

function readBulkDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000)).toISOString().slice(0, 10)
  }
  return bulkCellText(value)
}

export async function downloadStudentImportTemplate(_req, res, next) {
  try {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'School SIMS'
    const worksheet = workbook.addWorksheet('Student Registration')
    worksheet.columns = bulkTemplateFields.map(({ header, key, width }) => ({
      header,
      key,
      width,
      style: ['dob', 'registration_date'].includes(key)
        ? { numFmt: 'yyyy-mm-dd' }
        : ['house_no', 'phone_number', 'email', 'guardian_phone', 'guardian_email', 'emergency_contact_phone', 'temporary_password'].includes(key)
          ? { numFmt: '@' }
          : undefined,
    }))
    worksheet.views = [{ state: 'frozen', ySplit: 1 }]
    worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(bulkTemplateFields.length).letter}1` }
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173A63' } }
    const buffer = await workbook.xlsx.writeBuffer()
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="student-registration-template.xlsx"',
    })
    return res.send(Buffer.from(buffer))
  } catch (error) {
    return next(error)
  }
}

export async function bulkImportStudents(req, res, next) {
  if (!req.file || !['.xlsx', '.csv'].includes(path.extname(req.file.originalname).toLowerCase())) {
    return res.status(400).json({ message: 'Choose an .xlsx or .csv student registration file.' })
  }
  try {
    const workbook = new ExcelJS.Workbook()
    const extension = path.extname(req.file.originalname).toLowerCase()
    if (extension === '.xlsx') await workbook.xlsx.load(req.file.buffer)
    else await workbook.csv.read(Readable.from([req.file.buffer]))
    const worksheet = workbook.worksheets[0]
    if (!worksheet || worksheet.rowCount < 1) {
      return res.status(400).json({ message: 'The uploaded file does not contain a header row.' })
    }
    if (worksheet.rowCount > 1001) {
      return res.status(400).json({ message: 'Bulk import is limited to 1,000 student rows per file.' })
    }
    const headerIndexes = new Map()
    worksheet.getRow(1).eachCell((cell, column) => {
      const key = normalizeBulkHeader(cell.value)
      if (key) headerIndexes.set(key, column)
    })
    const requiredHeaders = [
      'full_name', 'dob', 'gender', 'grade', 'section', 'previous_school', 'region', 'zone',
      'woreda', 'kebele', 'phone_number', 'guardian_name', 'guardian_relation', 'guardian_phone',
      'emergency_contact_name', 'emergency_contact_phone', 'academic_year', 'temporary_password',
    ]
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexes.has(header))
    if (missingHeaders.length) {
      return res.status(400).json({ message: `Template is missing required columns: ${missingHeaders.join(', ')}.` })
    }
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const academicOptions = await getConfiguredAcademicOptions(pool, schoolId)
    const [policies] = await pool.execute(
      'SELECT min_password_length, require_password_mixed_case, require_password_number FROM system_security_policy WHERE id = 1'
    )
    const policy = policies[0] ?? { min_password_length: 8, require_password_mixed_case: false, require_password_number: false }
    const rowResults = []
    let inserted = 0

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber)
      const raw = Object.fromEntries([...headerIndexes].map(([key, column]) => [
        key,
        ['dob', 'registration_date'].includes(key) ? readBulkDate(row.getCell(column).value) : bulkCellText(row.getCell(column).value),
      ]))
      if (Object.values(raw).every((value) => !value)) continue

      const errors = []
      const registrationDate = raw.registration_date || new Date().toISOString().slice(0, 10)
      const address = [raw.region, raw.zone, raw.woreda, raw.kebele, raw.house_no].filter(Boolean).join(', ')
      if (raw.full_name.length > 100) errors.push('Full Name must be at most 100 characters.')
      if (!validDate(raw.dob)) errors.push('Date of Birth must use YYYY-MM-DD and be a valid date.')
      if (!['Female', 'Male'].includes(raw.gender)) errors.push('Gender must be Female or Male.')
      if (!studentGrades.includes(raw.grade)) errors.push('Grade must be Grade 9, Grade 10, Grade 11, or Grade 12.')
      if (!academicOptions.sections.some((section) => section.gradeLevel === raw.grade && section.sectionName === raw.section)) errors.push('Section is not active for this grade at your school.')
      if (!academicOptions.years.includes(raw.academic_year)) errors.push('Academic Year is not configured for your school.')
      if (!raw.previous_school || raw.previous_school.length > 200) errors.push('Previous School is required and must be at most 200 characters.')
      if ([raw.region, raw.zone, raw.woreda, raw.kebele].some((value) => !value || value.length > 100)) errors.push('Region, Zone, Woreda, and Kebele are required and limited to 100 characters each.')
      if (raw.house_no.length > 40) errors.push('House Number must be at most 40 characters.')
      if (!/^\d{7,40}$/.test(raw.phone_number.replace(/\D/g, ''))) errors.push('Phone Number must contain at least 7 digits.')
      if (raw.email && (raw.email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email))) errors.push('Email must be valid and at most 100 characters.')
      if (!raw.guardian_name || raw.guardian_name.length > 150) errors.push('Guardian Name is required and must be at most 150 characters.')
      if (!raw.guardian_relation || raw.guardian_relation.length > 50) errors.push('Guardian Relation is required and must be at most 50 characters.')
      if (!/^\d{7,40}$/.test(raw.guardian_phone.replace(/\D/g, ''))) errors.push('Guardian Phone must contain at least 7 digits.')
      if (raw.guardian_email && (raw.guardian_email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.guardian_email))) errors.push('Guardian Email must be valid and at most 100 characters.')
      if (!raw.emergency_contact_name || raw.emergency_contact_name.length > 150) errors.push('Emergency Contact Name is required and must be at most 150 characters.')
      if (!/^\d{7,40}$/.test(raw.emergency_contact_phone.replace(/\D/g, ''))) errors.push('Emergency Contact Phone must contain at least 7 digits.')
      if (!validDate(registrationDate)) errors.push('Registration Date must use YYYY-MM-DD and be a valid date.')
      const password = raw.temporary_password
      if (password.length < policy.min_password_length || password.length > 72
        || (policy.require_password_mixed_case && !(/[a-z]/.test(password) && /[A-Z]/.test(password)))
        || (policy.require_password_number && !/\d/.test(password))) {
        errors.push(`Temporary Password must be at least ${policy.min_password_length} characters and meet the school security policy.`)
      }
      if (address.length > 1000) errors.push('Combined address is too long.')
      if (errors.length) {
        rowResults.push({ row: rowNumber, status: 'skipped', message: errors.join(' ') })
        continue
      }

      let connection
      try {
        connection = await pool.getConnection()
        await connection.beginTransaction()
        const passwordHash = await bcrypt.hash(password, 10)
        const loginEmail = `student_${randomUUID().replaceAll('-', '')}@school.local`
        const fullName = raw.full_name
        const [userResult] = await connection.execute(
          `INSERT INTO users
            (full_name, email, password, role, grade_level, registration_source, registered_by, school_id)
           VALUES (?, ?, ?, 'Student', ?, ?, ?, ?)`,
          [fullName, loginEmail, passwordHash, raw.grade, req.user.role === 'Registrar' ? 'registrar' : 'admin', req.user.id, schoolId]
        )
        await connection.execute(
          `INSERT INTO students (
             user_id, school_id, full_name, email, dob, date_of_birth, gender, grade,
             grade_level, section, previous_school, region, zone, woreda, kebele, house_no,
             phone_number, phone, guardian_name, guardian_relation, relationship,
             guardian_phone, guardian_email, emergency_contact_name, emergency_contact_phone,
             emergency_contact, address, photo_path, parent_photo_url, academic_year, registration_date
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userResult.insertId, schoolId, fullName, raw.email || null, raw.dob, raw.dob, raw.gender,
            raw.grade, raw.grade, raw.section, raw.previous_school, raw.region, raw.zone, raw.woreda,
            raw.kebele, raw.house_no || null, raw.phone_number, raw.phone_number, raw.guardian_name,
            raw.guardian_relation, raw.guardian_relation, raw.guardian_phone, raw.guardian_email || null,
            raw.emergency_contact_name, raw.emergency_contact_phone, raw.emergency_contact_phone,
            address, null, null, raw.academic_year, registrationDate]
        )
        await connection.execute(
          `INSERT INTO student_records (
             user_id, date_of_birth, gender, phone, guardian_name, relationship,
             guardian_phone, guardian_email, address, section, academic_year, photo_path
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [userResult.insertId, raw.dob, raw.gender, raw.phone_number, raw.guardian_name,
            raw.guardian_relation, raw.guardian_phone, raw.guardian_email || null, address, raw.section, raw.academic_year]
        )
        await connection.commit()
        inserted += 1
        rowResults.push({ row: rowNumber, status: 'inserted', studentId: String(userResult.insertId), name: fullName })
      } catch (error) {
        if (connection) await connection.rollback()
        rowResults.push({ row: rowNumber, status: 'skipped', message: error.code === 'ER_DUP_ENTRY' ? 'A database uniqueness conflict prevented this row.' : 'Database insert failed for this row.' })
      } finally {
        connection?.release()
      }
    }
    return res.status(200).json({ inserted, skipped: rowResults.length - inserted, results: rowResults })
  } catch (error) {
    return next(error)
  }
}

export async function getHomeImages(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, title, description, image_path AS imageUrl, category, created_at AS createdAt FROM gallery_images WHERE is_featured_home = TRUE AND is_active = TRUE ORDER BY created_at DESC'
    )
    res.json(rows)
  } catch (error) {
    next(error)
  }
}

export async function getPublicSchoolProfile(_req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT setting_key AS settingKey, setting_value AS settingValue
       FROM school_settings
       WHERE setting_key IN ('school_id', 'school_name', 'region', 'wereda', 'logo_path', 'stamp_path')`
    )
    res.json(Object.fromEntries(rows.map((row) => [row.settingKey, row.settingValue])))
  } catch (error) { next(error) }
}

export async function uploadHomeImage(req, res, next) {
  try {
    const { title, description = '', category = 'Events', is_featured_home = false } = req.body
    if (!req.file) return res.status(400).json({ message: 'An image file is required.' })
    if (!title?.trim()) return res.status(400).json({ message: 'Title is required.' })

    const imagePath = `/uploads/gallery/${req.file.filename}`
    const [result] = await pool.execute(
      `INSERT INTO gallery_images (title, description, image_path, category, is_featured_home)
       VALUES (?, ?, ?, ?, ?)`,
      [title.trim(), description.trim(), imagePath, category.trim(), Boolean(is_featured_home === true || is_featured_home === 'true')]
    )
    res.status(201).json({ id: result.insertId, title: title.trim(), description, imagePath, category })
  } catch (error) {
    next(error)
  }
}
