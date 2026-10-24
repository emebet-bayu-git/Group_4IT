import React, { useState } from 'react'
import { ArrowLeft, ChevronDown, Download, GraduationCap, LoaderCircle } from 'lucide-react'
import Button from './ui/Button.jsx'

const years = [
  { year: '2025/2026', grade: 'Grade 9', gpa: '3.42', credits: 38, courses: [['English Language', 'A-', 5], ['Mathematics', 'B+', 5], ['Integrated Science', 'A', 5], ['Social Studies', 'A-', 4]] },
  { year: '2026/2027', grade: 'Grade 10', gpa: '3.80', credits: 40, courses: [['Mathematics', 'A', 5], ['English Language', 'A-', 5], ['Physics', 'B+', 5], ['Computer Science', 'A', 5]] },
  { year: '2027/2028', grade: 'Grade 11', gpa: '—', credits: 0, courses: [['Record not yet completed', '—', 0]] },
  { year: '2028/2029', grade: 'Grade 12', gpa: '—', credits: 0, courses: [['Scheduled academic record', '—', 0]] },
]

export default function TranscriptView({ onBack }) {
  const [openYears, setOpenYears] = useState(['2026/2027'])
  const [loading, setLoading] = useState(false)
  const toggle = (year) => setOpenYears((current) => current.includes(year) ? current.filter((item) => item !== year) : [...current, year])
  const download = () => { setLoading(true); window.setTimeout(() => setLoading(false), 1400) }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3"><Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />Back to portal</Button><span className="hidden text-sm text-slate-500 sm:block">Official academic record</span></div>
      <div className="mb-6 rounded-lg bg-primary-900 px-5 py-6 text-white shadow-panel"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-primary-200">Cumulative academic summary</p><h1 className="mt-1 text-2xl font-bold">Amara Okafor</h1></div><Button variant="secondary" loading={loading} onClick={download} className="border-white/20 bg-white text-primary-900 hover:bg-primary-50"><Download className="h-4 w-4" />{loading ? 'Preparing PDF...' : 'Download Official Transcript PDF'}</Button></div><div className="mt-6 grid grid-cols-3 divide-x divide-primary-700 rounded-md bg-primary-800/60 py-4 text-center"><div><p className="text-xs text-primary-200">Cumulative GPA</p><p className="mt-1 text-2xl font-bold">3.61</p></div><div><p className="text-xs text-primary-200">Credits earned</p><p className="mt-1 text-2xl font-bold">78</p></div><div><p className="text-xs text-primary-200">Graduation status</p><p className="mt-1 text-lg font-bold">In Progress</p></div></div></div>
      <section className="space-y-3" aria-label="Academic records by year">{years.map((record) => { const open = openYears.includes(record.year); return <article key={record.year} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel"><button onClick={() => toggle(record.year)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={open}><span className="grid h-10 w-10 place-items-center rounded-md bg-primary-50 text-primary-700"><GraduationCap className="h-5 w-5" /></span><span className="flex-1"><span className="block font-bold text-slate-900">{record.grade}</span><span className="mt-0.5 block text-xs text-slate-500">Academic year {record.year}</span></span><span className="hidden text-right sm:block"><span className="block text-xs text-slate-500">Year GPA</span><span className="font-bold text-slate-800">{record.gpa}</span></span><ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="border-t border-slate-100"><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Course</th><th className="px-5 py-3">Grade</th><th className="px-5 py-3 text-right">Credits</th></tr></thead><tbody className="divide-y divide-slate-100">{record.courses.map(([course, grade, credits]) => <tr key={course}><td className="px-5 py-4 font-semibold text-slate-800">{course}</td><td className="px-5 py-4">{grade === '—' ? <span className="text-slate-400">—</span> : <span className="inline-flex min-w-10 justify-center rounded-full bg-primary-50 px-2 py-1 font-bold text-primary-700">{grade}</span>}</td><td className="px-5 py-4 text-right text-slate-600">{credits}</td></tr>)}</tbody></table></div><div className="flex justify-between border-t border-slate-100 bg-slate-25 px-5 py-3 text-xs text-slate-500"><span>Credits earned</span><strong className="text-slate-700">{record.credits}</strong></div></div>}</article>})}</section>
    </div>
  )
}
