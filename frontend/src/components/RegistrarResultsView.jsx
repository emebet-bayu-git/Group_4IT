import React, { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { ArrowLeft, CheckCircle2, Printer } from 'lucide-react'
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
  const [printTarget, setPrintTarget] = useState('')
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
  useEffect(() => {
    if (!printTarget) return undefined
    const clearPrintTarget = () => setPrintTarget('')
    window.addEventListener('afterprint', clearPrintTarget)
    window.print()
    return () => window.removeEventListener('afterprint', clearPrintTarget)
  }, [printTarget])

  const publish = async () => {
    if (!details || details.submission.status !== 'approved' || !details.complete) return
    if (!window.confirm(t('Verify these approved results and permanently archive them? This calculates SGPA and CGPA.'))) return
    setBusy(true)
    try {
      await axios.post(`/api/registrar/section-results/${selectedId}/publish`, {}, authConfig())
      await loadSubmissions()
      await loadDetails(selectedId)
      toast.success(t('Section results archived and GPA calculated.'))
    } catch (requestError) {
      const message = requestError.response?.data?.message
        || (!requestError.response
          ? 'Could not reach the server while archiving results. Check your connection and try again.'
          : 'Unable to publish section results.')
      toast.error(t(message))
    } finally {
      setBusy(false)
    }
  }

  const selectedSubmission = submissions.find((submission) => String(submission.id) === selectedId)
  const printReports = details?.submission.status === 'published' ? details.students : []
  const printReport = (target) => setPrintTarget(target)

  return (
    <section className="registrar-results-workspace space-y-5" aria-labelledby="registrar-results-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Registrar workspace')}</p>
        <h1 id="registrar-results-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Submitted Section Results')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Review and verify homeroom submissions. Archive results after leadership approval to calculate SGPA and CGPA.')}</p>
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
                {details.submission.status === 'approved' && details.complete
                  ? <button type="button" disabled={busy} onClick={publish} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><CheckCircle2 className="h-4 w-4" />{busy ? t('Archiving…') : t('Verify & Archive Results')}</button>
                  : details.submission.status === 'approved' && !details.complete
                    ? <span className="rounded-full bg-warning-50 px-3 py-1 text-xs font-semibold text-warning-800">{t('Incomplete results cannot be archived until all subject grades are present.')}</span>
                  : details.submission.status === 'published'
                    ? <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700">{t('Archived')}</span><button type="button" onClick={() => printReport('all')} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-900"><Printer className="h-4 w-4" />{t('Print Official Grade Reports')}</button></div>
                    : <span className="rounded-full bg-warning-50 px-3 py-1 text-xs font-semibold text-warning-700">{t('Waiting for principal approval')}</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Student')}</th>{details.subjects.map((subject) => <th key={subject.assignmentId} className="px-4 py-3">{t(subject.subject)}</th>)}{details.submission.status === 'published' && <th className="px-4 py-3 text-right">{t('Actions')}</th>}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{details.students.map((student) => <tr key={student.id}>
                    <td className="px-4 py-3 font-semibold text-slate-900">{student.name}</td>
                    {student.results.map((result) => <td key={result.assignmentId} className="px-4 py-3 tabular-nums text-slate-700">
                      {result.total100 === null ? '—' : `${Number(result.total100).toFixed(2)} (${Number(result.assessment40).toFixed(2)} + ${Number(result.final60).toFixed(2)})`}
                    </td>)}
                    {details.submission.status === 'published' && <td className="px-4 py-3 text-right"><button type="button" onClick={() => printReport(String(student.id))} className="inline-flex items-center gap-1 rounded-md border border-primary-200 px-2 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50"><Printer className="h-3.5 w-3.5" />{t('Print')}</button></td>}
                  </tr>)}
                    {!details.students.length && <tr><td colSpan={Math.max(1, details.subjects.length + (details.submission.status === 'published' ? 2 : 1))} className="px-4 py-8 text-center text-slate-500">{t('No active students are enrolled in this section.')}</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 p-3"><button type="button" onClick={() => loadDetails(selectedId)} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-700"><ArrowLeft className="h-4 w-4" />{t('Refresh results')}</button></div>
            </div>}
          </div>}
      {details?.submission.status === 'published' && <div className="registrar-print-only">
        {printReports.map((student) => <article key={student.id} className={`registrar-grade-slip ${printTarget !== 'all' && printTarget !== String(student.id) ? 'registrar-grade-slip-excluded' : ''}`}>
          <header className="border-b-2 border-slate-900 pb-4 text-center">
            <p className="text-sm font-bold uppercase tracking-widest">Amhara Region Secondary School</p>
            <h1 className="mt-2 text-2xl font-bold uppercase">{t('Official Student Grade Report')}</h1>
            <p className="mt-1 text-sm">{t(student.academicYear)} · {t(student.semester)}</p>
          </header>
          <dl className="mt-5 grid grid-cols-2 border border-slate-500 text-sm sm:grid-cols-3">
            <div className="border-b border-r border-slate-400 p-3"><dt className="text-xs font-semibold uppercase">{t('Student name')}</dt><dd className="mt-1 font-bold">{student.name}</dd></div>
            <div className="border-b border-r border-slate-400 p-3"><dt className="text-xs font-semibold uppercase">{t('Student ID')}</dt><dd className="mt-1 font-bold">{student.studentNumber || student.id}</dd></div>
            <div className="border-b border-slate-400 p-3"><dt className="text-xs font-semibold uppercase">{t('Grade')}</dt><dd className="mt-1 font-bold">{t(student.gradeLevel)}</dd></div>
            <div className="border-r border-slate-400 p-3"><dt className="text-xs font-semibold uppercase">{t('Section')}</dt><dd className="mt-1 font-bold">{t(student.sectionName)}</dd></div>
            <div className="border-r border-slate-400 p-3"><dt className="text-xs font-semibold uppercase">{t('Academic Year')}</dt><dd className="mt-1 font-bold">{t(student.academicYear)}</dd></div>
            <div className="p-3"><dt className="text-xs font-semibold uppercase">{t('Semester')}</dt><dd className="mt-1 font-bold">{t(student.semester)}</dd></div>
          </dl>
          <table className="mt-5 w-full border-collapse border border-slate-500 text-sm">
            <thead><tr className="bg-slate-100">
              <th className="border border-slate-500 px-2 py-2 text-left">{t('Subject')}</th>
              <th className="border border-slate-500 px-2 py-2 text-right">{t('Assessment / 40')}</th>
              <th className="border border-slate-500 px-2 py-2 text-right">{t('Final / 60')}</th>
              <th className="border border-slate-500 px-2 py-2 text-right">{t('Total / 100')}</th>
              <th className="border border-slate-500 px-2 py-2 text-center">{t('Letter Grade')}</th>
            </tr></thead>
            <tbody>{student.results.map((result) => {
              const total = Number(result.total100)
              const letterGrade = total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F'
              return <tr key={result.assignmentId}>
                <td className="border border-slate-400 px-2 py-2">{t(result.subject)}</td>
                <td className="border border-slate-400 px-2 py-2 text-right">{Number(result.assessment40).toFixed(2)}</td>
                <td className="border border-slate-400 px-2 py-2 text-right">{Number(result.final60).toFixed(2)}</td>
                <td className="border border-slate-400 px-2 py-2 text-right font-bold">{total.toFixed(2)}</td>
                <td className="border border-slate-400 px-2 py-2 text-center font-bold">{letterGrade}</td>
              </tr>
            })}</tbody>
          </table>
          <div className="mt-4 flex justify-end gap-8 text-sm">
            <p>{t('Semester GPA (SGPA)')}: <strong>{Number(student.sgpa).toFixed(2)}</strong></p>
            <p>{t('Cumulative GPA (CGPA)')}: <strong>{Number(student.cgpa).toFixed(2)}</strong></p>
          </div>
          <footer className="mt-8 grid grid-cols-2 gap-6">
            <div className="flex min-h-32 flex-col items-center justify-center border border-dashed border-slate-500 p-3 text-center">
              {student.stampPath
                ? <img src={student.stampPath} alt={t('Official school stamp')} className="max-h-24 max-w-32 object-contain" />
                : <><p className="text-xs font-bold uppercase">{t('School Official Stamp / Seal')}</p><p className="mt-1 text-xs">{t('Official school seal')}</p></>}
            </div>
            <div className="flex items-center justify-center">
              {student.signaturePath && <img src={student.signaturePath} alt={t('Principal digital signature')} className="max-h-20 max-w-40 object-contain" />}
            </div>
            <div className="pt-8 text-center text-xs">
              <p className="border-t border-slate-700 pt-2 font-semibold">{[student.homeroomTeacherName, student.archivedByName].filter(Boolean).join(' / ') || '\u00a0'}</p>
              <p className="font-bold uppercase">{t('Homeroom Teacher / Registrar')}</p>
            </div>
            <div className="pt-8 text-center text-xs">
              <p className="border-t border-slate-700 pt-2 font-semibold">{student.principalName || '\u00a0'}</p>
              <p className="font-bold uppercase">{t('Academic Vice Principal / Principal')}</p>
            </div>
          </footer>
          <p className="mt-6 border-t border-slate-300 pt-2 text-center text-xs text-slate-600">
            {t('Leadership-approved on {approvedDate} and archived on {date}. Archived by {name}.', {
              approvedDate: student.approvedAt ? new Date(student.approvedAt).toLocaleString() : '—',
              date: student.archivedAt ? new Date(student.archivedAt).toLocaleString() : '—',
              name: student.archivedByName || t('Registrar'),
            })}
          </p>
          <p className="mt-1 text-center text-[10px] text-slate-500">{t('Letter-grade bands follow the published GPA scale: A 90+, B 80–89, C 70–79, D 60–69, F below 60.')}</p>
        </article>)}
      </div>}
    </section>
  )
}
