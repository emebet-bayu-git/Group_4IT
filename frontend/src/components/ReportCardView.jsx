import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowLeft, Printer } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { SchoolAddress, SchoolMark, useSchoolProfile } from './SchoolIdentity.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const authConfig = () => ({ headers: { Authorization: 'Bearer ' + readSessionToken() } })

function OfficialSchoolHeader({ school, name, stampPath, t }) {
  const officialSchool = { ...school, school_name: name || school.school_name }
  return (
    <header className="flex items-center gap-4 border-b-2 border-primary-900 pb-5">
      <SchoolMark school={officialSchool} />
      <div className="flex-1 text-center">
        <h1 className="text-xl font-bold uppercase tracking-wide sm:text-2xl">{officialSchool.school_name || t('School')}</h1>
        <p className="mt-1 text-xs text-slate-600"><SchoolAddress school={school} /></p>
        <p className="mt-1 text-xs text-slate-600">{t('Annual Report Card')}</p>
      </div>
      {(stampPath || school.stamp_path) && <img src={stampPath || school.stamp_path} alt={t('Official school stamp')} className="h-16 w-16 shrink-0 object-contain" />}
    </header>
  )
}

function SignatureLines({ principalName, homeroomTeacherName, t }) {
  return (
    <div className="mt-12 grid grid-cols-3 gap-5 text-center text-xs">
      {[
        ['Homeroom Teacher', homeroomTeacherName],
        ['Registrar', ''],
        ['School Principal', principalName],
      ].map(([label, name]) => (
        <div key={label} className="pt-8">
          <p className="border-b border-slate-500 pb-1 font-semibold">{name || '\u00a0'}</p>
          <p className="mt-2 font-semibold uppercase">{t(label)}</p>
          <p className="mt-4 border-b border-slate-500 pb-1">&nbsp;</p>
          <p className="mt-1 uppercase">{t('Date')}</p>
        </div>
      ))}
    </div>
  )
}

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
          toast.error(t(error.response?.data?.message || 'Unable to load your approved semester results.'))
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  if (loading) return <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('Loading approved semester results…')}</p>
  if (!report) return <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-panel">
    <Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('Back to portal')}</Button>
    <p className="text-sm text-slate-600">{t('No principal-approved semester results are available yet.')}</p>
  </section>

  const { student, academicYear, semesters = [], annualReport } = report
  const printAnnualReport = () => window.print()

  return (
    <div>
      <div className="report-actions mb-5 flex items-center justify-between">
        <Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('Back to portal')}</Button>
        {annualReport && <Button onClick={printAnnualReport}><Printer className="h-4 w-4" />{t('Print / Save Annual Report Card as PDF')}</Button>}
      </div>

      {annualReport && <article className="report-document mx-auto max-w-4xl bg-white px-5 py-8 text-slate-900 shadow-panel sm:px-10 sm:py-10">
        <OfficialSchoolHeader school={school} name={annualReport.approval.schoolName} stampPath={annualReport.approval.stampPath} t={t} />
        <div className="mt-5 text-center">
          <h2 className="text-lg font-bold uppercase">{t('Annual Report Card')}</h2>
          <p className="mt-1 text-sm font-semibold text-primary-800">{academicYear}</p>
        </div>
        <dl className="mt-5 grid grid-cols-2 border border-slate-400 text-sm sm:grid-cols-4">
          <div className="border-b border-r border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Student name')}</dt><dd className="mt-1 font-bold">{student.name}</dd></div>
          <div className="border-b border-r border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Student ID')}</dt><dd className="mt-1 font-bold">{student.studentNumber || student.id}</dd></div>
          <div className="border-b border-r border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Grade')}</dt><dd className="mt-1 font-bold">{t(annualReport.gradeLevel || semesters[1]?.gradeLevel || student.gradeLevel)}</dd></div>
          <div className="border-b border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Yearly Average')}</dt><dd className="mt-1 font-bold">{Number(annualReport.annualAverage).toFixed(2)}%</dd></div>
          <div className="border-r border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Final yearly rank')}</dt><dd className="mt-1 font-bold">{annualReport.sectionRank ?? '—'}</dd></div>
          <div className="border-r border-slate-300 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Promotion status')}</dt><dd className="mt-1 font-bold">{t(annualReport.promotionStatus)}</dd></div>
          <div className="col-span-2 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{t('Class / Section')}</dt><dd className="mt-1 font-bold">{t(annualReport.sectionName || semesters[1]?.sectionName || '—')}</dd></div>
        </dl>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse border border-slate-400 text-sm">
            <thead className="bg-primary-900 text-white"><tr>
              <th className="border border-slate-400 px-3 py-2 text-left">{t('Subject')}</th>
              <th className="border border-slate-400 px-3 py-2 text-center">{t('Semester 1')}</th>
              <th className="border border-slate-400 px-3 py-2 text-center">{t('Semester 2')}</th>
              <th className="border border-slate-400 px-3 py-2 text-center">{t('Yearly Average')}</th>
            </tr></thead>
            <tbody>{annualReport.subjects.map((subject) => <tr key={subject.name}>
              <td className="border border-slate-300 px-3 py-2.5 font-semibold">{t(subject.name)}</td>
              <td className="border border-slate-300 px-3 py-2.5 text-center">{subject.semester1Total === null ? '—' : Number(subject.semester1Total).toFixed(2)}</td>
              <td className="border border-slate-300 px-3 py-2.5 text-center">{subject.semester2Total === null ? '—' : Number(subject.semester2Total).toFixed(2)}</td>
              <td className="border border-slate-300 px-3 py-2.5 text-center font-bold">{Number(subject.yearlyAverage).toFixed(2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end text-sm font-bold">{t('Yearly Average')}: {Number(annualReport.annualAverage).toFixed(2)}%</div>
        {annualReport.approval.signaturePath && <div className="mt-4 flex justify-end"><img src={annualReport.approval.signaturePath} alt={t('Principal digital signature')} className="h-14 max-w-40 object-contain" /></div>}
        <SignatureLines
          principalName={annualReport.approval.principalName}
          homeroomTeacherName={annualReport.homeroomTeacherName}
          t={t}
        />
      </article>}

      <section className="report-online-only mt-6 space-y-4" aria-label={t('Approved semester result summaries')}>
        {!annualReport && <p className="rounded-lg border border-primary-200 bg-primary-50 p-4 text-sm text-primary-900">{t('Semester results are for online viewing. The printable Annual Report Card is available after both semesters are approved.')}</p>}
        <h2 className="font-bold text-slate-900">{t('Approved semester result summaries')}</h2>
        {semesters.map((semester) => (
          <article key={semester.semester} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-bold text-slate-900">{t(semester.semester)} · {academicYear}</h3><p className="mt-1 text-sm text-slate-500">{t(semester.gradeLevel)} · {t(semester.sectionName)}</p></div>
              <div className="text-right text-sm"><p>{t('Average')}: <strong>{Number(semester.average).toFixed(2)}%</strong></p><p>{t('Section rank')}: <strong>{semester.sectionRank}</strong></p></div>
            </header>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[400px] text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2 text-left">{t('Subject')}</th><th className="px-3 py-2 text-right">{t('Total / 100')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{semester.results.map((result) => <tr key={result.assignmentId}><td className="px-3 py-2 font-medium">{t(result.subject)}</td><td className="px-3 py-2 text-right font-semibold">{Number(result.total100).toFixed(2)}</td></tr>)}</tbody>
              </table>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
