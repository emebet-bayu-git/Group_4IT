import { pool } from '../config/db.js'

const validId = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0
const formatSemesterName = (name) => name
  ? String(name).trim().replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim()
  : null

async function getTeacherContext(userId) {
  if (!validId(userId)) return null
  const [[teacher]] = await pool.execute(
    "SELECT school_id AS schoolId FROM users WHERE id = ? AND role = 'Teacher' AND is_active = TRUE LIMIT 1",
    [userId]
  )
  if (!teacher?.schoolId) return null
  const [[period]] = await pool.execute(
    `SELECT y.id AS academicYearId, y.name AS academicYear,
            t.id AS termId, t.name AS semester
     FROM academic_years y
     JOIN academic_terms t ON t.academic_year_id = y.id AND t.school_id = y.school_id
     WHERE y.school_id = ? AND y.is_active = TRUE AND t.is_active = TRUE
     ORDER BY y.start_date DESC, t.start_date DESC LIMIT 1`,
    [teacher.schoolId]
  )
  return {
    schoolId: teacher.schoolId,
    period: period ? { ...period, semester: formatSemesterName(period.semester) } : null,
  }
}

export async function listTeacherClasses(req, res, next) {
  try {
    const context = await getTeacherContext(req.user.id)
    if (!context) return res.status(403).json({ message: 'Your teacher account is not assigned to a school.' })
    const [classes] = await pool.execute(
      `SELECT assignment.id, section.grade_level AS gradeLevel,
              section.section_name AS sectionName, assignment.subject,
              COUNT(DISTINCT studentAccount.id) AS studentCount
       FROM teacher_class_assignments assignment
       JOIN school_sections section ON section.id = assignment.section_id AND section.is_active = TRUE
       LEFT JOIN students student ON student.school_id = assignment.school_id
         AND COALESCE(student.grade, student.grade_level) = section.grade_level
         AND student.section = section.section_name AND student.status = 'Active'
       LEFT JOIN users studentAccount ON studentAccount.id = student.user_id
         AND studentAccount.role = 'Student' AND studentAccount.is_active = TRUE
       WHERE assignment.teacher_id = ? AND assignment.school_id = ?
       GROUP BY assignment.id, section.grade_level, section.section_name, assignment.subject
       ORDER BY section.grade_level, section.section_name, assignment.subject`,
      [req.user.id, context.schoolId]
    )
    return res.json({ classes, period: context.period })
  } catch (error) {
    console.error('Unable to load teacher workload:', error.message)
    return res.status(503).json({ message: 'Unable to load assigned classes. The teacher workspace database setup may be incomplete.' })
  }
}

export async function getTeacherClassGrades(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid assigned class ID.' })
  try {
    const context = await getTeacherContext(req.user.id)
    if (!context) return res.status(403).json({ message: 'Your teacher account is not assigned to a school.' })
    const [[classAssignment]] = await pool.execute(
      `SELECT assignment.id, section.grade_level AS gradeLevel,
              section.section_name AS sectionName, assignment.subject
       FROM teacher_class_assignments assignment
       JOIN school_sections section ON section.id = assignment.section_id AND section.is_active = TRUE
       WHERE assignment.id = ? AND assignment.teacher_id = ? AND assignment.school_id = ?
       LIMIT 1`,
      [req.params.id, req.user.id, context.schoolId]
    )
    if (!classAssignment) return res.status(404).json({ message: 'Assigned class not found.' })
    const [students] = await pool.execute(
      `SELECT student.id AS id, student.full_name AS name,
              COALESCE(student.grade, student.grade_level) AS gradeLevel, student.section,
              grade.assessment_40 AS assessment40, grade.final_60 AS final60,
              grade.total_100 AS total100
       FROM students student
       JOIN users account ON account.id = student.user_id
         AND account.role = 'Student' AND account.is_active = TRUE
       LEFT JOIN student_grades grade ON grade.assignment_id = ?
         AND grade.student_id = student.id
         AND grade.academic_year_id = ? AND grade.term_id = ?
       WHERE student.school_id = ? AND student.status = 'Active'
         AND COALESCE(student.grade, student.grade_level) = ?
         AND student.section = ?
       ORDER BY student.full_name, student.user_id`,
      [classAssignment.id, context.period?.academicYearId ?? null, context.period?.termId ?? null,
        context.schoolId, classAssignment.gradeLevel, classAssignment.sectionName]
    )
    return res.json({ class: classAssignment, period: context.period, students })
  } catch (error) {
    console.error('Unable to load teacher class roster and grades:', error.message)
    return res.status(503).json({ message: 'Unable to load this assigned class. The teacher workspace database setup may be incomplete.' })
  }
}

