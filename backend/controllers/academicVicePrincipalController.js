import { pool } from '../config/db.js'

const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const validId = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0

async function getSchoolId(userId) {
  const [[user]] = await pool.execute(
    `SELECT school_id AS schoolId FROM users
     WHERE id = ? AND role = 'Vice Principal' AND is_active = TRUE LIMIT 1`,
    [userId]
  )
  return user?.schoolId
}

async function getActiveAcademicYear(executor, schoolId) {
  const [[period]] = await executor.execute(
    `SELECT year.id AS academicYearId, year.name AS academicYear,
            term.id AS termId, term.name AS semester
     FROM academic_years year
     LEFT JOIN academic_terms term ON term.academic_year_id = year.id
       AND term.school_id = year.school_id AND term.is_current = TRUE
     WHERE year.school_id = ? AND year.is_active = TRUE
     ORDER BY year.start_date DESC, term.start_date DESC LIMIT 1`,
    [schoolId]
  )
  return period
}

async function getActiveSections(executor, schoolId, academicYearId, termId) {
  const [sections] = await executor.execute(
    `SELECT section.id, section.grade_level AS gradeLevel,
            section.section_name AS sectionName,
            section.homeroom_teacher_id AS homeroomTeacherId,
            homeroom.full_name AS homeroomTeacherName
     FROM school_sections section
     LEFT JOIN users homeroom ON homeroom.id = section.homeroom_teacher_id
     WHERE section.school_id = ? AND section.is_active = TRUE
       AND (
         (section.academic_year_id = ? AND (
           section.academic_term_id = ?
           OR (section.academic_term_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM school_sections currentTerm
             WHERE currentTerm.school_id = section.school_id
               AND currentTerm.academic_year_id = section.academic_year_id
               AND currentTerm.academic_term_id = ?
               AND currentTerm.grade_level = section.grade_level
               AND currentTerm.section_name = section.section_name
               AND currentTerm.is_active = TRUE
           ))
           OR (? IS NULL AND section.academic_term_id IS NULL)
         ))
         OR (section.academic_year_id IS NULL AND section.academic_term_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM school_sections currentYear
             WHERE currentYear.school_id = section.school_id
               AND currentYear.academic_year_id = ?
               AND (currentYear.academic_term_id = ? OR currentYear.academic_term_id IS NULL)
               AND currentYear.grade_level = section.grade_level
               AND currentYear.section_name = section.section_name
               AND currentYear.is_active = TRUE
           ))
       )
     ORDER BY section.grade_level, section.section_name`,
    [schoolId, academicYearId, termId, termId, termId, academicYearId, termId]
  )
  return sections
}

