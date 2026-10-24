import React, { useState } from 'react'
import { Bell, BookOpen, CalendarDays, ChevronDown, ClipboardCheck, GraduationCap, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, Users, UserRound, X } from 'lucide-react'

const menuByRole = {
  Admin: [
    ['Overview', LayoutDashboard], ['Students', Users], ['Staff & Teachers', GraduationCap], ['Academics', BookOpen], ['Attendance', ClipboardCheck], ['Calendar', CalendarDays], ['Settings', Settings],
  ],
  Registrar: [['Overview', LayoutDashboard], ['Students', Users], ['Enrollments', ClipboardCheck], ['Records', BookOpen], ['Calendar', CalendarDays]],
  Teacher: [['Overview', LayoutDashboard], ['My Classes', BookOpen], ['Attendance', ClipboardCheck], ['Gradebook', GraduationCap], ['Calendar', CalendarDays]],
  Student: [['Overview', LayoutDashboard], ['My Courses', BookOpen], ['Grades', ClipboardCheck], ['Attendance', CalendarDays], ['Profile', UserRound]],
}

export default function DashboardLayout({ children, role = 'Admin', userName = 'Olivia Bennett', academicYear = '2026/2027', term = 'Term 1', onLogout }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const items = menuByRole[role] ?? menuByRole.Admin

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center border-b border-primary-700 px-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && <div className="flex items-center gap-2.5 text-white"><div className="grid h-8 w-8 place-items-center rounded-md bg-white/10"><GraduationCap className="h-5 w-5" /></div><span className="font-bold">NORTHFIELD</span></div>}
        <button className="hidden rounded-md p-2 text-primary-200 hover:bg-primary-700 hover:text-white lg:block" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</button>
        <button className="rounded-md p-2 text-primary-200 hover:bg-primary-700 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <nav className="scrollbar-subtle flex-1 overflow-y-auto px-3 py-4" aria-label={`${role} navigation`}>
        {!collapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-primary-300">{role} workspace</p>}
        <ul className="space-y-1">
          {items.map(([label, Icon], index) => (
            <li key={label}>
              <a
                href="#"
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${index === 0 ? 'bg-primary-700 text-white' : 'text-primary-100 hover:bg-primary-700/70 hover:text-white'} ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-primary-700 p-3"><div className={`flex items-center gap-3 rounded-md p-2 ${collapsed ? 'justify-center' : ''}`}><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-500 text-sm font-bold text-white">OB</div>{!collapsed && <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{userName}</p><p className="text-xs text-primary-300">{role}</p></div>}</div></div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden bg-primary-900 transition-[width] lg:block ${collapsed ? 'w-20' : 'w-64'}`}>{sidebar}</aside>
      {mobileOpen && <><div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setMobileOpen(false)} /><aside className="fixed inset-y-0 left-0 z-50 w-72 bg-primary-900 lg:hidden">{sidebar}</aside></>}
      <div className={`flex min-h-screen min-w-0 flex-1 flex-col transition-[margin] ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm sm:px-6">
          <div className="flex items-center gap-3"><button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button><div><p className="text-xs font-medium text-slate-500">Academic Year</p><p className="text-sm font-bold text-slate-800">{academicYear} · {term}</p></div></div>
          <div className="flex items-center gap-1 sm:gap-3">
            <button className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger-500 ring-2 ring-white" /></button>
            <div className="relative"><button onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-slate-100" aria-expanded={profileOpen}><div className="grid h-8 w-8 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-800">OB</div><ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" /></button>{profileOpen && <div className="absolute right-0 mt-2 w-52 rounded-md border border-slate-200 bg-white p-1.5 shadow-panel"><div className="border-b border-slate-100 px-3 py-2"><p className="truncate text-sm font-semibold">{userName}</p><p className="text-xs text-slate-500">{role}</p></div><button className="mt-1 flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-slate-50"><UserRound className="h-4 w-4" />Profile settings</button></div>}</div>
            <button onClick={onLogout} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold text-slate-600 hover:bg-danger-50 hover:text-danger-700" aria-label="Log out"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Logout</span></button>
          </div>
        </header>
        <main className="scrollbar-subtle flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-screen-2xl p-4 sm:p-6 lg:p-8">{children}</div></main>
      </div>
    </div>
  )
}
