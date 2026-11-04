import { pool } from '../config/db.js'

const validId = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0
const grades = new Set(['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'])

async function getVicePrincipalSchoolId(userId) {
  const [[user]] = await pool.execute(
    `SELECT school_id AS schoolId FROM users
     WHERE id = ? AND role = 'Vice Principal' AND is_active = TRUE LIMIT 1`,
    [userId]
  )
  return user?.schoolId
}

async function getActivePeriod(executor, schoolId) {
  const [[period]] = await executor.execute(
    `SELECT year.id AS academicYearId, term.id AS termId
     FROM academic_years year
     JOIN academic_terms term ON term.academic_year_id = year.id AND term.school_id = year.school_id
     WHERE year.school_id = ? AND year.is_active = TRUE AND term.is_active = TRUE
     ORDER BY year.start_date DESC, term.start_date DESC LIMIT 1`,
    [schoolId]
  )
  return period
}

async function getPeriodSections(executor, schoolId, period) {
  const [sections] = await executor.execute(
    `SELECT id, grade_level AS gradeLevel, section_name AS sectionName
     FROM school_sections
     WHERE school_id = ? AND is_active = TRUE
       AND ((academic_year_id = ? AND academic_term_id = ?)
         OR (academic_year_id IS NULL AND academic_term_id IS NULL))
     ORDER BY grade_level, section_name`,
    [schoolId, period.academicYearId, period.termId]
  )
  return sections
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

export async function getVicePrincipalWorkload(req, res, next) {
  try {
    const schoolId = await getVicePrincipalSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your Vice Principal account is not assigned to a school.' })
    }
    const period = await getActivePeriod(pool, schoolId)
    if (!period) {
      return res.status(409).json({ message: 'Configure an active academic year and semester before assigning teacher workloads.' })
    }
    const sections = await getPeriodSections(pool, schoolId, period)
    const [teachers] = await pool.execute(
      `SELECT profile.id, account.full_name AS name, account.email,
              profile.woreda_employee_id AS woredaEmployeeId,
              profile.specialization, profile.qualification_degree AS qualificationDegree
       FROM teachers profile
       JOIN users account ON account.id = profile.id AND account.school_id = profile.school_id
       WHERE profile.school_id = ? AND account.role = 'Teacher' AND account.is_active = TRUE
       ORDER BY account.full_name, profile.id`,
      [schoolId]
    )
    const teacherId = req.query.teacherId
    let assignments = []
    let homeroomSectionId = null
    if (teacherId !== undefined && teacherId !== '') {
      if (!validId(teacherId)) return res.status(400).json({ message: 'Provide a valid teacher ID.' })
      const [[teacher]] = await pool.execute(
        `SELECT id FROM teachers WHERE id = ? AND school_id = ? LIMIT 1`,
        [teacherId, schoolId]
      )
      if (!teacher) return res.status(404).json({ message: 'Teacher not found in your school.' })
      const [rows] = await pool.execute(
        `SELECT assignment.section_id AS sectionId, assignment.grade_level AS gradeLevel,
                assignment.subject_id AS subjectId, subject.name AS subject
         FROM teacher_subject_assignments assignment
         JOIN school_subjects subject ON subject.id = assignment.subject_id
           AND subject.school_id = assignment.school_id
         JOIN school_sections section ON section.id = assignment.section_id
           AND section.school_id = assignment.school_id AND section.is_active = TRUE
         WHERE assignment.teacher_id = ? AND assignment.school_id = ?
           AND ((section.academic_year_id = ? AND section.academic_term_id = ?)
             OR (section.academic_year_id IS NULL AND section.academic_term_id IS NULL))
         ORDER BY assignment.grade_level, section.section_name, subject.name`,
        [teacherId, schoolId, period.academicYearId, period.termId]
      )
      assignments = rows
      const [[advisor]] = await pool.execute(
        `SELECT id FROM school_sections
         WHERE school_id = ? AND homeroom_teacher_id = ? AND is_active = TRUE
           AND ((academic_year_id = ? AND academic_term_id = ?)
             OR (academic_year_id IS NULL AND academic_term_id IS NULL))
         ORDER BY id LIMIT 1`,
        [schoolId, teacherId, period.academicYearId, period.termId]
      )
      homeroomSectionId = advisor?.id ?? null
    }
    return res.json({
      academicYearId: period.academicYearId,
      termId: period.termId,
      teachers,
      sections,
      assignments,
      homeroomSectionId,
    })
  } catch (error) {
    return next(error)
  }
}

