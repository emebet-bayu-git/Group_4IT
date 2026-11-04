import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const authConfig = () => ({ headers: { Authorization: `Bearer ${readSessionToken()}` } })

export default function GradeEntryView({ initialAssignmentId, readOnly = false }) {
  const { t } = useTranslation()
  const [classes, setClasses] = useState([])
  const [selectedId, setSelectedId] = useState(initialAssignmentId ? String(initialAssignmentId) : '')
  const [period, setPeriod] = useState(null)
  const [classInfo, setClassInfo] = useState(null)
  const [students, setStudents] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rowBusy, setRowBusy] = useState('')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    axios.get('/api/teacher/classes', authConfig()).then(({ data }) => {
      if (!active) return
      const available = Array.isArray(data?.classes) ? data.classes : []
      setClasses(available)
      setPeriod(data?.period ?? null)
      setLoadError(false)
      setSelectedId((current) => available.some((item) => String(item.id) === current)
        ? current
        : String(available[0]?.id || ''))
    }).catch((requestError) => {
      if (active) {
        setLoadError(true)
        toast.error(t(requestError.response?.data?.message || 'Unable to load assigned classes.'))
      }
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
    setLoadError(false)
    setLoadingStudents(true)
    axios.get(`/api/teacher/classes/${selectedId}/grades`, authConfig()).then(({ data }) => {
      if (!active) return
      setClassInfo(data?.class ?? null)
      setPeriod(data?.period ?? null)
      setStudents((Array.isArray(data?.students) ? data.students : []).map((student) => ({
        ...student,
        assessment40: student.assessment40 ?? '',
        final60: student.final60 ?? '',
      })))
    }).catch((requestError) => {
      if (active) {
        setLoadError(true)
        setStudents([])
        toast.error(t(requestError.response?.data?.message || 'Unable to load students for this class.'))
      }
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

  const saveStudentGrade = async (student) => {
    if (student.assessment40 === '' || student.final60 === '') {
      toast.error(t('Enter both score components before updating this result.'))
      return
    }
    setRowBusy(String(student.id))
    try {
      const { data } = await axios.put(`/api/teacher/classes/${selectedId}/grades`, {
        grades: [{
          studentId: student.id,
          assessment40: Number(student.assessment40),
          final60: Number(student.final60),
        }],
      }, authConfig())
      const { data: refreshed } = await axios.get(`/api/teacher/classes/${selectedId}/grades`, authConfig())
      setStudents((Array.isArray(refreshed?.students) ? refreshed.students : []).map((row) => ({
        ...row,
        assessment40: row.assessment40 ?? '',
        final60: row.final60 ?? '',
      })))
      toast.success(t("{name}'s result updated · {semester}, {year}.", { name: student.name, semester: data.semester, year: data.academicYear }))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || `Unable to update ${student.name}'s result.`))
    } finally {
      setRowBusy('')
    }
  }

  const deleteStudentGrade = async (student) => {
    if (!window.confirm(t("Delete {name}'s result for this class and semester?", { name: student.name }))) return
    setRowBusy(String(student.id))
    try {
      await axios.delete(`/api/teacher/classes/${selectedId}/grades/${student.id}`, authConfig())
      const { data } = await axios.get(`/api/teacher/classes/${selectedId}/grades`, authConfig())
      setStudents((Array.isArray(data?.students) ? data.students : []).map((row) => ({
        ...row,
        assessment40: row.assessment40 ?? '',
        final60: row.final60 ?? '',
      })))
      toast.success(t("{name}'s result deleted.", { name: student.name }))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || `Unable to delete ${student.name}'s result.`))
    } finally {
      setRowBusy('')
    }
  }

  const saveGrades = async (event) => {
    event.preventDefault()
    const grades = students.filter((student) => student.assessment40 !== '' && student.final60 !== '')
      .map((student) => ({ studentId: student.id, assessment40: Number(student.assessment40), final60: Number(student.final60) }))
    if (!grades.length) {
      toast.error(t('Enter both score components for at least one student before saving.'))
      return
    }
    setSaving(true)
    try {
      const { data } = await axios.put(`/api/teacher/classes/${selectedId}/grades`, { grades }, authConfig())
      toast.success(t('Saved scores for {count} students · {semester}, {year}.', { count: data.saved, semester: data.semester, year: data.academicYear }))
      const { data: refreshed } = await axios.get(`/api/teacher/classes/${selectedId}/grades`, authConfig())
      setStudents((Array.isArray(refreshed?.students) ? refreshed.students : []).map((student) => ({
        ...student,
        assessment40: student.assessment40 ?? '',
        final60: student.final60 ?? '',
      })))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to save these grades.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="grade-entry-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-primary-700">{t('Teacher workspace')}</p><h1 id="grade-entry-heading" className="mt-1 text-2xl font-bold text-slate-900">{t(readOnly ? 'Student Roster' : 'Grade Entry')}</h1><p className="mt-1 text-sm text-slate-500">{period ? `${t(period.semester)} · ${period.academicYear}` : t('No active academic semester')}</p></div>
        <label className="block min-w-56 text-sm font-medium text-slate-700">{t('Assigned class')}
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loadingClasses || !classes.length || saving || Boolean(rowBusy)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100">
            {!classes.length && <option value="">{t('No assigned classes')}</option>}
            {classes?.map((item) => <option key={item.id} value={item.id}>{t(item.gradeLevel)} · {t(item.sectionName)} · {t(item.subject)}</option>)}
          </select>
        </label>
      </header>
      {classInfo && <p className="text-sm font-semibold text-slate-700">{t(classInfo.gradeLevel)} · {t(classInfo.sectionName)} · {t(classInfo.subject)}</p>}
      {classInfo?.locked && <p role="status" className="rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">{t('These results have been submitted to the Registrar and are locked.')}</p>}
      {loadingClasses || loadingStudents ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading class roster…')}</p>
        : selectedId && !loadError ? <form onSubmit={saveGrades} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Student')}</th><th className="px-4 py-3">{t('Class')}</th>{!readOnly && <><th className="px-4 py-3">{t('Assessment / 40')}</th><th className="px-4 py-3">{t('Final / 60')}</th><th className="px-4 py-3">{t('Total / 100')}</th><th className="px-4 py-3 text-right">{t('Actions')}</th></>}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {students?.map((student) => {
                const hasScores = student.assessment40 !== '' && student.final60 !== ''
                const total = hasScores ? (Number(student.assessment40) + Number(student.final60)).toFixed(2) : '—'
                return <tr key={student.id}>
                  <td className="px-4 py-3"><span className="block font-semibold text-slate-900">{student.name}</span><span className="text-xs text-slate-500">{t('ID {id}', { id: student.id })}</span></td>
                  <td className="px-4 py-3">{student.gradeLevel} · {student.section}</td>
                  {!readOnly && <>
                    <td className="px-4 py-3"><input aria-label={`${student.name} assessment score out of 40`} type="number" min="0" max="40" step="0.01" value={student.assessment40} disabled={classInfo?.locked || saving || Boolean(rowBusy)} onChange={(event) => updateScore(student.id, 'assessment40', event.target.value)} className="h-9 w-28 rounded-md border border-slate-300 px-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-100" /></td>
                    <td className="px-4 py-3"><input aria-label={`${student.name} final exam score out of 60`} type="number" min="0" max="60" step="0.01" value={student.final60} disabled={classInfo?.locked || saving || Boolean(rowBusy)} onChange={(event) => updateScore(student.id, 'final60', event.target.value)} className="h-9 w-28 rounded-md border border-slate-300 px-2 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-slate-100" /></td>
                    <td className="px-4 py-3 font-bold tabular-nums text-slate-900">{total}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      <button type="button" disabled={classInfo?.locked || saving || Boolean(rowBusy) || !period} onClick={() => saveStudentGrade(student)} title={t('Update result')} aria-label={t("Update {name}'s result", { name: student.name })} className="inline-flex items-center gap-1 rounded-md border border-primary-200 px-2 py-1.5 text-xs font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"><Pencil className="h-4 w-4" /><span>{t('Update')}</span></button>
                      <button type="button" disabled={classInfo?.locked || saving || Boolean(rowBusy) || !hasScores || !period} onClick={() => deleteStudentGrade(student)} title={t('Delete result')} aria-label={t("Delete {name}'s result", { name: student.name })} className="rounded-md p-2 text-slate-500 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                    </div></td>
                  </>}
                </tr>
              })}
              {!students?.length && <tr><td colSpan={readOnly ? 2 : 6} className="px-4 py-10 text-center text-slate-500">{t('No active students are enrolled in this assigned class.')}</td></tr>}
            </tbody>
          </table></div>
          {!readOnly && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4"><p className="text-xs text-slate-500">{t(period ? 'Total updates as scores are entered. Rows need both scores to save.' : 'An active academic year and semester are required before grades can be saved.')}</p><button type="submit" disabled={classInfo?.locked || saving || Boolean(rowBusy) || !students.length || !period} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? t('Saving…') : t('Save grades')}</button></div>}
        </form> : !loadError && !loadingClasses && <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('No classes have been assigned to your account.')}</p>}
    </section>
  )
}