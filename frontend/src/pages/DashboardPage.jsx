import React, { useState } from 'react'
import AdminDashboard from '../components/AdminDashboard.jsx'
import DashboardLayout, { dashboardMenuByRole } from '../components/DashboardLayout.jsx'
import RegisterStudent from '../components/RegisterStudent.jsx'
import ReportCardView from '../components/ReportCardView.jsx'
import StudentDashboard from '../components/StudentDashboard.jsx'
import StudentList from '../components/StudentList.jsx'
import TeacherDashboard from '../components/TeacherDashboard.jsx'
import TranscriptView from '../components/TranscriptView.jsx'

const taskDetails = {
  Admin: {
    users: ['User Management', 'Administrator-only account management tasks.'],
    logs: ['System Logs', 'Administrator-only system activity and audit records.'],
  },
  Registrar: {},
  Teacher: {
    'grade-entry': ['Grade Entry', 'Enter and review grades for your assigned classes.'],
    attendance: ['Class Attendance', 'Record and review attendance for your classes.'],
    roster: ['Student Roster', 'View students assigned to your classes.'],
  },
  Student: {
    attendance: ['Attendance Record', 'Review your attendance for the current academic year.'],
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
  const [activeTask, setActiveTask] = useState('overview')
  const role = user.role
  const roleTasks = dashboardMenuByRole[role] ?? []
  const selectedTask = roleTasks.some((item) => item.id === activeTask)
    ? activeTask
    : roleTasks[0]?.id
  const navigateTask = (task) => {
    if (roleTasks.some((item) => item.id === task)) setActiveTask(task)
  }

  let content = <TaskPlaceholder role={role} task={selectedTask} />

  if (role === 'Admin') {
    if (selectedTask === 'overview') {
      content = <AdminDashboard onRegisterStudent={() => navigateTask('enrollment')} />
    } else if (selectedTask === 'students') {
      content = <StudentList onRegister={() => navigateTask('enrollment')} onAction={(action, student) => window.alert(`${action}: ${student.name}`)} />
    } else if (selectedTask === 'enrollment') {
      content = <RegisterStudent onCancel={() => navigateTask('students')} onComplete={() => navigateTask('students')} />
    }
  } else if (role === 'Registrar') {
    if (selectedTask === 'overview') {
      content = <StudentList onRegister={() => navigateTask('enrollment')} onAction={(action, student) => window.alert(`${action}: ${student.name}`)} />
    } else if (selectedTask === 'enrollment') {
      content = <RegisterStudent onCancel={() => navigateTask('overview')} onComplete={() => navigateTask('overview')} />
    } else if (selectedTask === 'transcripts') {
      content = <TranscriptView onBack={() => navigateTask('overview')} />
    }
  } else if (role === 'Teacher' && selectedTask === 'overview') {
    content = (
      <TeacherDashboard
        onEnterGrades={(classItem) => window.alert(`Opening grade entry for ${classItem.title}`)}
        onViewRoster={(classItem) => window.alert(`Opening roster for ${classItem.title}`)}
      />
    )
  } else if (role === 'Student') {
    if (selectedTask === 'overview') {
      content = <StudentDashboard onDownload={(documentName) => navigateTask(documentName === 'Official transcript' ? 'transcript' : 'grades')} />
    } else if (selectedTask === 'grades') {
      content = <ReportCardView onBack={() => navigateTask('overview')} />
    } else if (selectedTask === 'transcript') {
      content = <TranscriptView onBack={() => navigateTask('overview')} />
    }
  }

  return (
    <DashboardLayout
      user={user}
      activeTask={selectedTask}
      onNavigate={navigateTask}
      onLogout={onLogout}
    >
      {content}
    </DashboardLayout>
  )
}
