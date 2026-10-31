USE school_sims_db;

CREATE TABLE IF NOT EXISTS student_records (
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
);
