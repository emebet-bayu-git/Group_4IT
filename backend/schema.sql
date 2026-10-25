CREATE DATABASE IF NOT EXISTS school_sims_db;
USE school_sims_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM(
    'Super Admin',
    'School Admin',
    'Registrar',
    'Headmaster',
    'Supervisor',
    'Teacher',
    'Student'
  ) NOT NULL,
  grade_level ENUM('Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'N/A') DEFAULT 'N/A',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM(
    'Super Admin',
    'School Admin',
    'Registrar',
    'Headmaster',
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
('Super Admin', 'System Configurations', 'Manage global secondary school settings and server logs.', '/admin/config'),
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