export async function saveVicePrincipalWorkload(req, res, next) {
  const teacherId = req.params.teacherId
  const assignments = req.body?.assignments
  const homeroomSectionId = req.body?.homeroomSectionId === '' || req.body?.homeroomSectionId == null
    ? null
    : req.body.homeroomSectionId
  if (!validId(teacherId)) return res.status(400).json({ message: 'Provide a valid teacher ID.' })
  if (!Array.isArray(assignments) || assignments.length > 100) {
    return res.status(400).json({ message: 'Submit no more than 100 subject assignments.' })
  }
  if (homeroomSectionId !== null && !validId(homeroomSectionId)) {
    return res.status(400).json({ message: 'Choose a valid homeroom section or leave it unassigned.' })
  }
  const normalized = assignments.map((item) => ({
    sectionId: Number(item?.sectionId),
    subject: typeof item?.subject === 'string' ? item.subject.trim() : '',
  }))
  if (normalized.some((item) => !validId(item.sectionId) || !item.subject || item.subject.length > 100)) {
    return res.status(400).json({ message: 'Every subject assignment needs a valid section and a subject of at most 100 characters.' })
  }
  const assignmentKeys = normalized.map((item) => `${item.sectionId}:${item.subject.toLowerCase()}`)
  if (new Set(assignmentKeys).size !== assignmentKeys.length) {
    return res.status(400).json({ message: 'Duplicate subject assignments are not allowed.' })
  }

  let connection
  try {
    const schoolId = await getVicePrincipalSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your Vice Principal account is not assigned to a school.' })
    }
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const period = await getActivePeriod(connection, schoolId)
    if (!period) {
      await connection.rollback()
      return res.status(409).json({ message: 'Configure an active academic year and semester before assigning teacher workloads.' })
    }
    const [[teacher]] = await connection.execute(
      `SELECT profile.id FROM teachers profile
       JOIN users account ON account.id = profile.id AND account.school_id = profile.school_id
       WHERE profile.id = ? AND profile.school_id = ?
         AND account.role = 'Teacher' AND account.is_active = TRUE
       FOR UPDATE`,
      [teacherId, schoolId]
    )
    if (!teacher) {
      await connection.rollback()
      return res.status(404).json({ message: 'Active teacher not found in your school.' })
    }
    const sectionIds = [...new Set([
      ...normalized.map((item) => item.sectionId),
      ...(homeroomSectionId === null ? [] : [Number(homeroomSectionId)]),
    ])]
    const [sections] = sectionIds.length
      ? await connection.execute(
        `SELECT id, grade_level AS gradeLevel
         FROM school_sections
         WHERE school_id = ? AND is_active = TRUE AND id IN (${sectionIds.map(() => '?').join(', ')})
           AND ((academic_year_id = ? AND academic_term_id = ?)
             OR (academic_year_id IS NULL AND academic_term_id IS NULL))
         FOR UPDATE`,
        [schoolId, ...sectionIds, period.academicYearId, period.termId]
      )
      : [[]]
    if (sections.length !== sectionIds.length) {
      await connection.rollback()
      return res.status(400).json({ message: 'Choose active sections from the current academic year and semester.' })
    }
    const sectionById = new Map(sections.map((section) => [Number(section.id), section]))
    if (normalized.some((item) => !grades.has(sectionById.get(item.sectionId)?.gradeLevel))) {
      await connection.rollback()
      return res.status(400).json({ message: 'Subject assignments must use a supported Grade 9–12 section.' })
    }
    if (homeroomSectionId !== null) {
      const [[occupied]] = await connection.execute(
        `SELECT homeroom_teacher_id AS teacherId FROM school_sections
         WHERE id = ? AND school_id = ?`,
        [homeroomSectionId, schoolId]
      )
      if (occupied?.teacherId && Number(occupied.teacherId) !== Number(teacherId)) {
        await connection.rollback()
        return res.status(409).json({ message: 'That section already has a homeroom advisor. Assign another section or clear its current advisor first.' })
      }
    }

    const [existingAssignments] = await connection.execute(
      `SELECT assignment.id, assignment.section_id AS sectionId, assignment.subject
       FROM teacher_class_assignments assignment
       JOIN school_sections section ON section.id = assignment.section_id
         AND section.school_id = assignment.school_id AND section.is_active = TRUE
       WHERE assignment.teacher_id = ? AND assignment.school_id = ?
         AND ((section.academic_year_id = ? AND section.academic_term_id = ?)
           OR (section.academic_year_id IS NULL AND section.academic_term_id IS NULL))
       FOR UPDATE`,
      [teacherId, schoolId, period.academicYearId, period.termId]
    )
    const existingByKey = new Map(existingAssignments.map((assignment) => [
      `${assignment.sectionId}:${assignment.subject.toLowerCase()}`,
      assignment,
    ]))
    const desiredByKey = new Map(normalized.map((assignment) => [
      `${assignment.sectionId}:${assignment.subject.toLowerCase()}`,
      assignment,
    ]))
    const removedAssignmentIds = existingAssignments
      .filter((assignment) => !desiredByKey.has(`${assignment.sectionId}:${assignment.subject.toLowerCase()}`))
      .map((assignment) => Number(assignment.id))
    if (await hasUnarchivedGrades(connection, removedAssignmentIds)) {
      await connection.rollback()
      return res.status(409).json({
        message: 'A subject assignment has unarchived student grades. Finalize those results before removing or changing the teacher workload.',
      })
    }
    for (const assignment of existingAssignments) {
      const key = `${assignment.sectionId}:${assignment.subject.toLowerCase()}`
      const desired = desiredByKey.get(key)
      if (!desired) {
        await connection.execute('DELETE FROM teacher_class_assignments WHERE id = ?', [assignment.id])
      } else if (desired.subject !== assignment.subject) {
        await connection.execute(
          'UPDATE teacher_class_assignments SET subject = ? WHERE id = ?',
          [desired.subject, assignment.id]
        )
      }
    }
    await connection.execute(
      `DELETE FROM teacher_subject_assignments
       WHERE teacher_id = ? AND school_id = ?
         AND section_id IN (
           SELECT id FROM school_sections
           WHERE school_id = ? AND is_active = TRUE
             AND ((academic_year_id = ? AND academic_term_id = ?)
               OR (academic_year_id IS NULL AND academic_term_id IS NULL))
         )`,
      [teacherId, schoolId, schoolId, period.academicYearId, period.termId]
    )
    for (const assignment of normalized) {
      const section = sectionById.get(assignment.sectionId)
      const [subjectResult] = await connection.execute(
        `INSERT INTO school_subjects (school_id, name) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [schoolId, assignment.subject]
      )
      const subjectId = Number(subjectResult.insertId)
      await connection.execute(
        `INSERT INTO teacher_subject_assignments
           (teacher_id, school_id, subject_id, grade_level, section_id)
         VALUES (?, ?, ?, ?, ?)`,
        [teacherId, schoolId, subjectId, section.gradeLevel, section.id]
      )
      const key = `${section.id}:${assignment.subject.toLowerCase()}`
      if (!existingByKey.has(key)) {
        await connection.execute(
          `INSERT INTO teacher_class_assignments (teacher_id, school_id, section_id, subject)
           VALUES (?, ?, ?, ?)`,
          [teacherId, schoolId, section.id, assignment.subject]
        )
      }
    }
    await connection.execute(
      `UPDATE school_sections
       SET homeroom_teacher_id = NULL
       WHERE school_id = ? AND homeroom_teacher_id = ?
         AND ((academic_year_id = ? AND academic_term_id = ?)
           OR (academic_year_id IS NULL AND academic_term_id IS NULL))`,
      [schoolId, teacherId, period.academicYearId, period.termId]
    )
    if (homeroomSectionId !== null) {
      await connection.execute(
        `UPDATE school_sections SET homeroom_teacher_id = ?
         WHERE id = ? AND school_id = ?`,
        [teacherId, homeroomSectionId, schoolId]
      )
    }
    await connection.execute(
      `UPDATE users
       SET subjects = ?
       WHERE id = ? AND school_id = ? AND role = 'Teacher'`,
      [[...new Set(normalized.map((item) => item.subject))].join(', ') || null, teacherId, schoolId]
    )
    await connection.execute(
      `INSERT INTO activity_logs (actor_id, actor_role, action, module, details)
       VALUES (?, ?, 'teacher.workload.updated', 'workload', ?)`,
      [req.user.id, req.user.role, JSON.stringify({
        teacherId: Number(teacherId),
        subjectAssignmentCount: normalized.length,
        homeroomSectionId: homeroomSectionId === null ? null : Number(homeroomSectionId),
      })]
    )
    await connection.commit()
    return res.json({ message: 'Teacher workload and homeroom assignment saved.', teacherId: Number(teacherId) })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That subject assignment already exists for the selected section.' })
    }
    return next(error)
  } finally {
    connection?.release()
  }
}
