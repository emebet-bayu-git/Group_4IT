import React, { useState } from 'react'
import { Languages } from 'lucide-react'
import { useTranslation } from '../i18n/I18nContext.jsx'

export default function LanguageSwitcher() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { language, setLanguage, t } = useTranslation()

  const selectLanguage = (nextLanguage) => {
    setLanguage(nextLanguage)
    setMenuOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="flex items-center space-x-2 rounded-lg border border-emerald-600 bg-emerald-800 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700"
        aria-label={t('Change language')}
        aria-expanded={menuOpen}
      >
        <Languages className="h-4 w-4" />
        <span>{language === 'en' ? 'EN' : 'AM'}</span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 z-50 mt-1 w-40 rounded-lg border border-gray-100 bg-white py-1 text-gray-800 shadow-xl" role="menu" aria-label={t('Language')}>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={language === 'en'}
            onClick={() => selectLanguage('en')}
            className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-gray-100"
          >
            {t('English')}
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={language === 'am'}
            onClick={() => selectLanguage('am')}
            className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-gray-100"
          >
            {t('Amharic')}
          </button>
        </div>
      )}
    </div>
  )
}
