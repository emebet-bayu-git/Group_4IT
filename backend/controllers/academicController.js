import { pool } from '../config/db.js'

const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const validId = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function getSchoolId(userId) {
  const [[user]] = await pool.execute(
    'SELECT school_id AS schoolId, role FROM users WHERE id = ? AND is_active = TRUE LIMIT 1',
    [userId]
  )
  if (validId(user?.schoolId)) return user.schoolId
  if (user?.role !== 'School Admin') return null
  const [assignments] = await pool.execute(
    'SELECT school_id AS schoolId FROM school_admin_assignments WHERE user_id = ? ORDER BY assigned_at DESC LIMIT 1',
    [userId]
  )
  return assignments[0]?.schoolId
}

async function requireSchoolId(req, res) {
  const schoolId = await getSchoolId(req.user.id)
  if (!validId(schoolId)) {
    res.status(403).json({ message: 'Your account is not assigned to a school.' })
    return null
  }
  return schoolId
}

function validDateRange(startDate, endDate) {
  return validDate(startDate) && validDate(endDate) && startDate < endDate
}

function handleDuplicate(error, res, message) {
  if (error.code !== 'ER_DUP_ENTRY') return false
  res.status(409).json({ message })
  return true
}

async function listRows(req, res, next, table, columns, orderBy) {
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [rows] = await pool.execute(
      `SELECT ${columns} FROM ${table} WHERE school_id = ? ORDER BY ${orderBy}`,
      [schoolId]
    )
    return res.json(rows)
  } catch (error) {
    return next(error)
  }
}

export const listAcademicYears = (req, res, next) => listRows(
  req, res, next, 'academic_years',
  'id, name, start_date AS startDate, end_date AS endDate, is_active AS isActive',
  'start_date DESC'
)

export const listAcademicTerms = (req, res, next) => listRows(
  req, res, next, 'academic_terms',
  'id, academic_year_id AS academicYearId, name, start_date AS startDate, end_date AS endDate, is_active AS isActive, is_current AS isCurrent',
  'start_date'
)

function formatSemesterName(name) {
  if (!name) return null
  return String(name).trim().replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim()
}

async function getAcademicSection(executor, sectionId, schoolId) {
  const [[section]] = await executor.execute(
    `SELECT section.id, section.grade_level AS gradeLevel,
            section.section_name AS sectionName, section.is_active AS isActive,
            section.academic_year_id AS academicYearId, year.name AS academicYear,
            section.academic_term_id AS semesterId, semester.name AS semester,
            section.homeroom_teacher_id AS homeroomTeacherId,
            teacher.full_name AS homeroomTeacherName
     FROM school_sections section
     LEFT JOIN academic_years year ON year.id = section.academic_year_id AND year.school_id = section.school_id
     LEFT JOIN academic_terms semester ON semester.id = section.academic_term_id AND semester.school_id = section.school_id
     LEFT JOIN users teacher ON teacher.id = section.homeroom_teacher_id
     WHERE section.id = ? AND section.school_id = ? LIMIT 1`,
    [sectionId, schoolId]
  )
  return section ? { ...section, semester: formatSemesterName(section.semester) } : null
}

export async function listAcademicSections(req, res, next) {
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [sections] = await pool.execute(
      `SELECT section.id, section.grade_level AS gradeLevel,
              section.section_name AS sectionName, section.is_active AS isActive,
              section.academic_year_id AS academicYearId, year.name AS academicYear,
              section.academic_term_id AS semesterId, semester.name AS semester,
              section.homeroom_teacher_id AS homeroomTeacherId,
              teacher.full_name AS homeroomTeacherName
       FROM school_sections section
       LEFT JOIN academic_years year ON year.id = section.academic_year_id AND year.school_id = section.school_id
       LEFT JOIN academic_terms semester ON semester.id = section.academic_term_id AND semester.school_id = section.school_id
       LEFT JOIN users teacher ON teacher.id = section.homeroom_teacher_id
       WHERE section.school_id = ?
       ORDER BY year.start_date DESC, semester.start_date DESC, section.grade_level, section.section_name`,
      [schoolId]
    )
    return res.json(sections.map((section) => ({ ...section, semester: formatSemesterName(section.semester) })))
  } catch (error) {
    return next(error)
  }
}

