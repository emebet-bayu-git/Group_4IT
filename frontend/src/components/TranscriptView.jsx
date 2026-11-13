import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { ArrowLeft, ChevronDown, Download, GraduationCap } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { SchoolAddress, SchoolMark, useSchoolProfile } from './SchoolIdentity.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'
import { useAcademicContext } from '../contexts/AcademicContext.jsx'

export default function TranscriptView({ onBack, registrarMode = false }) {
  const { t } = useTranslation()
  const school = useSchoolProfile()
  const { period } = useAcademicContext()
  const [studentId, setStudentId] = useState('')
  const [requestedId, setRequestedId] = useState('')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(!registrarMode)
  const [openPeriods, setOpenPeriods] = useState([])
  const [accessError, setAccessError] = useState('')
  const [canMarkTransferredOut, setCanMarkTransferredOut] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    if (registrarMode && !requestedId) {
      setLoading(false)
      setRecords([])
      setAccessError('')
      setCanMarkTransferredOut(false)
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
        setAccessError('')
        setCanMarkTransferredOut(false)
        setOpenPeriods(available.length ? [`${available[0].academicYear}:${available[0].semester}`] : [])
      })
      .catch((error) => {
        if (!active) return
        setRecords([])
        setAccessError(error.response?.data?.message || '')
        setCanMarkTransferredOut(error.response?.status === 403 && registrarMode)
        if (error.response?.status !== 404) {
          toast.error(t(error.response?.data?.message || 'Unable to load archived academic records.'))
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [requestedId, registrarMode, refreshKey])

  const toggle = (key) => setOpenPeriods((current) => current.includes(key)
    ? current.filter((item) => item !== key) : [...current, key])
  const latest = records[0]
  const coursesCount = records.reduce((sum, item) => sum + item.subjects.length, 0)
  const download = () => window.print()
  const markTransferredOut = async () => {
    if (!window.confirm(t('Confirm that this student is officially transferring out of the school?'))) return
    try {
      await axios.post(`/api/registrar/students/${encodeURIComponent(requestedId)}/transfer-out`, {}, {
        headers: { Authorization: 'Bearer ' + readSessionToken() },
      })
      toast.success(t('Student marked as officially transferred out.'))
      setRefreshKey((current) => current + 1)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to mark this student as transferred out.'))
    }
  }

  return (
    <div>
      <div className="transcript-actions mb-5 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t('Back to portal')}</Button>
        {records.length > 0 && <Button onClick={download}><Download className="h-4 w-4" />{t('Download Official Transcript PDF')}</Button>}
      </div>
      {registrarMode && <form className="transcript-actions mb-5 flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault()
        setAccessError('')
        setCanMarkTransferredOut(false)
        setRequestedId(studentId.trim())
      }}>
        <label className="block text-sm font-medium text-slate-700">{t('Student record ID')}
          <input required inputMode="numeric" value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-1 h-10 rounded-md border border-slate-300 px-3" />
        </label>
        <Button type="submit">{t('Load transcript')}</Button>
        {requestedId && canMarkTransferredOut && <Button type="button" variant="secondary" onClick={markTransferredOut}>{t('Mark Official Transfer Out')}</Button>}
      </form>}
      {registrarMode && period?.academicYear && <p className="mb-4 text-sm font-semibold text-primary-800">{t('Current academic period')}: {period.academicYear}{period.semester ? ` · ${t(period.semester)}` : ''}</p>}
      {loading ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('Loading archived academic records…')}</p>
        : !records.length ? <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t(accessError || (registrarMode && !requestedId ? 'Enter a student record ID to retrieve its archived transcript.' : 'No permanently archived academic records are available.'))}</p>
          : <div className="transcript-document">
            <header className="flex items-center gap-4 border-b-2 border-primary-900 pb-5 text-center">
              <SchoolMark school={{ ...school, school_name: latest.schoolName || school.school_name }} />
              <div className="flex-1"><h1 className="text-xl font-bold uppercase tracking-wide">{latest.schoolName || school.school_name || t('School')}</h1><p className="mt-1 text-xs text-slate-600"><SchoolAddress school={school} /></p><p className="mt-1 text-sm font-semibold">{t('Grade 9–12 Official Transcript')}</p></div>
              {(latest.stampPath || school.stamp_path) && <img src={latest.stampPath || school.stamp_path} alt={t('Official school stamp')} className="h-16 w-16 shrink-0 object-contain" />}
            </header>
            <div className="mt-5 grid grid-cols-3 border border-slate-300 py-4 text-center">
              <div><p className="text-xs text-slate-500">{t('Cumulative GPA')}</p><p className="mt-1 text-xl font-bold">{Number(latest.cgpa).toFixed(2)}</p></div>
              <div><p className="text-xs text-slate-500">{t('Archived courses')}</p><p className="mt-1 text-xl font-bold">{coursesCount}</p></div>
              <div><p className="text-xs text-slate-500">{t('Record periods')}</p><p className="mt-1 text-xl font-bold">{records.length}</p></div>
            </div>
            <section className="space-y-3" aria-label={t('Academic records by year')}>
              {records.map((record) => {
                const key = `${record.academicYear}:${record.semester}`
                const open = openPeriods.includes(key)
                return <article key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
                  <div className="hidden border-b border-slate-100 px-5 py-3 print:block">
                    <p className="font-bold text-slate-900">{t(record.gradeLevel)} · {t(record.sectionName)}</p>
                    <p className="text-xs text-slate-500">{record.academicYear} · {t(record.semester)}</p>
                  </div>
                  <button type="button" onClick={() => toggle(key)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={open}>
                    <span className="grid h-10 w-10 place-items-center rounded-md bg-primary-50 text-primary-700"><GraduationCap className="h-5 w-5" /></span>
                    <span className="flex-1"><span className="block font-bold text-slate-900">{t(record.gradeLevel)} · {t(record.sectionName)}</span><span className="mt-0.5 block text-xs text-slate-500">{record.academicYear} · {t(record.semester)}</span></span>
                    <span className="hidden text-right sm:block"><span className="block text-xs text-slate-500">{t('SGPA / CGPA')}</span><span className="font-bold text-slate-800">{Number(record.sgpa).toFixed(2)} / {Number(record.cgpa).toFixed(2)}</span></span>
                    <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`${open ? 'block' : 'hidden'} print:block border-t border-slate-100`}>
                    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">{t('Course')}</th><th className="px-5 py-3 text-right">{t('Assessment / 40')}</th><th className="px-5 py-3 text-right">{t('Final / 60')}</th><th className="px-5 py-3 text-right">{t('Total / 100')}</th><th className="px-5 py-3 text-right">{t('Grade point')}</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">{record.subjects.map((subject) => <tr key={subject.name}><td className="px-5 py-4 font-semibold text-slate-800">{t(subject.name)}</td><td className="px-5 py-4 text-right">{Number(subject.assessment40).toFixed(2)}</td><td className="px-5 py-4 text-right">{Number(subject.final60).toFixed(2)}</td><td className="px-5 py-4 text-right font-bold">{Number(subject.total100).toFixed(2)}</td><td className="px-5 py-4 text-right">{Number(subject.gradePoint).toFixed(2)}</td></tr>)}</tbody>
                    </table></div>
                    <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs"><span>{t('Semester GPA')}</span><strong>{Number(record.sgpa).toFixed(2)}</strong></div>
                  </div>
                </article>
              })}
            </section>
            <div className="mt-12 grid grid-cols-3 gap-5 text-center text-xs">
              {[
                ['Homeroom Teacher', ''],
                ['Registrar', ''],
                ['School Principal', latest.principalName],
              ].map(([label, name]) => <div key={label} className="pt-8">
                <p className="border-b border-slate-500 pb-1 font-semibold">{name || '\u00a0'}</p>
                <p className="mt-2 font-semibold uppercase">{t(label)}</p>
                <p className="mt-4 border-b border-slate-500 pb-1">&nbsp;</p>
                <p className="mt-1 uppercase">{t('Date')}</p>
              </div>)}
            </div>
            {latest.signaturePath && <div className="mt-3 flex justify-end"><img src={latest.signaturePath} alt={t('Principal digital signature')} className="h-12 max-w-36 object-contain" /></div>}
          </div>}
    </div>
  )
}