function parseScore(value, maximum) {
  if (value === '' || value === null || value === undefined) return null
  const score = Number(value)
  if (!Number.isFinite(score) || score < 0 || score > maximum
    || Math.abs(score * 100 - Math.round(score * 100)) > 1e-8) return null
  return score
}

export async function saveTeacherClassGrades(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid assigned class ID.' })
  const rows = req.body?.grades
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) {
    return res.status(400).json({ message: 'Submit between 1 and 500 student grade rows.' })
  }
  const studentIds = rows.map((row) => row?.studentId)
  if (studentIds.some((id) => !validId(id)) || new Set(studentIds.map(Number)).size !== studentIds.length) {
    return res.status(400).json({ message: 'Each grade row must have a unique valid student ID.' })
  }
  const scores = rows.map((row) => ({
    studentId: Number(row.studentId),
    assessment40: parseScore(row.assessment40, 40),
    final60: parseScore(row.final60, 60),
  }))
  if (scores.some((row) => row.assessment40 === null || row.final60 === null)) {
    return res.status(400).json({ message: 'Continuous assessment must be 0–40 and final exam must be 0–60, with at most two decimal places.' })
  }

  let connection
  try {
    const context = await getTeacherContext(req.user.id)
    if (!context) return res.status(403).json({ message: 'Your teacher account is not assigned to a school.' })
    if (!context.period) return res.status(409).json({ message: 'An active academic year and term must be configured before grade entry.' })
    const [[classAssignment]] = await pool.execute(
      `SELECT assignment.id, section.grade_level AS gradeLevel,
              section.section_name AS sectionName
       FROM teacher_class_assignments assignment
       JOIN school_sections section ON section.id = assignment.section_id AND section.is_active = TRUE
       WHERE assignment.id = ? AND assignment.teacher_id = ? AND assignment.school_id = ?
       LIMIT 1`,
      [req.params.id, req.user.id, context.schoolId]
    )
    if (!classAssignment) return res.status(404).json({ message: 'Assigned class not found.' })
    const placeholders = studentIds.map(() => '?').join(', ')
    const [enrolledStudents] = await pool.execute(
      `SELECT student.id AS id
       FROM students student
       JOIN users account ON account.id = student.user_id
         AND account.role = 'Student' AND account.is_active = TRUE
       WHERE student.school_id = ? AND student.status = 'Active'
         AND COALESCE(student.grade, student.grade_level) = ?
         AND student.section = ? AND student.user_id IN (${placeholders})`,
      [context.schoolId, classAssignment.gradeLevel, classAssignment.sectionName, ...studentIds]
    )
    if (enrolledStudents.length !== studentIds.length) {
      return res.status(400).json({ message: 'One or more students are not active members of this assigned class.' })
    }

    connection = await pool.getConnection()
    await connection.beginTransaction()
    for (const grade of scores) {
      const total100 = Math.round((grade.assessment40 + grade.final60) * 100) / 100
      await connection.execute(
        `INSERT INTO student_grades
          (assignment_id, student_id, school_id, academic_year_id, term_id,
           assessment_40, final_60, total_100, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE assessment_40 = VALUES(assessment_40),
           final_60 = VALUES(final_60), total_100 = VALUES(total_100), updated_by = VALUES(updated_by)`,
        [classAssignment.id, grade.studentId, context.schoolId,
          context.period.academicYearId, context.period.termId,
          grade.assessment40, grade.final60, total100, req.user.id]
      )
    }
    await connection.commit()
    return res.json({ saved: scores.length, academicYear: context.period.academicYear, semester: context.period.semester })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Unable to save teacher grades:', error.message)
    return res.status(503).json({ message: 'Unable to save grades. Check the teacher workspace database setup and try again.' })
  } finally {
    connection?.release()
  }
}