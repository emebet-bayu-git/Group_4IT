import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const authConfig = () => ({ headers: { Authorization: `Bearer ${readSessionToken()}` } })

export default function RegistrarResultsView() {
  const { t } = useTranslation()
  const [submissions, setSubmissions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const detailsRequestId = useRef(0)

  const loadSubmissions = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/registrar/section-results', authConfig())
      const available = data.submissions || []
      setSubmissions(available)
      setSelectedId((current) => available.some((submission) => String(submission.id) === current)
        ? current
        : String(available[0]?.id || ''))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to load submitted section results.'))
    } finally {
      setLoading(false)
    }
  }

  const loadDetails = async (id) => {
    const requestId = ++detailsRequestId.current
    if (!id) {
      setDetails(null)
      setLoadingDetails(false)
      return
    }
    setDetails(null)
    setLoadingDetails(true)
    try {
      const { data } = await axios.get(`/api/registrar/section-results/${id}`, authConfig())
      if (requestId === detailsRequestId.current) setDetails(data)
    } catch (requestError) {
      if (requestId === detailsRequestId.current) {
        setDetails(null)
        toast.error(t(requestError.response?.data?.message || 'Unable to load the submitted marksheet.'))
      }
    } finally {
      if (requestId === detailsRequestId.current) setLoadingDetails(false)
    }
  }

  useEffect(() => { loadSubmissions() }, [])
  useEffect(() => { loadDetails(selectedId) }, [selectedId])

  const publish = async () => {
    if (!details || details.submission.status !== 'approved') return
    if (!window.confirm(t('Permanently archive these approved results and calculate SGPA and CGPA?'))) return
    setBusy(true)
    try {
      await axios.post(`/api/registrar/section-results/${selectedId}/publish`, {}, authConfig())
      await loadSubmissions()
      await loadDetails(selectedId)
      toast.success(t('Section results archived and GPA calculated.'))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to publish section results.'))
    } finally {
      setBusy(false)
    }
  }

  const selectedSubmission = submissions.find((submission) => String(submission.id) === selectedId)

  return (
    <section className="space-y-5" aria-labelledby="registrar-results-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Registrar workspace')}</p>
        <h1 id="registrar-results-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Submitted Section Results')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('After principal approval, permanently archive section marksheets to calculate SGPA and CGPA.')}</p>
        <p className="mt-1 text-xs text-slate-500">{t('GPA scale: 90+ = 4.0, 80–89 = 3.0, 70–79 = 2.0, 60–69 = 1.0, below 60 = 0.0; subjects are equally weighted.')}</p>
      </header>
      {loading ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading submitted results…')}</p>
        : !submissions.length ? <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('No section results have been submitted.')}</p>
          : <div className="grid gap-5 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
            <div className="space-y-2">
              {submissions.map((submission) => <button key={submission.id} type="button" onClick={() => setSelectedId(String(submission.id))} className={`w-full rounded-lg border p-4 text-left shadow-panel ${selectedId === String(submission.id) ? 'border-primary-400 bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="flex items-start justify-between gap-2"><span className="font-bold text-slate-900">{t(submission.gradeLevel)} · {t(submission.sectionName)}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${submission.status === 'published' ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>{t(submission.status === 'published' ? 'Archived' : submission.status === 'approved' ? 'Approved' : 'Awaiting principal approval')}</span></span>
                <span className="mt-2 block text-xs text-slate-600">{t(submission.semester)} · {submission.academicYear}</span>
                <span className="mt-1 block text-xs text-slate-500">{t('Submitted by {name}', { name: submission.submittedBy })}</span>
              </button>)}
            </div>
            {loadingDetails && <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading submitted marksheet…')}</p>}
            {details && <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
                <div><h2 className="font-bold text-slate-900">{selectedSubmission ? `${t(selectedSubmission.gradeLevel)} · ${t(selectedSubmission.sectionName)}` : ''}</h2><p className="mt-1 text-xs text-slate-500">{t(details.submission.semester)} · {details.submission.academicYear} · {details.students.length} {t('students')}</p></div>
                {details.submission.status === 'approved'
                  ? <button type="button" disabled={busy} onClick={publish} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{busy ? t('Archiving…') : t('Permanently archive & calculate GPA')}</button>
                  : <span className={`rounded-full px-3 py-1 text-xs font-semibold ${details.submission.status === 'published' ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>{t(details.submission.status === 'published' ? 'Archived' : 'Waiting for principal approval')}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Student')}</th>{details.subjects.map((subject) => <th key={subject.assignmentId} className="px-4 py-3">{t(subject.subject)}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{details.students.map((student) => <tr key={student.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{student.name}</td>
                    {student.results.map((result) => <td key={result.assignmentId} className="px-4 py-3 tabular-nums text-slate-700">
                      {result.total100 === null ? '—' : `${Number(result.total100).toFixed(2)} (${Number(result.assessment40).toFixed(2)} + ${Number(result.final60).toFixed(2)})`}
                    </td>)}
                  </tr>)}
                    {!details.students.length && <tr><td colSpan={Math.max(1, details.subjects.length + 1)} className="px-4 py-8 text-center text-slate-500">{t('No active students are enrolled in this section.')}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 p-3"><button type="button" onClick={() => loadDetails(selectedId)} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><ArrowLeft className="h-4 w-4" />{t('Refresh results')}</button></div>
            </div>}
          </div>}
    </section>
  )
}
