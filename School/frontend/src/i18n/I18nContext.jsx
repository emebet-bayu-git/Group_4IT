import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import english from '../locales/en.json'
import amharic from '../locales/am.json'

const LanguageContext = createContext(null)
const dictionaries = { en: english, am: amharic }
const preferenceKey = 'sims_language'

function readLanguagePreference() {
  try {
    return localStorage.getItem(preferenceKey) === 'am' ? 'am' : 'en'
  } catch (error) {
    console.error('Unable to read saved language preference:', error.message)
    return 'en'
  }
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(readLanguagePreference)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = 'ltr'
  }, [language])

  const setLanguage = (nextLanguage) => {
    if (!Object.hasOwn(dictionaries, nextLanguage)) return
    try {
      localStorage.setItem(preferenceKey, nextLanguage)
    } catch (error) {
      console.error('Unable to save language preference:', error.message)
    }
    setLanguageState(nextLanguage)
  }

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key, values = {}) => {
      const template = dictionaries[language][key] || dictionaries.en[key] || key
      return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? `{${name}}`))
    },
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useTranslation() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useTranslation must be used within an I18nProvider.')
  return context
}
