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
CALL add_column_if_missing('student_records', 'graduated_at', 'DATETIME NULL');

DROP PROCEDURE add_column_if_missing;

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
