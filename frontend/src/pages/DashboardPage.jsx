import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
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
import AdvisorAggregationView from '../components/AdvisorAggregationView.jsx'
import RegistrarResultsView from '../components/RegistrarResultsView.jsx'
import LeadershipResultsView from '../components/LeadershipResultsView.jsx'
import SectionAllocationView from '../components/SectionAllocationView.jsx'
import ReEnrollmentView from '../components/ReEnrollmentView.jsx'
import TeacherWorkloadView from '../components/TeacherWorkloadView.jsx'
import WoredaTeacherRegistrationView from '../components/WoredaTeacherRegistrationView.jsx'
import { readSessionToken } from './LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const taskDetails = {
  'Super Admin': {
    schools: ['Register School', 'Manage registered schools and add new institutions.'],
    'all-users': ['Register School Admin', 'Manage School Admin accounts and their assigned schools.'],
    'system-access': ['System Enable/Disable', 'Control system-wide settings and administrative features.'],
    'audit-logs': ['System Security & Audit Logs', 'Inspect system-wide audit activity and security events.'],
  },
  'School Admin': {
    'academic-infrastructure': ['Academic Infrastructure', 'Manage semesters, grade levels, and sections for this school.'],
    'school-profile': ['School Profile & Metadata', 'Manage school stamp, header, and profile information.'],
    'staff-registration': ['Register School Staff', 'Onboard Woreda-deployed teachers and create staff accounts for your assigned school.'],
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
    'leadership-results': ['Review Class Results', 'Review class results submitted by homeroom advisors and approve them with the official stamp.'],
  },
  'Vice Principal': {
    overview: ['Leadership Overview', 'Review your school leadership responsibilities.'],
    'teacher-workload': ['Teacher Workload & Section Assignment', 'Assign teachers to subjects, grade sections, and an optional homeroom advisor role.'],
    'leadership-results': ['Review Class Results', 'Review class results submitted by homeroom advisors and approve them with the official stamp.'],
  },
  Supervisor: {
    overview: ['Leadership Overview', 'Review your school leadership responsibilities.'],
  },
  Student: {
    schedule: ['Class Schedule', 'Check your classes and daily schedule.'],
  },
}

function TaskPlaceholder({ role, task, t }) {
  const detail = taskDetails[role]?.[task]
  if (!detail) return null

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
      <p className="text-sm font-semibold text-primary-700">{t('{role} workspace', { role: t(role) })}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{t(detail[0])}</h1>
      <p className="mt-2 text-sm text-slate-600">{t(detail[1])}</p>
      <p className="mt-6 rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {t('This task is ready to connect to the school records service.')}
      </p>
    </section>
  )
}

