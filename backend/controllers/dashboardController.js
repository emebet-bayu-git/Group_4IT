import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { pool } from '../config/db.js'
import { DEFAULT_TEMPORARY_PASSWORD } from '../utils/accountDefaults.js'

const studentPhotoDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads/students')
const studentGrades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const confirmedEnrollmentSql = "LOWER(TRIM(section_status)) IN ('confirmed / enrolled', 'confirmed', 'enrolled')"
const legacyAcademicOptions = {
  sections: studentGrades.flatMap((gradeLevel) => (
    ['Section A', 'Section B', 'Section C'].map((sectionName) => ({ gradeLevel, sectionName }))
  )),
}

async function getConfiguredAcademicOptions(executor = pool, schoolId = null) {
  const yearScope = schoolId ? ' WHERE school_id = ?' : ''
  const scopeValues = schoolId ? [schoolId] : []
  const [configuredYears] = await executor.execute(
    `SELECT name FROM academic_years${yearScope}
     ORDER BY is_active DESC, start_date DESC`,
    scopeValues
  )
  const [activeSections] = await executor.execute(
    `SELECT grade_level AS gradeLevel, section_name AS sectionName
     FROM school_sections WHERE is_active = TRUE${schoolId ? ' AND school_id = ?' : ''} ORDER BY grade_level, section_name`,
    scopeValues
  )
  const [[sectionCount]] = await executor.execute(`SELECT COUNT(*) AS total FROM school_sections${yearScope}`, scopeValues)
  return {
    years: configuredYears.map((row) => row.name),
    sections: activeSections.length ? activeSections : Number(sectionCount.total) ? [] : legacyAcademicOptions.sections,
  }
}

async function getActiveSectionId(executor, schoolId, grade, sectionName) {
  const [[section]] = await executor.execute(
    `SELECT id FROM school_sections
     WHERE school_id = ? AND grade_level = ? AND section_name = ? AND is_active = TRUE
       AND ((academic_year_id IS NULL AND academic_term_id IS NULL)
         OR EXISTS (
           SELECT 1 FROM academic_years activeYear
           JOIN academic_terms activeTerm ON activeTerm.academic_year_id = activeYear.id
             AND activeTerm.school_id = activeYear.school_id
           WHERE activeYear.id = school_sections.academic_year_id
             AND activeTerm.id = school_sections.academic_term_id
             AND activeYear.school_id = school_sections.school_id
             AND activeYear.is_active = TRUE AND activeTerm.is_current = TRUE
         ))
     ORDER BY academic_year_id DESC, academic_term_id DESC, id DESC LIMIT 1`,
    [schoolId, grade, sectionName]
  )
  return section?.id ?? null
}

