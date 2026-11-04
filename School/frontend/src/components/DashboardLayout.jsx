import React, { useState } from 'react'
import AppFooter from './AppFooter.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import ProfileView from './ProfileView.jsx'
import { useSchoolProfile } from './SchoolIdentity.jsx'
import {
  Bell,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  School,
  Settings,
  Users,
  UserRound,
  X,
} from 'lucide-react'
import { useTranslation } from '../i18n/I18nContext.jsx'

export const dashboardMenuByRole = {
  'Super Admin': [
    { id: 'schools', label: 'Schools', icon: School },
    { id: 'all-users', label: 'Register Users', icon: UserRound },
    { id: 'audit-logs', label: 'System Security & Audit Logs', icon: ClipboardCheck },
  ],
  'School Admin': [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'staff-oversight', label: 'School Staff Oversight', icon: UserRound },
    { id: 'academic-infrastructure', label: 'Academic Infrastructure', icon: BookOpen },
    { id: 'school-profile', label: 'School Profile & Metadata', icon: Settings },
    { id: 'staff-registration', label: 'Register Staff', icon: UserRound },
    { id: 'role-assign', label: 'Role Assign', icon: BadgeCheck },
    { id: 'student-rosters', label: 'Student Rosters', icon: Users },
  ],
  Admin: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'system-access', label: 'System Administration', icon: Settings },
  ],
  Registrar: [
    { id: 'overview', label: 'Student Records', icon: LayoutDashboard },
    { id: 'enrollment', label: 'Student Enrollment', icon: ClipboardCheck },
    { id: 're-enrollment', label: 'Student Re-Enrollment / Check-In', icon: ClipboardCheck },
    { id: 'section-allocation', label: 'Student Section Allocation', icon: Users },
    { id: 'transcripts', label: 'Grade 9–12 Transcripts', icon: FileText },
    { id: 'section-results', label: 'Submitted Section Results', icon: ClipboardCheck },
  ],
  Teacher: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'grade-entry', label: 'Grade Entry', icon: GraduationCap },
    { id: 'roster', label: 'Student Roster', icon: Users },
  ],
  'Vice Principal': [
    { id: 'overview', label: 'Leadership Overview', icon: LayoutDashboard },
    { id: 'teacher-workload', label: 'Teacher Workload & Section Assignment', icon: Users },
    { id: 'leadership-results', label: 'Review Class Results', icon: ClipboardCheck },
  ],
  Headmaster: [
    { id: 'overview', label: 'Leadership Overview', icon: LayoutDashboard },
    { id: 'leadership-results', label: 'Review Class Results', icon: ClipboardCheck },
  ],
  Supervisor: [{ id: 'overview', label: 'Leadership Overview', icon: LayoutDashboard }],
  Student: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'grades', label: 'View Grades', icon: GraduationCap },
    { id: 'transcript', label: 'Transcript', icon: FileText },
    { id: 'schedule', label: 'Class Schedule', icon: CalendarDays },
  ],
}