export async function getAcademicVicePrincipalWorkspace(req, res, next) {
  try {
    const schoolId = await getSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your Vice Principal account is not assigned to a school.' })
    }
    const period = await getActiveAcademicYear(pool, schoolId)
    if (!period) {
      return res.status(409).json({ message: 'Configure an active academic year before managing teaching assignments.' })
    }
    const sections = await getActiveSections(pool, schoolId, period.academicYearId, period.termId)
    const [[settings]] = await pool.execute(
      'SELECT max_weekly_periods AS maxWeeklyPeriods FROM school_academic_settings WHERE school_id = ?',
      [schoolId]
    )
    const maxWeeklyPeriods = Number(settings?.maxWeeklyPeriods || 24)
    const [teachers] = await pool.execute(
      `SELECT account.id, account.full_name AS name,
              COALESCE(NULLIF(profile.specialization, ''), account.department) AS specialization,
              COALESCE(assignment.currentPeriods, 0) AS currentPeriods
       FROM users account
       LEFT JOIN teachers profile ON profile.id = account.id AND profile.school_id = account.school_id
       LEFT JOIN (
         SELECT logicalAssignment.teacher_id, SUM(logicalAssignment.weeklyPeriods) AS currentPeriods
         FROM (
           SELECT assignment.teacher_id, section.grade_level, section.section_name,
                  assignment.subject_id, MAX(assignment.weekly_periods) AS weeklyPeriods
           FROM section_subject_teachers assignment
           JOIN school_sections section ON section.id = assignment.section_id
             AND section.school_id = assignment.school_id
           WHERE assignment.school_id = ? AND assignment.academic_year_id = ?
             AND assignment.teacher_id IS NOT NULL
           GROUP BY assignment.teacher_id, section.grade_level, section.section_name,
                    assignment.subject_id
         ) logicalAssignment
         GROUP BY logicalAssignment.teacher_id
       ) assignment ON assignment.teacher_id = account.id
       WHERE account.school_id = ? AND account.role = 'Teacher' AND account.is_active = TRUE
       GROUP BY account.id, account.full_name, profile.specialization, account.department,
                assignment.currentPeriods
       ORDER BY account.full_name`,
      [schoolId, period.academicYearId, schoolId]
    )
    const [loads] = await pool.execute(
      `SELECT assignment.teacher_id AS teacherId,
              section.grade_level AS gradeLevel, section.section_name AS sectionName,
              subject.name AS subject, MAX(assignment.weekly_periods) AS weeklyPeriods
       FROM section_subject_teachers assignment
       JOIN school_sections section ON section.id = assignment.section_id
         AND section.school_id = assignment.school_id
       JOIN school_subjects subject ON subject.id = assignment.subject_id
         AND subject.school_id = assignment.school_id
       WHERE assignment.school_id = ? AND assignment.academic_year_id = ?
         AND assignment.teacher_id IS NOT NULL
       GROUP BY assignment.teacher_id, section.grade_level, section.section_name,
                assignment.subject_id, subject.name
       ORDER BY section.grade_level, section.section_name, subject.name`,
      [schoolId, period.academicYearId]
    )
    const sectionIds = sections.map((section) => Number(section.id))
    const [slotCountRows] = sectionIds.length
      ? await pool.execute(
        `SELECT COUNT(*) AS totalSlots,
                SUM(assignment.teacher_id IS NOT NULL) AS assignedSlots
         FROM school_sections section
         JOIN school_grade_curriculum curriculum ON curriculum.school_id = section.school_id
           AND curriculum.grade_level = section.grade_level
         LEFT JOIN section_subject_teachers assignment
           ON assignment.school_id = section.school_id
           AND assignment.academic_year_id = ?
           AND assignment.section_id = section.id
           AND assignment.subject_id = curriculum.subject_id
         WHERE section.school_id = ? AND section.id IN (${sectionIds.map(() => '?').join(', ')})`,
        [period.academicYearId, schoolId, ...sectionIds]
      )
      : [[{ totalSlots: 0, assignedSlots: 0 }]]
    const slotCounts = slotCountRows[0]
    const nearLimitTeachers = teachers.filter((teacher) => (
      Number(teacher.currentPeriods) >= maxWeeklyPeriods * 0.8
    )).length
    const selectedGrade = typeof req.query.grade === 'string' && grades.includes(req.query.grade)
      ? req.query.grade
      : ''
    const selectedSectionId = validId(req.query.sectionId) ? Number(req.query.sectionId) : null
    let subjectSlots = []
    let homeroomCandidates = []
    if (selectedSectionId) {
      const section = sections.find((item) => Number(item.id) === selectedSectionId)
      if (!section || (selectedGrade && selectedGrade !== section.gradeLevel)) {
        return res.status(404).json({ message: 'Choose a section in the active academic year.' })
      }
      const [slots] = await pool.execute(
        `SELECT curriculum.subject_id AS subjectId, subject.name,
                subject.department, curriculum.weekly_periods AS weeklyPeriods,
                assignment.teacher_id AS teacherId,
                assigned.full_name AS teacherName
         FROM school_grade_curriculum curriculum
         JOIN school_subjects subject ON subject.id = curriculum.subject_id
           AND subject.school_id = curriculum.school_id
         LEFT JOIN section_subject_teachers assignment ON assignment.school_id = curriculum.school_id
           AND assignment.academic_year_id = ? AND assignment.section_id = ?
           AND assignment.subject_id = curriculum.subject_id
         LEFT JOIN users assigned ON assigned.id = assignment.teacher_id
         WHERE curriculum.school_id = ? AND curriculum.grade_level = ?
         ORDER BY subject.name`,
        [period.academicYearId, section.id, schoolId, section.gradeLevel]
      )
      subjectSlots = slots
      const [candidates] = await pool.execute(
        `SELECT teacher.id, teacher.full_name AS name,
                COALESCE(NULLIF(profile.specialization, ''), teacher.department) AS specialization,
                EXISTS(
                  SELECT 1 FROM section_subject_teachers assignment
                  WHERE assignment.school_id = teacher.school_id
                    AND assignment.academic_year_id = ?
                    AND assignment.section_id = ?
                    AND assignment.teacher_id = teacher.id
                ) AS teachesSection
         FROM users teacher
         LEFT JOIN teachers profile ON profile.id = teacher.id AND profile.school_id = teacher.school_id
         WHERE teacher.school_id = ? AND teacher.role = 'Teacher' AND teacher.is_active = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM school_sections occupied
             WHERE occupied.school_id = teacher.school_id
               AND (occupied.academic_year_id = ? OR occupied.academic_year_id IS NULL)
               AND occupied.homeroom_teacher_id = teacher.id
               AND occupied.id <> ?
               AND NOT (occupied.grade_level = ? AND occupied.section_name = ?)
           )
         ORDER BY teachesSection DESC, teacher.full_name`,
        [period.academicYearId, section.id, schoolId, period.academicYearId,
          section.id, section.gradeLevel, section.sectionName]
      )
      homeroomCandidates = candidates
    }
    const totalSections = sections.length
    return res.json({
      academicYearId: Number(period.academicYearId),
      academicYear: period.academicYear,
      semester: period.semester,
      maxWeeklyPeriods,
      sections,
      teachers: teachers.map((teacher) => ({
        ...teacher,
        id: Number(teacher.id),
        currentPeriods: Number(teacher.currentPeriods),
      })),
      loads: loads.map((load) => ({ ...load, weeklyPeriods: Number(load.weeklyPeriods) })),
      subjectSlots,
      homeroomCandidates,
      stats: {
        totalSections,
        unassignedSubjectSlots: Math.max(0, Number(slotCounts.totalSlots || 0) - Number(slotCounts.assignedSlots || 0)),
        teachersNearPeriodLimit: nearLimitTeachers,
        sectionsWithoutHomeroomTeachers: sections.filter((section) => !section.homeroomTeacherId).length,
      },
    })
  } catch (error) {
    return next(error)
  }
}