export async function listAcademicTeachers(req, res, next) {
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [teachers] = await pool.execute(
      `SELECT id, full_name AS name FROM users
       WHERE school_id = ? AND role = 'Teacher' AND is_active = TRUE
       ORDER BY full_name`,
      [schoolId]
    )
    return res.json(teachers)
  } catch (error) {
    return next(error)
  }
}

export async function updateAcademicSectionAdvisor(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid grade section ID.' })
  const teacherId = req.body?.teacherId === '' || req.body?.teacherId === null
    ? null
    : req.body?.teacherId
  if (teacherId !== null && !validId(teacherId)) {
    return res.status(400).json({ message: 'Choose a valid homeroom teacher.' })
  }
  let connection
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [[section]] = await pool.execute(
      `SELECT id, academic_year_id AS academicYearId, academic_term_id AS academicTermId
       FROM school_sections WHERE id = ? AND school_id = ? LIMIT 1`,
      [req.params.id, schoolId]
    )
    if (!section) return res.status(404).json({ message: 'Grade section not found.' })
    if (teacherId !== null) {
      const [[teacher]] = await pool.execute(
        `SELECT id FROM users
         WHERE id = ? AND school_id = ? AND role = 'Teacher' AND is_active = TRUE LIMIT 1`,
        [teacherId, schoolId]
      )
      if (!teacher) return res.status(400).json({ message: 'Choose an active teacher from your school.' })
    }
    connection = await pool.getConnection()
    await connection.beginTransaction()
    if (teacherId !== null) {
      await connection.execute(
        `UPDATE school_sections
         SET homeroom_teacher_id = NULL
         WHERE school_id = ? AND homeroom_teacher_id = ? AND id <> ?
           AND ((academic_year_id = ? AND academic_term_id = ?)
             OR (academic_year_id IS NULL AND academic_term_id IS NULL))`,
        [schoolId, teacherId, req.params.id, section.academicYearId, section.academicTermId]
      )
    }
    await connection.execute(
      'UPDATE school_sections SET homeroom_teacher_id = ? WHERE id = ? AND school_id = ?',
      [teacherId, req.params.id, schoolId]
    )
    await connection.commit()
    return res.json(await getAcademicSection(pool, req.params.id, schoolId))
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function getActiveAcademicPeriod(req, res, next) {
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [rows] = await pool.execute(
      `SELECT school.id AS schoolId, school.name AS schoolName,
              year.id AS academicYearId, year.name AS academicYear,
              year.start_date AS yearStartDate, year.end_date AS yearEndDate,
              term.id AS semesterId, term.name AS semester
       FROM schools school
       LEFT JOIN academic_years year ON year.school_id = school.id AND year.is_active = TRUE
       LEFT JOIN academic_terms term ON term.academic_year_id = year.id
         AND term.school_id = year.school_id AND term.is_current = TRUE
       WHERE school.id = ?
       ORDER BY year.start_date DESC, term.start_date DESC LIMIT 1`,
      [schoolId]
    )
    if (!rows.length) return res.status(404).json({ message: 'Your assigned school could not be found.' })
    return res.json({
      schoolId: rows[0].schoolId,
      schoolName: rows[0].schoolName,
      academicYearId: rows[0].academicYearId || null,
      academicYear: rows[0].academicYear || null,
      semesterId: rows[0].semesterId || null,
      semester: formatSemesterName(rows[0].semester),
      yearStartDate: rows[0].yearStartDate,
      yearEndDate: rows[0].yearEndDate,
    })
  } catch (error) {
    return next(error)
  }
}

function validateYear(body) {
  return typeof body?.name === 'string'
    && /^\d{4}\/\d{4}$/.test(body.name.trim())
    && validDateRange(body.startDate, body.endDate)
    && (body.isActive === undefined || typeof body.isActive === 'boolean')
}