async function getCurrentAcademicPeriod(executor, schoolId) {
  const [rows] = await executor.execute(
    `SELECT year.id AS academicYearId, year.name AS academicYear,
            term.id AS termId, term.name AS semester
     FROM academic_years year
     JOIN academic_terms term ON term.academic_year_id = year.id
       AND term.school_id = year.school_id AND term.is_current = TRUE
     WHERE year.school_id = ? AND year.is_active = TRUE
     ORDER BY year.start_date DESC, term.start_date DESC LIMIT 1`,
    [schoolId]
  )
  return rows[0] ?? null
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
  const [[user]] = await pool.execute(
    'SELECT school_id, role FROM users WHERE id = ? AND is_active = TRUE LIMIT 1',
    [userId]
  )
  if (user?.school_id) return user.school_id
  if (user?.role !== 'School Admin') return null
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

function sectionSuffix(index) {
  let value = index + 1
  let suffix = ''
  while (value > 0) {
    value -= 1
    suffix = String.fromCharCode(65 + (value % 26)) + suffix
    value = Math.floor(value / 26)
  }
  return suffix
}

function compareSectionNames(left, right) {
  const sectionIndex = (name) => {
    const suffix = /^Section\s+([A-Z]+)$/i.exec(name)?.[1]?.toUpperCase()
    if (!suffix) return null
    return [...suffix].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0)
  }
  const leftIndex = sectionIndex(left)
  const rightIndex = sectionIndex(right)
  if (leftIndex !== null && rightIndex !== null) return leftIndex - rightIndex
  if (leftIndex !== null) return -1
  if (rightIndex !== null) return 1
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function sortAllocationStudents(students, order) {
  const alphabetical = (left, right) => (
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || Number(left.userId) - Number(right.userId)
  )
  if (order === 'studentId') {
    return [...students].sort((left, right) => {
      const leftId = String(left.studentNumber || left.userId).trim()
      const rightId = String(right.studentNumber || right.userId).trim()
      if (/^\d+$/.test(leftId) && /^\d+$/.test(rightId)) {
        const leftNumber = BigInt(leftId)
        const rightNumber = BigInt(rightId)
        return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0
      }
      return leftId.localeCompare(rightId, undefined, { numeric: true, sensitivity: 'base' })
    })
  }
  if (order !== 'gender') return [...students].sort(alphabetical)

  const female = students.filter((student) => student.gender === 'Female').sort(alphabetical)
  const male = students.filter((student) => student.gender === 'Male').sort(alphabetical)
  const unknown = students.filter((student) => !['Female', 'Male'].includes(student.gender)).sort(alphabetical)
  const balanced = []
  for (let femaleIndex = 0, maleIndex = 0; femaleIndex < female.length || maleIndex < male.length;) {
    if (femaleIndex < female.length) balanced.push(female[femaleIndex++])
    if (maleIndex < male.length) balanced.push(male[maleIndex++])
  }
  return balanced.concat(unknown)
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
                  student.academic_status AS academicStatus,
                  student.section_status AS sectionStatus,
                  student.section_id AS sectionId,
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

export async function getRegistrarSectionAllocation(req, res, next) {
  const grade = typeof req.query.grade === 'string' ? req.query.grade : ''
  if (!studentGrades.includes(grade)) return res.status(400).json({ message: 'Select a valid grade level.' })
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    const period = await getCurrentAcademicPeriod(pool, schoolId)
    if (!period) return res.status(409).json({ message: 'Configure an active academic year and current semester before section allocation.' })
    const [sections] = await pool.execute(
      `SELECT section.id, section.grade_level AS gradeLevel,
              section.section_name AS sectionName,
              COUNT(student.id) AS studentCount
       FROM school_sections section
       LEFT JOIN students student ON student.section_id = section.id
         AND student.school_id = section.school_id
         AND student.status = 'Active'
         AND ${confirmedEnrollmentSql}
         AND (student.enrollment_year_id = ?
           OR (student.enrollment_year_id IS NULL AND student.academic_year = ?))
       WHERE section.school_id = ? AND section.grade_level = ? AND section.is_active = TRUE
         AND ((section.academic_year_id = ? AND (? IS NULL OR section.academic_term_id = ?))
           OR (section.academic_year_id IS NULL AND section.academic_term_id IS NULL))
       GROUP BY section.id, section.grade_level, section.section_name
       ORDER BY section.section_name`,
      [period.academicYearId, period.academicYear, schoolId, grade, period.academicYearId, period.termId, period.termId]
    )
    const [students] = await pool.execute(
      `SELECT student.id, student.user_id AS userId, account.student_number AS studentNumber,
              student.full_name AS name,
              student.gender, student.section
       FROM students student
       JOIN users account ON account.id = student.user_id AND account.school_id = student.school_id
       WHERE student.school_id = ? AND student.status IN ('Unassigned', 'Active')
         AND ${confirmedEnrollmentSql}
         AND (student.enrollment_year_id = ?
           OR (student.enrollment_year_id IS NULL AND student.academic_year = ?))
         AND COALESCE(NULLIF(student.grade, ''), student.grade_level) = ?
         AND student.section_id IS NULL
       ORDER BY student.full_name, student.user_id`,
      [schoolId, period.academicYearId, period.academicYear, grade]
    )
    const [assignedStudents] = await pool.execute(
      `SELECT student.id, student.user_id AS userId, student.full_name AS name,
              student.gender, student.section_id AS sectionId, section.section_name AS sectionName
       FROM students student
       JOIN school_sections section ON section.id = student.section_id
         AND section.school_id = student.school_id
       WHERE student.school_id = ? AND student.status = 'Active'
         AND ${confirmedEnrollmentSql}
         AND (student.enrollment_year_id = ?
           OR (student.enrollment_year_id IS NULL AND student.academic_year = ?))
         AND COALESCE(NULLIF(student.grade, ''), student.grade_level) = ?
       ORDER BY section.section_name, student.full_name, student.user_id`,
      [schoolId, period.academicYearId, period.academicYear, grade]
    )
    const [gradeCounts] = await pool.execute(
      `SELECT COALESCE(NULLIF(grade, ''), grade_level) AS gradeLevel, COUNT(*) AS studentCount
       FROM students
       WHERE school_id = ? AND status IN ('Unassigned', 'Active') AND section_id IS NULL
         AND ${confirmedEnrollmentSql}
         AND (enrollment_year_id = ?
           OR (enrollment_year_id IS NULL AND academic_year = ?))
       GROUP BY COALESCE(NULLIF(grade, ''), grade_level)`,
      [schoolId, period.academicYearId, period.academicYear]
    )
    return res.json({
      sections: sections.map((section) => ({ ...section, studentCount: Number(section.studentCount) })),
      students,
      assignedStudents,
      academicYear: period.academicYear,
      semester: period.semester,
      gradeCounts: studentGrades.map((gradeLevel) => ({
        gradeLevel,
        studentCount: Number(gradeCounts.find((row) => row.gradeLevel === gradeLevel)?.studentCount || 0),
      })),
    })
  } catch (error) {
    console.error('Unable to load Registrar section allocation:', error.message)
    return next(error)
  }
}

export async function listRegistrarReEnrollment(req, res, next) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : ''
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    const period = await getCurrentAcademicPeriod(pool, schoolId)
    const searchTerm = `%${search}%`
    const [students] = await pool.execute(
      `SELECT student.user_id AS id, student.full_name AS name,
              account.student_number AS studentNumber,
              COALESCE(student.grade, student.grade_level) AS gradeLevel,
              student.academic_status AS academicStatus,
              student.section_status AS sectionStatus,
              student.academic_year AS previousAcademicYear,
              student.promoted_from_year_id AS promotedFromYearId
       FROM students student
       JOIN users account ON account.id = student.user_id
         AND account.school_id = student.school_id AND account.role = 'Student'
         AND account.is_active = TRUE
       WHERE student.school_id = ?
         AND student.status = 'Unassigned'
         AND COALESCE(NULLIF(student.grade, ''), student.grade_level) IN ('Grade 10', 'Grade 11', 'Grade 12')
         AND student.section_status IN ('Pending Check-In', 'Pending Re-Enrollment')
         AND student.academic_status NOT IN ('Transferred', 'Withdrawn')
         AND (? IS NULL OR student.promoted_from_year_id IS NULL
           OR student.promoted_from_year_id <> ?)
         AND (? = '' OR student.full_name LIKE ? OR CAST(student.user_id AS CHAR) LIKE ?
           OR account.student_number LIKE ?)
       ORDER BY student.grade_level, student.full_name, student.user_id`,
      [schoolId, period?.academicYearId ?? null, period?.academicYearId ?? null,
        search, searchTerm, searchTerm, searchTerm]
    )
    return res.json({
      academicYear: period?.academicYear ?? null,
      academicYearId: period?.academicYearId ?? null,
      semester: period?.semester ?? null,
      students,
    })
  } catch (error) {
    console.error('Unable to load Registrar re-enrollment list:', error.message)
    return next(error)
  }
}