export async function saveAcademicCurriculumSubject(req, res, next) {
  const { gradeLevel, subjectName, department } = req.body ?? {}
  const weeklyPeriods = Number(req.body?.weeklyPeriods)
  if (!grades.includes(gradeLevel) || typeof subjectName !== 'string'
    || !subjectName.trim() || subjectName.trim().length > 100
    || !Number.isInteger(weeklyPeriods) || weeklyPeriods < 1 || weeklyPeriods > 40
    || department != null && (typeof department !== 'string' || department.trim().length > 100)) {
    return res.status(400).json({ message: 'Provide a valid grade, subject, department, and weekly period count (1–40).' })
  }
  let connection
  try {
    const schoolId = await getSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your Vice Principal account is not assigned to a school.' })
    }
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const period = await getActiveAcademicYear(connection, schoolId)
    const [subjectRows] = await connection.execute(
      `INSERT INTO school_subjects (school_id, name, department)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id),
         department = COALESCE(VALUES(department), department)`,
      [schoolId, subjectName.trim(), department?.trim() || null]
    )
    const subjectId = Number(subjectRows.insertId)
    await connection.execute(
      `INSERT INTO school_grade_curriculum (school_id, grade_level, subject_id, weekly_periods)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE weekly_periods = VALUES(weekly_periods)`,
      [schoolId, gradeLevel, subjectId, weeklyPeriods]
    )
    if (period) {
      const [[settings]] = await connection.execute(
        'SELECT max_weekly_periods AS maxWeeklyPeriods FROM school_academic_settings WHERE school_id = ?',
        [schoolId]
      )
      const maxWeeklyPeriods = Number(settings?.maxWeeklyPeriods || 24)
      const [assignments] = await connection.execute(
        `SELECT logicalAssignment.teacher_id AS teacherId,
                COUNT(*) AS assignmentCount
         FROM (
           SELECT assignment.teacher_id, section.grade_level, section.section_name
           FROM section_subject_teachers assignment
           JOIN school_sections section ON section.id = assignment.section_id
             AND section.school_id = assignment.school_id
           WHERE assignment.school_id = ? AND assignment.academic_year_id = ?
             AND assignment.subject_id = ? AND assignment.teacher_id IS NOT NULL
             AND section.grade_level = ?
           GROUP BY assignment.teacher_id, section.grade_level, section.section_name
         ) logicalAssignment
         GROUP BY logicalAssignment.teacher_id`,
        [schoolId, period.academicYearId, subjectId, gradeLevel]
      )
      const assignmentsByTeacher = new Map()
      for (const assignment of assignments) {
        assignmentsByTeacher.set(Number(assignment.teacherId), Number(assignment.assignmentCount))
      }
      for (const [teacherId, assignmentCount] of [...assignmentsByTeacher].sort(([first], [second]) => first - second)) {
        await connection.execute(
          'SELECT id FROM users WHERE id = ? AND school_id = ? FOR UPDATE',
          [teacherId, schoolId]
        )
        const [[load]] = await connection.execute(
          `SELECT COALESCE(SUM(logicalAssignment.weeklyPeriods), 0) AS otherPeriods
           FROM (
             SELECT MAX(assignment.weekly_periods) AS weeklyPeriods
             FROM section_subject_teachers assignment
             JOIN school_sections section ON section.id = assignment.section_id
               AND section.school_id = assignment.school_id
             WHERE assignment.school_id = ? AND assignment.academic_year_id = ?
               AND assignment.teacher_id = ?
               AND NOT (assignment.subject_id = ? AND section.grade_level = ?)
             GROUP BY section.grade_level, section.section_name, assignment.subject_id
           ) logicalAssignment`,
          [schoolId, period.academicYearId, teacherId, subjectId, gradeLevel]
        )
        const proposedLoad = Number(load.otherPeriods) + assignmentCount * weeklyPeriods
        if (proposedLoad > maxWeeklyPeriods) {
          await connection.rollback()
          return res.status(409).json({
            message: `Updating this curriculum subject would give a teacher ${proposedLoad}/${maxWeeklyPeriods} weekly periods, exceeding the school limit.`,
          })
        }
      }
      await connection.execute(
        `UPDATE section_subject_teachers assignment
         JOIN school_sections section ON section.id = assignment.section_id
           AND section.school_id = assignment.school_id
         SET assignment.weekly_periods = ?
         WHERE assignment.school_id = ? AND assignment.academic_year_id = ?
           AND assignment.subject_id = ? AND section.grade_level = ?`,
        [weeklyPeriods, schoolId, period.academicYearId, subjectId, gradeLevel]
      )
    }
    await connection.commit()
    return res.json({ message: 'Curriculum subject saved.' })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function initializeAcademicCurriculum(req, res, next) {
  const subjects = [
    { name: 'Mathematics', department: 'Mathematics' },
    { name: 'English', department: 'English' },
    { name: 'Physics', department: 'Physics' },
    { name: 'Chemistry', department: 'Chemistry' },
    { name: 'Biology', department: 'Biology' },
    { name: 'Geography', department: 'Geography' },
    { name: 'History', department: 'History' },
    { name: 'Civics', department: 'Civics' },
    { name: 'Information Technology', department: 'Information Technology' },
    { name: 'Amharic', department: 'Amharic' },
    { name: 'Health/Physical Education', department: 'Health/Physical Education' },
  ]
  let connection
  try {
    const schoolId = await getSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your Vice Principal account is not assigned to a school.' })
    }
    connection = await pool.getConnection()
    await connection.beginTransaction()
    for (const subject of subjects) {
      const [subjectRows] = await connection.execute(
        `INSERT INTO school_subjects (school_id, name, department)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id),
           department = COALESCE(department, VALUES(department))`,
        [schoolId, subject.name, subject.department]
      )
      const subjectId = Number(subjectRows.insertId)
      for (const gradeLevel of grades) {
        await connection.execute(
          `INSERT IGNORE INTO school_grade_curriculum
             (school_id, grade_level, subject_id, weekly_periods)
           VALUES (?, ?, ?, 4)`,
          [schoolId, gradeLevel, subjectId]
        )
      }
    }
    await connection.commit()
    return res.json({
      message: 'Default curriculum subjects initialized for Grades 9–12. Review subject periods and department names for your school.',
      subjectCount: subjects.length,
      gradeCount: grades.length,
    })
  } catch (error) {
    if (connection) await connection.rollback()
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function saveAcademicSubjectTeacher(req, res, next) {
  const { sectionId, subjectId } = req.params
  const teacherId = req.body?.teacherId === '' || req.body?.teacherId == null
    ? null
    : Number(req.body.teacherId)
  if (!validId(sectionId) || !validId(subjectId)
    || teacherId !== null && !validId(teacherId)) {
    return res.status(400).json({ message: 'Choose a valid section, subject, and teacher.' })
  }
  let connection
  try {
    const schoolId = await getSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your Vice Principal account is not assigned to a school.' })
    }
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const period = await getActiveAcademicYear(connection, schoolId)
    if (!period) {
      await connection.rollback()
      return res.status(409).json({ message: 'Configure an active academic year before managing teaching assignments.' })
    }
    const [[section]] = await connection.execute(
      `SELECT id, grade_level AS gradeLevel, section_name AS sectionName,
              academic_year_id AS academicYearId
       FROM school_sections
       WHERE id = ? AND school_id = ? AND is_active = TRUE
         AND ((academic_year_id = ? AND (? IS NULL OR academic_term_id = ? OR academic_term_id IS NULL))
           OR (academic_year_id IS NULL AND academic_term_id IS NULL))`,
      [sectionId, schoolId, period.academicYearId, period.termId, period.termId]
    )
    const [[curriculum]] = await connection.execute(
      `SELECT curriculum.weekly_periods AS weeklyPeriods, subject.name
       FROM school_grade_curriculum curriculum
       JOIN school_subjects subject ON subject.id = curriculum.subject_id
       WHERE curriculum.school_id = ? AND curriculum.grade_level = ?
         AND curriculum.subject_id = ? FOR UPDATE`,
      [schoolId, section?.gradeLevel || '', subjectId]
    )
    if (!section || !curriculum) {
      await connection.rollback()
      return res.status(404).json({ message: 'The section or curriculum subject is not available in the active academic year.' })
    }
    const [equivalentSections] = await connection.execute(
      `SELECT id FROM school_sections
       WHERE school_id = ? AND is_active = TRUE AND grade_level = ? AND section_name = ?
         AND (academic_year_id = ? OR academic_year_id IS NULL)
       ORDER BY id FOR UPDATE`,
      [schoolId, section.gradeLevel, section.sectionName, period.academicYearId]
    )
    const sectionIds = equivalentSections.map((item) => Number(item.id))
    if (!sectionIds.includes(Number(sectionId))) {
      await connection.rollback()
      return res.status(404).json({ message: 'Choose a section in the active academic year.' })
    }
    const sectionPlaceholders = sectionIds.map(() => '?').join(', ')
    await connection.execute(
      `SELECT teacher_id AS teacherId FROM section_subject_teachers
       WHERE school_id = ? AND academic_year_id = ? AND section_id IN (${sectionPlaceholders})
         AND subject_id = ? FOR UPDATE`,
      [schoolId, period.academicYearId, ...sectionIds, subjectId]
    )
    const [legacyAssignments] = await connection.execute(
      `SELECT id, teacher_id AS teacherId FROM teacher_class_assignments
       WHERE school_id = ? AND section_id IN (${sectionPlaceholders}) AND subject = ?
       ORDER BY id FOR UPDATE`,
      [schoolId, ...sectionIds, curriculum.name]
    )
    if (teacherId !== null && legacyAssignments.some((item) => Number(item.teacherId) !== teacherId)) {
      for (const legacyAssignment of legacyAssignments) {
        const [[unarchivedGrade]] = await connection.execute(
          `SELECT grade.id FROM student_grades grade
           LEFT JOIN permanent_academic_records archived
             ON archived.assignment_id = grade.assignment_id
             AND archived.student_id = grade.student_id
             AND archived.academic_year_id = grade.academic_year_id
             AND archived.term_id = grade.term_id
           WHERE grade.assignment_id = ? AND grade.academic_year_id = ?
             AND archived.id IS NULL LIMIT 1`,
          [legacyAssignment.id, period.academicYearId]
        )
        if (unarchivedGrade) {
          await connection.rollback()
          return res.status(409).json({
            message: 'This subject has unarchived student results. Finalize them before changing or removing the assignment.',
          })
        }
      }
    }
    if (teacherId !== null) {
      const [[teacher]] = await connection.execute(
        `SELECT id FROM users
         WHERE id = ? AND school_id = ? AND role = 'Teacher' AND is_active = TRUE
         FOR UPDATE`,
        [teacherId, schoolId]
      )
      if (!teacher) {
        await connection.rollback()
        return res.status(404).json({ message: 'Choose an active teacher in your school.' })
      }
      const [[settings]] = await connection.execute(
        'SELECT max_weekly_periods AS maxWeeklyPeriods FROM school_academic_settings WHERE school_id = ?',
        [schoolId]
      )
      const maxWeeklyPeriods = Number(settings?.maxWeeklyPeriods || 24)
      const [[load]] = await connection.execute(
        `SELECT COALESCE(SUM(logicalAssignment.weeklyPeriods), 0) AS currentPeriods
         FROM (
           SELECT MAX(assignment.weekly_periods) AS weeklyPeriods
           FROM section_subject_teachers assignment
           JOIN school_sections section ON section.id = assignment.section_id
             AND section.school_id = assignment.school_id
           WHERE assignment.school_id = ? AND assignment.academic_year_id = ?
             AND assignment.teacher_id = ?
             AND NOT (section.grade_level = ? AND section.section_name = ?
               AND assignment.subject_id = ?)
           GROUP BY section.grade_level, section.section_name, assignment.subject_id
         ) logicalAssignment`,
        [schoolId, period.academicYearId, teacherId, section.gradeLevel, section.sectionName, subjectId]
      )
      const newLoad = Number(load.currentPeriods) + Number(curriculum.weeklyPeriods)
      if (newLoad > maxWeeklyPeriods) {
        await connection.rollback()
        return res.status(409).json({
          message: `This assignment would give the teacher ${newLoad}/${maxWeeklyPeriods} weekly periods, exceeding the school limit.`,
          currentPeriods: Number(load.currentPeriods),
          weeklyPeriods: Number(curriculum.weeklyPeriods),
          maxWeeklyPeriods,
        })
      }
      for (const equivalentSectionId of sectionIds) {
        await connection.execute(
          `INSERT INTO section_subject_teachers
             (school_id, academic_year_id, section_id, subject_id, teacher_id, weekly_periods)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id),
             weekly_periods = VALUES(weekly_periods)`,
          [schoolId, period.academicYearId, equivalentSectionId, subjectId, teacherId, curriculum.weeklyPeriods]
        )
        await connection.execute(
          `DELETE FROM teacher_subject_assignments
           WHERE school_id = ? AND section_id = ? AND subject_id = ?`,
          [schoolId, equivalentSectionId, subjectId]
        )
        await connection.execute(
          `INSERT INTO teacher_subject_assignments
             (teacher_id, school_id, subject_id, grade_level, section_id)
           VALUES (?, ?, ?, ?, ?)`,
          [teacherId, schoolId, subjectId, section.gradeLevel, equivalentSectionId]
        )
        const [legacyAssignments] = await connection.execute(
          `SELECT id FROM teacher_class_assignments
           WHERE school_id = ? AND section_id = ? AND subject = ?
           ORDER BY (teacher_id = ?) DESC, id FOR UPDATE`,
          [schoolId, equivalentSectionId, curriculum.name, teacherId]
        )
        if (legacyAssignments.length) {
          await connection.execute(
            'UPDATE teacher_class_assignments SET teacher_id = ? WHERE id = ?',
            [teacherId, legacyAssignments[0].id]
          )
        } else {
          await connection.execute(
            `INSERT INTO teacher_class_assignments (teacher_id, school_id, section_id, subject)
             VALUES (?, ?, ?, ?)`,
            [teacherId, schoolId, equivalentSectionId, curriculum.name]
          )
        }
      }
    } else {
      await connection.execute(
        `UPDATE section_subject_teachers SET teacher_id = NULL
         WHERE school_id = ? AND academic_year_id = ? AND section_id IN (${sectionPlaceholders})
           AND subject_id = ?`,
        [schoolId, period.academicYearId, ...sectionIds, subjectId]
      )
      await connection.execute(
        `DELETE FROM teacher_subject_assignments
         WHERE school_id = ? AND section_id IN (${sectionPlaceholders}) AND subject_id = ?`,
        [schoolId, ...sectionIds, subjectId]
      )
    }
    await connection.commit()
    return res.json({ message: teacherId ? 'Subject teacher assigned.' : 'Subject assignment removed.' })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'This section already has a teacher assigned to that subject.' })
    }
    return next(error)
  } finally {
    connection?.release()
  }
}

