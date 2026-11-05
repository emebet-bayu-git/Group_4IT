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
     WHERE y.school_id = ? AND y.is_active = TRUE AND t.is_current = TRUE
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
      `SELECT assignment.id, section.id AS sectionId, section.grade_level AS gradeLevel,
              section.section_name AS sectionName, assignment.subject,
              COALESCE(section.homeroom_teacher_id = assignment.teacher_id, FALSE) AS isHomeroomTeacher,
              submission.status AS submissionStatus,
              COUNT(DISTINCT studentAccount.id) AS studentCount
       FROM teacher_class_assignments assignment
       LEFT JOIN school_sections section ON section.id = assignment.section_id
         AND section.school_id = assignment.school_id AND section.is_active = TRUE
       LEFT JOIN section_result_submissions submission ON submission.section_id = section.id
         AND submission.academic_year_id = ? AND submission.term_id = ?
       LEFT JOIN students student ON student.school_id = assignment.school_id
         AND COALESCE(student.grade, student.grade_level) = section.grade_level
         AND student.section = section.section_name AND student.status = 'Active'
         AND student.section_status = 'Confirmed / Enrolled'
         AND student.enrollment_year_id = ?
       LEFT JOIN users studentAccount ON studentAccount.id = student.user_id
         AND studentAccount.role = 'Student' AND studentAccount.is_active = TRUE
       WHERE assignment.teacher_id = ? AND assignment.school_id = ? AND section.id IS NOT NULL
       GROUP BY assignment.id, section.id, section.grade_level, section.section_name,
         assignment.subject, section.homeroom_teacher_id, submission.status
       ORDER BY section.grade_level, section.section_name, assignment.subject`,
      [context.period?.academicYearId ?? null, context.period?.termId ?? null,
        context.period?.academicYearId ?? null,
        req.user.id, context.schoolId]
    )
    let advisorSections = []
    if (context.period) {
      const [sections] = await pool.execute(
        `SELECT section.id, section.grade_level AS gradeLevel,
                section.section_name AS sectionName
         FROM users teacher
         LEFT JOIN school_sections section ON section.homeroom_teacher_id = teacher.id
           AND section.school_id = teacher.school_id AND section.is_active = TRUE
           AND section.academic_year_id = ? AND section.academic_term_id = ?
         WHERE teacher.id = ? AND teacher.school_id = ? AND teacher.role = 'Teacher'
           AND teacher.is_active = TRUE
         ORDER BY section.grade_level, section.section_name`,
        [context.period.academicYearId, context.period.termId, req.user.id, context.schoolId]
      )
      advisorSections = sections.filter((section) => section.id !== null)
    }
    return res.json({ classes, advisorSections, period: context.period })
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
      `SELECT assignment.id, section.id AS sectionId, section.grade_level AS gradeLevel,
              section.section_name AS sectionName, assignment.subject,
              submission.status AS submissionStatus
       FROM teacher_class_assignments assignment
       JOIN school_sections section ON section.id = assignment.section_id AND section.is_active = TRUE
       LEFT JOIN section_result_submissions submission ON submission.section_id = section.id
         AND submission.academic_year_id = ? AND submission.term_id = ?
       WHERE assignment.id = ? AND assignment.teacher_id = ? AND assignment.school_id = ?
       LIMIT 1`,
      [context.period?.academicYearId ?? null, context.period?.termId ?? null,
        req.params.id, req.user.id, context.schoolId]
    )
    if (!classAssignment) return res.status(404).json({ message: 'Assigned class not found.' })
    classAssignment.locked = Boolean(classAssignment.submissionStatus)
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
         AND student.section_status = 'Confirmed / Enrolled'
         AND student.enrollment_year_id = ?
         AND COALESCE(student.grade, student.grade_level) = ?
         AND student.section = ?
       ORDER BY student.full_name, student.user_id`,
      [classAssignment.id, context.period?.academicYearId ?? null, context.period?.termId ?? null,
       context.schoolId, context.period?.academicYearId ?? null,
       classAssignment.gradeLevel, classAssignment.sectionName]
    )
    return res.json({ class: classAssignment, period: context.period, students })
  } catch (error) {
    console.error('Unable to load teacher class roster and grades:', error.message)
    return res.status(503).json({ message: 'Unable to load this assigned class. The teacher workspace database setup may be incomplete.' })
  }
}

async function loadSectionResultBundle(executor, sectionId, schoolId, academicYearId, termId) {
  const [[section]] = await executor.execute(
    `SELECT id, grade_level AS gradeLevel, section_name AS sectionName,
            homeroom_teacher_id AS homeroomTeacherId
     FROM school_sections
     WHERE id = ? AND school_id = ? LIMIT 1`,
    [sectionId, schoolId]
  )
  if (!section) return null

  const [students] = await executor.execute(
    `SELECT student.id, student.user_id AS userId, student.full_name AS name,
            account.student_number AS studentNumber
     FROM students student
     JOIN users account ON account.id = student.user_id
       AND account.role = 'Student' AND account.is_active = TRUE
     WHERE student.school_id = ? AND student.status = 'Active'
       AND student.section_status = 'Confirmed / Enrolled'
       AND student.enrollment_year_id = ?
       AND COALESCE(student.grade, student.grade_level) = ?
       AND student.section = ?
     ORDER BY student.full_name, student.user_id`,
    [schoolId, academicYearId, section.gradeLevel, section.sectionName]
  )
  const [subjects] = await executor.execute(
    `SELECT assignment.id AS assignmentId, assignment.subject,
            teacher.id AS teacherId, teacher.full_name AS teacherName,
            COUNT(DISTINCT studentAccount.id) AS studentCount,
            COUNT(DISTINCT CASE WHEN studentAccount.id IS NOT NULL THEN grade.student_id END) AS gradedCount
     FROM teacher_class_assignments assignment
     JOIN users teacher ON teacher.id = assignment.teacher_id
       AND teacher.role = 'Teacher'
     LEFT JOIN students student ON student.school_id = assignment.school_id
       AND COALESCE(student.grade, student.grade_level) = ?
       AND student.section = ? AND student.status = 'Active'
       AND student.section_status = 'Confirmed / Enrolled'
       AND student.enrollment_year_id = ?
     LEFT JOIN users studentAccount ON studentAccount.id = student.user_id
       AND studentAccount.role = 'Student' AND studentAccount.is_active = TRUE
     LEFT JOIN student_grades grade ON grade.assignment_id = assignment.id
       AND grade.student_id = student.id AND grade.academic_year_id = ?
       AND grade.term_id = ?
     WHERE assignment.section_id = ? AND assignment.school_id = ?
     GROUP BY assignment.id, assignment.subject, teacher.id, teacher.full_name
     ORDER BY assignment.subject, teacher.full_name`,
    [section.gradeLevel, section.sectionName, academicYearId, academicYearId, termId, sectionId, schoolId]
  )
  const subjectIds = subjects.map(({ assignmentId }) => assignmentId)
  let grades = []
  if (subjectIds.length) {
    const placeholders = subjectIds.map(() => '?').join(', ')
    const [gradeRows] = await executor.execute(
      `SELECT assignment_id AS assignmentId, student_id AS studentId,
              assessment_40 AS assessment40, final_60 AS final60, total_100 AS total100
       FROM student_grades
       WHERE school_id = ? AND academic_year_id = ? AND term_id = ?
         AND assignment_id IN (${placeholders})`,
      [schoolId, academicYearId, termId, ...subjectIds]
    )
    grades = gradeRows
  }
  const gradeMap = new Map(grades.map((grade) => [
    `${grade.studentId}:${grade.assignmentId}`,
    grade,
  ]))
  const normalizedSubjects = subjects.map((subject) => ({
    ...subject,
    studentCount: Number(subject.studentCount),
    gradedCount: Number(subject.gradedCount),
    complete: students.length > 0
      && Number(subject.studentCount) === students.length
      && Number(subject.gradedCount) === students.length,
  }))
  const marksheet = students.map((student) => ({
    ...student,
    results: normalizedSubjects.map((subject) => ({
      assignmentId: subject.assignmentId,
      subject: subject.subject,
      assessment40: gradeMap.get(`${student.id}:${subject.assignmentId}`)?.assessment40 ?? null,
      final60: gradeMap.get(`${student.id}:${subject.assignmentId}`)?.final60 ?? null,
      total100: gradeMap.get(`${student.id}:${subject.assignmentId}`)?.total100 ?? null,
    })),
  }))
  return {
    section: { ...section, homeroomTeacherId: Number(section.homeroomTeacherId) },
    students: marksheet,
    subjects: normalizedSubjects,
    complete: students.length > 0 && normalizedSubjects.length > 0
      && normalizedSubjects.every((subject) => subject.complete),
  }
}

export async function listTeacherAdvisorSections(req, res, next) {
  try {
    const context = await getTeacherContext(req.user.id)
    if (!context) return res.status(403).json({ message: 'Your teacher account is not assigned to a school.' })
    if (!context.period) return res.json({ sections: [], period: null })
    const [assignedSections] = await pool.execute(
      `SELECT id, grade_level AS gradeLevel, section_name AS sectionName
       FROM school_sections
       WHERE school_id = ? AND homeroom_teacher_id = ? AND is_active = TRUE
         AND academic_year_id = ? AND academic_term_id = ?
       ORDER BY grade_level, section_name`,
      [context.schoolId, req.user.id, context.period.academicYearId, context.period.termId]
    )
    const sections = await Promise.all(assignedSections.map(async (section) => {
      const bundle = await loadSectionResultBundle(
        pool, section.id, context.schoolId,
        context.period.academicYearId, context.period.termId
      )
      return { ...section, subjects: bundle.subjects, complete: bundle.complete }
    }))
    return res.json({ sections, period: context.period })
  } catch (error) {
    console.error('Unable to load homeroom result sections:', error.message)
    return next(error)
  }
}

export async function getTeacherAdvisorSectionResults(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid grade section ID.' })
  try {
    const context = await getTeacherContext(req.user.id)
    if (!context) return res.status(403).json({ message: 'Your teacher account is not assigned to a school.' })
    if (!context.period) return res.status(409).json({ message: 'An active academic year and term must be configured.' })
    const [[section]] = await pool.execute(
      `SELECT id FROM school_sections
       WHERE id = ? AND school_id = ? AND homeroom_teacher_id = ?
         AND academic_year_id = ? AND academic_term_id = ? AND is_active = TRUE
       LIMIT 1`,
      [req.params.id, context.schoolId, req.user.id,
        context.period.academicYearId, context.period.termId]
    )
    if (!section) return res.status(404).json({ message: 'This section is not assigned to you as homeroom teacher.' })
    const bundle = await loadSectionResultBundle(
      pool, section.id, context.schoolId,
      context.period.academicYearId, context.period.termId
    )
    const [[submission]] = await pool.execute(
      `SELECT status, submitted_at AS submittedAt
       FROM section_result_submissions
       WHERE section_id = ? AND academic_year_id = ? AND term_id = ? LIMIT 1`,
      [section.id, context.period.academicYearId, context.period.termId]
    )
    return res.json({ ...bundle, period: context.period, submission: submission || null })
  } catch (error) {
    console.error('Unable to load homeroom section marksheet:', error.message)
    return next(error)
  }
}

export async function submitTeacherAdvisorSectionResults(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid grade section ID.' })
  let connection
  try {
    const context = await getTeacherContext(req.user.id)
    if (!context) return res.status(403).json({ message: 'Your teacher account is not assigned to a school.' })
    if (!context.period) return res.status(409).json({ message: 'An active academic year and term must be configured.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [[section]] = await connection.execute(
      `SELECT id FROM school_sections
       WHERE id = ? AND school_id = ? AND homeroom_teacher_id = ?
         AND academic_year_id = ? AND academic_term_id = ? AND is_active = TRUE
       FOR UPDATE`,
      [req.params.id, context.schoolId, req.user.id,
        context.period.academicYearId, context.period.termId]
    )
    if (!section) {
      await connection.rollback()
      return res.status(404).json({ message: 'This section is not assigned to you as homeroom teacher.' })
    }
    const [[existingSubmission]] = await connection.execute(
      `SELECT id FROM section_result_submissions
       WHERE section_id = ? AND academic_year_id = ? AND term_id = ? LIMIT 1`,
      [section.id, context.period.academicYearId, context.period.termId]
    )
    if (existingSubmission) {
      await connection.rollback()
      return res.status(409).json({ message: 'This section has already been submitted to the Registrar.' })
    }
    const bundle = await loadSectionResultBundle(
      connection, section.id, context.schoolId,
      context.period.academicYearId, context.period.termId
    )
    if (!bundle.complete) {
      await connection.rollback()
      return res.status(409).json({ message: 'Every subject teacher must submit grades for every active student before section submission.' })
    }
    await connection.execute(
      `INSERT INTO section_result_submissions
        (section_id, school_id, academic_year_id, term_id, submitted_by)
       VALUES (?, ?, ?, ?, ?)`,
      [section.id, context.schoolId, context.period.academicYearId,
        context.period.termId, req.user.id]
    )
    await connection.commit()
    return res.json({ message: 'Section results submitted to the Registrar.', status: 'submitted' })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Unable to submit homeroom section results:', error.message)
    return next(error)
  } finally {
    connection?.release()
  }
}

async function getRegistrarSchoolId(userId) {
  const [[registrar]] = await pool.execute(
    `SELECT school_id AS schoolId FROM users
     WHERE id = ? AND role = 'Registrar' AND is_active = TRUE LIMIT 1`,
    [userId]
  )
  return registrar?.schoolId || null
}

async function getLeadershipSchoolId(userId) {
  const [[leader]] = await pool.execute(
    `SELECT school_id AS schoolId FROM users
     WHERE id = ? AND role IN ('Headmaster', 'Vice Principal') AND is_active = TRUE LIMIT 1`,
    [userId]
  )
  return leader?.schoolId || null
}

export async function listLeadershipSectionSubmissions(req, res, next) {
  try {
    const schoolId = await getLeadershipSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your leadership account is not assigned to a school.' })
    const [submissions] = await pool.execute(
      `SELECT submission.id, submission.section_id AS sectionId,
              section.grade_level AS gradeLevel, section.section_name AS sectionName,
              year.name AS academicYear, term.name AS semester,
              submission.status, submission.submitted_at AS submittedAt,
              submitter.full_name AS submittedBy
       FROM section_result_submissions submission
       JOIN school_sections section ON section.id = submission.section_id
       JOIN academic_years year ON year.id = submission.academic_year_id
       JOIN academic_terms term ON term.id = submission.term_id
       JOIN users submitter ON submitter.id = submission.submitted_by
       WHERE submission.school_id = ?
       ORDER BY submission.submitted_at DESC, section.grade_level, section.section_name`,
      [schoolId]
    )
    return res.json({ submissions })
  } catch (error) {
    console.error('Unable to load leadership section submissions:', error.message)
    return next(error)
  }
}

export async function getLeadershipSectionSubmission(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid submission ID.' })
  try {
    const schoolId = await getLeadershipSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your leadership account is not assigned to a school.' })
    const [[submission]] = await pool.execute(
      `SELECT submission.id, submission.section_id AS sectionId,
              submission.academic_year_id AS academicYearId, submission.term_id AS termId,
              submission.status, submission.submitted_at AS submittedAt,
              submission.approved_at AS approvedAt, submission.approval_name AS principalName,
              submission.approval_stamp_path AS stampPath,
              submission.approval_signature_path AS signaturePath,
              section.grade_level AS gradeLevel, section.section_name AS sectionName,
              year.name AS academicYear, term.name AS semester,
              submitter.full_name AS submittedBy
       FROM section_result_submissions submission
       JOIN school_sections section ON section.id = submission.section_id
       JOIN academic_years year ON year.id = submission.academic_year_id
       JOIN academic_terms term ON term.id = submission.term_id
       JOIN users submitter ON submitter.id = submission.submitted_by
       WHERE submission.id = ? AND submission.school_id = ? LIMIT 1`,
      [req.params.id, schoolId]
    )
    if (!submission) return res.status(404).json({ message: 'Submitted section results not found.' })
    const bundle = await loadSectionResultBundle(
      pool, submission.sectionId, schoolId, submission.academicYearId, submission.termId
    )
    return res.json({ ...bundle, submission })
  } catch (error) {
    console.error('Unable to load leadership section marksheet:', error.message)
    return next(error)
  }
}

export async function approveLeadershipSectionSubmission(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid submission ID.' })
  let connection
  try {
    const schoolId = await getLeadershipSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your leadership account is not assigned to a school.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [[submission]] = await connection.execute(
      `SELECT id, status FROM section_result_submissions
       WHERE id = ? AND school_id = ? FOR UPDATE`,
      [req.params.id, schoolId]
    )
    if (!submission) {
      await connection.rollback()
      return res.status(404).json({ message: 'Submitted section results not found.' })
    }
    if (submission.status !== 'submitted') {
      await connection.rollback()
      return res.status(409).json({ message: 'These results have already been approved or archived.' })
    }
    const [[section]] = await connection.execute(
      `SELECT section_id AS sectionId, academic_year_id AS academicYearId,
              term_id AS termId
       FROM section_result_submissions WHERE id = ? AND school_id = ?`,
      [submission.id, schoolId]
    )
    const bundle = await loadSectionResultBundle(
      connection, section.sectionId, schoolId, section.academicYearId, section.termId
    )
    if (!bundle?.complete) {
      await connection.rollback()
      return res.status(409).json({ message: 'These section results are incomplete and cannot be approved.' })
    }
    const [[school]] = await connection.execute(
      `SELECT school.name AS schoolName, school.stamp_path AS stampPath,
              school.signature_path AS signaturePath, leader.full_name AS principalName
       FROM schools school
       JOIN users leader ON leader.id = ? AND leader.school_id = school.id
         AND leader.role IN ('Headmaster', 'Vice Principal') AND leader.is_active = TRUE
       WHERE school.id = ? LIMIT 1`,
      [req.user.id, schoolId]
    )
    if (!school) {
      await connection.rollback()
      return res.status(403).json({ message: 'Your leadership account is not assigned to this school.' })
    }
    const isSchoolAsset = (value) => typeof value === 'string'
      && /^\/uploads\/school-assets\/[A-Za-z0-9._-]+$/.test(value)
    if (!isSchoolAsset(school.stampPath) || !isSchoolAsset(school.signaturePath)) {
      await connection.rollback()
      return res.status(409).json({ message: 'Upload the official school stamp and principal signature in School Profile before approving results.' })
    }
    await connection.execute(
      `UPDATE section_result_submissions
       SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP,
           approval_stamp_path = ?, approval_signature_path = ?, approval_name = ?
       WHERE id = ? AND school_id = ? AND status = 'submitted'`,
      [req.user.id, school.stampPath, school.signaturePath, school.principalName,
        submission.id, schoolId]
    )
    await connection.commit()
    return res.json({
      message: 'Results approved and locked.',
      status: 'approved',
      schoolName: school.schoolName,
      stampPath: school.stampPath,
      signaturePath: school.signaturePath,
      principalName: school.principalName,
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Unable to approve leadership section results:', error.message)
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function listRegistrarSectionSubmissions(req, res, next) {
  try {
    const schoolId = await getRegistrarSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    const [submissions] = await pool.execute(
      `SELECT submission.id, submission.section_id AS sectionId,
              section.grade_level AS gradeLevel, section.section_name AS sectionName,
              year.name AS academicYear, term.name AS semester,
              submission.status, submission.submitted_at AS submittedAt,
              submitter.full_name AS submittedBy
       FROM section_result_submissions submission
       JOIN school_sections section ON section.id = submission.section_id
       JOIN academic_years year ON year.id = submission.academic_year_id
       JOIN academic_terms term ON term.id = submission.term_id
       JOIN users submitter ON submitter.id = submission.submitted_by
       WHERE submission.school_id = ?
       ORDER BY submission.submitted_at DESC, section.grade_level, section.section_name`,
      [schoolId]
    )
    return res.json({ submissions })
  } catch (error) {
    console.error('Unable to load Registrar section submissions:', error.message)
    return next(error)
  }
}

export async function getRegistrarSectionSubmission(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid submission ID.' })
  try {
    const schoolId = await getRegistrarSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    const [[submission]] = await pool.execute(
      `SELECT submission.id, submission.section_id AS sectionId,
              submission.academic_year_id AS academicYearId,
              submission.term_id AS termId, submission.status,
              section.grade_level AS gradeLevel, section.section_name AS sectionName,
              year.name AS academicYear, term.name AS semester,
              submission.submitted_at AS submittedAt,
              submitter.full_name AS submittedBy
       FROM section_result_submissions submission
       JOIN school_sections section ON section.id = submission.section_id
       JOIN academic_years year ON year.id = submission.academic_year_id
       JOIN academic_terms term ON term.id = submission.term_id
       JOIN users submitter ON submitter.id = submission.submitted_by
       WHERE submission.id = ? AND submission.school_id = ? LIMIT 1`,
      [req.params.id, schoolId]
    )
    if (!submission) return res.status(404).json({ message: 'Submitted section results not found.' })
    if (submission.status === 'published') {
      const [archivedRows] = await pool.execute(
        `SELECT student_id AS studentId, student_name AS name,
                assignment_id AS assignmentId, subject,
                assessment_40 AS assessment40, final_60 AS final60, total_100 AS total100
         FROM permanent_academic_records
         WHERE school_id = ? AND source_submission_id = ?
         ORDER BY student_name, subject`,
        [schoolId, submission.id]
      )
      const subjectsById = new Map()
      const studentsById = new Map()
      for (const row of archivedRows) {
        const assignmentId = Number(row.assignmentId)
        subjectsById.set(assignmentId, { assignmentId, subject: row.subject })
        if (!studentsById.has(Number(row.studentId))) {
          studentsById.set(Number(row.studentId), { id: Number(row.studentId), name: row.name, results: [] })
        }
        studentsById.get(Number(row.studentId)).results.push({
          assignmentId,
          assessment40: Number(row.assessment40),
          final60: Number(row.final60),
          total100: Number(row.total100),
        })
      }
      return res.json({
        section: { gradeLevel: submission.gradeLevel, sectionName: submission.sectionName },
        subjects: [...subjectsById.values()],
        students: [...studentsById.values()],
        complete: true,
        submission,
      })
    }
    const bundle = await loadSectionResultBundle(
      pool, submission.sectionId, schoolId,
      submission.academicYearId, submission.termId
    )
    return res.json({ ...bundle, submission })
  } catch (error) {
    console.error('Unable to load Registrar section marksheet:', error.message)
    return next(error)
  }
}

export async function getStudentApprovedReportCard(req, res, next) {
  try {
    const [[student]] = await pool.execute(
      `SELECT student.id, student.school_id AS schoolId, student.full_name AS name,
              account.student_number AS studentNumber,
              COALESCE(student.grade, student.grade_level) AS gradeLevel, student.section
       FROM students student
       JOIN users account ON account.id = student.user_id
         AND account.role = 'Student' AND account.is_active = TRUE
       WHERE student.user_id = ? AND student.status = 'Active' LIMIT 1`,
      [req.user.id]
    )
    if (!student) return res.status(404).json({ message: 'Your active student record was not found.' })
    const [[submission]] = await pool.execute(
      `SELECT submission.id, submission.section_id AS sectionId,
              submission.academic_year_id AS academicYearId, submission.term_id AS termId,
              submission.status, submission.approved_at AS approvedAt,
              submission.approval_name AS principalName,
              submission.approval_stamp_path AS stampPath,
              submission.approval_signature_path AS signaturePath,
              school.name AS schoolName, year.name AS academicYear,
              term.name AS semester, section.grade_level AS gradeLevel,
              section.section_name AS sectionName
       FROM section_result_submissions submission
       JOIN school_sections section ON section.id = submission.section_id
       JOIN schools school ON school.id = submission.school_id
       JOIN academic_years year ON year.id = submission.academic_year_id
       JOIN academic_terms term ON term.id = submission.term_id
       WHERE submission.school_id = ? AND section.grade_level = ?
         AND section.section_name = ? AND submission.status IN ('approved', 'published')
       ORDER BY submission.approved_at DESC, submission.submitted_at DESC LIMIT 1`,
      [student.schoolId, student.gradeLevel, student.section]
    )
    if (!submission) return res.status(404).json({ message: 'No principal-approved report card is available yet.' })
    const bundle = await loadSectionResultBundle(
      pool, submission.sectionId, student.schoolId,
      submission.academicYearId, submission.termId
    )
    const studentResults = bundle?.students.find((item) => Number(item.id) === Number(student.id))
    if (!studentResults) return res.status(404).json({ message: 'Your approved report card was not found.' })
    return res.json({
      student,
      section: bundle.section,
      subjects: bundle.subjects,
      results: studentResults.results,
      approval: {
        status: submission.status,
        approvedAt: submission.approvedAt,
        principalName: submission.principalName,
        stampPath: submission.stampPath,
        signaturePath: submission.signaturePath,
        schoolName: submission.schoolName,
        academicYear: submission.academicYear,
        semester: submission.semester,
      },
    })
  } catch (error) {
    console.error('Unable to load approved student report card:', error.message)
    return next(error)
  }
}

async function loadPermanentRecords(schoolId, studentId) {
  const [records] = await pool.execute(
    `SELECT id, student_name AS studentName, student_number AS studentNumber,
            grade_level AS gradeLevel, section_name AS sectionName,
            subject, academic_year AS academicYear, semester,
            assessment_40 AS assessment40, final_60 AS final60, total_100 AS total100,
            grade_point AS gradePoint, sgpa, cgpa, school_name AS schoolName,
            stamp_path AS stampPath, signature_path AS signaturePath,
            principal_name AS principalName, archived_at AS archivedAt
     FROM permanent_academic_records
     WHERE school_id = ? AND student_id = ?
     ORDER BY academic_year_id DESC, term_id DESC, subject`,
    [schoolId, studentId]
  )
  const periods = new Map()
  for (const record of records) {
    const key = `${record.academicYear}:${record.semester}`
    if (!periods.has(key)) periods.set(key, {
      academicYear: record.academicYear,
      semester: record.semester,
      gradeLevel: record.gradeLevel,
      sectionName: record.sectionName,
      sgpa: Number(record.sgpa),
      cgpa: Number(record.cgpa),
      schoolName: record.schoolName,
      stampPath: record.stampPath,
      signaturePath: record.signaturePath,
      principalName: record.principalName,
      archivedAt: record.archivedAt,
      subjects: [],
    })
    periods.get(key).subjects.push({
      name: record.subject,
      assessment40: Number(record.assessment40),
      final60: Number(record.final60),
      total100: Number(record.total100),
      gradePoint: Number(record.gradePoint),
    })
  }
  return [...periods.values()]
}

export async function getMyPermanentAcademicRecords(req, res, next) {
  try {
    const [[student]] = await pool.execute(
      `SELECT id, school_id AS schoolId FROM students
       WHERE user_id = ? AND status IN ('Active', 'Unassigned') LIMIT 1`,
      [req.user.id]
    )
    if (!student) return res.status(404).json({ message: 'Your active student record was not found.' })
    return res.json({ records: await loadPermanentRecords(student.schoolId, student.id) })
  } catch (error) {
    console.error('Unable to load student academic archive:', error.message)
    return next(error)
  }
}

export async function getRegistrarStudentAcademicRecords(req, res, next) {
  if (!validId(req.params.studentId)) return res.status(400).json({ message: 'Provide a valid student ID.' })
  try {
    const schoolId = await getRegistrarSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    const records = await loadPermanentRecords(schoolId, req.params.studentId)
    if (!records.length) return res.status(404).json({ message: 'No permanently archived academic records were found for this student.' })
    return res.json({ records })
  } catch (error) {
    console.error('Unable to load Registrar academic archive:', error.message)
    return next(error)
  }
}

export async function publishRegistrarSectionSubmission(req, res, next) {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Provide a valid submission ID.' })
  let connection
  try {
    const schoolId = await getRegistrarSchoolId(req.user.id)
    if (!schoolId) return res.status(403).json({ message: 'Your Registrar account is not assigned to a school.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [[submission]] = await connection.execute(
      `SELECT submission.id, submission.status, submission.section_id AS sectionId,
              submission.academic_year_id AS academicYearId, submission.term_id AS termId,
              submission.approved_by AS approvedBy, submission.approved_at AS approvedAt,
              submission.approval_stamp_path AS stampPath,
              submission.approval_signature_path AS signaturePath,
              submission.approval_name AS principalName,
              school.name AS schoolName, year.name AS academicYear,
              term.name AS semester
       FROM section_result_submissions submission
       JOIN schools school ON school.id = submission.school_id
       JOIN academic_years year ON year.id = submission.academic_year_id
       JOIN academic_terms term ON term.id = submission.term_id
       WHERE submission.id = ? AND submission.school_id = ? FOR UPDATE`,
      [req.params.id, schoolId]
    )
    if (!submission) {
      await connection.rollback()
      return res.status(404).json({ message: 'Submitted section results not found.' })
    }
    if (submission.status !== 'approved') {
      await connection.rollback()
      return res.status(409).json({ message: 'Only principal-approved results can be permanently archived.' })
    }
    const bundle = await loadSectionResultBundle(
      connection, submission.sectionId, schoolId,
      submission.academicYearId, submission.termId
    )
    if (!bundle?.complete) {
      await connection.rollback()
      return res.status(409).json({ message: 'These section results are incomplete and cannot be archived.' })
    }
    const subjectByAssignment = new Map(bundle.subjects.map((subject) => [
      Number(subject.assignmentId), subject.subject,
    ]))
    const recordsByStudent = bundle.students.map((student) => {
      const studentResults = student.results.map((result) => {
        const total = Number(result.total100)
        const gradePoint = total >= 90 ? 4 : total >= 80 ? 3 : total >= 70 ? 2 : total >= 60 ? 1 : 0
        return { ...result, gradePoint, subject: subjectByAssignment.get(Number(result.assignmentId)) }
      })
      return {
        student,
        results: studentResults,
        pointsTotal: studentResults.reduce((sum, result) => sum + result.gradePoint, 0),
      }
    })
    for (const { student, results, pointsTotal } of recordsByStudent) {
      const [[history]] = await connection.execute(
        `SELECT COALESCE(SUM(grade_point), 0) AS pointTotal, COUNT(*) AS courseCount
         FROM permanent_academic_records
         WHERE school_id = ? AND student_id = ?`,
        [schoolId, student.id]
      )
      const sgpa = Math.round(pointsTotal / results.length * 100) / 100
      const cgpa = Math.round(
        (Number(history.pointTotal) + pointsTotal)
          / (Number(history.courseCount) + results.length) * 100
      ) / 100
      for (const result of results) {
        await connection.execute(
          `INSERT INTO permanent_academic_records
            (school_id, student_id, student_name, student_number, grade_level, section_name,
             assignment_id, subject, academic_year_id, term_id, academic_year, semester,
             assessment_40, final_60, total_100, grade_point, sgpa, cgpa, school_name,
             stamp_path, signature_path, principal_name, approved_by, approved_at,
             source_submission_id, archived_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [schoolId, student.id, student.name, student.studentNumber || null,
            bundle.section.gradeLevel, bundle.section.sectionName, result.assignmentId,
            result.subject, submission.academicYearId, submission.termId,
            submission.academicYear, submission.semester, result.assessment40,
            result.final60, result.total100, result.gradePoint, sgpa, cgpa,
            submission.schoolName, submission.stampPath, submission.signaturePath,
            submission.principalName, submission.approvedBy, submission.approvedAt,
            submission.id, req.user.id]
        )
      }
    }
    let promotedCount = 0
    const [[finalTerm]] = await connection.execute(
      `SELECT id FROM academic_terms
       WHERE school_id = ? AND academic_year_id = ?
       ORDER BY end_date DESC, id DESC LIMIT 1`,
      [schoolId, submission.academicYearId]
    )
    if (Number(finalTerm?.id) === Number(submission.termId)) {
      for (const { student, results } of recordsByStudent) {
        if (bundle.section.gradeLevel !== 'Grade 9' || !results.length) continue
        const average = results.reduce((sum, result) => sum + Number(result.total100), 0) / results.length
        const promoted = average >= 60
        const nextGrade = promoted ? 'Grade 10' : 'Grade 9'
        const academicStatus = promoted ? 'Promoted to Grade 10' : 'Repeating Grade 9'
        await connection.execute(
          `UPDATE students
           SET grade = ?, grade_level = ?, section = NULL, section_id = NULL,
               status = 'Unassigned', academic_status = ?,
               section_status = 'Pending Re-Enrollment',
               enrollment_year_id = NULL, promoted_from_year_id = ?
           WHERE id = ? AND school_id = ?`,
          [nextGrade, nextGrade, academicStatus, submission.academicYearId, student.id, schoolId]
        )
        await connection.execute(
          `UPDATE users SET grade_level = ? WHERE id = ? AND school_id = ? AND role = 'Student'`,
          [nextGrade, student.userId, schoolId]
        )
        await connection.execute(
          `UPDATE student_records
           SET section = NULL, status = 'Unassigned'
           WHERE user_id = ?`,
          [student.userId]
        )
        if (promoted) promotedCount += 1
      }
    }
    await connection.execute(
      `UPDATE section_result_submissions
       SET status = 'published', published_by = ?, published_at = CURRENT_TIMESTAMP
       WHERE id = ? AND school_id = ?`,
      [req.user.id, submission.id, schoolId]
    )
    await connection.commit()
    return res.json({
      message: 'Results permanently archived and GPA calculated.',
      status: 'published',
      studentCount: recordsByStudent.length,
      recordCount: recordsByStudent.reduce((count, item) => count + item.results.length, 0),
      promotedCount,
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Unable to publish Registrar section results:', error.message)
    return next(error)
  } finally {
    connection?.release()
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
      `SELECT assignment.id, section.id AS sectionId, section.grade_level AS gradeLevel,
              section.section_name AS sectionName
       FROM teacher_class_assignments assignment
       JOIN school_sections section ON section.id = assignment.section_id AND section.is_active = TRUE
       WHERE assignment.id = ? AND assignment.teacher_id = ? AND assignment.school_id = ?
       LIMIT 1`,
      [req.params.id, req.user.id, context.schoolId]
    )
    if (!classAssignment) return res.status(404).json({ message: 'Assigned class not found.' })
    const placeholders = studentIds.map(() => '?').join(', ')
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute(
      'SELECT id FROM school_sections WHERE id = ? AND school_id = ? FOR UPDATE',
      [classAssignment.sectionId, context.schoolId]
    )
    const [[submission]] = await connection.execute(
      `SELECT id FROM section_result_submissions
       WHERE section_id = ? AND academic_year_id = ? AND term_id = ? LIMIT 1`,
      [classAssignment.sectionId, context.period.academicYearId, context.period.termId]
    )
    if (submission) {
      await connection.rollback()
      return res.status(423).json({ message: 'These results have been submitted to the Registrar and are locked.' })
    }
    const [enrolledStudents] = await connection.execute(
      `SELECT student.id AS id
       FROM students student
       JOIN users account ON account.id = student.user_id
         AND account.role = 'Student' AND account.is_active = TRUE
       WHERE student.school_id = ? AND student.status = 'Active'
         AND student.section_status = 'Confirmed / Enrolled'
         AND student.enrollment_year_id = ?
         AND COALESCE(student.grade, student.grade_level) = ?
         AND student.section = ? AND student.id IN (${placeholders})`,
      [context.schoolId, context.period?.academicYearId ?? null,
        classAssignment.gradeLevel, classAssignment.sectionName, ...studentIds]
    )
    if (enrolledStudents.length !== studentIds.length) {
      await connection.rollback()
      return res.status(400).json({ message: 'One or more students are not active members of this assigned class.' })
    }
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

export async function deleteTeacherClassGrade(req, res, next) {
  if (!validId(req.params.id) || !validId(req.params.studentId)) {
    return res.status(400).json({ message: 'Provide a valid assigned class ID and student ID.' })
  }
  let connection
  try {
    const context = await getTeacherContext(req.user.id)
    if (!context) return res.status(403).json({ message: 'Your teacher account is not assigned to a school.' })
    if (!context.period) return res.status(409).json({ message: 'An active academic year and term must be configured before managing grades.' })
    const [[classAssignment]] = await pool.execute(
      `SELECT assignment.id, section.id AS sectionId
       FROM teacher_class_assignments assignment
       JOIN school_sections section ON section.id = assignment.section_id AND section.is_active = TRUE
       WHERE assignment.id = ? AND assignment.teacher_id = ? AND assignment.school_id = ?
       LIMIT 1`,
      [req.params.id, req.user.id, context.schoolId]
    )
    if (!classAssignment) return res.status(404).json({ message: 'Assigned class not found.' })
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute(
      'SELECT id FROM school_sections WHERE id = ? AND school_id = ? FOR UPDATE',
      [classAssignment.sectionId, context.schoolId]
    )
    const [[submission]] = await connection.execute(
      `SELECT id FROM section_result_submissions
       WHERE section_id = ? AND academic_year_id = ? AND term_id = ? LIMIT 1`,
      [classAssignment.sectionId, context.period.academicYearId, context.period.termId]
    )
    if (submission) {
      await connection.rollback()
      return res.status(423).json({ message: 'These results have been submitted to the Registrar and are locked.' })
    }
    const [result] = await connection.execute(
      `DELETE FROM student_grades
       WHERE assignment_id = ? AND student_id = ? AND school_id = ?
         AND academic_year_id = ? AND term_id = ?`,
      [classAssignment.id, req.params.studentId, context.schoolId,
        context.period.academicYearId, context.period.termId]
    )
    await connection.commit()
    if (!result.affectedRows) return res.status(404).json({ message: 'No result exists for this student in the active semester.' })
    return res.json({ message: 'Student result deleted.' })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Unable to delete teacher grade:', error.message)
    return next(error)
  } finally {
    connection?.release()
  }
}