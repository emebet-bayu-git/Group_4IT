import React from 'react'
import { CalendarDays, ClipboardCheck, FileText, Users } from 'lucide-react'
import { useAcademicContext } from '../contexts/AcademicContext.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const registrarActions = [
  { task: 'student-records', label: 'Student Records', description: 'Browse and update student records.', icon: Users },
  { task: 're-enrollment', label: 'Student Re-Enrollment / Check-In', description: 'Confirm returning students for the current academic year.', icon: ClipboardCheck },
  { task: 'section-allocation', label: 'Student Section Allocation', description: 'Assign students to their grade sections.', icon: Users },
  { task: 'transcripts', label: 'Grade 9–12 Transcripts', description: 'Retrieve and review archived transcripts.', icon: FileText },
  { task: 'section-results', label: 'Submitted Section Results', description: 'Review results submitted for publication.', icon: ClipboardCheck },
]

export default function RegistrarDashboard({ onNavigate }) {
  const { t } = useTranslation()
  const { period, loading } = useAcademicContext()
  const academicPeriod = [period?.academicYear, period?.semester].filter(Boolean).map(t).join(' · ')

  return (
    <section className="space-y-6" aria-labelledby="registrar-overview-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Registrar workspace')}</p>
        <h1 id="registrar-overview-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Registrar overview')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Manage student records, enrollment, section placement, transcripts, and results.')}</p>
      </header>

      <article className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-700">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">{t('Active academic period')}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {loading ? t('Loading academic period…') : academicPeriod || t('No active academic period')}
          </p>
        </div>
      </article>

      <section aria-labelledby="registrar-actions-heading">
        <h2 id="registrar-actions-heading" className="mb-3 font-bold text-slate-900">{t('Registrar tasks')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {registrarActions.map(({ task, label, description, icon: Icon }) => (
            <button
              key={task}
              type="button"
              onClick={() => onNavigate(task)}
              className="workspace-hover-card flex min-h-32 items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 text-left shadow-panel"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-700">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-bold text-slate-900">{t(label)}</span>
                <span className="mt-1 block text-sm text-slate-500">{t(description)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </section>
  )
}