export async function saveAcademicHomeroomTeacher(req, res, next) {
  const { sectionId } = req.params
  const teacherId = req.body?.teacherId === '' || req.body?.teacherId == null
    ? null
    : Number(req.body.teacherId)
  if (!validId(sectionId) || teacherId !== null && !validId(teacherId)) {
    return res.status(400).json({ message: 'Choose a valid section and homeroom teacher.' })
  }
  let connection
  try {
    const schoolId = await getSchoolId(req.user.id)
    if (!validId(schoolId)) {
      return res.status(403).json({ message: 'Your Vice Principal account is not assigned to a school.' })
    }
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const period = await getActiveAcademicYear(connection, schoolId)
    if (!period) {
      await connection.rollback()
      return res.status(409).json({ message: 'Configure an active academic year before assigning homeroom teachers.' })
    }
    const [[section]] = await connection.execute(
      `SELECT id, grade_level AS gradeLevel, section_name AS sectionName,
              academic_year_id AS academicYearId
       FROM school_sections
       WHERE id = ? AND school_id = ? AND is_active = TRUE
         AND ((academic_year_id = ? AND (? IS NULL OR academic_term_id = ? OR academic_term_id IS NULL))
           OR (academic_year_id IS NULL AND academic_term_id IS NULL))
       FOR UPDATE`,
      [sectionId, schoolId, period.academicYearId, period.termId, period.termId]
    )
    if (!section) {
      await connection.rollback()
      return res.status(404).json({ message: 'Choose a section in the active academic year.' })
    }
    if (teacherId !== null) {
      const [[teacher]] = await connection.execute(
        'SELECT id FROM users WHERE id = ? AND school_id = ? AND role = ? AND is_active = TRUE FOR UPDATE',
        [teacherId, schoolId, 'Teacher']
      )
      if (!teacher) {
        await connection.rollback()
        return res.status(400).json({ message: 'Choose an active teacher in your school.' })
      }
      const [[occupied]] = await connection.execute(
        `SELECT id FROM school_sections
         WHERE school_id = ? AND (academic_year_id = ? OR academic_year_id IS NULL)
           AND homeroom_teacher_id = ?
           AND id <> ? AND NOT (grade_level = ? AND section_name = ?)
         LIMIT 1`,
        [schoolId, period.academicYearId, teacherId, sectionId, section.gradeLevel, section.sectionName]
      )
      if (occupied) {
        await connection.rollback()
        return res.status(409).json({ message: 'This teacher is already the homeroom teacher for another section in the active academic year.' })
      }
    }
    await connection.execute(
      `UPDATE school_sections SET homeroom_teacher_id = ?
       WHERE school_id = ? AND grade_level = ? AND section_name = ?
         AND ((? IS NOT NULL AND academic_year_id = ?)
           OR (? IS NULL AND academic_year_id IS NULL))`,
      [teacherId, schoolId, section.gradeLevel, section.sectionName,
        section.academicYearId, period.academicYearId, section.academicYearId]
    )
    await connection.commit()
    return res.json({ message: 'Homeroom teacher assignment saved.' })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.status) return res.status(error.status).json({ message: error.message })
    return next(error)
  } finally {
    connection?.release()
  }
}
