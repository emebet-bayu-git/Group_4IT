import React, { useEffect, useState } from 'react'
import axios from 'axios'
import AdminDashboard from '../components/AdminDashboard.jsx'
import AdminWorkspace from '../components/AdminWorkspace.jsx'
import AcademicInfrastructureView from '../components/AcademicInfrastructureView.jsx'
import RoleAssignView from '../components/RoleAssignView.jsx'
import DashboardLayout, { dashboardMenuByRole } from '../components/DashboardLayout.jsx'
import RegisterStudent from '../components/RegisterStudent.jsx'
import ReportCardView from '../components/ReportCardView.jsx'
import StudentDashboard from '../components/StudentDashboard.jsx'
import StudentList from '../components/StudentList.jsx'
import SchoolStaffOversightView from '../components/SchoolStaffOversightView.jsx'
import TeacherDashboard from '../components/TeacherDashboard.jsx'
import GradeEntryView from '../components/GradeEntryView.jsx'
import TranscriptView from '../components/TranscriptView.jsx'
import { readSessionToken } from './LoginPage.jsx'

const taskDetails = {
  'Super Admin': {
    schools: ['Schools', 'Manage registered schools and add new institutions.'],
    'all-users': ['Register Users', 'Manage system users and account lifecycle.'],
    'audit-logs': ['System Security & Audit Logs', 'Inspect system-wide audit activity and security events.'],
  },
  'School Admin': {
    'academic-infrastructure': ['Academic Infrastructure', 'Manage semesters, grade levels, and sections for this school.'],
    'school-profile': ['School Profile & Metadata', 'Manage school stamp, header, and profile information.'],
    'staff-registration': ['Register School Staff', 'Create Teacher and Registrar accounts for your assigned school.'],
    'staff-oversight': ['School Staff Oversight', 'Review staff and operational assignments for this school.'],
    'role-assign': ['Role Assign', 'Assign school leadership roles to teachers and registrars.'],
    'student-rosters': ['Student Rosters', 'Review roster and enrollment status for this school only.'],
  },
  Admin: {},
  Registrar: {},
  Teacher: {
    'grade-entry': ['Grade Entry', 'Enter and review grades for your assigned classes.'],
    roster: ['Student Roster', 'View students assigned to your classes.'],
  },
  Headmaster: {
    overview: ['Leadership Overview', 'Review your school leadership responsibilities.'],
  },
  'Vice Principal': {
    overview: ['Leadership Overview', 'Review your school leadership responsibilities.'],
  },
  Supervisor: {
    overview: ['Leadership Overview', 'Review your school leadership responsibilities.'],
  },
  Student: {
    schedule: ['Class Schedule', 'Check your classes and daily schedule.'],
  },
}

function TaskPlaceholder({ role, task }) {
  const detail = taskDetails[role]?.[task]
  if (!detail) return null

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
      <p className="text-sm font-semibold text-primary-700">{role} workspace</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{detail[0]}</h1>
      <p className="mt-2 text-sm text-slate-600">{detail[1]}</p>
      <p className="mt-6 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        This task is ready to connect to the school records service.
      </p>
    </section>
  )
}