export default function DashboardLayout({
  children,
  user,
  academicYear = 'Academic year not configured',
  semester = '',
  activeTask = 'overview',
  onNavigate,
  onLogout,
  onUserUpdated,
  advisorAvailable = false,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const school = useSchoolProfile()
  const { t } = useTranslation()
  const schoolName = school.school_name || t('Amhara Region Secondary School')
  const role = user.systemRole || user.role
  const userName = user.name || user.identifier || role
  const canEditProfile = ['Super Admin', 'School Admin', 'Registrar', 'Teacher', 'Headmaster', 'Vice Principal', 'Supervisor'].includes(role)
  const items = role === 'Teacher' && advisorAvailable
    ? [...dashboardMenuByRole.Teacher, { id: 'advisor-results', label: 'Class Result Aggregation & Submission', icon: ClipboardCheck }]
    : dashboardMenuByRole[role] ?? []
  const initials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U'

  const selectTask = (id) => {
    onNavigate?.(id)
    setMobileOpen(false)
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center border-b border-primary-700 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <div className="flex min-w-0 items-center gap-2.5 text-white"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10"><GraduationCap className="h-5 w-5" /></div><span className="min-w-0 truncate text-xs font-bold">{schoolName.toUpperCase()}</span></div>}
        <button className="hidden rounded-md p-2 text-primary-200 hover:bg-primary-700 hover:text-white lg:block" onClick={() => setCollapsed(!collapsed)} aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}>{collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</button>
        <button className="rounded-md p-2 text-primary-200 hover:bg-primary-700 lg:hidden" onClick={() => setMobileOpen(false)} aria-label={t('Close menu')}><X className="h-5 w-5" /></button>
      </div>
      <nav className="scrollbar-subtle flex-1 overflow-y-auto px-3 py-4" aria-label={t('{role} navigation', { role: t(role) })}>
        {!collapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-primary-300">{t('{role} workspace', { role: t(role) })}</p>}
        <ul className="space-y-1">
          {items.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => selectTask(id)}
                aria-current={activeTask === id ? 'page' : undefined}
                className={`flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition ${activeTask === id ? 'bg-primary-700 text-white' : 'text-primary-100 hover:bg-primary-700/70 hover:text-white'} ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? t(label) : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{t(label)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-primary-700 p-3">
        <div className={`flex items-center gap-3 rounded-md p-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-500 text-sm font-bold text-white">{user.avatarPath ? <img src={user.avatarPath} alt="" className="h-full w-full object-cover" /> : initials}</div>
          {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{userName}</p><p className="text-xs text-primary-300">{t(role)}</p></div>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden bg-primary-900 transition-[width] lg:block ${collapsed ? 'w-20' : 'w-64'}`}>{sidebar}</aside>
      {mobileOpen && <><button type="button" className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-label={t('Close navigation')} /><aside className="fixed inset-y-0 left-0 z-50 w-72 bg-primary-900 lg:hidden">{sidebar}</aside></>}
      <div className={`flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-emerald-700 px-4 text-white shadow-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3"><button className="rounded-md p-2 text-emerald-50 hover:bg-emerald-800 lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t('Open menu')}><Menu className="h-5 w-5" /></button><div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-white/10">{school.logo_path ? <img src={school.logo_path} alt="" className="h-full w-full object-contain" /> : <GraduationCap className="h-6 w-6" />}</div><div className="min-w-0"><p className="truncate text-sm font-bold sm:text-base">{schoolName}</p><p className="truncate text-xs text-emerald-100">{[academicYear, semester].filter(Boolean).map(t).join(' · ') || t('Academic period not configured')}</p></div></div>
          <div className="flex items-center gap-1 sm:gap-3">
            <button className="relative rounded-md p-2 text-emerald-50 hover:bg-emerald-800" aria-label={t('Notifications')}><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger-500 ring-2 ring-emerald-700" /></button>
            <LanguageSwitcher />
            <div className="relative"><button type="button" onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-emerald-800" aria-label={t('Open account menu')} aria-expanded={menuOpen}><div className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-white text-xs font-bold text-emerald-800">{user.avatarPath ? <img src={user.avatarPath} alt="" className="h-full w-full object-cover" /> : initials}</div><ChevronDown className="hidden h-4 w-4 text-emerald-100 sm:block" /></button>{menuOpen && <div className="absolute right-0 mt-2 w-56 rounded-md border border-slate-200 bg-white p-1.5 text-slate-900 shadow-panel"><div className="px-3 py-2"><p className="truncate text-sm font-semibold">{userName}</p><p className="text-xs text-slate-500">{t(role)}</p></div>{canEditProfile && <button type="button" onClick={() => { setMenuOpen(false); setProfileOpen(true) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"><UserRound className="h-4 w-4" />{t('My Profile')}</button>}</div>}</div>
            <button onClick={onLogout} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold text-white hover:bg-emerald-800" aria-label={t('Log out')}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">{t('Logout')}</span></button>
          </div>
        </header>
        <main className="scrollbar-subtle flex-1 overflow-y-auto"><div className="workspace-card-scope mx-auto w-full max-w-screen-2xl p-4 sm:p-6 lg:p-8"><div className="mb-6"><h1 className="text-2xl font-bold text-slate-900">{t('Welcome, {name}!', { name: userName })}</h1><p className="mt-1 text-sm text-slate-500">{t('{role} workspace', { role: t(role) })}</p></div>{children}</div></main>
        <AppFooter schoolName={schoolName} />
      </div>
      {canEditProfile && <ProfileView open={profileOpen} onClose={() => setProfileOpen(false)} onProfileUpdated={onUserUpdated} />}
    </div>
  )
}
