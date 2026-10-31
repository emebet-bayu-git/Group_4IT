import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { readSessionToken } from '../pages/LoginPage.jsx'

const authConfig = () => ({ headers: { Authorization: `Bearer ${readSessionToken()}` } })

export default function GradeEntryView({ initialAssignmentId, readOnly = false }) {
  const [classes, setClasses] = useState([])
  const [selectedId, setSelectedId] = useState(initialAssignmentId ? String(initialAssignmentId) : '')
  const [period, setPeriod] = useState(null)
  const [classInfo, setClassInfo] = useState(null)
  const [students, setStudents] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    axios.get('/api/teacher/classes', authConfig()).then(({ data }) => {
      if (!active) return
      const available = data.classes || []
      setClasses(available)
      setPeriod(data.period)
      setSelectedId((current) => available.some((item) => String(item.id) === current)
        ? current
        : String(available[0]?.id || ''))
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || 'Unable to load assigned classes.')
    }).finally(() => {
      if (active) setLoadingClasses(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setStudents([])
      setClassInfo(null)
      setLoadingStudents(false)
      return undefined
    }
    let active = true
    setLoadingStudents(true)
    setError('')
    setNotice('')
    axios.get(`/api/teacher/classes/${selectedId}/grades`, authConfig()).then(({ data }) => {
      if (!active) return
      setClassInfo(data.class)
      setPeriod(data.period)
      setStudents(data.students.map((student) => ({
        ...student,
        assessment40: student.assessment40 ?? '',
        final60: student.final60 ?? '',
      })))
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || 'Unable to load students for this class.')
    }).finally(() => {
      if (active) setLoadingStudents(false)
    })
    return () => { active = false }
  }, [selectedId])

  const updateScore = (studentId, field, value) => {
    setStudents((current) => current.map((student) => (
      student.id === studentId ? { ...student, [field]: value } : student
    )))
  }

  const saveGrades = async (event) => {
    event.preventDefault()
    const grades = students.filter((student) => student.assessment40 !== '' && student.final60 !== '')
      .map((student) => ({ studentId: student.id, assessment40: Number(student.assessment40), final60: Number(student.final60) }))
    if (!grades.length) {
      setError('Enter both score components for at least one student before saving.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { data } = await axios.put(`/api/teacher/classes/${selectedId}/grades`, { grades }, authConfig())
      setNotice(`Saved scores for ${data.saved} students · ${data.semester}, ${data.academicYear}.`)
      const { data: refreshed } = await axios.get(`/api/teacher/classes/${selectedId}/grades`, authConfig())
      setStudents(refreshed.students.map((student) => ({
        ...student,
        assessment40: student.assessment40 ?? '',
        final60: student.final60 ?? '',
      })))
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to save these grades.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="grade-entry-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-primary-700">Teacher workspace</p><h1 id="grade-entry-heading" className="mt-1 text-2xl font-bold text-slate-900">{readOnly ? 'Student Roster' : 'Grade Entry'}</h1><p className="mt-1 text-sm text-slate-500">{period ? `${period.semester} · ${period.academicYear}` : 'No active academic semester'}</p></div>
        <label className="block min-w-56 text-sm font-medium text-slate-700">Assigned class
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loadingClasses || !classes.length} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
            {!classes.length && <option value="">No assigned classes</option>}
            {classes.map((item) => <option key={item.id} value={item.id}>{item.gradeLevel} · {item.sectionName} · {item.subject}</option>)}
          </select>
        </label>
      </header>
      {error && <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-success-200 bg-success-50 p-3 text-sm text-success-700">{notice}</p>}
      {classInfo && <p className="text-sm font-semibold text-slate-700">{classInfo.gradeLevel} · {classInfo.sectionName} · {classInfo.subject}</p>}
      {loadingClasses || loadingStudents ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading class roster…</p>
        : selectedId && !error ? <form onSubmit={saveGrades} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Class</th>{!readOnly && <><th className="px-4 py-3">Assessment / 40</th><th className="px-4 py-3">Final / 60</th><th className="px-4 py-3">Total / 100</th></>}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((student) => {
                const hasScores = student.assessment40 !== '' && student.final60 !== ''
                const total = hasScores ? (Number(student.assessment40) + Number(student.final60)).toFixed(2) : '—'
                return <tr key={student.id}>
                  <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{student.name}</span><span className="text-xs text-slate-500">ID {student.id}</span></td>
                  <td className="px-4 py-3">{student.gradeLevel} · {student.section}</td>
                  {!readOnly && <>
                    <td className="px-4 py-3"><input aria-label={`${student.name} assessment score out of 40`} type="number" min="0" max="40" step="0.01" value={student.assessment40} onChange={(event) => updateScore(student.id, 'assessment40', event.target.value)} className="h-9 w-28 rounded-md border border-slate-300 px-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></td>
                    <td className="px-4 py-3"><input aria-label={`${student.name} final exam score out of 60`} type="number" min="0" max="60" step="0.01" value={student.final60} onChange={(event) => updateScore(student.id, 'final60', event.target.value)} className="h-9 w-28 rounded-md border border-slate-300 px-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></td>
                    <td className="px-4 py-3 font-bold tabular-nums text-slate-900">{total}</td>
                  </>}
                </tr>
              })}
              {!students.length && <tr><td colSpan={readOnly ? 2 : 5} className="px-4 py-10 text-center text-slate-500">No active students are enrolled in this assigned class.</td></tr>}
            </tbody>
          </table></div>
          {!readOnly && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4"><p className="text-xs text-slate-500">{period ? 'Total updates as scores are entered. Rows need both scores to save.' : 'An active academic year and semester are required before grades can be saved.'}</p><button type="submit" disabled={saving || !students.length || !period} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Saving…' : 'Save grades'}</button></div>}
        </form> : !error && !loadingClasses && <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">No classes have been assigned to your account.</p>}
    </section>
  )
}