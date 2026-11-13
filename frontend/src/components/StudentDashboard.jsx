import React from 'react'
import { Download, FileText, GraduationCap, UserRound } from 'lucide-react'
import Button from './ui/Button.jsx'
import StatusBadge from './ui/Badge.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

export default function StudentDashboard({ student = {}, onDownload }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="mb-6"><p className="text-sm font-semibold text-primary-700">{t('Student portal')}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{t('Academic overview')}</h1><p className="mt-1 text-sm text-slate-500">{student.academicYear ? t('Your student records for {year}', { year: student.academicYear }) : t('View your approved academic results and official documents.')}</p></div>

      <div className="grid gap-6">
        <section className="workspace-hover-card rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="student-profile-heading">
          <div className="flex items-start justify-between"><h2 id="student-profile-heading" className="font-bold text-slate-900">{t('Student profile')}</h2><StatusBadge status={student.status || 'Active'} /></div>
          <div className="mt-5 flex items-center gap-4">{student.photoUrl ? <img src={student.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-primary-50" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-800 ring-4 ring-primary-50"><UserRound className="h-9 w-9" /></div>}<div className="min-w-0"><p className="truncate text-lg font-bold text-slate-900">{student.name}</p><p className="mt-1 text-sm text-slate-500">{t('Student ID: {id}', { id: student.rollNumber })}</p></div></div>
          <dl className="mt-5 divide-y divide-slate-100 rounded-md border border-slate-200"><div className="flex justify-between px-4 py-3"><dt className="text-sm text-slate-500">{t('Class & section')}</dt><dd className="text-sm font-semibold text-slate-800">{t(student.className || '—')} · {t(student.section || '—')}</dd></div><div className="flex justify-between px-4 py-3"><dt className="text-sm text-slate-500">{t('Academic status')}</dt><dd className="text-sm font-semibold text-success-700">{t(student.academicStatus || student.status || 'Active')}</dd></div><div className="flex justify-between px-4 py-3"><dt className="text-sm text-slate-500">{t('Session')}</dt><dd className="text-sm font-semibold text-slate-800">{student.academicYear || '—'}</dd></div></dl>
        </section>
      </div>

      <section className="workspace-hover-card mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="downloads-heading">
        <div className="mb-4"><h2 id="downloads-heading" className="font-bold text-slate-900">{t('Documents & downloads')}</h2><p className="mt-1 text-sm text-slate-500">{t('Semester results are online; official PDFs are available when eligible.')}</p>{!student.transcriptAvailable && <p className="mt-1 text-xs text-slate-500">{t('The official transcript is available after Grade 12 completion or an official transfer out.')}</p>}</div>
        <div className={`grid gap-3 ${student.transcriptAvailable ? 'sm:grid-cols-2' : ''}`}>
          <Button variant="primary" onClick={() => onDownload?.('Semester results')} className="h-auto min-h-16 justify-start px-4 py-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white/10"><FileText className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-sm">{t('View Semester Results / Annual Report Card')}</span><span className="mt-0.5 block text-xs font-normal text-primary-200">{t('Semester summaries online; annual PDF after both approvals.')}</span></span><Download className="ml-auto h-5 w-5 shrink-0" /></Button>
          {student.transcriptAvailable && <Button variant="secondary" onClick={() => onDownload?.('Official transcript')} className="h-auto min-h-16 justify-start px-4 py-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100"><GraduationCap className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-sm">{t('Download Official Transcript')}</span><span className="mt-0.5 block text-xs font-normal text-slate-500">PDF · {t('Complete academic record')}</span></span><Download className="ml-auto h-5 w-5 shrink-0" /></Button>}
        </div>
      </section>

    </>
  )
}