export async function createAcademicYear(req, res, next) {
  const body = req.body ?? {}
  if (!validateYear(body)) return res.status(400).json({ message: 'Enter a year such as 2026/2027 and a valid start and end date.' })
  let connection
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    connection = await pool.getConnection()
    await connection.beginTransaction()
    if (body.isActive === true) {
      await connection.execute('UPDATE academic_years SET is_active = FALSE WHERE school_id = ?', [schoolId])
    }
    const [result] = await connection.execute(
      'INSERT INTO academic_years (name, start_date, end_date, is_active, school_id) VALUES (?, ?, ?, ?, ?)',
      [body.name.trim(), body.startDate, body.endDate, body.isActive === true, schoolId]
    )
    if (body.isActive === true) {
      await connection.execute(
        'UPDATE academic_terms SET is_active = FALSE, is_current = FALSE WHERE school_id = ? AND academic_year_id <> ?',
        [schoolId, result.insertId]
      )
    }
    await connection.commit()
    const [[year]] = await pool.execute(
      'SELECT id, name, start_date AS startDate, end_date AS endDate, is_active AS isActive FROM academic_years WHERE id = ? AND school_id = ?',
      [result.insertId, schoolId]
    )
    return res.status(201).json(year)
  } catch (error) {
    if (connection) await connection.rollback()
    if (handleDuplicate(error, res, 'That academic year already exists for your school.')) return
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function updateAcademicYear(req, res, next) {
  const body = req.body ?? {}
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid academic year ID.' })
  if (!validateYear(body)) return res.status(400).json({ message: 'Enter a year such as 2026/2027 and a valid start and end date.' })
  let connection
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [[existing]] = await connection.execute(
      'SELECT id FROM academic_years WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, schoolId]
    )
    if (!existing) {
      await connection.rollback()
      return res.status(404).json({ message: 'Academic year not found.' })
    }
    await connection.execute(
      'UPDATE academic_years SET name = ?, start_date = ?, end_date = ? WHERE id = ? AND school_id = ?',
      [body.name.trim(), body.startDate, body.endDate, req.params.id, schoolId]
    )
    if (body.isActive === true) {
      await connection.execute('UPDATE academic_years SET is_active = FALSE WHERE school_id = ?', [schoolId])
    }
    await connection.execute(
      'UPDATE academic_years SET is_active = ? WHERE id = ? AND school_id = ?',
      [body.isActive === true, req.params.id, schoolId]
    )
    if (body.isActive === true) {
      await connection.execute(
        'UPDATE academic_terms SET is_active = FALSE, is_current = FALSE WHERE school_id = ? AND academic_year_id <> ?',
        [schoolId, req.params.id]
      )
    } else {
      await connection.execute(
        'UPDATE academic_terms SET is_active = FALSE, is_current = FALSE WHERE school_id = ? AND academic_year_id = ?',
        [schoolId, req.params.id]
      )
    }
    await connection.commit()
    const [[year]] = await pool.execute(
      'SELECT id, name, start_date AS startDate, end_date AS endDate, is_active AS isActive FROM academic_years WHERE id = ? AND school_id = ?',
      [req.params.id, schoolId]
    )
    return res.json(year)
  } catch (error) {
    if (connection) await connection.rollback()
    if (handleDuplicate(error, res, 'That academic year already exists for your school.')) return
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function deleteAcademicYear(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid academic year ID.' })
  let connection
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [[year]] = await pool.execute(
      'SELECT id FROM academic_years WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, schoolId]
    )
    if (!year) return res.status(404).json({ message: 'Academic year not found.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute(
      'DELETE FROM school_sections WHERE academic_year_id = ? AND school_id = ?',
      [req.params.id, schoolId]
    )
    await connection.execute(
      'DELETE FROM academic_terms WHERE academic_year_id = ? AND school_id = ?',
      [req.params.id, schoolId]
    )
    await connection.execute(
      'DELETE FROM academic_years WHERE id = ? AND school_id = ?',
      [req.params.id, schoolId]
    )
    await connection.commit()
    return res.json({ message: 'Academic year deleted.' })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
}

async function validateTerm(schoolId, body) {
  if (!validId(body?.academicYearId) || !['Semester 1', 'Semester 2'].includes(body.name)
    || !validDateRange(body.startDate, body.endDate)
    || (body.isActive !== undefined && typeof body.isActive !== 'boolean')) return false
  const [years] = await pool.execute(
    'SELECT id, is_active AS isActive FROM academic_years WHERE id = ? AND school_id = ? LIMIT 1',
    [body.academicYearId, schoolId]
  )
  return years.length > 0 && (body.isActive !== true || Boolean(years[0].isActive))
}

async function setCurrentTerm(connection, schoolId, termId) {
  await connection.execute('UPDATE academic_terms SET is_active = FALSE, is_current = FALSE WHERE school_id = ?', [schoolId])
  await connection.execute('UPDATE academic_terms SET is_active = TRUE, is_current = TRUE WHERE id = ? AND school_id = ?', [termId, schoolId])
}

export async function createAcademicTerm(req, res, next) {
  const body = req.body ?? {}
  let connection
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    if (!await validateTerm(schoolId, body)) return res.status(400).json({ message: 'Choose an existing school year, enter a term name, and provide valid dates. To mark a term current, first mark its school year active.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    if (body.isActive === true) {
      await connection.execute('UPDATE academic_terms SET is_active = FALSE, is_current = FALSE WHERE school_id = ?', [schoolId])
    }
    const [result] = await connection.execute(
      'INSERT INTO academic_terms (academic_year_id, name, start_date, end_date, is_active, is_current, school_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [body.academicYearId, body.name.trim(), body.startDate, body.endDate, body.isActive === true, body.isActive === true, schoolId]
    )
    await connection.commit()
    const [[term]] = await pool.execute(
      'SELECT id, academic_year_id AS academicYearId, name, start_date AS startDate, end_date AS endDate, is_active AS isActive FROM academic_terms WHERE id = ? AND school_id = ?',
      [result.insertId, schoolId]
    )
    return res.status(201).json(term)
  } catch (error) {
    if (connection) await connection.rollback()
    if (handleDuplicate(error, res, 'That term already exists in the selected academic year.')) return
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function updateAcademicTerm(req, res, next) {
  const body = req.body ?? {}
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid term ID.' })
  let connection
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    if (!await validateTerm(schoolId, body)) return res.status(400).json({ message: 'Choose an existing school year, enter a term name, and provide valid dates. To mark a term current, first mark its school year active.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [[existing]] = await connection.execute(
      'SELECT id, academic_year_id AS academicYearId FROM academic_terms WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, schoolId]
    )
    if (!existing) {
      await connection.rollback()
      return res.status(404).json({ message: 'Term not found.' })
    }
    if (Number(existing.academicYearId) !== Number(body.academicYearId)) {
      const [[dependencies]] = await connection.execute(
        'SELECT COUNT(*) AS total FROM school_sections WHERE academic_term_id = ? AND school_id = ?',
        [req.params.id, schoolId]
      )
      if (Number(dependencies.total)) {
        await connection.rollback()
        return res.status(409).json({ message: 'This semester has configured grade sections. Remove or update those sections before moving it to another academic year.' })
      }
    }
    await connection.execute(
      `UPDATE academic_terms SET academic_year_id = ?, name = ?, start_date = ?, end_date = ?
       WHERE id = ? AND school_id = ?`,
      [body.academicYearId, body.name.trim(), body.startDate, body.endDate, req.params.id, schoolId]
    )
    if (body.isActive === true) await setCurrentTerm(connection, schoolId, req.params.id)
    else await connection.execute('UPDATE academic_terms SET is_active = FALSE, is_current = FALSE WHERE id = ? AND school_id = ?', [req.params.id, schoolId])
    await connection.commit()
    const [[term]] = await pool.execute(
      'SELECT id, academic_year_id AS academicYearId, name, start_date AS startDate, end_date AS endDate, is_active AS isActive FROM academic_terms WHERE id = ? AND school_id = ?',
      [req.params.id, schoolId]
    )
    return res.json(term)
  } catch (error) {
    if (connection) await connection.rollback()
    if (handleDuplicate(error, res, 'That term already exists in the selected academic year.')) return
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function deleteAcademicTerm(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid term ID.' })
  let connection
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [[term]] = await pool.execute(
      'SELECT id FROM academic_terms WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, schoolId]
    )
    if (!term) return res.status(404).json({ message: 'Term not found.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute(
      'DELETE FROM school_sections WHERE academic_term_id = ? AND school_id = ?',
      [req.params.id, schoolId]
    )
    await connection.execute(
      'DELETE FROM academic_terms WHERE id = ? AND school_id = ?',
      [req.params.id, schoolId]
    )
    await connection.commit()
    return res.json({ message: 'Term deleted.' })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
}

function validateSection(body) {
  return grades.includes(body?.gradeLevel)
    && typeof body.sectionName === 'string'
    && /^[A-Za-z0-9 -]{1,30}$/.test(body.sectionName.trim())
    && (body.isActive === undefined || typeof body.isActive === 'boolean')
}

async function getActiveSectionPeriod(schoolId) {
  const [periods] = await pool.execute(
    `SELECT year.id AS academicYearId, semester.id AS semesterId
     FROM academic_years year
     JOIN academic_terms semester ON semester.academic_year_id = year.id
       AND semester.school_id = year.school_id
     WHERE year.school_id = ?
       AND year.is_active = TRUE AND semester.is_current = TRUE LIMIT 1`,
    [schoolId]
  )
  return periods[0] || null
}

export async function createAcademicSection(req, res, next) {
  const body = req.body ?? {}
  if (!validateSection(body)) return res.status(400).json({ message: 'Choose a grade, section name, active academic year, and active semester.' })
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const period = await getActiveSectionPeriod(schoolId)
    if (!period) return res.status(409).json({ message: 'Set an academic year and semester as active before adding grade sections.' })
    const [result] = await pool.execute(
      `INSERT INTO school_sections
        (grade_level, section_name, is_active, school_id, academic_year_id, academic_term_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [body.gradeLevel, body.sectionName.trim(), body.isActive !== false, schoolId, period.academicYearId, period.semesterId]
    )
    const section = await getAcademicSection(pool, result.insertId, schoolId)
    return res.status(201).json(section)
  } catch (error) {
    if (handleDuplicate(error, res, 'That section name already exists for this grade, academic year, and semester.')) return
    return next(error)
  }
}

export async function updateAcademicSection(req, res, next) {
  const body = req.body ?? {}
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid grade section ID.' })
  if (!validateSection(body)) return res.status(400).json({ message: 'Choose a grade, section name, active academic year, and active semester.' })
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const period = await getActiveSectionPeriod(schoolId)
    if (!period) return res.status(409).json({ message: 'Set an academic year and semester as active before saving grade sections.' })
    const [[existing]] = await pool.execute(
      'SELECT id FROM school_sections WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, schoolId]
    )
    if (!existing) return res.status(404).json({ message: 'Grade section not found.' })
    await pool.execute(
      `UPDATE school_sections SET grade_level = ?, section_name = ?, is_active = ?,
              academic_year_id = ?, academic_term_id = ?
       WHERE id = ? AND school_id = ?`,
      [body.gradeLevel, body.sectionName.trim(), body.isActive !== false,
        period.academicYearId, period.semesterId, req.params.id, schoolId]
    )
    const section = await getAcademicSection(pool, req.params.id, schoolId)
    return res.json(section)
  } catch (error) {
    if (handleDuplicate(error, res, 'That section name already exists for this grade, academic year, and semester.')) return
    return next(error)
  }
}

export async function deleteAcademicSection(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid grade section ID.' })
  try {
    const schoolId = await requireSchoolId(req, res)
    if (!schoolId) return
    const [[section]] = await pool.execute(
      'SELECT id, grade_level AS gradeLevel, section_name AS sectionName FROM school_sections WHERE id = ? AND school_id = ? LIMIT 1',
      [req.params.id, schoolId]
    )
    if (!section) return res.status(404).json({ message: 'Grade section not found.' })
    const [[students]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM students
       WHERE school_id = ? AND section = ? AND COALESCE(grade, grade_level) = ?`,
      [schoolId, section.sectionName, section.gradeLevel]
    )
    const [[assignments]] = await pool.execute('SELECT COUNT(*) AS total FROM teacher_class_assignments WHERE section_id = ? AND school_id = ?', [req.params.id, schoolId])
    if (Number(students.total) || Number(assignments.total)) {
      return res.status(409).json({ message: 'This section has enrolled students or teacher assignments. Deactivate it instead of deleting it.' })
    }
    await pool.execute('DELETE FROM school_sections WHERE id = ? AND school_id = ?', [req.params.id, schoolId])
    return res.json({ message: 'Grade section deleted.' })
  } catch (error) {
    return next(error)
  }
}