export async function checkInRegistrarStudent(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid student ID.' })
  let connection
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const period = await getCurrentAcademicPeriod(connection, schoolId)
    if (!period) {
      await connection.rollback()
      return res.status(409).json({ message: 'Configure an active academic year before checking students in.' })
    }
    const [rows] = await connection.execute(
      `SELECT student.user_id AS id,
              COALESCE(student.grade, student.grade_level) AS gradeLevel,
              student.section_status AS sectionStatus,
              student.promoted_from_year_id AS promotedFromYearId
       FROM students student
       JOIN users account ON account.id = student.user_id
         AND account.school_id = student.school_id AND account.role = 'Student'
         AND account.is_active = TRUE
       WHERE student.user_id = ? AND student.school_id = ?
         AND student.status = 'Unassigned'
         AND COALESCE(NULLIF(student.grade, ''), student.grade_level) IN ('Grade 10', 'Grade 11', 'Grade 12')
         AND student.academic_status NOT IN ('Transferred', 'Withdrawn')
       FOR UPDATE`,
      [req.params.id, schoolId]
    )
    const student = rows[0]
    if (!student) {
      await connection.rollback()
      return res.status(404).json({ message: 'Student not found in your school.' })
    }
    if (!['Pending Check-In', 'Pending Re-Enrollment'].includes(student.sectionStatus)) {
      await connection.rollback()
      return res.status(409).json({ message: 'This student is not awaiting Registrar check-in.' })
    }
    if (Number(student.promotedFromYearId) === Number(period.academicYearId)) {
      await connection.rollback()
      return res.status(409).json({ message: 'Activate the next academic year before checking this student in.' })
    }
    await connection.execute(
      `UPDATE students
       SET section = NULL, section_id = NULL, status = 'Unassigned',
           section_status = 'Confirmed / Enrolled',
           enrollment_year_id = ?, academic_year = ?
       WHERE user_id = ? AND school_id = ?`,
      [period.academicYearId, period.academicYear, req.params.id, schoolId]
    )
    await connection.execute(
      `UPDATE users SET grade_level = ? WHERE id = ? AND school_id = ? AND role = 'Student'`,
      [student.gradeLevel, req.params.id, schoolId]
    )
    await connection.execute(
      `UPDATE student_records
       SET section = NULL, status = 'Unassigned', academic_year = ?
       WHERE user_id = ?`,
      [period.academicYear, req.params.id]
    )
    await connection.commit()
    return res.json({
      message: 'Student checked in for the active academic year.',
      studentId: Number(req.params.id),
      gradeLevel: student.gradeLevel,
      academicYear: period.academicYear,
      sectionStatus: 'Confirmed / Enrolled',
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Unable to check in Registrar student:', error.message)
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function previewRegistrarSections(req, res, next) {
  const body = req.body ?? {}
  const grade = typeof body.grade === 'string' ? body.grade : ''
  const capacity = Number(body.capacity)
  const sortBy = body.sortBy || 'alphabetical'
  if (!studentGrades.includes(grade)
    || !Number.isInteger(capacity) || capacity < 1 || capacity > 200
    || !['alphabetical', 'studentId', 'gender'].includes(sortBy)
  ) {
    return res.status(400).json({ message: 'Choose a valid grade, capacity, and allocation order.' })
  }
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    const period = await getCurrentAcademicPeriod(pool, schoolId)
    if (!period) return res.status(409).json({ message: 'Configure an active academic year and current semester before section allocation.' })
    const [sections] = await pool.execute(
      `SELECT id, section_name AS sectionName FROM school_sections
       WHERE school_id = ? AND grade_level = ? AND is_active = TRUE
         AND ((academic_year_id = ? AND academic_term_id = ?)
           OR (academic_year_id IS NULL AND academic_term_id IS NULL))
       ORDER BY section_name`,
      [schoolId, grade, period.academicYearId, period.termId]
    )
    const [students] = await pool.execute(
      `SELECT student.id, student.user_id AS userId,
              account.student_number AS studentNumber, student.full_name AS name, student.gender
       FROM students student
       JOIN users account ON account.id = student.user_id AND account.school_id = student.school_id
       WHERE student.school_id = ? AND student.status IN ('Unassigned', 'Active')
         AND LOWER(TRIM(student.section_status)) IN ('confirmed / enrolled', 'confirmed', 'enrolled')
         AND (student.enrollment_year_id = ?
           OR (student.enrollment_year_id IS NULL AND student.academic_year = ?))
         AND student.section_id IS NULL
         AND COALESCE(NULLIF(student.grade, ''), student.grade_level) = ?`,
      [schoolId, period.academicYearId, period.academicYear, grade]
    )
    const [counts] = await pool.execute(
      `SELECT section_id AS sectionId, COUNT(*) AS assigned,
              SUM(gender = 'Female') AS femaleCount, SUM(gender = 'Male') AS maleCount
       FROM students WHERE school_id = ? AND status = 'Active'
         AND ${confirmedEnrollmentSql}
         AND (enrollment_year_id = ?
           OR (enrollment_year_id IS NULL AND academic_year = ?))
         AND section_id IS NOT NULL
       GROUP BY section_id`,
      [schoolId, period.academicYearId, period.academicYear]
    )
    const countsBySection = new Map(counts.map((row) => [Number(row.sectionId), {
      assigned: Number(row.assigned),
      Female: Number(row.femaleCount),
      Male: Number(row.maleCount),
    }]))
    let planningSections = sections.map((section) => ({
      ...section,
      assigned: countsBySection.get(Number(section.id))?.assigned || 0,
      isNew: false,
    }))
    const capacityAvailable = () => planningSections.reduce(
      (total, section) => total + Math.max(0, capacity - section.assigned), 0
    )
    const neededSections = Math.ceil(Math.max(0, students.length - capacityAvailable()) / capacity)
    if (neededSections) {
      const [usedRows] = await pool.execute(
        `SELECT section_name AS sectionName FROM school_sections
         WHERE school_id = ? AND grade_level = ?
           AND ((academic_year_id = ? AND academic_term_id = ?)
             OR (academic_year_id IS NULL AND academic_term_id IS NULL))`,
        [schoolId, grade, period.academicYearId, period.termId]
      )
      const usedNames = new Set(usedRows.map((row) => row.sectionName.toLowerCase()))
      let suffix = 0
      while (planningSections.filter((section) => section.isNew).length < neededSections) {
        const sectionName = `Section ${sectionSuffix(suffix++)}`
        if (usedNames.has(sectionName.toLowerCase())) continue
        planningSections.push({
          id: null, sectionName, assigned: 0, Female: 0, Male: 0, isNew: true,
        })
        usedNames.add(sectionName.toLowerCase())
      }
    }
    planningSections.sort((a, b) => compareSectionNames(a.sectionName, b.sectionName))

    const ordered = sortAllocationStudents(students, sortBy)

    const assignments = []
    for (const student of ordered) {
      const destination = planningSections.find((section) => section.assigned < capacity)
      if (!destination) break
      destination.assigned += 1
      assignments.push({
        studentId: student.id,
        userId: student.userId,
        studentNumber: student.studentNumber,
        name: student.name,
        gender: student.gender,
        sectionId: destination.id,
        sectionName: destination.sectionName,
        isNewSection: destination.isNew,
      })
    }
    return res.json({
      academicYear: period.academicYear,
      semester: period.semester,
      grade,
      capacity,
      sortBy,
      assignments,
      sections: planningSections.map(({ id, sectionName, assigned, isNew }) => ({
        id, sectionName, assigned, isNew, capacity,
      })),
    })
  } catch (error) {
    return next(error)
  }
}

export async function transferRegistrarStudent(req, res, next) {
  if (!validId(req.params.studentId)) return res.status(400).json({ message: 'Provide a valid student ID.' })
  const { sectionId, capacity } = req.body ?? {}
  if (!validId(sectionId) || !Number.isInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > 200) {
    return res.status(400).json({ message: 'Choose a valid target section and capacity.' })
  }
  let connection
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const period = await getCurrentAcademicPeriod(connection, schoolId)
    if (!period) {
      await connection.rollback()
      return res.status(409).json({ message: 'Configure an active academic year and current semester before transferring students.' })
    }
    const [[student]] = await connection.execute(
      `SELECT id, user_id AS userId, COALESCE(grade, grade_level) AS gradeLevel,
              section_id AS sectionId
       FROM students WHERE user_id = ? AND school_id = ? AND status = 'Active'
         AND ${confirmedEnrollmentSql} AND enrollment_year_id = ?
         AND section_id IS NOT NULL FOR UPDATE`,
      [req.params.studentId, schoolId, period.academicYearId]
    )
    if (!student) {
      await connection.rollback()
      return res.status(404).json({ message: 'Student is not assigned in your school for the active academic year.' })
    }
    const [[section]] = await connection.execute(
      `SELECT id, section_name AS sectionName FROM school_sections
       WHERE id = ? AND school_id = ? AND grade_level = ? AND is_active = TRUE
         AND ((academic_year_id = ? AND academic_term_id = ?)
           OR (academic_year_id IS NULL AND academic_term_id IS NULL))
       LIMIT 1 FOR UPDATE`,
      [sectionId, schoolId, student.gradeLevel, period.academicYearId, period.termId]
    )
    if (!section) {
      await connection.rollback()
      return res.status(404).json({ message: 'Student or target section is not available in the active academic period.' })
    }
    if (Number(student.sectionId) === Number(section.id)) {
      await connection.rollback()
      return res.status(400).json({ message: 'Choose a different section for the transfer.' })
    }
    const [[count]] = await connection.execute(
      `SELECT COUNT(*) AS total FROM students WHERE school_id = ? AND section_id = ?
       AND status = 'Active' AND ${confirmedEnrollmentSql} AND enrollment_year_id = ?`,
      [schoolId, section.id, period.academicYearId]
    )
    if (Number(count.total) >= Number(capacity)) {
      await connection.rollback()
      return res.status(409).json({ message: 'The target section has no available seats.' })
    }
    await connection.execute(
      `UPDATE students SET section_id = ?, section = ? WHERE id = ? AND school_id = ?`,
      [section.id, section.sectionName, student.id, schoolId]
    )
    await connection.execute(
      `UPDATE student_records SET section = ? WHERE user_id = ?`,
      [section.sectionName, student.userId]
    )
    await connection.commit()
    return res.json({
      message: 'Student transferred successfully.',
      studentId: Number(student.userId),
      sectionId: Number(section.id),
      sectionName: section.sectionName,
    })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function assignRegistrarSections(req, res, next) {
  const body = req.body ?? {}
  const grade = typeof body.grade === 'string' ? body.grade : ''
  const mode = body.mode
  const studentIds = body.studentIds
  if (!studentGrades.includes(grade) || !['manual', 'batch'].includes(mode)
    || !Array.isArray(studentIds) && mode === 'manual') {
    return res.status(400).json({ message: 'Provide a valid grade, allocation mode, and student list.' })
  }
  const capacity = Number(body.capacity)
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) {
    return res.status(400).json({ message: 'Choose a section capacity from 1 to 200 students.' })
  }
  if (mode === 'manual' && (studentIds.length < 1 || studentIds.some((id) => !validId(id))
    || new Set(studentIds.map(Number)).size !== studentIds.length)) {
    return res.status(400).json({ message: 'Select one or more valid, unique student records.' })
  }
  if (mode === 'manual' && !validId(body.sectionId)) {
    return res.status(400).json({ message: 'Choose a valid target section.' })
  }
  const sortBy = body.sortBy || 'alphabetical'
  if (mode === 'batch' && !['alphabetical', 'studentId', 'gender'].includes(sortBy)) {
    return res.status(400).json({ message: 'Choose a supported automatic allocation order.' })
  }

  let connection
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [schools] = await connection.execute('SELECT id FROM schools WHERE id = ? FOR UPDATE', [schoolId])
    if (!schools.length) {
      await connection.rollback()
      return res.status(403).json({ message: 'Your Registrar account is not assigned to an active school.' })
    }
    const period = await getCurrentAcademicPeriod(connection, schoolId)
    if (!period) {
      await connection.rollback()
      return res.status(409).json({ message: 'Configure an active academic year and current semester before section allocation.' })
    }
    const [sections] = await connection.execute(
      `SELECT id, section_name AS sectionName FROM school_sections
       WHERE school_id = ? AND grade_level = ? AND is_active = TRUE
         AND ((academic_year_id = ? AND (? IS NULL OR academic_term_id = ?))
           OR (academic_year_id IS NULL AND academic_term_id IS NULL))
       ORDER BY section_name FOR UPDATE`,
      [schoolId, grade, period.academicYearId, period.termId, period.termId]
    )
    if (!sections.length && mode === 'manual') {
      await connection.rollback()
      return res.status(409).json({ message: 'Create active sections for this grade before manual assignment.' })
    }
    const [existingCounts] = await connection.execute(
      `SELECT section_id AS sectionId, COUNT(*) AS studentCount,
              SUM(gender = 'Female') AS femaleCount, SUM(gender = 'Male') AS maleCount
       FROM students
       WHERE school_id = ? AND status = 'Active'
         AND ${confirmedEnrollmentSql}
         AND (enrollment_year_id = ?
           OR (enrollment_year_id IS NULL AND academic_year = ?))
         AND section_id IS NOT NULL
       GROUP BY section_id`,
      [schoolId, period.academicYearId, period.academicYear]
    )
    const countBySection = new Map(existingCounts.map((row) => [Number(row.sectionId), {
      total: Number(row.studentCount),
      Female: Number(row.femaleCount),
      Male: Number(row.maleCount),
    }]))

    const [students] = await connection.execute(
      `SELECT student.id, student.user_id AS userId,
             account.student_number AS studentNumber, student.full_name AS name, student.gender
      FROM students student
      JOIN users account ON account.id = student.user_id AND account.school_id = student.school_id
      WHERE student.school_id = ? AND student.status IN ('Unassigned', 'Active')
       AND LOWER(TRIM(student.section_status)) IN ('confirmed / enrolled', 'confirmed', 'enrolled')
       AND (student.enrollment_year_id = ?
         OR (student.enrollment_year_id IS NULL AND student.academic_year = ?))
       AND student.section_id IS NULL
       AND COALESCE(NULLIF(student.grade, ''), student.grade_level) = ?
      ORDER BY student.full_name, student.user_id FOR UPDATE`,
      [schoolId, period.academicYearId, period.academicYear, grade]
    )
    const byId = new Map(students.map((student) => [Number(student.id), student]))
    let assignments = []
    let targetSection = null

    if (mode === 'manual') {
      targetSection = sections.find((section) => Number(section.id) === Number(body.sectionId))
      if (!targetSection) {
        await connection.rollback()
        return res.status(400).json({ message: 'The selected section is not active in this grade.' })
      }
      const selectedStudents = studentIds.map((id) => byId.get(Number(id)))
      if (selectedStudents.some((student) => !student)) {
        await connection.rollback()
        return res.status(409).json({ message: 'One or more selected students are no longer unassigned in this grade. Refresh and try again.' })
      }
      const [[count]] = await connection.execute(
        `SELECT COUNT(*) AS total FROM students
         WHERE school_id = ? AND status = 'Active' AND section_id = ?
           AND (enrollment_year_id = ? OR (enrollment_year_id IS NULL AND academic_year = ?))
           AND ${confirmedEnrollmentSql}`,
        [schoolId, targetSection.id, period.academicYearId, period.academicYear]
      )
      if (Number(count.total) + selectedStudents.length > capacity) {
        await connection.rollback()
        return res.status(409).json({ message: 'The selected students exceed this section’s available capacity.' })
      }
      assignments = selectedStudents.map((student) => ({ student, section: targetSection }))
    } else {
      const activeSections = sections.map((section) => ({
        ...section,
        assigned: countBySection.get(Number(section.id))?.total || 0,
      }))
      const totalCapacity = () => activeSections.reduce(
        (sum, section) => sum + Math.max(0, capacity - section.assigned), 0
      )
      const sectionsToCreate = Math.ceil(Math.max(0, students.length - totalCapacity()) / capacity)
      if (sectionsToCreate) {
        const [existingSectionNames] = await connection.execute(
          `SELECT section_name AS sectionName FROM school_sections
          WHERE school_id = ? AND grade_level = ?
            AND ((academic_year_id = ? AND academic_term_id = ?)
              OR (academic_year_id IS NULL AND academic_term_id IS NULL)) FOR UPDATE`,
          [schoolId, grade, period.academicYearId, period.termId]
        )
        const usedNames = new Set(existingSectionNames.map(({ sectionName }) => sectionName.toLowerCase()))
        let suffixIndex = 0
        let created = 0
        while (created < sectionsToCreate) {
          const sectionName = `Section ${sectionSuffix(suffixIndex++)}`
          if (usedNames.has(sectionName.toLowerCase())) continue
          const [result] = await connection.execute(
            `INSERT INTO school_sections
               (grade_level, section_name, is_active, school_id, academic_year_id, academic_term_id)
             VALUES (?, ?, TRUE, ?, ?, ?)`,
            [grade, sectionName, schoolId, period.academicYearId, period.termId]
          )
          const section = { id: Number(result.insertId), sectionName }
          activeSections.push({ ...section, assigned: 0 })
          sections.push(section)
          countBySection.set(section.id, { total: 0, Female: 0, Male: 0 })
          usedNames.add(sectionName.toLowerCase())
          created += 1
        }
      }
      activeSections.sort((a, b) => compareSectionNames(a.sectionName, b.sectionName))
      const ordered = sortAllocationStudents(students, sortBy)
      for (const student of ordered) {
        const section = activeSections.find((item) => item.assigned < capacity)
        if (!section) break
        section.assigned += 1
        assignments.push({ student, section })
      }
    }

    const assignmentsBySection = new Map()
    for (const assignment of assignments) {
      const key = Number(assignment.section.id)
      if (!assignmentsBySection.has(key)) assignmentsBySection.set(key, [])
      assignmentsBySection.get(key).push(assignment)
    }
    for (const [sectionId, sectionAssignments] of assignmentsBySection) {
      const section = sectionAssignments[0].section
      const studentIdsForSection = sectionAssignments.map(({ student }) => Number(student.id))
      const studentUserIds = sectionAssignments.map(({ student }) => Number(student.userId))
      const studentPlaceholders = studentIdsForSection.map(() => '?').join(', ')
      const userPlaceholders = studentUserIds.map(() => '?').join(', ')
      const [updated] = await connection.execute(
        `UPDATE students SET section_id = ?, section = ?, status = 'Active'
         WHERE id IN (${studentPlaceholders}) AND school_id = ? AND status IN ('Unassigned', 'Active') AND section_id IS NULL
           AND ${confirmedEnrollmentSql}
           AND (enrollment_year_id = ? OR (enrollment_year_id IS NULL AND academic_year = ?))`,
        [sectionId, section.sectionName, ...studentIdsForSection, schoolId, period.academicYearId, period.academicYear]
      )
      if (Number(updated.affectedRows) !== studentIdsForSection.length) {
        await connection.rollback()
        return res.status(409).json({ message: 'Student assignments changed while this allocation was being saved. Refresh and try again.' })
      }
      await connection.execute(
        `UPDATE student_records SET section = ?, status = 'Active' WHERE user_id IN (${userPlaceholders})`,
        [section.sectionName, ...studentUserIds]
      )
    }
    await connection.commit()
    return res.json({
      message: 'Student sections assigned successfully.',
      assigned: assignments.length,
      assignments: assignments.map(({ student, section }) => ({
        studentId: student.id, sectionId: section.id, sectionName: section.sectionName,
      })),
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Unable to assign Registrar student sections:', error.message)
    return next(error)
  } finally {
    connection?.release()
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
              student.status, student.academic_status AS academicStatus,
              student.section_status AS sectionStatus
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
    const sectionId = await getActiveSectionId(connection, schoolId, grade, section)
    await connection.execute(
      `UPDATE users SET full_name = ?, grade_level = ?${passwordHash ? ', password = ?' : ''}
       WHERE id = ? AND school_id = ? AND role = 'Student'`,
      passwordHash
        ? [fullName, grade, passwordHash, req.params.id, schoolId]
        : [fullName, grade, req.params.id, schoolId]
    )
    await connection.execute(
      `UPDATE students SET full_name = ?, email = ?, dob = ?, date_of_birth = ?, gender = ?,
         grade = ?, grade_level = ?, section = ?, section_id = ?, previous_school = ?, region = ?, zone = ?,
         woreda = ?, kebele = ?, house_no = ?, phone_number = ?, phone = ?, guardian_name = ?,
         guardian_relation = ?, relationship = ?, guardian_phone = ?, guardian_email = ?,
         emergency_contact_name = ?, emergency_contact_phone = ?, emergency_contact = ?,
         address = ?, photo_path = ?, parent_photo_url = ?, academic_year = ?, registration_date = ?
       WHERE user_id = ? AND school_id = ?`,
      [fullName, email || null, dob, dob, gender, grade, grade, section, sectionId, previousSchool,
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
    const options = await getConfiguredAcademicOptions(pool, schoolId)
    const activePeriod = await getCurrentAcademicPeriod(pool, schoolId)
    if (activePeriod) {
      const [sections] = await pool.execute(
        `SELECT grade_level AS gradeLevel, section_name AS sectionName
         FROM school_sections
         WHERE school_id = ? AND is_active = TRUE
           AND ((? IS NOT NULL AND academic_year_id = ? AND academic_term_id = ?)
             OR (academic_year_id IS NULL AND academic_term_id IS NULL))
         ORDER BY grade_level, section_name`,
        [schoolId, activePeriod.termId, activePeriod.academicYearId, activePeriod.termId]
      )
      options.sections = sections
    }
    return res.json(options)
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
    'section', 'academicYear', 'registrationDate',
  ]
  const values = Object.fromEntries(fields.map((field) => [
    field,
    typeof body[field] === 'string'
      ? body[field].trim()
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
    grade, ...(req.user.role === 'Registrar' ? [] : [values.section]),
    values.academicYear, registrationDate,
  ]
  if (requiredFields.some((field) => !field)) {
    await cleanupUploadedPhotos()
    return res.status(400).json({ message: 'Complete all required student details.' })
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
    || (values.section && !academicOptions.sections.some((section) => section.gradeLevel === grade && section.sectionName === values.section))
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
    const period = await getCurrentAcademicPeriod(connection, schoolId)
    const requiresCheckIn = req.user.role === 'Registrar'
    const sectionId = requiresCheckIn
      ? null
      : await getActiveSectionId(connection, schoolId, grade, values.section)
    const sectionName = sectionId ? values.section : null
    const studentStatus = sectionId ? 'Active' : 'Unassigned'
    const academicStatus = grade === 'Grade 9' ? 'Active' : 'Enrolled'
    const sectionStatus = sectionId && !requiresCheckIn ? 'Confirmed / Enrolled' : 'Pending Check-In'
    const passwordHash = await bcrypt.hash(DEFAULT_TEMPORARY_PASSWORD, 10)
    const loginEmail = `student_${randomUUID().replaceAll('-', '')}@school.local`
    const [result] = await connection.execute(
      `INSERT INTO users
        (full_name, email, password, role, grade_level, registration_source, registered_by, school_id, must_change_password)
             VALUES (?, ?, ?, 'Student', ?, ?, ?, ?, TRUE)`,
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
         grade_level, section, section_id, previous_school, region, zone, woreda, kebele, house_no,
         phone_number, phone, guardian_name, guardian_relation, relationship,
         guardian_phone, guardian_email, emergency_contact_name, emergency_contact_phone,
         emergency_contact, address, photo_path, parent_photo_url, academic_year, registration_date, status,
         academic_status, section_status, enrollment_year_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        sectionName,
        sectionId,
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
        studentStatus,
        academicStatus,
        sectionStatus,
        period?.academicYearId ?? null,
      ]
    )
    await connection.execute(
      `INSERT INTO student_records (
         user_id, date_of_birth, gender, phone, guardian_name, relationship,
         guardian_phone, guardian_email, address, section, academic_year, photo_path, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        sectionName,
        values.academicYear,
        req.file ? `/uploads/students/${req.file.filename}` : null,
        studentStatus,
      ]
    )
    await connection.commit()
    return res.status(201).json({
      id: result.insertId,
      studentId: String(result.insertId),
      name: fullName,
      email: values.email || null,
      className: grade,
      section: sectionName,
      gender: values.gender,
      status: studentStatus,
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
        : ['house_no', 'phone_number', 'email', 'guardian_phone', 'guardian_email', 'emergency_contact_phone'].includes(key)
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
      'full_name', 'dob', 'gender', 'grade', 'previous_school', 'region', 'zone',
      'woreda', 'kebele', 'phone_number', 'guardian_name', 'guardian_relation', 'guardian_phone',
      'emergency_contact_name', 'emergency_contact_phone', 'academic_year',
    ]
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexes.has(header))
    if (missingHeaders.length) {
      return res.status(400).json({ message: `Template is missing required columns: ${missingHeaders.join(', ')}.` })
    }
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const academicOptions = await getConfiguredAcademicOptions(pool, schoolId)
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
      if (req.user.role !== 'Registrar' && raw.section
        && !academicOptions.sections.some((section) => section.gradeLevel === raw.grade && section.sectionName === raw.section)) {
        errors.push('Section is not active for this grade at your school.')
      }
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
      if (address.length > 1000) errors.push('Combined address is too long.')
      if (errors.length) {
        rowResults.push({ row: rowNumber, status: 'skipped', message: errors.join(' ') })
        continue
      }

      let connection
      try {
        connection = await pool.getConnection()
        await connection.beginTransaction()
        const period = await getCurrentAcademicPeriod(connection, schoolId)
        const sectionId = req.user.role !== 'Registrar' && raw.section
          ? await getActiveSectionId(connection, schoolId, raw.grade, raw.section)
          : null
        const sectionName = sectionId ? raw.section : null
        const studentStatus = sectionId ? 'Active' : 'Unassigned'
        const sectionStatus = sectionId && req.user.role !== 'Registrar'
          ? 'Confirmed / Enrolled'
          : 'Pending Check-In'
        const academicStatus = raw.grade === 'Grade 9' ? 'Active' : 'Enrolled'
        const passwordHash = await bcrypt.hash(DEFAULT_TEMPORARY_PASSWORD, 10)
        const loginEmail = `student_${randomUUID().replaceAll('-', '')}@school.local`
        const fullName = raw.full_name
        const [userResult] = await connection.execute(
          `INSERT INTO users
            (full_name, email, password, role, grade_level, registration_source, registered_by, school_id, must_change_password)
           VALUES (?, ?, ?, 'Student', ?, ?, ?, ?, TRUE)`,
          [fullName, loginEmail, passwordHash, raw.grade, req.user.role === 'Registrar' ? 'registrar' : 'admin', req.user.id, schoolId]
        )
        await connection.execute(
          `INSERT INTO students (
             user_id, school_id, full_name, email, dob, date_of_birth, gender, grade,
             grade_level, section, section_id, previous_school, region, zone, woreda, kebele, house_no,
             phone_number, phone, guardian_name, guardian_relation, relationship,
             guardian_phone, guardian_email, emergency_contact_name, emergency_contact_phone,
             emergency_contact, address, photo_path, parent_photo_url, academic_year, registration_date, status,
             academic_status, section_status, enrollment_year_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userResult.insertId, schoolId, fullName, raw.email || null, raw.dob, raw.dob, raw.gender,
            raw.grade, raw.grade, sectionName, sectionId, raw.previous_school, raw.region, raw.zone, raw.woreda,
            raw.kebele, raw.house_no || null, raw.phone_number, raw.phone_number, raw.guardian_name,
            raw.guardian_relation, raw.guardian_relation, raw.guardian_phone, raw.guardian_email || null,
            raw.emergency_contact_name, raw.emergency_contact_phone, raw.emergency_contact_phone,
            address, null, null, raw.academic_year, registrationDate, studentStatus,
            academicStatus, sectionStatus, period?.academicYearId ?? null]
        )
        await connection.execute(
          `INSERT INTO student_records (
             user_id, date_of_birth, gender, phone, guardian_name, relationship,
             guardian_phone, guardian_email, address, section, academic_year, photo_path, status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
          [userResult.insertId, raw.dob, raw.gender, raw.phone_number, raw.guardian_name,
            raw.guardian_relation, raw.guardian_phone, raw.guardian_email || null, address, sectionName, raw.academic_year, studentStatus]
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

export async function getWorkspaceAcademicPeriod(req, res, next) {
  try {
    const schoolId = await getAccountSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your account is not assigned to a school.' })
    const [rows] = await pool.execute(
      `SELECT year.name AS academicYear, term.name AS semester
       FROM academic_years year
       LEFT JOIN academic_terms term ON term.academic_year_id = year.id
         AND term.school_id = year.school_id AND term.is_current = TRUE
       WHERE year.school_id = ? AND year.is_active = TRUE
       ORDER BY year.start_date DESC, term.start_date DESC LIMIT 1`,
      [schoolId]
    )
    res.json(rows[0] ?? null)
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
