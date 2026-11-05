import React from 'react'
import { Award, CalendarDays, Download, FileText, GraduationCap, TrendingUp, Trophy, UserRound } from 'lucide-react'
import Button from './ui/Button.jsx'
import StatusBadge from './ui/Badge.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const performance = [68, 74, 72, 81, 86]
const semesters = ['Semester 1', 'Semester 2', 'Semester 1', 'Semester 2', 'Semester 1']

const grades = [
  { subject: 'Mathematics', score: 88, grade: 'A', remark: 'Excellent' },
  { subject: 'English Language', score: 84, grade: 'A-', remark: 'Very good' },
  { subject: 'Physics', score: 79, grade: 'B+', remark: 'Good' },
  { subject: 'Computer Science', score: 92, grade: 'A', remark: 'Excellent' },
  { subject: 'History', score: 76, grade: 'B', remark: 'Good' },
]

function TrendChart() {
  const { t } = useTranslation()
  const points = performance.map((value, index) => {
    const x = 8 + index * (284 / (performance.length - 1))
    const y = 104 - ((value - 60) / 40) * 88
    return `${x},${y}`
  }).join(' ')

  return (
    <div className="mt-5">
      <svg viewBox="0 0 300 112" className="h-28 w-full" role="img" aria-label={t('Performance trend across five semesters')}>
        {[16, 46, 76, 106].map((y) => <line key={y} x1="8" y1={y} x2="292" y2={y} stroke="#e2e8f0" strokeWidth="1" />)}
        <polyline points={points} fill="none" stroke="#164aaf" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {performance.map((value, index) => {
          const x = 8 + index * (284 / (performance.length - 1))
          const y = 104 - ((value - 60) / 40) * 88
          return <circle key={`${value}-${index}`} cx={x} cy={y} r="4" fill="white" stroke="#164aaf" strokeWidth="3" />
        })}
      </svg>
      <div className="flex justify-between text-[10px] font-medium text-slate-400"><span>{t(semesters[0])}</span><span>{t(semesters[2])}</span><span>{t(semesters[4])}</span></div>
    </div>
  )
}

