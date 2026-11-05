USE school_sims_db;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER //
CREATE PROCEDURE add_column_if_missing(
  IN table_name_value VARCHAR(64),
  IN column_name_value VARCHAR(64),
  IN column_definition_value VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = table_name_value
      AND column_name = column_name_value
  ) THEN
    SET @add_column_sql = CONCAT(
      'ALTER TABLE `', REPLACE(table_name_value, '`', '``'),
      '` ADD COLUMN `', REPLACE(column_name_value, '`', '``'),
      '` ', column_definition_value
    );
    PREPARE add_column_statement FROM @add_column_sql;
    EXECUTE add_column_statement;
    DEALLOCATE PREPARE add_column_statement;
  END IF;
END//
DELIMITER ;

CALL add_column_if_missing('users', 'is_active', 'BOOLEAN NOT NULL DEFAULT TRUE');
CALL add_column_if_missing('users', 'failed_login_attempts', 'INT UNSIGNED NOT NULL DEFAULT 0');
CALL add_column_if_missing('users', 'locked_until', 'DATETIME NULL');
CALL add_column_if_missing('users', 'password_changed_at', 'DATETIME NULL');
CALL add_column_if_missing('users', 'token_version', 'INT UNSIGNED NOT NULL DEFAULT 0');
CALL add_column_if_missing('users', 'registration_source', 'ENUM(''admin'', ''registrar'', ''pending'') NOT NULL DEFAULT ''pending''');
CALL add_column_if_missing('users', 'registered_by', 'INT NULL');
CALL add_column_if_missing('users', 'username', 'VARCHAR(60) NULL');
CALL add_column_if_missing('users', 'phone', 'VARCHAR(40) NULL');
CALL add_column_if_missing('users', 'employee_id', 'VARCHAR(50) NULL');
CALL add_column_if_missing('users', 'gender', 'ENUM(''Female'', ''Male'') NULL');
CALL add_column_if_missing('users', 'school_id', 'INT NULL');
CALL add_column_if_missing('users', 'department', 'VARCHAR(100) NULL');
CALL add_column_if_missing('users', 'avatar_path', 'VARCHAR(500) NULL');
CALL add_column_if_missing('student_records', 'graduated_at', 'DATETIME NULL');

CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_key VARCHAR(100) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP PROCEDURE IF EXISTS backfill_legacy_user_registration;
DELIMITER //
CREATE PROCEDURE backfill_legacy_user_registration()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations
    WHERE migration_key = 'admin_workspace_legacy_registration_source'
  ) THEN
    UPDATE users
    SET registration_source = 'admin'
    WHERE is_active = TRUE AND registration_source = 'pending';
    INSERT INTO schema_migrations (migration_key)
    VALUES ('admin_workspace_legacy_registration_source');
  END IF;
END//
DELIMITER ;
CALL backfill_legacy_user_registration();
DROP PROCEDURE backfill_legacy_user_registration;

SET @registered_by_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'users'
    AND constraint_name = 'fk_users_registered_by'
);
SET @add_registered_by_fk_sql = IF(
  @registered_by_fk_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT fk_users_registered_by FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE add_registered_by_fk_statement FROM @add_registered_by_fk_sql;
EXECUTE add_registered_by_fk_statement;
DEALLOCATE PREPARE add_registered_by_fk_statement;

SET @username_index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users'
    AND index_name = 'uq_users_username'
);
SET @add_username_index_sql = IF(
  @username_index_exists = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)',
  'SELECT 1'
);
PREPARE add_username_index_statement FROM @add_username_index_sql;
EXECUTE add_username_index_statement;
DEALLOCATE PREPARE add_username_index_statement;

SET @employee_index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users'
    AND index_name = 'uq_users_school_employee_id'
);
SET @add_employee_index_sql = IF(
  @employee_index_exists = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_school_employee_id (school_id, employee_id)',
  'SELECT 1'
);
PREPARE add_employee_index_statement FROM @add_employee_index_sql;
EXECUTE add_employee_index_statement;
DEALLOCATE PREPARE add_employee_index_statement;

