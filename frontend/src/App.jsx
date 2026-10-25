import React, { useState } from 'react'
import AboutPage from './pages/AboutPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import HomePage from './pages/HomePage.jsx'
import LoginPage, { clearSession, readSessionUser } from './pages/LoginPage.jsx'

export default function App() {
  const [authUser, setAuthUser] = useState(readSessionUser)
  const [publicView, setPublicView] = useState('home')

  const openLogin = () => setPublicView('login')
  const completeLogin = (credentials) => {
    const user = {
      role: credentials.role,
      name: credentials.identifier,
      identifier: credentials.identifier,
    }
    setAuthUser(user)
    return { token: 'demo-jwt-token', ...user }
  }

  if (authUser) {
    return (
      <DashboardPage
        user={authUser}
        onLogout={() => {
          clearSession()
          setAuthUser(null)
          setPublicView('home')
        }}
      />
    )
  }

  if (publicView === 'login') {
    return <LoginPage onBack={() => setPublicView('home')} onLogin={completeLogin} />
  }
  if (publicView === 'about') {
    return <AboutPage onHome={() => setPublicView('home')} onPortal={openLogin} />
  }
  if (publicView === 'contact') {
    return <ContactPage onHome={() => setPublicView('home')} onAbout={() => setPublicView('about')} onPortal={openLogin} />
  }
  return <HomePage onAccessPortal={openLogin} onAbout={() => setPublicView('about')} onContact={() => setPublicView('contact')} />
}
