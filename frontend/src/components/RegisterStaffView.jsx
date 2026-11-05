import React, { useState } from 'react'
import RegistrarRegistrationView from './RegistrarRegistrationView.jsx'
import WoredaTeacherRegistrationView from './WoredaTeacherRegistrationView.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

export default function RegisterStaffView() {
  const { t } = useTranslation()
  const [activeForm, setActiveForm] = useState(null)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('Choose staff type to register')}>
        {[
          { id: 'teacher', label: 'Register Teacher' },
          { id: 'registrar', label: 'Register Registrar' },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={activeForm === id}
            onClick={() => setActiveForm((current) => current === id ? null : id)}
            className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
              activeForm === id
                ? 'border-primary-800 bg-primary-800 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t(label)}
          </button>
        ))}
        {activeForm && (
          <button
            type="button"
            onClick={() => setActiveForm(null)}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {t('Close form')}
          </button>
        )}
      </div>
      {activeForm === 'teacher'
        ? <WoredaTeacherRegistrationView />
        : activeForm === 'registrar'
          ? <RegistrarRegistrationView />
          : null}
    </div>
  )
}
