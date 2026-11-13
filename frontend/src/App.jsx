import React, { useEffect, useState } from 'react'
import axios from 'axios'
import AboutPage from './pages/AboutPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage, {
  clearSession,
  readSessionUser,
  updateSessionPasswordStatus,
  updateSessionToken,
  updateSessionUser,
} from './pages/LoginPage.jsx'
import PasswordResetPage from './pages/PasswordResetPage.jsx'
import MainLayout from './components/MainLayout.jsx'
import { AcademicProvider } from './contexts/AcademicContext.jsx'
import { I18nProvider } from './i18n/I18nContext.jsx'
import { Toaster } from 'react-hot-toast'
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

const toastClassName = 'flex items-center gap-2 rounded-lg border px-4 py-3 shadow-md'

const publicPaths = {
  home: '/',
  login: '/login',
  about: '/about',
  contact: '/contact',
}

function readPublicView() {
  return Object.keys(publicPaths).find((view) => publicPaths[view] === window.location.pathname) || 'home'
}

function AppContent() {
  const [authUser, setAuthUser] = useState(readSessionUser)
  const [publicView, setPublicView] = useState(readPublicView)

  useEffect(() => {
    const handlePopState = () => setPublicView(readPublicView())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const completeLogin = async (credentials) => {
    const { data } = await axios.post('/api/auth/login', {
      identifier: credentials.identifier,
      password: credentials.password,
    })
    if (!data.token || !['Super Admin', 'School Admin', 'Registrar', 'Teacher', 'Student', 'Headmaster', 'Vice Principal', 'Supervisor'].includes(data.role)) {
      throw new Error('Invalid authentication response.')
    }
    const user = {
      role: data.role,
      systemRole: data.systemRole,
      name: data.name,
      identifier: data.identifier || credentials.identifier,
      avatarPath: data.avatarPath || '',
      mustChangePassword: Boolean(data.mustChangePassword),
    }
    setAuthUser(user)
    return { ...data, ...user }
  }

  if (authUser) {
    if (authUser.mustChangePassword) {
      return <PasswordResetPage
        user={authUser}
        onPasswordChanged={(token) => {
          updateSessionToken(token)
          updateSessionPasswordStatus(false)
          setAuthUser((current) => ({ ...current, mustChangePassword: false }))
        }}
        onLogout={() => {
          clearSession()
          setAuthUser(null)
          window.history.replaceState({}, '', publicPaths.login)
          setPublicView('login')
        }}
      />
    }
    return (
      <AcademicProvider key={authUser.identifier} user={authUser}>
        <DashboardPage
          user={authUser}
          onUserUpdated={(profile) => {
            updateSessionUser(profile)
            setAuthUser((current) => ({
              ...current,
              name: profile.name,
              identifier: String(profile.id),
              avatarPath: profile.avatarPath || '',
            }))
          }}
          onLogout={() => {
            clearSession()
            setAuthUser(null)
            window.history.replaceState({}, '', publicPaths.login)
            setPublicView('login')
          }}
        />
      </AcademicProvider>
    )
  }

  const navigate = (page) => {
    const path = publicPaths[page] || publicPaths.home
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setPublicView(page)
  }

  return (
    <MainLayout onNavigate={navigate}>
      {publicView === 'login' && <LoginPage onBack={() => navigate('home')} onLogin={completeLogin} />}
      {publicView === 'about' && <AboutPage onHome={() => navigate('home')} />}
      {publicView === 'contact' && <ContactPage />}
      {publicView === 'home' && <HomePage />}
    </MainLayout>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          duration: 4000,
          success: {
            className: `${toastClassName} bg-emerald-50 border-emerald-200 text-emerald-800`,
            icon: <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />,
          },
          error: {
            className: `${toastClassName} bg-red-50 border-red-200 text-red-800`,
            icon: <XCircle className="h-5 w-5 shrink-0 text-red-600" />,
          },
        }}
      />
    </I18nProvider>
  )
}
