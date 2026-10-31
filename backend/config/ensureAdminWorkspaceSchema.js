import { pool } from './db.js'

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [table, column]
  )
  if (!rows.length) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
  }
}

async function hasColumn(table, column) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [table, column]
  )
  return rows.length > 0
}

async function ensureForeignKey(table, constraint, ddl) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?
     LIMIT 1`,
    [table, constraint]
  )
  if (!rows.length) await pool.query(ddl)
}

async function ensureSchoolScopedUniqueIndex(table, indexName, columns, legacyColumns) {
  const [indexes] = await pool.execute(
    `SELECT index_name AS indexName, non_unique AS nonUnique,
            GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS indexColumns
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ?
     GROUP BY index_name, non_unique`,
    [table]
  )
  const legacySignature = legacyColumns.join(',')
  for (const index of indexes) {
    if (Number(index.nonUnique) === 0 && index.indexColumns === legacySignature) {
      await pool.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index.indexName}\``)
    }
  }
  const desiredSignature = columns.join(',')
  const [updatedIndexes] = await pool.execute(
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') AS indexColumns
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? AND non_unique = 0
     GROUP BY index_name`,
    [table, indexName]
  )
  if (updatedIndexes[0]?.indexColumns !== desiredSignature) {
    await pool.query(`ALTER TABLE \`${table}\` ADD UNIQUE KEY \`${indexName}\` (${columns.map((column) => `\`${column}\``).join(', ')})`)
  }
}

export async function ensureAdminWorkspaceSchema() {
  const [databaseRows] = await pool.query('SELECT DATABASE() AS databaseName')
  const databaseName = databaseRows[0]?.databaseName
  if (!databaseName) throw new Error('No MySQL database is selected. Set DB_NAME in backend/.env.')

  const [userTable] = await pool.execute(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'users' LIMIT 1`
  )
  if (!userTable.length) {
    throw new Error(`The "${databaseName}" database has no users table. Import backend/schema.sql first.`)
  }
  await ensureColumn('users', 'is_active', 'BOOLEAN NOT NULL DEFAULT TRUE')
  await ensureColumn('users', 'failed_login_attempts', 'INT UNSIGNED NOT NULL DEFAULT 0')
  await ensureColumn('users', 'locked_until', 'DATETIME NULL')
  await ensureColumn('users', 'password_changed_at', 'DATETIME NULL')
  await ensureColumn('users', 'token_version', 'INT UNSIGNED NOT NULL DEFAULT 0')
  await ensureColumn('users', 'registration_source', "ENUM('admin', 'registrar', 'pending') NOT NULL DEFAULT 'pending'")
  await ensureColumn('users', 'registered_by', 'INT NULL')
  await ensureColumn('users', 'school_id', 'INT NULL')
  await ensureColumn('users', 'section', 'VARCHAR(30) NULL')
  await ensureColumn('users', 'department', 'VARCHAR(100) NULL')
  await ensureColumn('users', 'subjects', 'TEXT NULL')
  await ensureColumn('users', 'student_number', 'VARCHAR(50) NULL')
  await pool.query(`ALTER TABLE users MODIFY role ENUM(
    'Super Admin',
    'School Admin',
    'Registrar',
    'Headmaster',
    'Vice Principal',
    'Supervisor',
    'Teacher',
    'Student'
  ) NOT NULL`)
  const hadSchoolName = await hasColumn('schools', 'name')
  const hadSchoolCode = await hasColumn('schools', 'code')
  const hadSchoolActiveFlag = await hasColumn('schools', 'is_active')
  const hadSchoolContact = await hasColumn('schools', 'contact')
  const hadSchoolStampUrl = await hasColumn('schools', 'stamp_url')
  const hadSchoolLogoUrl = await hasColumn('schools', 'logo_url')
  await pool.query(`CREATE TABLE IF NOT EXISTS schools (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    address VARCHAR(255) NULL,
    region VARCHAR(100) NULL,
    zone VARCHAR(100) NULL,
    wereda VARCHAR(100) NULL,
    contact VARCHAR(255) NULL,
    stamp_url VARCHAR(500) NULL,
    logo_url VARCHAR(500) NULL,
    contact_details VARCHAR(255) NULL,
    stamp_path VARCHAR(500) NULL,
    logo_path VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)
  await ensureColumn('schools', 'id', 'INT NOT NULL AUTO_INCREMENT UNIQUE')
  await ensureColumn('schools', 'name', 'VARCHAR(150) NULL')
  await ensureColumn('schools', 'code', 'VARCHAR(50) NULL')
  await ensureColumn('schools', 'is_active', 'BOOLEAN NOT NULL DEFAULT TRUE')
  await ensureColumn('schools', 'contact', 'VARCHAR(255) NULL')
  await ensureColumn('schools', 'stamp_url', 'VARCHAR(500) NULL')
  await ensureColumn('schools', 'logo_url', 'VARCHAR(500) NULL')
  await ensureColumn('schools', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
  await ensureColumn('schools', 'status', "ENUM('active', 'inactive') NOT NULL DEFAULT 'active'")
  await ensureColumn('schools', 'address', 'VARCHAR(255) NULL')
  await ensureColumn('schools', 'region', 'VARCHAR(100) NULL')
  await ensureColumn('schools', 'zone', 'VARCHAR(100) NULL')
  await ensureColumn('schools', 'wereda', 'VARCHAR(100) NULL')
  await ensureColumn('schools', 'contact_details', 'VARCHAR(255) NULL')
  await ensureColumn('schools', 'stamp_path', 'VARCHAR(500) NULL')
  await ensureColumn('schools', 'logo_path', 'VARCHAR(500) NULL')
  await ensureColumn('schools', 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
  const schoolColumns = new Set([
    'id', 'name', 'code', 'region', 'zone', 'wereda',
    'contact', 'stamp_url', 'logo_url', 'is_active', 'created_at',
  ])
  const [schoolColumnRows] = await pool.execute(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'schools'`
  )
  const availableSchoolColumns = new Set(schoolColumnRows.map((row) => row.column_name))
  for (const column of schoolColumns) {
    if (!availableSchoolColumns.has(column)) {
      throw new Error(`The schools table is missing required column "${column}" after migration.`)
    }
  }
  if (!hadSchoolName && availableSchoolColumns.has('school_name')) {
    await pool.query("UPDATE schools SET name = school_name WHERE name IS NULL OR name = ''")
  }
  await pool.query("UPDATE schools SET name = CONCAT('School ', id) WHERE name IS NULL OR TRIM(name) = ''")
  if (!hadSchoolCode && availableSchoolColumns.has('school_code')) {
    await pool.query("UPDATE schools SET code = school_code WHERE code IS NULL OR code = ''")
  }
  await pool.query("UPDATE schools SET code = CONCAT('LEGACY-', id) WHERE code IS NULL OR TRIM(code) = ''")
  if (!hadSchoolContact) {
    await pool.query('UPDATE schools SET contact = contact_details WHERE contact IS NULL')
  }
  if (!hadSchoolStampUrl) {
    await pool.query('UPDATE schools SET stamp_url = stamp_path WHERE stamp_url IS NULL')
  }
  if (!hadSchoolLogoUrl) {
    await pool.query('UPDATE schools SET logo_url = logo_path WHERE logo_url IS NULL')
  }
  if (!hadSchoolActiveFlag) {
    await pool.query("UPDATE schools SET is_active = (status = 'active')")
  } else {
    await pool.query("UPDATE schools SET status = IF(is_active, 'active', 'inactive')")
  }
  await pool.query('ALTER TABLE schools MODIFY name VARCHAR(150) NOT NULL')
  await pool.query('ALTER TABLE schools MODIFY code VARCHAR(50) NOT NULL')
  await pool.query('ALTER TABLE schools MODIFY stamp_url VARCHAR(500) NULL')
  await pool.query('ALTER TABLE schools MODIFY logo_url VARCHAR(500) NULL')
  await pool.query(`CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_role VARCHAR(50) NULL,
    action VARCHAR(120) NULL,
    module VARCHAR(60) NULL,
    details JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_activity_logs_created (created_at)
  )`)
  await ensureColumn('activity_logs', 'actor_id', 'INT NULL')
  await ensureColumn('activity_logs', 'actor_role', 'VARCHAR(50) NULL')
  await ensureColumn('activity_logs', 'action', 'VARCHAR(120) NULL')
  await ensureColumn('activity_logs', 'module', 'VARCHAR(60) NULL')
  await ensureColumn('activity_logs', 'details', 'JSON NULL')
  await ensureColumn('activity_logs', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
  if (await hasColumn('activity_logs', 'user_id')) {
    await pool.query('UPDATE activity_logs SET actor_id = user_id WHERE actor_id IS NULL')
    await pool.query('ALTER TABLE activity_logs MODIFY user_id INT NULL')
  }
  if (await hasColumn('activity_logs', 'action_type')) {
    await pool.query('UPDATE activity_logs SET action = action_type WHERE action IS NULL')
    await pool.query('ALTER TABLE activity_logs MODIFY action_type VARCHAR(100) NULL')
  }
  if (await hasColumn('activity_logs', 'description')) {
    await pool.query(
      `UPDATE activity_logs
       SET details = JSON_OBJECT('description', description)
       WHERE details IS NULL AND description IS NOT NULL`
    )
    await pool.query('ALTER TABLE activity_logs MODIFY description TEXT NULL')
  }
  await pool.query("UPDATE activity_logs SET action = 'legacy.activity' WHERE action IS NULL OR action = ''")
  await pool.query("UPDATE activity_logs SET module = 'legacy' WHERE module IS NULL OR module = ''")
  await pool.query('ALTER TABLE activity_logs MODIFY action VARCHAR(120) NOT NULL')
  await pool.query('ALTER TABLE activity_logs MODIFY module VARCHAR(60) NOT NULL')
  await pool.query(`CREATE TABLE IF NOT EXISTS school_admin_assignments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    school_id INT NOT NULL,
    user_id INT NOT NULL,
    assigned_by INT NOT NULL,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_school_admin_assignment (school_id, user_id),
    CONSTRAINT fk_school_admin_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    CONSTRAINT fk_school_admin_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_school_admin_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS academic_years (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    school_id INT NOT NULL DEFAULT 1,
    UNIQUE KEY uq_academic_year_school_name (school_id, name)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS academic_terms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    academic_year_id INT NOT NULL,
    name VARCHAR(40) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    school_id INT NOT NULL DEFAULT 1,
    UNIQUE KEY uq_academic_term (academic_year_id, name),
    CONSTRAINT fk_term_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS school_sections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    grade_level ENUM('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12') NOT NULL,
    section_name VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    school_id INT NOT NULL DEFAULT 1,
    academic_year_id INT NULL,
    academic_term_id INT NULL,
    UNIQUE KEY uq_school_period_grade_section (school_id, academic_year_id, academic_term_id, grade_level, section_name),
    CONSTRAINT fk_school_section_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT,
    CONSTRAINT fk_school_section_term FOREIGN KEY (academic_term_id) REFERENCES academic_terms(id) ON DELETE RESTRICT
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS teacher_class_assignments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    school_id INT NOT NULL,
    section_id INT NOT NULL,
    subject VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_teacher_class_subject (teacher_id, section_id, subject),
    INDEX idx_teacher_assignments_school (school_id, teacher_id),
    CONSTRAINT fk_teacher_assignment_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_teacher_assignment_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    CONSTRAINT fk_teacher_assignment_section FOREIGN KEY (section_id) REFERENCES school_sections(id) ON DELETE CASCADE
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS school_settings (
    setting_key VARCHAR(60) PRIMARY KEY,
    setting_value TEXT NULL,
    school_id INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)
  await ensureColumn('academic_years', 'school_id', 'INT NOT NULL DEFAULT 1')
  await ensureColumn('academic_terms', 'school_id', 'INT NOT NULL DEFAULT 1')
  await ensureColumn('academic_terms', 'is_active', 'BOOLEAN NOT NULL DEFAULT FALSE')
  await ensureColumn('school_sections', 'school_id', 'INT NOT NULL DEFAULT 1')
  await ensureColumn('school_sections', 'academic_year_id', 'INT NULL')
  await ensureColumn('school_sections', 'academic_term_id', 'INT NULL')
  await ensureColumn('school_settings', 'school_id', 'INT NOT NULL DEFAULT 1')
  await ensureSchoolScopedUniqueIndex('academic_years', 'uq_academic_year_school_name', ['school_id', 'name'], ['name'])
  await ensureSchoolScopedUniqueIndex('school_sections', 'uq_school_period_grade_section', ['school_id', 'academic_year_id', 'academic_term_id', 'grade_level', 'section_name'], ['grade_level', 'section_name'])
  await ensureSchoolScopedUniqueIndex('school_sections', 'uq_school_period_grade_section', ['school_id', 'academic_year_id', 'academic_term_id', 'grade_level', 'section_name'], ['school_id', 'grade_level', 'section_name'])
  await ensureForeignKey(
    'school_sections',
    'fk_school_section_year',
    'ALTER TABLE school_sections ADD CONSTRAINT fk_school_section_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE RESTRICT'
  )
  await ensureForeignKey(
    'school_sections',
    'fk_school_section_term',
    'ALTER TABLE school_sections ADD CONSTRAINT fk_school_section_term FOREIGN KEY (academic_term_id) REFERENCES academic_terms(id) ON DELETE RESTRICT'
  )
  await pool.query(`CREATE TABLE IF NOT EXISTS student_records (
    user_id INT NOT NULL PRIMARY KEY,
    date_of_birth DATE NOT NULL,
    gender ENUM('Female', 'Male') NOT NULL,
    phone VARCHAR(40) NULL,
    guardian_name VARCHAR(150) NOT NULL,
    relationship VARCHAR(50) NOT NULL,
    guardian_phone VARCHAR(40) NOT NULL,
    guardian_email VARCHAR(100) NULL,
    address VARCHAR(1000) NOT NULL,
    section VARCHAR(30) NOT NULL,
    academic_year VARCHAR(20) NOT NULL,
    photo_path VARCHAR(500) NULL,
    status ENUM('Active', 'Pending', 'Archived') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_records_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    school_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NULL,
    dob DATE NULL,
    date_of_birth DATE NOT NULL,
    grade ENUM('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12') NULL,
    grade_level ENUM('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12') NOT NULL,
    section VARCHAR(30) NOT NULL,
    gender ENUM('Female', 'Male') NULL,
    previous_school VARCHAR(200) NULL,
    region VARCHAR(100) NULL,
    zone VARCHAR(100) NULL,
    woreda VARCHAR(100) NULL,
    kebele VARCHAR(100) NULL,
    house_no VARCHAR(40) NULL,
    phone_number VARCHAR(40) NULL,
    phone VARCHAR(40) NULL,
    guardian_relation VARCHAR(50) NULL,
    relationship VARCHAR(50) NULL,
    guardian_email VARCHAR(100) NULL,
    address VARCHAR(1000) NOT NULL,
    guardian_name VARCHAR(150) NOT NULL,
    guardian_phone VARCHAR(40) NOT NULL,
    emergency_contact_name VARCHAR(150) NULL,
    emergency_contact_phone VARCHAR(40) NULL,
    emergency_contact VARCHAR(40) NOT NULL,
    photo_path VARCHAR(500) NULL,
    parent_photo_url VARCHAR(500) NULL,
    academic_year VARCHAR(20) NULL,
    registration_date DATE NULL,
    status ENUM('Active', 'Pending', 'Archived') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_students_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    INDEX idx_students_school_name (school_id, full_name)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  const [studentTableCollations] = await pool.execute(
    `SELECT table_collation FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'students' LIMIT 1`
  )
  if (!String(studentTableCollations[0]?.table_collation || '').startsWith('utf8mb4_')) {
    await pool.query('ALTER TABLE students CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  }
  await ensureColumn('students', 'user_id', 'INT NULL')
  await ensureColumn('students', 'school_id', 'INT NULL')
  await ensureColumn('students', 'full_name', 'VARCHAR(100) NULL')
  await ensureColumn('students', 'email', 'VARCHAR(100) NULL')
  await ensureColumn('students', 'dob', 'DATE NULL')
  await ensureColumn('students', 'date_of_birth', 'DATE NULL')
  await ensureColumn('students', 'grade', "ENUM('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12') NULL")
  await ensureColumn('students', 'grade_level', 'VARCHAR(20) NULL')
  await ensureColumn('students', 'section', 'VARCHAR(30) NULL')
  await ensureColumn('students', 'gender', "ENUM('Female', 'Male') NULL")
  await ensureColumn('students', 'previous_school', 'VARCHAR(200) NULL')
  await ensureColumn('students', 'region', 'VARCHAR(100) NULL')
  await ensureColumn('students', 'zone', 'VARCHAR(100) NULL')
  await ensureColumn('students', 'woreda', 'VARCHAR(100) NULL')
  await ensureColumn('students', 'kebele', 'VARCHAR(100) NULL')
  await ensureColumn('students', 'house_no', 'VARCHAR(40) NULL')
  await ensureColumn('students', 'phone_number', 'VARCHAR(40) NULL')
  await ensureColumn('students', 'phone', 'VARCHAR(40) NULL')
  await ensureColumn('students', 'guardian_relation', 'VARCHAR(50) NULL')
  await ensureColumn('students', 'relationship', 'VARCHAR(50) NULL')
  await ensureColumn('students', 'guardian_email', 'VARCHAR(100) NULL')
  await ensureColumn('students', 'address', 'VARCHAR(1000) NULL')
  await ensureColumn('students', 'guardian_name', 'VARCHAR(150) NULL')
  await ensureColumn('students', 'guardian_phone', 'VARCHAR(40) NULL')
  await ensureColumn('students', 'emergency_contact_name', 'VARCHAR(150) NULL')
  await ensureColumn('students', 'emergency_contact_phone', 'VARCHAR(40) NULL')
  await ensureColumn('students', 'emergency_contact', 'VARCHAR(40) NULL')
  await ensureColumn('students', 'photo_path', 'VARCHAR(500) NULL')
  await ensureColumn('students', 'parent_photo_url', 'VARCHAR(500) NULL')
  await ensureColumn('students', 'academic_year', 'VARCHAR(20) NULL')
  await ensureColumn('students', 'registration_date', 'DATE NULL')
  await ensureColumn('students', 'status', "ENUM('Active', 'Pending', 'Archived') NOT NULL DEFAULT 'Active'")
  await ensureColumn('students', 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP')
  await pool.query(
    `UPDATE students
     SET dob = COALESCE(dob, date_of_birth),
         grade = COALESCE(grade, grade_level),
         phone_number = COALESCE(phone_number, phone),
         guardian_relation = COALESCE(guardian_relation, relationship),
         emergency_contact_phone = COALESCE(emergency_contact_phone, emergency_contact),
         registration_date = COALESCE(registration_date, DATE(created_at))`
  )
  await pool.query(
    `UPDATE users student
     JOIN users registrar ON registrar.id = student.registered_by
     SET student.school_id = registrar.school_id
     WHERE student.role = 'Student' AND student.school_id IS NULL
       AND registrar.school_id IS NOT NULL`
  )
  await pool.query(
    `INSERT INTO students (
       user_id, school_id, full_name, email, dob, date_of_birth, grade, grade_level, section,
       gender, previous_school, region, zone, woreda, kebele, house_no, phone_number, phone,
       guardian_name, guardian_relation, relationship, guardian_phone, guardian_email,
       emergency_contact_name, emergency_contact_phone, emergency_contact, address,
       photo_path, academic_year, registration_date, status
     )
     SELECT u.id, u.school_id, u.full_name, u.email, s.date_of_birth, s.date_of_birth,
            u.grade_level, u.grade_level, s.section, s.gender, NULL, NULL, NULL, NULL, NULL, NULL,
            s.phone, s.phone, s.guardian_name, s.relationship, s.relationship, s.guardian_phone,
            s.guardian_email, NULL, COALESCE(s.phone, s.guardian_phone),
            COALESCE(s.phone, s.guardian_phone), s.address, s.photo_path, s.academic_year,
            DATE(u.created_at), s.status
     FROM users u
     JOIN student_records s ON s.user_id = u.id
     WHERE u.role = 'Student' AND u.school_id IS NOT NULL
       AND u.grade_level IN ('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12')
       AND NOT EXISTS (SELECT 1 FROM students existing WHERE existing.user_id = u.id)`
  )
  await ensureColumn('student_records', 'graduated_at', 'DATETIME NULL')
  await pool.query(
    `UPDATE users u
     JOIN student_records s ON s.user_id = u.id
     SET u.registration_source = 'registrar'
     WHERE u.role = 'Student'
       AND u.is_active = TRUE
       AND u.registration_source = 'pending'
       AND s.status = 'Active'`
  )

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_key VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  const [legacyMigration] = await pool.execute(
    `SELECT 1 FROM schema_migrations
     WHERE migration_key = 'admin_workspace_legacy_registration_source' LIMIT 1`
  )
  if (!legacyMigration.length) {
    await pool.query(
      `UPDATE users SET registration_source = 'admin'
       WHERE is_active = TRUE AND registration_source = 'pending'`
    )
    await pool.execute(
      `INSERT INTO schema_migrations (migration_key)
       VALUES ('admin_workspace_legacy_registration_source')`
    )
  }

  await ensureForeignKey(
    'users',
    'fk_users_registered_by',
    'ALTER TABLE users ADD CONSTRAINT fk_users_registered_by FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE SET NULL'
  )

  await pool.query(`CREATE TABLE IF NOT EXISTS system_security_policy (
    id TINYINT PRIMARY KEY,
    min_password_length TINYINT UNSIGNED NOT NULL DEFAULT 8,
    require_password_mixed_case BOOLEAN NOT NULL DEFAULT FALSE,
    require_password_number BOOLEAN NOT NULL DEFAULT FALSE,
    max_failed_logins TINYINT UNSIGNED NOT NULL DEFAULT 5,
    lockout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,
    session_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 480
  )`)
  await pool.execute('INSERT IGNORE INTO system_security_policy (id) VALUES (1)')
  await pool.query(`CREATE TABLE IF NOT EXISTS admin_delegations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    delegated_user_id INT NOT NULL,
    created_by INT NOT NULL,
    permissions JSON NOT NULL,
    starts_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_delegation_active (delegated_user_id, expires_at, revoked_at),
    CONSTRAINT fk_delegation_user FOREIGN KEY (delegated_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_delegation_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS transcript_verifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL UNIQUE,
    student_name VARCHAR(100) NOT NULL,
    grade_level VARCHAR(30) NOT NULL,
    section VARCHAR(30) NULL,
    academic_year VARCHAR(20) NULL,
    verification_code CHAR(32) NOT NULL UNIQUE,
    archived_at DATETIME NOT NULL,
    purged_at DATETIME NULL,
    INDEX idx_transcript_code (verification_code)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS student_grades (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    student_id INT NOT NULL,
    school_id INT NOT NULL,
    academic_year_id INT NOT NULL,
    term_id INT NOT NULL,
    assessment_40 DECIMAL(5,2) NOT NULL,
    final_60 DECIMAL(5,2) NOT NULL,
    total_100 DECIMAL(5,2) NOT NULL,
    updated_by INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_student_class_term_grade (assignment_id, student_id, academic_year_id, term_id),
    INDEX idx_student_grades_period (school_id, academic_year_id, term_id),
    CONSTRAINT fk_student_grade_assignment FOREIGN KEY (assignment_id) REFERENCES teacher_class_assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_grade_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_grade_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_grade_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_grade_term FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_grade_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
  )`)
}
