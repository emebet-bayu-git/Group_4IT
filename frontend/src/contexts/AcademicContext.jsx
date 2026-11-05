import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const AcademicContext = createContext(null)

function getSessionStorage() {
  return localStorage.getItem('sims_auth_token') ? localStorage : sessionStorage
}

function getCachedPeriod(userId) {
  const cached = getSessionStorage().getItem(`sims_academic_context_${userId}`)
  if (!cached) return null
  try {
    return JSON.parse(cached)
  } catch (error) {
    console.error('Unable to read cached academic context:', error.message)
    return null
  }
}

export function AcademicProvider({ user, children }) {
  const userId = user.identifier
  const isSchoolWorkspace = user.role !== 'Super Admin'
  const [period, setPeriod] = useState(null)
  const [loading, setLoading] = useState(isSchoolWorkspace)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!isSchoolWorkspace) {
      setPeriod(null)
      setError('')
      setLoading(false)
      return null
    }

    setLoading(true)
    try {
      const token = localStorage.getItem('sims_auth_token') || sessionStorage.getItem('sims_auth_token')
      const { data } = await axios.get('/api/academic/active-context', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPeriod(data)
      setError('')
      const storage = getSessionStorage()
      if (data) storage.setItem(`sims_academic_context_${userId}`, JSON.stringify(data))
      else storage.removeItem(`sims_academic_context_${userId}`)
      return data
    } catch (requestError) {
      setError(requestError.response?.status === 403
        ? 'Academic period unavailable'
        : 'Academic period could not be refreshed')
      console.error('Unable to load the active academic context:', requestError.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [isSchoolWorkspace, userId])

  useEffect(() => {
    setPeriod(isSchoolWorkspace ? getCachedPeriod(userId) : null)
    setError('')
    refresh()

    const handleContextChanged = () => { refresh() }
    window.addEventListener('academic-context-changed', handleContextChanged)
    let channel
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('academic-context')
      channel.addEventListener('message', handleContextChanged)
    }
    return () => {
      window.removeEventListener('academic-context-changed', handleContextChanged)
      channel?.close()
    }
  }, [isSchoolWorkspace, refresh, userId])

  const value = useMemo(() => ({ period, loading, error, refresh }), [period, loading, error, refresh])
  return <AcademicContext.Provider value={value}>{children}</AcademicContext.Provider>
}

export function useAcademicContext() {
  const context = useContext(AcademicContext)
  if (!context) throw new Error('useAcademicContext must be used within an AcademicProvider.')
  return context
}
