import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowLeft, ChevronDown, Download, GraduationCap } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { SchoolMark, useSchoolProfile } from './SchoolIdentity.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

export default function TranscriptView({ onBack, registrarMode = false }) {
  const { t } = useTranslation()
  const school = useSchoolProfile()
  const [studentId, setStudentId] = useState('')
  const [requestedId, setRequestedId] = useState('')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(!registrarMode)
  const [openPeriods, setOpenPeriods] = useState([])

  useEffect(() => {
    let active = true
    if (registrarMode && !requestedId) {
      setLoading(false)
      setRecords([])
      return () => { active = false }
    }
    const url = registrarMode
      ? `/api/registrar/academic-records/${encodeURIComponent(requestedId)}`
      : '/api/student/academic-records'
    setLoading(true)
    axios.get(url, { headers: { Authorization: 'Bearer ' + readSessionToken() } })
      .then(({ data }) => {
        if (!active) return
        const available = Array.isArray(data?.records) ? data.records : []
        setRecords(available)
        setOpenPeriods(available.length ? [`${available[0].academicYear}:${available[0].semester}`] : [])
      })
      .catch((error) => {
        if (!active) return
        setRecords([])
        if (error.response?.status !== 404) {
          toast.error(t(error.response?.data?.message || 'Unable to load archived academic records.'))
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [requestedId, registrarMode])

  const toggle = (key) => setOpenPeriods((current) => current.includes(key)
    ? current.filter((item) => item !== key) : [...current, key])
  const latest = records[0]
  const coursesCount = records.reduce((sum, item) => sum + item.subjects.length, 0)
  const download = () => window.print()

  return (
    <div>
      <div className="transcript-actions mb-5 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('Back to portal')}</Button>
        {records.length > 0 && <Button onClick={download}><Download className="h-4 w-4" />{t('Download Official Transcript PDF')}</Button>}
      </div>
      {registrarMode && <form className="transcript-actions mb-5 flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault()
        setRequestedId(studentId.trim())
      }}>
        <label className="block text-sm font-medium text-slate-700">{t('Student record ID')}
          <input required inputMode="numeric" value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-1 h-10 rounded-md border border-slate-300 px-3" />
        </label>
        <Button type="submit">{t('Load transcript')}</Button>
      </form>}
      {loading ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('Loading archived academic records…')}</p>
        : !records.length ? <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t(registrarMode && !requestedId ? 'Enter a student record ID to retrieve its archived transcript.' : 'No permanently archived academic records are available.')}</p>
          : <div className="transcript-document">
            <div className="mb-6 rounded-lg bg-primary-900 px-5 py-6 text-white shadow-panel">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3"><SchoolMark school={{ ...school, school_name: latest.schoolName || school.school_name }} className="h-14 w-14 rounded-full border-2 border-white bg-white p-1 text-primary-900" /><div><p className="text-sm font-semibold text-primary-200">{latest.schoolName || school.school_name} · {t('Cumulative academic summary')}</p><h1 className="mt-1 text-2xl font-bold">{latest.studentName}</h1></div></div>
                <div className="flex items-center gap-3">{latest.stampPath && <img src={latest.stampPath} alt={t('Official school stamp')} className="h-14 max-w-24 object-contain" />}{latest.signaturePath && <img src={latest.signaturePath} alt={t('Principal digital signature')} className="h-12 max-w-32 object-contain" />}</div>
              </div>
              <div className="mt-6 grid grid-cols-3 divide-x divide-primary-700 rounded-md bg-primary-800/60 py-4 text-center">
                <div><p className="text-xs text-primary-200">{t('Cumulative GPA')}</p><p className="mt-1 text-2xl font-bold">{Number(latest.cgpa).toFixed(2)}</p></div>
                <div><p className="text-xs text-primary-200">{t('Archived courses')}</p><p className="mt-1 text-2xl font-bold">{coursesCount}</p></div>
                <div><p className="text-xs text-primary-200">{t('Record periods')}</p><p className="mt-1 text-2xl font-bold">{records.length}</p></div>
              </div>
            </div>
            <section className="space-y-3" aria-label={t('Academic records by year')}>
              {records.map((record) => {
                const key = `${record.academicYear}:${record.semester}`
                const open = openPeriods.includes(key)
                return <article key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
                  <button type="button" onClick={() => toggle(key)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={open}>
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-primary-50 text-primary-700"><GraduationCap className="h-5 w-5" /></span>
                    <span className="flex-1"><span className="block font-bold text-slate-900">{t(record.gradeLevel)} · {t(record.sectionName)}</span><span className="mt-0.5 block text-xs text-slate-500">{record.academicYear} · {t(record.semester)}</span></span>
                    <span className="hidden text-right sm:block"><span className="block text-xs text-slate-500">{t('SGPA / CGPA')}</span><span className="font-bold text-slate-800">{Number(record.sgpa).toFixed(2)} / {Number(record.cgpa).toFixed(2)}</span></span>
                    <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && <div className="border-t border-slate-100">
                    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">{t('Course')}</th><th className="px-5 py-3 text-right">{t('Assessment / 40')}</th><th className="px-5 py-3 text-right">{t('Final / 60')}</th><th className="px-5 py-3 text-right">{t('Total / 100')}</th><th className="px-5 py-3 text-right">{t('Grade point')}</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{record.subjects.map((subject) => <tr key={subject.name}><td className="px-5 py-4 font-semibold text-slate-800">{t(subject.name)}</td><td className="px-5 py-4 text-right">{Number(subject.assessment40).toFixed(2)}</td><td className="px-5 py-4 text-right">{Number(subject.final60).toFixed(2)}</td><td className="px-5 py-4 text-right font-bold">{Number(subject.total100).toFixed(2)}</td><td className="px-5 py-4 text-right">{Number(subject.gradePoint).toFixed(2)}</td></tr>)}</tbody>
                    </table></div>
                    <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs"><span>{t('Semester GPA')}</span><strong>{Number(record.sgpa).toFixed(2)}</strong></div>
                  </div>}
                </article>
              })}
            </section>
          </div>}
    </div>
  )
}
