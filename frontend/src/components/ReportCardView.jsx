import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowLeft, Printer } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { SchoolAddress, SchoolMark, useSchoolProfile } from './SchoolIdentity.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const authConfig = () => ({ headers: { Authorization: 'Bearer ' + readSessionToken() } })

export default function ReportCardView({ onBack }) {
  const { t } = useTranslation()
  const school = useSchoolProfile()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    axios.get('/api/student/report-card', authConfig())
      .then(({ data }) => { if (active) setReport(data) })
      .catch((error) => {
        if (active && error.response?.status !== 404) {
          toast.error(t(error.response?.data?.message || 'Unable to load your approved report card.'))
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('Loading approved report card…')}</p>
  if (!report) return <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
    <Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('Back to portal')}</Button>
    <p className="text-sm text-slate-600">{t('No principal-approved report card is available yet.')}</p>
  </section>

  const { student, section, approval, subjects = [], results = [] } = report
  const byAssignment = new Map(results.map((result) => [Number(result.assignmentId), result]))
  const average = results.length
    ? results.reduce((sum, result) => sum + Number(result.total100 || 0), 0) / results.length
    : 0

  return (
    <div>
      <div className="report-actions sticky top-0 z-20 -mx-4 mb-6 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('Back to portal')}</Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" />{t('Print / Save as PDF')}</Button>
      </div>
      <article className="report-document mx-auto max-w-4xl bg-white px-5 py-8 text-slate-900 shadow-panel sm:px-10 sm:py-10">
        <header className="flex items-center gap-4 border-b-2 border-primary-900 pb-5 text-center sm:text-left">
          <SchoolMark school={{ ...school, school_name: approval.schoolName || school.school_name }} />
          <div className="flex-1"><h1 className="text-xl font-bold uppercase tracking-wide sm:text-2xl">{approval.schoolName || school.school_name || t('School')}</h1><p className="mt-1 text-xs text-slate-500"><SchoolAddress school={school} /></p></div>
        </header>
        <div className="mt-5 text-center"><h2 className="text-lg font-bold uppercase">{t('Student Semester Report')}</h2><p className="mt-1 text-sm font-semibold text-primary-800">{t(approval.semester)} · {approval.academicYear}</p></div>
        <dl className="mt-5 grid grid-cols-2 border border-slate-400 text-sm sm:grid-cols-3">
          <div className="border-b border-r border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Student name')}</dt><dd className="mt-1 font-bold">{student.name}</dd></div>
          <div className="border-b border-r border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Student ID')}</dt><dd className="mt-1 font-bold">{student.studentNumber || student.id}</dd></div>
          <div className="border-b border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Class / Section')}</dt><dd className="mt-1 font-bold">{t(section.gradeLevel)} · {t(section.sectionName)}</dd></div>
          <div className="col-span-2 border-r border-slate-300 p-3 sm:col-span-1"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Overall percentage')}</dt><dd className="mt-1 font-bold">{average.toFixed(2)}%</dd></div>
          <div className="col-span-2 p-3 sm:col-span-2"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Approval status')}</dt><dd className="mt-1 font-bold">{t(approval.status === 'published' ? 'Permanently archived' : 'Principal approved')}</dd></div>
        </dl>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[560px] border-collapse border border-slate-400 text-sm">
          <thead className="bg-primary-900 text-white"><tr><th className="border border-slate-400 px-3 py-2 text-left">{t('Subject')}</th><th className="border border-slate-400 px-3 py-2 text-center">{t('Assessment / 40')}</th><th className="border border-slate-400 px-3 py-2 text-center">{t('Final / 60')}</th><th className="border border-slate-400 px-3 py-2 text-center">{t('Total / 100')}</th></tr></thead>
          <tbody>{subjects.map((subject) => {
            const result = byAssignment.get(Number(subject.assignmentId))
            return <tr key={subject.assignmentId}><td className="border border-slate-300 px-3 py-2.5 font-semibold">{t(subject.subject)}</td><td className="border border-slate-300 px-3 py-2.5 text-center">{Number(result?.assessment40 ?? 0).toFixed(2)}</td><td className="border border-slate-300 px-3 py-2.5 text-center">{Number(result?.final60 ?? 0).toFixed(2)}</td><td className="border border-slate-300 px-3 py-2.5 text-center font-bold">{Number(result?.total100 ?? 0).toFixed(2)}</td></tr>
          })}</tbody>
        </table></div>
        <div className="mt-10 grid grid-cols-2 gap-10 px-4 text-center text-sm">
          <div className="self-end"><p className="border-b border-slate-500 pb-1">{t('Homeroom advisor')}</p><p className="mt-2 text-xs font-semibold uppercase text-slate-500">{t('Advisor')}</p></div>
          <div><div className="flex h-20 items-center justify-center gap-3">{approval.stampPath && <img src={approval.stampPath} alt={t('Official school stamp')} className="h-16 max-w-28 object-contain" />}{approval.signaturePath && <img src={approval.signaturePath} alt={t('Principal digital signature')} className="h-12 max-w-36 object-contain" />}</div><p className="border-b border-slate-500 pb-1 font-semibold">{approval.principalName}</p><p className="mt-2 text-xs font-semibold uppercase text-slate-500">{t('Principal signature')}</p></div>
        </div>
      </article>
    </div>
  )
}
