import React, { useState } from 'react'
import { Menu, X } from 'lucide-react'
import AppFooter from './AppFooter.jsx'
import { useSchoolProfile } from './SchoolIdentity.jsx'

export default function MainLayout({ children, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const school = useSchoolProfile()
  const schoolName = school.school_name || 'Amhara Region Secondary School'

  const navigate = (page) => {
    setMenuOpen(false)
    onNavigate(page)
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <nav className="relative z-20 flex items-center justify-between bg-emerald-700 px-6 py-4 text-white shadow-md" aria-label="Main navigation">
        <button onClick={() => navigate('home')} className="text-left text-xl font-bold">
          {schoolName}
        </button>
        <div className="hidden items-center gap-6 text-sm font-medium md:flex">
          <button onClick={() => navigate('home')} className="transition hover:text-emerald-100">Home</button>
          <button onClick={() => navigate('about')} className="transition hover:text-emerald-100">About</button>
          <button onClick={() => navigate('contact')} className="transition hover:text-emerald-100">Contact</button>
          <button onClick={() => navigate('login')} className="rounded-md bg-emerald-900 px-4 py-2 transition hover:bg-emerald-950">Login</button>
        </div>
        <button
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-md p-2 transition hover:bg-emerald-800 md:hidden"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        {menuOpen && (
          <div className="absolute left-0 right-0 top-16 border-t border-emerald-600 bg-emerald-700 px-6 py-4 md:hidden">
            <div className="flex flex-col gap-3 text-sm font-medium">
              <button onClick={() => navigate('home')} className="py-1 text-left hover:text-emerald-100">Home</button>
              <button onClick={() => navigate('about')} className="py-1 text-left hover:text-emerald-100">About</button>
              <button onClick={() => navigate('contact')} className="py-1 text-left hover:text-emerald-100">Contact</button>
              <button onClick={() => navigate('login')} className="mt-1 rounded-md bg-emerald-900 px-4 py-2.5 text-left hover:bg-emerald-950">Login</button>
            </div>
          </div>
        )}
      </nav>
      <div className="flex flex-1 flex-col">
        {children}
      </div>
      <AppFooter schoolName={schoolName} />
    </div>
  )
}
