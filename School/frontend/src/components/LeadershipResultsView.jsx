import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { CheckCircle2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const authConfig = () => ({ headers: { Authorization: 'Bearer ' + readSessionToken() } })

export default function LeadershipResultsView() {
  const { t } = useTranslation()
  const [submissions, setSubmissions] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [busy, setBusy] = useState(false)
  const requestId = useRef(0)

  const loadSubmissions = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/leadership/section-results', authConfig())
      const available = Array.isArray(data?.submissions) ? data.submissions : []
      setSubmissions(available)
      setSelectedId((current) => available.some((item) => String(item.id) === current)
        ? current : String(available[0]?.id || ''))
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to load submitted section results.'))
    } finally {
      setLoading(false)
    }
  }

  const loadDetails = async (id) => {
    const request = ++requestId.current
    if (!id) {
      setDetails(null)
      setLoadingDetails(false)
      return
    }
    setDetails(null)
    setLoadingDetails(true)
    try {
      const { data } = await axios.get(`/api/leadership/section-results/${id}`, authConfig())
      if (request === requestId.current) setDetails(data)
    } catch (error) {
      if (request === requestId.current) {
        setDetails(null)
        toast.error(t(error.response?.data?.message || 'Unable to load submitted section results.'))
      }
    } finally {
      if (request === requestId.current) setLoadingDetails(false)
    }
  }

  useEffect(() => { loadSubmissions() }, [])
  useEffect(() => { loadDetails(selectedId) }, [selectedId])

  const approve = async () => {
    if (!details || details.submission?.status !== 'submitted') return
    if (!window.confirm(t('Approve and lock these results with the official school stamp and principal signature?'))) return
    setBusy(true)
    try {
      await axios.post(`/api/leadership/section-results/${selectedId}/approve`, {}, authConfig())
      toast.success(t('Results approved, signed, stamped, and locked.'))
      await loadSubmissions()
      await loadDetails(selectedId)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to approve these results.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="leadership-results-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Principal workspace')}</p>
        <h1 id="leadership-results-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Review and approve class results')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Approved results are locked and receive the school stamp and principal signature.')}</p>
      </header>
      {loading ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading submitted results…')}</p>
        : !submissions.length ? <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('No section results have been submitted.')}</p>
          : <div className="grid gap-5 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)]">
            <div className="space-y-2">
              {submissions.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(String(item.id))} className={`w-full rounded-lg border p-4 text-left shadow-panel ${selectedId === String(item.id) ? 'border-primary-400 bg-primary-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <span className="flex items-start justify-between gap-2"><span className="font-bold text-slate-900">{t(item.gradeLevel)} · {t(item.sectionName)}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{t(item.status)}</span></span>
                <span className="mt-2 block text-xs text-slate-600">{t(item.semester)} · {item.academicYear}</span>
                <span className="mt-1 block text-xs text-slate-500">{t('Submitted by {name}', { name: item.submittedBy })}</span>
              </button>)}
            </div>
            {loadingDetails && <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading submitted marksheet…')}</p>}
            {details && <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
                <div><h2 className="font-bold text-slate-900">{t(details.submission.gradeLevel)} · {t(details.submission.sectionName)}</h2><p className="mt-1 text-xs text-slate-500">{t(details.submission.semester)} · {details.submission.academicYear} · {details.students?.length || 0} {t('students')}</p></div>
                {details.submission.status === 'submitted'
                  ? <button type="button" disabled={busy} onClick={approve} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{busy ? t('Approving…') : t('Approve & Stamp')}</button>
                  : <span className="rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700">{t(details.submission.status === 'published' ? 'Archived' : 'Approved and locked')}</span>}
              </div>
              {details.submission.status !== 'submitted' && <div className="flex items-center justify-center gap-5 border-b border-slate-200 p-3 text-center">
                {details.submission.stampPath && <img src={details.submission.stampPath} alt={t('Official school stamp')} className="h-16 max-w-32 object-contain" />}
                {details.submission.signaturePath && <img src={details.submission.signaturePath} alt={t('Principal digital signature')} className="h-12 max-w-40 object-contain" />}
                <span className="text-xs text-slate-600">{details.submission.principalName}</span>
              </div>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Student')}</th>{(details.subjects || []).map((subject) => <th key={subject.assignmentId} className="px-4 py-3">{t(subject.subject)}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{(details.students || []).map((student) => <tr key={student.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{student.name}</td>
                    {(student.results || []).map((result) => <td key={result.assignmentId} className="px-4 py-3 tabular-nums text-slate-700">
                      {result.total100 === null ? '—' : `${Number(result.total100).toFixed(2)} (${Number(result.assessment40).toFixed(2)} + ${Number(result.final60).toFixed(2)})`}
                    </td>)}
                  </tr>)}
                  {!details.students?.length && <tr><td colSpan={Math.max(1, (details.subjects?.length || 0) + 1)} className="px-4 py-8 text-center text-slate-500">{t('No active students are enrolled in this section.')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>}
          </div>}
    </section>
  )
}
