import React, { useState } from 'react'
import DashboardLayout from './layouts/DashboardLayout.jsx'
import Button from './components/ui/Button.jsx'
import StatusBadge from './components/ui/Badge.jsx'
import Modal from './components/ui/Modal.jsx'
import { Select, Textarea, TextInput } from './components/ui/Fields.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import TeacherDashboard from './components/TeacherDashboard.jsx'
import StudentDashboard from './components/StudentDashboard.jsx'
import RegisterStudent from './components/RegisterStudent.jsx'
import StudentList from './components/StudentList.jsx'
import ReportCardView from './components/ReportCardView.jsx'
import TranscriptView from './components/TranscriptView.jsx'
import HomePage from './components/HomePage.jsx'
import AboutPage from './components/AboutPage.jsx'
import ContactPage from './components/ContactPage.jsx'
import LoginPage, { storeSessionToken } from './components/LoginPage.jsx'

export default function App() {
  const [role, setRole] = useState('Admin')
  const [modalOpen, setModalOpen] = useState(false)
  const [studentView, setStudentView] = useState('directory')
  const [studentDocument, setStudentDocument] = useState(null)
  const [showPortal, setShowPortal] = useState(false)
  const [publicView, setPublicView] = useState('home')
  const openLogin = () => setPublicView('login')
  const completeLogin = (credentials) => {
    setRole(credentials.role)
    setShowPortal(true)
    return { token: 'demo-jwt-token', role: credentials.role }
  }
  if (!showPortal && publicView === 'login') return <LoginPage onBack={() => setPublicView('home')} onLogin={completeLogin} />
  if (!showPortal && publicView === 'about') return <AboutPage onHome={() => setPublicView('home')} onPortal={openLogin} />
  if (!showPortal && publicView === 'contact') return <ContactPage onHome={() => setPublicView('home')} onAbout={() => setPublicView('about')} onPortal={openLogin} />
  if (!showPortal) return <HomePage onAccessPortal={openLogin} onAbout={() => setPublicView('about')} onContact={() => setPublicView('contact')} />
  return (
    <DashboardLayout role={role} onLogout={() => window.alert('Logout requested')}>
      <div className="mb-4 flex justify-end">
        <select aria-label="Preview dashboard role" value={role} onChange={(event) => setRole(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold"><option>Admin</option><option>Registrar</option><option>Teacher</option><option>Student</option></select>
      </div>
      {role === 'Admin' || role === 'Registrar' ? studentView === 'directory' ? (
        <StudentList onRegister={() => setStudentView('register')} onAction={(action, student) => window.alert(`${action}: ${student.name}`)} />
      ) : studentView === 'register' ? (
        <RegisterStudent onCancel={() => setStudentView('directory')} onComplete={() => setStudentView('directory')} />
      ) : (
        <AdminDashboard onRegisterStudent={() => setStudentView('register')} />
      ) : role === 'Teacher' ? (
        <TeacherDashboard onEnterGrades={(classItem) => window.alert(`Opening grade entry for ${classItem.title}`)} onViewRoster={(classItem) => window.alert(`Opening roster for ${classItem.title}`)} />
      ) : role === 'Student' ? studentDocument === 'report-card' ? (
        <ReportCardView onBack={() => setStudentDocument(null)} />
      ) : studentDocument === 'transcript' ? (
        <TranscriptView onBack={() => setStudentDocument(null)} />
      ) : (
        <StudentDashboard onDownload={(documentName) => setStudentDocument(documentName === 'Official transcript' ? 'transcript' : 'report-card')} />
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-panel"><h1 className="text-2xl font-bold text-slate-900">{role} workspace</h1><p className="mt-2 text-sm text-slate-500">Dashboard content for this role is not included in this view.</p></section>
      )}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register student" description="Add a student to the current academic year." footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="success" onClick={() => setModalOpen(false)}>Save student</Button></>}><div className="grid gap-4 sm:grid-cols-2"><TextInput label="Full name" required placeholder="Student name" /><Select label="Grade" required placeholder="Choose grade" options={[{ value: '9', label: 'Grade 9' }, { value: '10', label: 'Grade 10' }]} /><div className="sm:col-span-2"><Textarea label="Notes" placeholder="Optional administrative notes" /></div></div></Modal>
    </DashboardLayout>
  )
}
