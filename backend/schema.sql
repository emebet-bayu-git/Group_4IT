CREATE DATABASE IF NOT EXISTS school_sims_db;
USE school_sims_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  username VARCHAR(60) NULL,
  phone VARCHAR(40) NULL,
  employee_id VARCHAR(50) NULL,
  gender ENUM('Female', 'Male') NULL,
  school_id INT NULL,
  avatar_path VARCHAR(500) NULL,
  password VARCHAR(255) NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  role ENUM(
    'Super Admin',
    'School Admin',
    'Registrar',
    'Headmaster',
    'Vice Principal',
    'Supervisor',
    'Teacher',
    'Student'
  ) NOT NULL,
  grade_level ENUM('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'N/A') DEFAULT 'N/A',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_school_employee_id (school_id, employee_id)
);

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
  section VARCHAR(30) NULL,
  academic_year VARCHAR(20) NOT NULL,
  photo_path VARCHAR(500) NULL,
  status ENUM('Active', 'Pending', 'Archived', 'Unassigned') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_student_records_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM(
    'Super Admin',
    'School Admin',
    'Registrar',
    'Headmaster',
    'Vice Principal',
    'Supervisor',
    'Teacher',
    'Student'
  ) NOT NULL,
  task_title VARCHAR(150) NOT NULL,
  task_description TEXT NOT NULL,
  action_route VARCHAR(100) NOT NULL,
  UNIQUE KEY unique_role_task (role, task_title)
);

INSERT IGNORE INTO role_tasks (role, task_title, task_description, action_route) VALUES
('Super Admin', 'System Configurations', 'Manage global secondary school settings and system health.', '/admin/config'),
('Super Admin', 'User Account Control', 'Create and manage credentials for School Admins & Headmasters.', '/admin/users'),
('School Admin', 'Manage Staff Accounts', 'Create, update, and manage Teacher & Registrar accounts.', '/school-admin/staff'),
('School Admin', 'Academic Calendar', 'Configure term dates and Grade 9-12 national exam schedules.', '/school-admin/calendar'),
('Registrar', 'Student Registration', 'Register new Grade 9-12 secondary school students.', '/registrar/enroll'),
('Registrar', 'Issue Transcripts', 'Generate official academic report cards and transcripts.', '/registrar/transcripts'),
('Headmaster', 'School Performance', 'Review school-wide academic statistics and department reports.', '/headmaster/performance'),
('Headmaster', 'Staff Evaluation', 'Oversee supervisor feedback and faculty discipline.', '/headmaster/evaluations'),
('Supervisor', 'Curriculum Inspection', 'Monitor Grade 9-12 teaching standards and syllabus completion.', '/supervisor/inspection'),
('Supervisor', 'Classroom Observation', 'Submit classroom evaluation reports for teachers.', '/supervisor/observations'),
('Teacher', 'Enter Student Grades', 'Submit mid-term and final examination scores.', '/teacher/grades'),
('Teacher', 'Daily Attendance', 'Take homeroom attendance for assigned secondary classes.', '/teacher/attendance'),
('Student', 'View Grade Report', 'Check Grade 9-12 subject scores, GPA, and term ranks.', '/student/grades'),
('Student', 'Class Schedule', 'View daily timetable and national exam preparation schedules.', '/student/schedule');

INSERT IGNORE INTO users (full_name, email, password, role, grade_level, must_change_password) VALUES
('Super Admin User', 'superadmin@school.edu.et', '$2a$10$orwtqq/L94apbA1GTuelQe/kMy7yp7/VMNWHJa0Kg9/m4TYMPFMDy', 'Super Admin', 'N/A', FALSE),
('Abebe Kebede (Student)', 'student@school.edu.et', '$2a$10$orwtqq/L94apbA1GTuelQe/kMy7yp7/VMNWHJa0Kg9/m4TYMPFMDy', 'Student', 'Grade 11', TRUE),
('Tewodros Kassahun (Teacher)', 'teacher@school.edu.et', '$2a$10$orwtqq/L94apbA1GTuelQe/kMy7yp7/VMNWHJa0Kg9/m4TYMPFMDy', 'Teacher', 'N/A', TRUE);
