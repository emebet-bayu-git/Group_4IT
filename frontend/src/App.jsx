import React, { useEffect, useState } from 'react'
import axios from 'axios'
import AboutPage from './pages/AboutPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage, { clearSession, readSessionUser, updateSessionUser } from './pages/LoginPage.jsx'
import MainLayout from './components/MainLayout.jsx'
import { I18nProvider } from './i18n/I18nContext.jsx'
import { Toaster } from 'react-hot-toast'

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
    }
    setAuthUser(user)
    return { ...data, ...user }
  }

  if (authUser) {
    return (
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
            style: { background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' },
            iconTheme: { primary: '#059669', secondary: '#ecfdf5' },
          },
          error: {
            style: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
            iconTheme: { primary: '#dc2626', secondary: '#fef2f2' },
          },
        }}
      />
    </I18nProvider>
  )
}
