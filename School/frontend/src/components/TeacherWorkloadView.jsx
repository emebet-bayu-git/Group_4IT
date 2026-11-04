import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
const authConfig = () => ({ headers: { Authorization: `Bearer ${readSessionToken()}` } })

export default function TeacherWorkloadView() {
  const { t } = useTranslation()
  const [teachers, setTeachers] = useState([])
  const [sections, setSections] = useState([])
  const [teacherId, setTeacherId] = useState('')
  const [assignments, setAssignments] = useState([])
  const [homeroomSectionId, setHomeroomSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async (selectedTeacherId = teacherId) => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/vice-principal/workload', {
        ...authConfig(),
        params: selectedTeacherId ? { teacherId: selectedTeacherId } : {},
      })
      setTeachers(Array.isArray(data?.teachers) ? data.teachers : [])
      setSections(Array.isArray(data?.sections) ? data.sections : [])
      setAssignments(Array.isArray(data?.assignments)
        ? data.assignments.map((item) => ({ sectionId: String(item.sectionId), subject: item.subject || '' }))
        : [])
      setHomeroomSectionId(data?.homeroomSectionId ? String(data.homeroomSectionId) : '')
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to load teacher workloads.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load('') }, [])

  const selectTeacher = (value) => {
    setTeacherId(value)
    if (value) load(value)
    else {
      setAssignments([])
      setHomeroomSectionId('')
    }
  }

  const updateAssignment = (index, key, value) => {
    setAssignments((current) => current.map((item, itemIndex) => (
      index === itemIndex ? { ...item, [key]: value } : item
    )))
  }

  const save = async (event) => {
    event.preventDefault()
    if (!teacherId) return
    setBusy(true)
    try {
      await axios.put(`/api/vice-principal/workload/${teacherId}`, {
        assignments: assignments.map(({ sectionId, subject }) => ({ sectionId, subject })),
        homeroomSectionId: homeroomSectionId || null,
      }, authConfig())
      toast.success(t('Teacher workload and homeroom assignment saved.'))
      await load(teacherId)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to save teacher workload.'))
    } finally {
      setBusy(false)
    }
  }

  const selectedTeacher = teachers.find((teacher) => String(teacher.id) === teacherId)

  return (
    <section className="space-y-5" aria-labelledby="teacher-workload-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Vice Principal workspace')}</p>
        <h1 id="teacher-workload-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Teacher Workload & Section Assignment')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Assign subjects across multiple sections independently from the optional single-section homeroom advisor role.')}</p>
      </header>
      {loading && !teachers.length
        ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading teachers and sections…')}</p>
        : <form onSubmit={save} className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <label className="block max-w-xl text-sm font-medium text-slate-700">{t('Teacher')}
            <select required value={teacherId} onChange={(event) => selectTeacher(event.target.value)} className={inputClass}>
              <option value="">{t('Select a teacher')}</option>
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}{teacher.woredaEmployeeId ? ` · ${teacher.woredaEmployeeId}` : ''}</option>)}
            </select>
          </label>
          {selectedTeacher && <p className="text-sm text-slate-600">{selectedTeacher.specialization || t('No specialization recorded')}{selectedTeacher.qualificationDegree ? ` · ${selectedTeacher.qualificationDegree}` : ''}</p>}
          <fieldset disabled={!teacherId || busy} className="space-y-3">
            <legend className="text-sm font-semibold text-slate-800">{t('Subject Assignments')}</legend>
            {assignments.map((assignment, index) => <div key={index} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className="block text-sm font-medium text-slate-700">{t('Grade and section')}
                <select required value={assignment.sectionId} onChange={(event) => updateAssignment(index, 'sectionId', event.target.value)} className={inputClass}>
                  <option value="">{t('Select a class section')}</option>
                  {sections.map((section) => <option key={section.id} value={section.id}>{t(section.gradeLevel)} · {t(section.sectionName)}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">{t('Subject')}
                <input required maxLength={100} value={assignment.subject} onChange={(event) => updateAssignment(index, 'subject', event.target.value)} className={inputClass} placeholder={t('e.g. Physics')} />
              </label>
              <button type="button" onClick={() => setAssignments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={t('Remove subject assignment')} className="self-end rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-white"><Trash2 className="h-5 w-5" /></button>
            </div>)}
            <button type="button" disabled={!sections.length} onClick={() => setAssignments((current) => [...current, { sectionId: '', subject: '' }])} className="inline-flex items-center gap-2 rounded-md border border-primary-700 px-3 py-2 text-sm font-semibold text-primary-800 disabled:opacity-50"><Plus className="h-4 w-4" />{t('Add subject and section')}</button>
            {!sections.length && <p className="text-sm text-amber-700">{t('No active sections are configured for the current academic period.')}</p>}
          </fieldset>
          <label className="block max-w-xl text-sm font-medium text-slate-700">{t('Homeroom Advisor (optional; one section only)')}
            <select disabled={!teacherId || busy} value={homeroomSectionId} onChange={(event) => setHomeroomSectionId(event.target.value)} className={inputClass}>
              <option value="">{t('No homeroom advisor assignment')}</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{t(section.gradeLevel)} · {t(section.sectionName)}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!teacherId || busy || loading} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{busy ? t('Saving…') : t('Save Workload')}</button>
        </form>}
    </section>
  )
}