CREATE TABLE IF NOT EXISTS academic_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(20) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS academic_terms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  academic_year_id INT NOT NULL,
  name VARCHAR(40) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  UNIQUE KEY uq_academic_term (academic_year_id, name),
  CONSTRAINT fk_term_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS school_sections (
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
);

CALL add_column_if_missing('school_sections', 'homeroom_teacher_id', 'INT NULL');

SET @homeroom_teacher_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.referential_constraints
  WHERE constraint_schema = DATABASE()
    AND table_name = 'school_sections'
    AND constraint_name = 'fk_school_section_homeroom_teacher'
);
SET @add_homeroom_teacher_fk_sql = IF(
  @homeroom_teacher_fk_exists = 0,
  'ALTER TABLE school_sections ADD CONSTRAINT fk_school_section_homeroom_teacher FOREIGN KEY (homeroom_teacher_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE add_homeroom_teacher_fk_statement FROM @add_homeroom_teacher_fk_sql;
EXECUTE add_homeroom_teacher_fk_statement;
DEALLOCATE PREPARE add_homeroom_teacher_fk_statement;

CREATE TABLE IF NOT EXISTS teachers (
  id INT PRIMARY KEY,
  school_id INT NOT NULL,
  woreda_employee_id VARCHAR(50) NULL,
  phone_number VARCHAR(40) NULL,
  specialization VARCHAR(100) NULL,
  qualification_degree VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teacher_woreda_employee (school_id, woreda_employee_id),
  INDEX idx_teachers_school (school_id, id),
  CONSTRAINT fk_teacher_profile_user FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS school_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_school_subject_name (school_id, name)
);

CREATE TABLE IF NOT EXISTS teacher_subject_assignments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT NOT NULL,
  school_id INT NOT NULL,
  subject_id INT NOT NULL,
  grade_level ENUM('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12') NOT NULL,
  section_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_teacher_subject_section (teacher_id, subject_id, section_id),
  INDEX idx_teacher_subject_school (school_id, teacher_id, grade_level),
  CONSTRAINT fk_teacher_subject_profile FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_subject_catalog FOREIGN KEY (subject_id) REFERENCES school_subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_subject_section FOREIGN KEY (section_id) REFERENCES school_sections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS section_result_submissions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  school_id INT NOT NULL,
  academic_year_id INT NOT NULL,
  term_id INT NOT NULL,
  status ENUM('submitted', 'published') NOT NULL DEFAULT 'submitted',
  submitted_by INT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by INT NULL,
  published_at TIMESTAMP NULL,
  UNIQUE KEY uq_section_result_submission_period (section_id, academic_year_id, term_id),
  INDEX idx_section_result_submissions_school_status (school_id, status, submitted_at),
  CONSTRAINT fk_section_submission_section FOREIGN KEY (section_id) REFERENCES school_sections(id) ON DELETE CASCADE,
  CONSTRAINT fk_section_submission_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
  CONSTRAINT fk_section_submission_term FOREIGN KEY (term_id) REFERENCES academic_terms(id) ON DELETE CASCADE,
  CONSTRAINT fk_section_submission_submitter FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_section_submission_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT
);

DROP PROCEDURE add_column_if_missing;

CREATE TABLE IF NOT EXISTS school_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_security_policy (
  id TINYINT PRIMARY KEY,
  min_password_length TINYINT UNSIGNED NOT NULL DEFAULT 8,
  require_password_mixed_case BOOLEAN NOT NULL DEFAULT FALSE,
  require_password_number BOOLEAN NOT NULL DEFAULT FALSE,
  max_failed_logins TINYINT UNSIGNED NOT NULL DEFAULT 5,
  lockout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  session_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 480
);

INSERT IGNORE INTO system_security_policy (id) VALUES (1);

CREATE TABLE IF NOT EXISTS admin_delegations (
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
);

CREATE TABLE IF NOT EXISTS transcript_verifications (
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
);