export default function DashboardPage({ user, onLogout }) {
  const [activeTask, setActiveTask] = useState(() => dashboardMenuByRole[user.systemRole || user.role]?.[0]?.id || 'overview')
  const [studentProfile, setStudentProfile] = useState(null)
  const [studentProfileError, setStudentProfileError] = useState('')
  const [schoolStudentRegistration, setSchoolStudentRegistration] = useState(false)
  const [selectedTeacherClassId, setSelectedTeacherClassId] = useState('')
  const [dashboardStats, setDashboardStats] = useState(null)
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false)
  const [dashboardStatsError, setDashboardStatsError] = useState('')
  const role = user.systemRole || user.role
  const refreshDashboardStats = async () => {
    setDashboardStatsLoading(true)
    setDashboardStatsError('')
    try {
      const { data } = await axios.get('/api/admin/dashboard-stats', {
        headers: { Authorization: `Bearer ${readSessionToken()}` },
      })
      setDashboardStats(data)
    } catch (error) {
      setDashboardStatsError(error.response?.data?.message || 'Unable to load school overview statistics.')
    }
    setDashboardStatsLoading(false)
  }
  const roleTasks = dashboardMenuByRole[role] ?? []
  const initialTask = roleTasks[0]?.id || 'overview'
  const currentTask = roleTasks.some((item) => item.id === activeTask) ? activeTask : initialTask
  const navigateTask = (task) => {
    if (roleTasks.some((item) => item.id === task)) setActiveTask(task)
  }
  useEffect(() => {
    if (!roleTasks.some((item) => item.id === activeTask)) setActiveTask(initialTask)
  }, [role, initialTask, activeTask, roleTasks])
  useEffect(() => {
    if (role !== 'School Admin') {
      setDashboardStats(null)
      return undefined
    }
    refreshDashboardStats()
    return undefined
  }, [role])
  useEffect(() => {
    if (role !== 'Student') return undefined
    let active = true
    axios.get('/api/students/me', {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    }).then(({ data }) => {
      if (active) setStudentProfile({ ...data, rollNumber: String(data.id) })
    }).catch((error) => {
      if (active) setStudentProfileError(error.response?.data?.message || 'Unable to load your student profile.')
    })
    return () => { active = false }
  }, [role])
  const saveStudent = async (student) => {
    const formData = new FormData()
    Object.entries(student).forEach(([key, value]) => {
      if (key === 'photoFile') {
        if (value) formData.append('photo', value)
      } else if (key === 'parentPhoto') {
        if (value) formData.append('parent_photo', value)
      } else {
        formData.append(key, value)
      }
    })
    const { data } = await axios.post('/api/students', formData, {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    })
    return data
  }

  let content = <TaskPlaceholder role={role} task={currentTask} />

  if (role === 'Super Admin') {
    if (currentTask === 'schools' || currentTask === 'all-users' || currentTask === 'audit-logs') {
      content = <AdminWorkspace activeTask={currentTask} />
    }
  } else if (role === 'School Admin') {
    if (currentTask === 'overview') {
      content = <AdminDashboard
        onRegisterStudent={() => navigateTask('student-rosters')}
        stats={dashboardStats}
        loading={dashboardStatsLoading}
        error={dashboardStatsError}
      />
    } else if (currentTask === 'role-assign') {
      content = <RoleAssignView />
    } else if (currentTask === 'student-rosters') {
      content = schoolStudentRegistration
        ? <RegisterStudent onCancel={() => setSchoolStudentRegistration(false)} onComplete={saveStudent} />
        : <StudentList onRegister={() => setSchoolStudentRegistration(true)} onAction={(action, student) => window.alert(`${action}: ${student.name}`)} />
    } else if (currentTask === 'staff-oversight') {
      content = <SchoolStaffOversightView />
    } else if (currentTask === 'academic-infrastructure') {
      content = <AcademicInfrastructureView onConfigurationChange={refreshDashboardStats} />
    } else if (currentTask === 'staff-registration' || currentTask === 'school-profile') {
      content = <AdminWorkspace activeTask={currentTask} />
    }
  } else if (role === 'Admin') {
    if (currentTask === 'overview') {
      content = <AdminDashboard onRegisterStudent={() => navigateTask('enrollment')} />
    } else if (currentTask === 'students') {
      content = <StudentList onRegister={() => navigateTask('enrollment')} onAction={(action, student) => window.alert(`${action}: ${student.name}`)} />
    } else if (currentTask === 'enrollment') {
      content = <RegisterStudent onCancel={() => navigateTask('students')} onComplete={saveStudent} />
    } else if (currentTask === 'system-access') {
      content = <AdminWorkspace activeTask={currentTask} />
    }
  } else if (role === 'Registrar') {
    if (currentTask === 'overview') {
      content = <StudentList onRegister={() => navigateTask('enrollment')} onAction={(action, student) => window.alert(`${action}: ${student.name}`)} />
    } else if (currentTask === 'enrollment') {
      content = <RegisterStudent onCancel={() => navigateTask('overview')} onComplete={saveStudent} />
    } else if (currentTask === 'transcripts') {
      content = <TranscriptView onBack={() => navigateTask('overview')} />
    }
  } else if (role === 'Teacher') {
    if (currentTask === 'overview') {
      content = <TeacherDashboard
        teacherName={user.name || user.identifier}
        onEnterGrades={(classItem) => { setSelectedTeacherClassId(String(classItem.id)); navigateTask('grade-entry') }}
        onViewRoster={(classItem) => { setSelectedTeacherClassId(String(classItem.id)); navigateTask('roster') }}
      />
    } else if (currentTask === 'grade-entry' || currentTask === 'roster') {
      content = <GradeEntryView initialAssignmentId={selectedTeacherClassId} readOnly={currentTask === 'roster'} />
    }
  } else if (role === 'Student') {
    if (currentTask === 'overview') {
      content = studentProfileError
        ? <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">{studentProfileError}</p>
        : studentProfile
          ? <StudentDashboard student={studentProfile} onDownload={(documentName) => navigateTask(documentName === 'Official transcript' ? 'transcript' : 'grades')} />
          : <p role="status" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading your student profile…</p>
    } else if (currentTask === 'grades') {
      content = <ReportCardView onBack={() => navigateTask('overview')} />
    } else if (currentTask === 'transcript') {
      content = <TranscriptView onBack={() => navigateTask('overview')} />
    }
  }

  return (
    <DashboardLayout
      user={user}
      academicYear={role === 'School Admin' ? dashboardStats?.academicPeriod?.academicYear || 'Not configured' : undefined}
      semester={role === 'School Admin' ? dashboardStats?.academicPeriod?.semester || 'No current semester' : undefined}
      activeTask={currentTask}
      onNavigate={navigateTask}
      onLogout={onLogout}
    >
      {content}
    </DashboardLayout>
  )
}
