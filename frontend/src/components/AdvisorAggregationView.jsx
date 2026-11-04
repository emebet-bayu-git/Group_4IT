import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { ArrowLeft, Send } from 'lucide-react'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const authConfig = () => ({ headers: { Authorization: `Bearer ${readSessionToken()}` } })

export default function AdvisorAggregationView() {
  const { t } = useTranslation()
  const [sections, setSections] = useState([])
  const [period, setPeriod] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [busy, setBusy] = useState(false)
  const resultsRequestId = useRef(0)

  const loadSections = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/teacher/advisor/sections', authConfig())
      setSections(data.sections || [])
      setPeriod(data.period)
      setSelectedId((current) => data.sections.some((section) => String(section.id) === current)
        ? current
        : String(data.sections[0]?.id || ''))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to load your advisor sections.'))
    } finally {
      setLoading(false)
    }
  }

  const loadResults = async (sectionId) => {
    const requestId = ++resultsRequestId.current
    if (!sectionId) {
      setResults(null)
      setLoadingResults(false)
      return
    }
    setResults(null)
    setLoadingResults(true)
    try {
      const { data } = await axios.get(`/api/teacher/advisor/sections/${sectionId}/results`, authConfig())
      if (requestId === resultsRequestId.current) setResults(data)
    } catch (requestError) {
      if (requestId === resultsRequestId.current) {
        setResults(null)
        toast.error(t(requestError.response?.data?.message || 'Unable to load this section marksheet.'))
      }
    } finally {
      if (requestId === resultsRequestId.current) setLoadingResults(false)
    }
  }

  useEffect(() => { loadSections() }, [])
  useEffect(() => { loadResults(selectedId) }, [selectedId])

  const submitResults = async () => {
    if (!results?.complete || results.submission) return
    if (!window.confirm(t('Submit this section marksheet to the Registrar? Results will be locked for subject teachers.'))) return
    setBusy(true)
    try {
      await axios.post(`/api/teacher/advisor/sections/${selectedId}/submit`, {}, authConfig())
      await loadSections()
      await loadResults(selectedId)
      toast.success(t('Section results submitted to the Registrar.'))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to submit section results.'))
    } finally {
      setBusy(false)
    }
  }

  const currentSection = sections.find((section) => String(section.id) === selectedId)

  return (
    <section className="space-y-5" aria-labelledby="advisor-results-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Teacher workspace')}</p>
        <h1 id="advisor-results-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Class Result Aggregation & Submission')}</h1>
        <p className="mt-1 text-sm text-slate-500">{period ? `${t(period.semester)} · ${period.academicYear}` : t('No active academic semester')}</p>
      </header>
      {loading ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading advisor sections…')}</p>
        : !sections.length ? <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('You are not assigned as a homeroom teacher for an active section.')}</p>
          : <div className="space-y-4">
            <label className="block max-w-sm text-sm font-medium text-slate-700">{t('Assigned section')}
              <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                {sections.map((section) => <option key={section.id} value={section.id}>{t(section.gradeLevel)} · {t(section.sectionName)}</option>)}
              </select>
            </label>
            {loadingResults && <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading section marksheet…')}</p>}
            {results && <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
                <div><h2 className="font-bold text-slate-900">{currentSection ? `${t(currentSection.gradeLevel)} · ${t(currentSection.sectionName)}` : ''}</h2><p className="mt-1 text-xs text-slate-500">{results.students.length} {t('students')} · {results.subjects.length} {t('subject assignments')}</p></div>
                <div className="flex items-center gap-2">
                  {results.submission
                    ? <span className="rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700">{t(results.submission.status === 'published' ? 'Permanently archived' : results.submission.status === 'approved' ? 'Principal approved and locked' : 'Submitted for principal approval')}</span>
                    : <button type="button" disabled={!results.complete || busy} onClick={submitResults} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{busy ? t('Submitting…') : t('Review & Send to Registrar')}</button>}
                </div>
              </div>
              <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {results.subjects.map((subject) => <div key={subject.assignmentId} className="rounded-md border border-slate-200 p-3">
                  <p className="font-semibold text-slate-900">{t(subject.subject)}</p>
                  <p className="mt-1 text-xs text-slate-600">{t('Teacher')}: {subject.teacherName}</p>
                  <p className={`mt-2 text-xs font-semibold ${subject.complete ? 'text-success-700' : 'text-warning-700'}`}>
                    {subject.complete ? t('Complete') : t('Pending')} · {subject.gradedCount}/{subject.studentCount} {t('students')}
                  </p>
                </div>)}
                {!results.subjects.length && <p className="text-sm text-slate-600">{t('No subject-teacher assignments exist for this section.')}</p>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Student')}</th>{results.subjects.map((subject) => <th key={subject.assignmentId} className="px-4 py-3">{t(subject.subject)}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{results.students.map((student) => <tr key={student.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{student.name}</td>
                    {student.results.map((result) => <td key={result.assignmentId} className="px-4 py-3 tabular-nums text-slate-700">
                      {result.total100 === null ? '—' : `${Number(result.total100).toFixed(2)} (${Number(result.assessment40).toFixed(2)} + ${Number(result.final60).toFixed(2)})`}
                    </td>)}
                  </tr>)}
                    {!results.students.length && <tr><td colSpan={Math.max(1, results.subjects.length + 1)} className="px-4 py-8 text-center text-slate-500">{t('No active students are enrolled in this section.')}</td></tr>}
                  </tbody>
                </table>
              </div>
              {results.submission && <div className="border-t border-slate-200 p-3"><button type="button" onClick={() => loadResults(selectedId)} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><ArrowLeft className="h-4 w-4" />{t('Refresh results')}</button></div>}
            </div>}
          </div>}
    </section>
  )
}