export default function DashboardPage({ user, onLogout, onUserUpdated }) {
  const { t } = useTranslation()
  const [activeTask, setActiveTask] = useState(() => dashboardMenuByRole[user.systemRole || user.role]?.[0]?.id || 'overview')
  const [studentProfile, setStudentProfile] = useState(null)
  const [studentProfileError, setStudentProfileError] = useState('')
  const [selectedTeacherClassId, setSelectedTeacherClassId] = useState('')
  const [dashboardStats, setDashboardStats] = useState(null)
  const [dashboardStatsLoading, setDashboardStatsLoading] = useState(false)
  const [dashboardStatsError, setDashboardStatsError] = useState('')
  const [academicPeriod, setAcademicPeriod] = useState(null)
  const [advisorSections, setAdvisorSections] = useState([])
  const [advisorSectionsError, setAdvisorSectionsError] = useState('')
  const role = user.systemRole || user.role
  const refreshAcademicPeriod = async () => {
    try {
      const { data } = await axios.get('/api/workspace-academic-period', {
        headers: { Authorization: `Bearer ${readSessionToken()}` },
      })
      setAcademicPeriod(data)
    } catch {
      setAcademicPeriod(null)
    }
  }
  const refreshAcademicConfiguration = async () => {
    await Promise.all([refreshDashboardStats(), refreshAcademicPeriod()])
  }
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
  const roleTasks = role === 'Teacher'
    ? [...dashboardMenuByRole.Teacher, ...(advisorSections.length
      ? [{ id: 'advisor-results', label: 'Class Result Aggregation & Submission' }]
      : [])]
    : dashboardMenuByRole[role] ?? []
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
    const handleAcademicContextChange = () => refreshAcademicPeriod()
    window.addEventListener('academic-context-changed', handleAcademicContextChange)
    let channel
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('academic-context')
      channel.addEventListener('message', handleAcademicContextChange)
    }
    return () => {
      window.removeEventListener('academic-context-changed', handleAcademicContextChange)
      channel?.close()
    }
  }, [role])
  useEffect(() => {
    let active = true
    axios.get('/api/workspace-academic-period', {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    }).then(({ data }) => {
      if (active) setAcademicPeriod(data)
    }).catch(() => {
      if (active) setAcademicPeriod(null)
    })
    return () => { active = false }
  }, [role])
  useEffect(() => {
    let active = true
    if (role !== 'Teacher') {
      setAdvisorSections([])
      setAdvisorSectionsError('')
      return () => { active = false }
    }
    axios.get('/api/teacher/advisor/sections', {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    }).then(({ data }) => {
      if (active) setAdvisorSections(data.sections || [])
    }).catch((error) => {
      if (active) {
        setAdvisorSections([])
        setAdvisorSectionsError(error.response?.data?.message || 'Unable to load homeroom teacher assignments.')
      }
    })
    return () => { active = false }
  }, [role])
  useEffect(() => {
    if (role !== 'Student') return undefined
    let active = true
    axios.get('/api/students/me', {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    }).then(({ data }) => {
      if (active) setStudentProfile({ ...data, rollNumber: String(data.id) })
    }).catch((error) => {
      if (active) {
        const message = error.response?.data?.message || 'Unable to load your student profile.'
        setStudentProfileError(message)
        toast.error(t(message))
      }
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

  let content = <TaskPlaceholder role={role} task={currentTask} t={t} />

  if (role === 'Super Admin') {
    if (currentTask === 'schools' || currentTask === 'all-users' || currentTask === 'system-access' || currentTask === 'audit-logs') {
      content = <AdminWorkspace activeTask={currentTask} />
    }
  } else if (role === 'School Admin') {
    if (currentTask === 'overview') {
      content = <AdminDashboard
        stats={dashboardStats}
        loading={dashboardStatsLoading}
        error={dashboardStatsError}
      />
    } else if (currentTask === 'role-assign') {
      content = <RoleAssignView />
    } else if (currentTask === 'student-rosters') {
      content = <StudentList viewOnly />
    } else if (currentTask === 'staff-oversight') {
      content = <SchoolStaffOversightView />
    } else if (currentTask === 'academic-infrastructure') {
      content = <AcademicInfrastructureView onConfigurationChange={refreshAcademicConfiguration} />
    } else if (currentTask === 'staff-registration' || currentTask === 'school-profile') {
      content = currentTask === 'staff-registration'
        ? <div className="space-y-5"><WoredaTeacherRegistrationView /><AdminWorkspace activeTask={currentTask} /></div>
        : <AdminWorkspace activeTask={currentTask} />
    }
  } else if (role === 'Admin') {
    if (currentTask === 'overview') {
      content = <AdminDashboard />
    } else if (currentTask === 'students') {
      content = <StudentList viewOnly />
    } else if (currentTask === 'system-access') {
      content = <AdminWorkspace activeTask={currentTask} />
    }
  } else if (role === 'Registrar') {
    if (currentTask === 'overview') {
      content = <StudentList onRegister={() => navigateTask('enrollment')} onAction={(action, student) => window.alert(`${action}: ${student.name}`)} />
    } else if (currentTask === 'enrollment') {
      content = <RegisterStudent onCancel={() => navigateTask('overview')} onComplete={saveStudent} allowUnassigned />
    } else if (currentTask === 're-enrollment') {
      content = <ReEnrollmentView />
    } else if (currentTask === 'section-allocation') {
      content = <SectionAllocationView />
    } else if (currentTask === 'transcripts') {
      content = <TranscriptView onBack={() => navigateTask('overview')} registrarMode />
    } else if (currentTask === 'section-results') {
      content = <RegistrarResultsView />
    }
  } else if (role === 'Teacher') {
    if (currentTask === 'overview') {
      content = <TeacherDashboard
        teacherName={user.name || user.identifier}
        advisorSections={advisorSections}
        advisorSectionsError={advisorSectionsError}
        onViewAdvisorResults={() => navigateTask('advisor-results')}
        onEnterGrades={(classItem) => { setSelectedTeacherClassId(String(classItem.id)); navigateTask('grade-entry') }}
        onViewRoster={(classItem) => { setSelectedTeacherClassId(String(classItem.id)); navigateTask('roster') }}
      />
    } else if (currentTask === 'grade-entry' || currentTask === 'roster') {
      content = <GradeEntryView initialAssignmentId={selectedTeacherClassId} readOnly={currentTask === 'roster'} />
    } else if (currentTask === 'advisor-results' && advisorSections.length) {
      content = <AdvisorAggregationView />
    }
  } else if (role === 'Student') {
    if (currentTask === 'overview') {
      content = studentProfileError
        ? <p className="text-sm text-slate-600">{t(studentProfileError)}</p>
        : studentProfile
          ? <StudentDashboard student={studentProfile} onDownload={(documentName) => navigateTask(documentName === 'Official transcript' ? 'transcript' : 'grades')} />
          : <p role="status" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">{t('Loading your student profile…')}</p>
    } else if (currentTask === 'grades') {
      content = <ReportCardView onBack={() => navigateTask('overview')} />
    } else if (currentTask === 'transcript') {
      content = <TranscriptView onBack={() => navigateTask('overview')} />
    }
  } else if (role === 'Vice Principal' && currentTask === 'teacher-workload') {
    content = <TeacherWorkloadView />
  } else if (['Headmaster', 'Vice Principal'].includes(role) && currentTask === 'leadership-results') {
    content = <LeadershipResultsView />
  }

  return (
    <DashboardLayout
      user={user}
      academicYear={academicPeriod?.academicYear || dashboardStats?.academicPeriod?.academicYear || 'Not configured'}
      semester={academicPeriod?.semester || dashboardStats?.academicPeriod?.semester || 'No current semester'}
      activeTask={currentTask}
      onNavigate={navigateTask}
      onLogout={onLogout}
      onUserUpdated={onUserUpdated}
      advisorAvailable={advisorSections.length > 0}
    >
      {content}
    </DashboardLayout>
  )
}
