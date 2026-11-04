import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const authConfig = () => ({ headers: { Authorization: 'Bearer ' + readSessionToken() } })

export default function SectionAllocationView() {
  const { t } = useTranslation()
  const [grade, setGrade] = useState(grades[0])
  const [capacity, setCapacity] = useState('40')
  const [sortBy, setSortBy] = useState('alphabetical')
  const [sections, setSections] = useState([])
  const [students, setStudents] = useState([])
  const [gradeCounts, setGradeCounts] = useState([])
  const [academicYear, setAcademicYear] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [targetSection, setTargetSection] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/registrar/section-allocation', {
        ...authConfig(),
        params: { grade },
      })
      const availableSections = Array.isArray(data?.sections) ? data.sections : []
      setSections(availableSections)
      setStudents(Array.isArray(data?.students) ? data.students : [])
      setGradeCounts(Array.isArray(data?.gradeCounts) ? data.gradeCounts : [])
      setAcademicYear(data?.academicYear || '')
      setSelectedIds([])
      setTargetSection((current) => availableSections.some((item) => String(item.id) === current)
        ? current : String(availableSections[0]?.id || ''))
    } catch (error) {
      setSections([])
      setStudents([])
      setGradeCounts([])
      setAcademicYear('')
      toast.error(t(error.response?.data?.message || 'Unable to load section allocation data.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [grade])

  const selectedCount = selectedIds.length
  const capacityValue = Number(capacity)
  const validCapacity = Number.isInteger(capacityValue) && capacityValue >= 1 && capacityValue <= 200
  const toggleStudent = (studentId) => setSelectedIds((current) => current.includes(studentId)
    ? current.filter((id) => id !== studentId) : [...current, studentId])
  const toggleAll = () => setSelectedIds((current) => current.length === students.length
    ? [] : students.map((student) => student.id))

  const allocate = async (mode) => {
    setBusy(true)
    try {
      const payload = {
        mode,
        grade,
        capacity: Number(capacity),
        sortBy,
        ...(mode === 'manual' ? { sectionId: Number(targetSection), studentIds: selectedIds } : {}),
      }
      const { data } = await axios.post('/api/registrar/assign-sections', payload, authConfig())
      toast.success(t('Assigned {count} students to sections.', { count: data.assigned }))
      await load()
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to assign students to sections.'))
    } finally {
      setBusy(false)
    }
  }

  const target = sections.find((section) => String(section.id) === targetSection)

  return (
    <section className="space-y-5" aria-labelledby="section-allocation-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Registrar workspace')}</p>
        <h1 id="section-allocation-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Student Section Allocation')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Review unassigned student totals by grade and distribute them into sections.')}</p>
        <p className="mt-1 text-sm font-semibold text-primary-800">{t('Active academic year')}: {academicYear || t('Not configured')}</p>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-panel sm:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">{t('Grade level')}
          <select value={grade} onChange={(event) => setGrade(event.target.value)} disabled={busy} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3">
            {grades.map((item) => <option key={item} value={item}>{t(item)}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">{t('Maximum students per section')}
          <input type="number" min="1" max="200" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3" />
        </label>
        <label className="text-sm font-medium text-slate-700">{t('Automatic allocation order')}
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} disabled={busy} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3">
            <option value="alphabetical">{t('Alphabetical name')}</option>
            <option value="studentId">{t('Student ID')}</option>
            <option value="gender">{t('Balance by gender')}</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('Unassigned student counts by grade')}>
        {grades.map((gradeLevel) => {
          const count = gradeCounts.find((item) => item.gradeLevel === gradeLevel)?.studentCount || 0
          return <button key={gradeLevel} type="button" onClick={() => setGrade(gradeLevel)} disabled={busy} aria-pressed={grade === gradeLevel} className={`rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${grade === gradeLevel ? 'border-primary-400 bg-primary-50' : 'border-slate-200 bg-white hover:border-primary-200'}`}>
            <span className="block text-sm font-semibold text-slate-700">{t(gradeLevel)}</span>
            <span className="mt-1 block text-2xl font-bold text-slate-900">{loading ? '—' : count}</span>
            <span className="text-xs text-slate-500">{t('unassigned students')}</span>
          </button>
        })}
      </div>

      {sections.length > 0 && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((section) => <div key={section.id} className="rounded-md border border-slate-200 bg-white p-3">
          <p className="font-semibold text-slate-900">{t(section.gradeLevel)} · {t(section.sectionName)}</p>
          <p className="mt-1 text-xs text-slate-500">{t('{count} of {capacity} students', { count: section.studentCount, capacity: Number(capacity) })}</p>
        </div>)}
      </div>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div><h2 className="font-bold text-slate-900">{t('Distribute Students')}</h2><p className="mt-1 text-xs text-slate-500">{t('{count} confirmed students are awaiting section assignment in {grade}.', { count: students.length, grade: t(grade) })}</p></div>
          <Button disabled={busy || loading || !students.length || !validCapacity} loading={busy} onClick={() => allocate('batch')}>{t('Auto-Allocate')}</Button>
        </div>
        {loading ? <p role="status" className="p-5 text-sm text-slate-500">{t('Loading students…')}</p>
          : !students.length ? <p className="p-5 text-sm text-slate-600">{t('There are no unassigned students in this grade.')}</p>
            : <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="w-12 px-4 py-3"><input type="checkbox" checked={selectedIds.length === students.length} onChange={toggleAll} aria-label={t('Select all students')} /></th><th className="px-4 py-3">{t('Student name')}</th><th className="px-4 py-3">{t('Student ID')}</th><th className="px-4 py-3">{t('Gender')}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{students.map((student) => <tr key={student.id}>
                    <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleStudent(student.id)} aria-label={t('Select {name}', { name: student.name })} /></td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{student.name}</td>
                    <td className="px-4 py-3 text-slate-600">{student.userId}</td>
                    <td className="px-4 py-3 text-slate-600">{student.gender ? t(student.gender) : '—'}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
        {!loading && !sections.length && students.length > 0 && <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{t('Sections will be created automatically based on the capacity you set.')}</p>}
        {!loading && students.length > 0 && sections.length > 0 && <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-4">
          <label className="min-w-52 text-sm font-medium text-slate-700">{t('Assign selected students to')}
            <select value={targetSection} onChange={(event) => setTargetSection(event.target.value)} disabled={busy} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3">
              {sections.map((section) => {
                const seats = Math.max(0, (Number.isFinite(capacityValue) ? capacityValue : 0) - section.studentCount)
                return <option key={section.id} value={section.id} disabled={!seats}>{t(section.sectionName)} · {seats} {t('seats available')}</option>
              })}
            </select>
          </label>
          <Button variant="secondary" disabled={busy || !selectedCount || !target || !validCapacity || target.studentCount + selectedCount > capacityValue} loading={busy} onClick={() => allocate('manual')}>{t('Assign selected ({count})', { count: selectedCount })}</Button>
        </div>}
      </div>
    </section>
  )
}
