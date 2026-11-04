import React from 'react'
import { useTranslation } from '../i18n/I18nContext.jsx'

export default function AppFooter({ schoolName = 'Amhara Region Secondary School' }) {
  const { t } = useTranslation()
  return (
    <footer className="bg-emerald-800 px-5 py-4 text-sm text-emerald-50 sm:px-6">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center justify-between gap-2 sm:flex-row">
        <p className="text-center sm:text-left">{t('© {year} {school} Information Management System. All rights reserved.', { year: new Date().getFullYear(), school: schoolName })}</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-emerald-100">
          <span>{t('SIMS v0.1.0')}</span>
          <a className="underline-offset-4 hover:text-white hover:underline" href="mailto:support@northfield.edu">{t('Support')}</a>
          <a className="underline-offset-4 hover:text-white hover:underline" href="mailto:registrar@northfield.edu">{t('Registrar')}</a>
        </div>
      </div>
    </footer>
  )
}