export default function StudentDashboard({ student = { name: 'Amara Okafor', rollNumber: 'NFS-2026-1048', className: 'Grade 10', section: 'Section A' }, onDownload }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="mb-6"><p className="text-sm font-semibold text-primary-700">{t('Student portal')}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{t('Academic overview')}</h1><p className="mt-1 text-sm text-slate-500">{t('Your records and performance for {period}', { period: `${t('Semester 2')}, 2026/2027` })}</p></div>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
        <section className="workspace-hover-card rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="student-profile-heading">
          <div className="flex items-start justify-between"><h2 id="student-profile-heading" className="font-bold text-slate-900">{t('Student profile')}</h2><StatusBadge status={student.status || 'Active'} /></div>
          <div className="mt-5 flex items-center gap-4">{student.photoUrl ? <img src={student.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-4 ring-primary-50" /> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-800 ring-4 ring-primary-50"><UserRound className="h-9 w-9" /></div>}<div className="min-w-0"><p className="truncate text-lg font-bold text-slate-900">{student.name}</p><p className="mt-1 text-sm text-slate-500">{t('Student ID: {id}', { id: student.rollNumber })}</p></div></div>
          <dl className="mt-5 divide-y divide-slate-100 rounded-md border border-slate-200"><div className="flex justify-between px-4 py-3"><dt className="text-sm text-slate-500">{t('Class & section')}</dt><dd className="text-sm font-semibold text-slate-800">{t(student.className || '—')} · {t(student.section || '—')}</dd></div><div className="flex justify-between px-4 py-3"><dt className="text-sm text-slate-500">{t('Academic status')}</dt><dd className="text-sm font-semibold text-success-700">{t(student.status || 'Active')}</dd></div><div className="flex justify-between px-4 py-3"><dt className="text-sm text-slate-500">{t('Session')}</dt><dd className="text-sm font-semibold text-slate-800">{student.academicYear || '2026/2027'}</dd></div></dl>
        </section>

        <section className="workspace-hover-card rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="performance-heading">
          <div className="flex items-start justify-between"><div><h2 id="performance-heading" className="font-bold text-slate-900">{t('Academic performance')}</h2><p className="mt-1 text-sm text-slate-500">{t('Current semester summary')}</p></div><span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">{t('Improving')}</span></div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-md bg-slate-50 px-2 py-4"><div className="px-3"><p className="text-xs text-slate-500">{t('Semester GPA')}</p><p className="mt-1 text-2xl font-bold text-slate-900">3.8</p><p className="mt-1 text-xs text-slate-400">{t('out of 4.0')}</p></div><div className="px-3"><p className="text-xs text-slate-500">{t('Percentage')}</p><p className="mt-1 text-2xl font-bold text-slate-900">86%</p><p className="mt-1 flex items-center text-xs font-semibold text-success-700"><TrendingUp className="mr-0.5 h-3 w-3" />4.2%</p></div><div className="px-3"><p className="text-xs text-slate-500">{t('Class rank')}</p><p className="mt-1 text-2xl font-bold text-slate-900">{t('3rd')}</p><p className="mt-1 text-xs text-slate-400">{t('of {count} students', { count: 32 })}</p></div></div>
          <TrendChart />
        </section>
      </div>

      <section className="workspace-hover-card mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="downloads-heading">
        <div className="mb-4"><h2 id="downloads-heading" className="font-bold text-slate-900">{t('Documents & downloads')}</h2><p className="mt-1 text-sm text-slate-500">{t('Official records are generated securely in PDF format')}</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="primary" onClick={() => onDownload?.('Latest result card')} className="h-auto min-h-16 justify-start px-4 py-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-white/10"><FileText className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-sm">{t('Download Latest Result Card')}</span><span className="mt-0.5 block text-xs font-normal text-primary-200">PDF · {t('Semester 2')}, 2026/2027</span></span><Download className="ml-auto h-5 w-5 shrink-0" /></Button>
          <Button variant="secondary" onClick={() => onDownload?.('Official transcript')} className="h-auto min-h-16 justify-start px-4 py-3 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-slate-100"><GraduationCap className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-sm">{t('Download Official Transcript')}</span><span className="mt-0.5 block text-xs font-normal text-slate-500">PDF · {t('Complete academic record')}</span></span><Download className="ml-auto h-5 w-5 shrink-0" /></Button>
        </div>
      </section>

      <section className="workspace-hover-card mt-6 rounded-lg border border-slate-200 bg-white shadow-panel" aria-labelledby="grades-heading">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="grades-heading" className="font-bold text-slate-900">{t('Recent semester grades')}</h2><p className="mt-1 text-xs text-slate-500">{t('Semester 2')}, 2026/2027</p></div><div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex"><CalendarDays className="h-4 w-4" />{t('Updated {date}', { date: t('Oct 20') })}</div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3 font-semibold">{t('Subject')}</th><th className="px-5 py-3 font-semibold">{t('Score')}</th><th className="px-5 py-3 font-semibold">{t('Grade')}</th><th className="px-5 py-3 font-semibold">{t('Remark')}</th></tr></thead><tbody className="divide-y divide-slate-100">{grades.map((grade) => <tr key={grade.subject}><td className="px-5 py-4"><span className="flex items-center gap-2 font-semibold text-slate-800"><Award className="h-4 w-4 text-primary-500" />{t(grade.subject)}</span></td><td className="px-5 py-4 font-semibold text-slate-700">{grade.score}%</td><td className="px-5 py-4"><span className="inline-flex min-w-10 justify-center rounded-full bg-primary-50 px-2 py-1 font-bold text-primary-700">{grade.grade}</span></td><td className="px-5 py-4 text-slate-600">{t(grade.remark)}</td></tr>)}</tbody></table></div>
        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4 text-sm text-slate-600"><Trophy className="h-4 w-4 text-warning-600" /><span><strong className="text-slate-800">{t('Overall')}:</strong> 83.8% · {t('Grade')} A-</span></div>
      </section>
    </>
  )
}
