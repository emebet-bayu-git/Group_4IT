import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const blankYear = { name: '', startDate: '', endDate: '', isActive: false }
const blankTerm = { academicYearId: '', name: '', startDate: '', endDate: '', isActive: false }
const blankSection = { gradeLevel: 'Grade 9', sectionName: '', isActive: true }
const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

function dateInputValue(value) {
  if (!value) return ''
  return typeof value === 'string' ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10)
}

function AdminField({ label, ...props }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input {...props} className={inputClass} /></label>
}

export default function AcademicInfrastructureView({ onConfigurationChange }) {
  const { t } = useTranslation()
  const [years, setYears] = useState([])
  const [terms, setTerms] = useState([])
  const [sections, setSections] = useState([])
  const [teachers, setTeachers] = useState([])
  const [advisorSelections, setAdvisorSelections] = useState({})
  const [sectionDrafts, setSectionDrafts] = useState([{ ...blankSection }])
  const [editingYears, setEditingYears] = useState(new Set())
  const [editingTerms, setEditingTerms] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  const request = (method, url, data) => axios({
    method,
    url: `/api/academic/${url}`,
    data,
    headers: { Authorization: `Bearer ${readSessionToken()}` },
  })

  const load = async () => {
    setLoading(true)
    try {
      const [yearResult, termResult, sectionResult, teacherResult] = await Promise.all([
        request('get', 'years'),
        request('get', 'terms'),
        request('get', 'sections'),
        request('get', 'teachers'),
      ])
      const loadedYears = yearResult.data.map((year) => ({ ...year, startDate: dateInputValue(year.startDate), endDate: dateInputValue(year.endDate), isActive: Boolean(year.isActive) }))
      const loadedTerms = termResult.data.map((term) => ({ ...term, name: String(term.name || '').replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim(), academicYearId: String(term.academicYearId), startDate: dateInputValue(term.startDate), endDate: dateInputValue(term.endDate), isActive: Boolean(term.isActive) }))
      const currentYear = loadedYears.find((year) => year.isActive)
      const currentSemester = loadedTerms.find((semester) => semester.isActive
        && String(semester.academicYearId) === String(currentYear?.id))
      setYears(loadedYears)
      setTerms(loadedTerms)
      setSections(sectionResult.data.filter((section) => (
        currentYear && currentSemester
        && String(section.academicYearId) === String(currentYear.id)
        && String(section.semesterId) === String(currentSemester.id)
      )).map((section) => ({
        ...section,
        isActive: Boolean(section.isActive),
      })))
      setTeachers(teacherResult.data)
      setAdvisorSelections({})
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to load academic configuration.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  const setRows = (resource, update) => {
    const setters = { years: setYears, terms: setTerms, sections: setSectionDrafts }
    setters[resource](update)
  }

  const updateRow = (resource, index, key, value) => {
    setRows(resource, (current) => current.map((item, rowIndex) => (
      rowIndex === index ? { ...item, [key]: value } : item
    )))
  }

  const saveRow = async (event, resource, index, item, label) => {
    event.preventDefault()
    const actionKey = `${resource}-${item.id || `new-${index}`}`
    setBusy(actionKey)
    try {
      const payload = resource === 'sections' ? { ...item, isActive: true } : item
      const { data: savedItem } = await request(item.id ? 'put' : 'post', `${resource}${item.id ? `/${item.id}` : ''}`, payload)
      if (resource === 'sections') {
        await load()
        setSectionDrafts((current) => current.map((draft, rowIndex) => (
          rowIndex === index ? { ...blankSection, gradeLevel: item.gradeLevel } : draft
        )))
      } else {
        await load()
        if (resource === 'years' && item.id) {
          setEditingYears((current) => {
            const updated = new Set(current)
            updated.delete(item.id)
            return updated
          })
        }
        if (resource === 'terms' && item.id) {
          setEditingTerms((current) => {
            const updated = new Set(current)
            updated.delete(item.id)
            return updated
          })
        }
      }
      await onConfigurationChange?.()
      toast.success(t('{label} saved successfully.', { label: t(label) }))
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to save {label}.', { label: t(label) }))
    } finally {
      setBusy('')
    }
  }

  const deleteRow = async (resource, index, item, label) => {
    if (!item.id) {
      setRows(resource, (current) => current.filter((_, rowIndex) => rowIndex !== index))
      return
    }
    if (!window.confirm(t('Delete this {item}? This action cannot be undone.', { item: t(label.toLowerCase()) }))) return
    const actionKey = `${resource}-${item.id}`
    setBusy(actionKey)
    try {
      await request('delete', `${resource}/${item.id}`)
      await load()
      await onConfigurationChange?.()
      toast.success(t('{label} deleted successfully.', { label: t(label) }))
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to delete {label}.', { label: t(label) }))
    } finally {
      setBusy('')
    }
  }

  const saveAdvisor = async (section) => {
    setBusy(`advisor-${section.id}`)
    try {
      const teacherId = advisorSelections[section.id] ?? section.homeroomTeacherId ?? ''
      await request('put', `sections/${section.id}/advisor`, { teacherId: teacherId || null })
      await load()
      await onConfigurationChange?.()
      toast.success(t('Homeroom teacher assignment saved.'))
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to save homeroom teacher assignment.'))
    } finally {
      setBusy('')
    }
  }

  const activeYear = years.find((year) => year.isActive)
  const activeSemester = terms.find((semester) => semester.isActive
    && String(semester.academicYearId) === String(activeYear?.id))
  const canAssignSection = Boolean(activeYear && activeSemester)
  const addSection = () => setSectionDrafts((current) => [...current, { ...blankSection }])
  const isCalendarRowLocked = (item, editingRows) => Boolean(item.id && item.isActive && !editingRows.has(item.id))
  const unlockCalendarRow = (setter, id) => setter((current) => new Set(current).add(id))

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('School Admin workspace')}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{t('Academic Infrastructure')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Configure the academic calendar and the grade sections used by your school.')}</p>
      </header>
      {loading && <p role="status" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">{t('Loading academic configuration…')}</p>}

      <section className="workspace-hover-card space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="academic-years-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="academic-years-heading" className="text-lg font-bold text-slate-900">{t('Academic Years')}</h2><p className="mt-1 text-sm text-slate-600">{t("Define school academic years and date ranges. Check 'Active' for the current operating year.")}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => setYears((current) => [...current, { ...blankYear }])} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />{t('Add year')}</button></div>
        {years.map((year, index) => {
          const locked = isCalendarRowLocked(year, editingYears)
          return <form key={year.id || `new-year-${index}`} onSubmit={(event) => saveRow(event, 'years', index, year, 'Academic year')} className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <AdminField label={t('Academic year name')} disabled={locked} required pattern="\d{4}/\d{4}" placeholder={t('e.g. 2026/2027')} value={year.name} onChange={(event) => updateRow('years', index, 'name', event.target.value)} />
          <AdminField label={t('Start date')} disabled={locked} required type="date" value={year.startDate} onChange={(event) => updateRow('years', index, 'startDate', event.target.value)} />
          <AdminField label={t('End date')} disabled={locked} required type="date" value={year.endDate} onChange={(event) => updateRow('years', index, 'endDate', event.target.value)} />
          <label title={t('Only one academic year can be active at a time.')} className={`flex items-center gap-2 self-end pb-2 text-sm font-medium ${locked ? 'text-slate-400' : 'text-slate-700'}`}><input type="checkbox" disabled={locked} checked={year.isActive} onChange={(event) => updateRow('years', index, 'isActive', event.target.checked)} />{t('Active')}</label>
          <div className="flex items-end gap-2">{locked ? <button type="button" disabled={Boolean(busy)} onClick={() => unlockCalendarRow(setEditingYears, year.id)} className="inline-flex h-10 items-center gap-2 rounded-md border border-primary-700 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"><Pencil className="h-4 w-4" />{t('Update')}</button> : <button type="submit" disabled={Boolean(busy)} title={t(year.id ? 'Save academic year changes' : 'Save academic year')} aria-label={t(year.id ? 'Save academic year changes' : 'Save academic year')} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-800 px-3 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" />{year.id ? t('Save changes') : t('Save')}</button>}<button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('years', index, year, 'Academic year')} title={t('Delete academic year')} aria-label={t('Delete academic year')} className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>
        </form>
        })}
        {!years.length && !loading && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t('No academic years yet. Add a year to begin setting up the school calendar.')}</p>}
      </section>

      <section className="workspace-hover-card space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="semesters-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="semesters-heading" className="text-lg font-bold text-slate-900">{t('Semesters')}</h2><p className="mt-1 text-sm text-slate-600">{t('Divide the academic year into semesters (e.g., Semester 1, Semester 2) and specify their schedules.')}</p></div><button type="button" disabled={Boolean(busy) || !years.length} onClick={() => setTerms((current) => [...current, { ...blankTerm, academicYearId: String(years[0]?.id || '') }])} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />{t('Add semester')}</button></div>
        {terms.map((term, index) => {
          const locked = isCalendarRowLocked(term, editingTerms)
          return <form key={term.id || `new-semester-${index}`} onSubmit={(event) => saveRow(event, 'terms', index, term, 'Semester')} className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <label className="block text-sm font-medium text-slate-700">{t('Academic year')}<select required disabled={locked} value={term.academicYearId} onChange={(event) => updateRow('terms', index, 'academicYearId', event.target.value)} className={inputClass}><option value="">{t('Select academic year')}</option>{years.map((year) => <option key={year.id || `draft-${year.name}`} value={year.id || ''}>{year.name || t('Unsaved year')}</option>)}</select></label>
          <AdminField label={t('Semester name')} disabled={locked} required maxLength={40} placeholder={t('e.g. Semester 1')} value={term.name} onChange={(event) => updateRow('terms', index, 'name', event.target.value)} />
          <AdminField label={t('Start date')} disabled={locked} required type="date" value={term.startDate} onChange={(event) => updateRow('terms', index, 'startDate', event.target.value)} />
          <AdminField label={t('End date')} disabled={locked} required type="date" value={term.endDate} onChange={(event) => updateRow('terms', index, 'endDate', event.target.value)} />
          <label title={t('The current semester is displayed in teacher workspaces and used when saving grades.')} className={`flex items-center gap-2 self-end pb-2 text-sm font-medium ${locked ? 'text-slate-400' : 'text-slate-700'}`}><input type="checkbox" disabled={locked} checked={term.isActive} onChange={(event) => updateRow('terms', index, 'isActive', event.target.checked)} />{t('Current semester')}</label>
          <div className="flex items-end gap-2">{locked ? <button type="button" disabled={Boolean(busy)} onClick={() => unlockCalendarRow(setEditingTerms, term.id)} className="inline-flex h-10 items-center gap-2 rounded-md border border-primary-700 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"><Pencil className="h-4 w-4" />{t('Update')}</button> : <button type="submit" disabled={Boolean(busy)} title={t(term.id ? 'Save semester changes' : 'Save semester')} aria-label={t(term.id ? 'Save semester changes' : 'Save semester')} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-800 px-3 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" />{term.id ? t('Save changes') : t('Save')}</button>}<button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('terms', index, term, 'Semester')} title={t('Delete semester')} aria-label={t('Delete semester')} className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>
        </form>
        })}
        {!terms.length && !loading && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t('No semesters yet. Add an academic year before creating its semesters.')}</p>}
      </section>

      <section className="workspace-hover-card space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="grade-sections-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="grade-sections-heading" className="text-lg font-bold text-slate-900">{t('Grade Levels & Sections (Grades 9–12)')}</h2><p className="mt-1 text-sm text-slate-600">{t('Manage grade levels (9, 10, 11, 12) and their corresponding section streams (e.g., Section A, B, C).')}</p><p className="mt-2 text-sm font-semibold text-primary-800">{canAssignSection ? t('New sections will be linked to {year} · {semester}.', { year: activeYear.name, semester: activeSemester.name }) : t('New sections are automatically linked to the active academic year and semester.')}</p></div><button type="button" disabled={Boolean(busy)} onClick={addSection} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />{t('Add grade section')}</button></div>
        {!canAssignSection && !loading && <p id="active-period-warning" role="alert" className="rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">{t('To enable Save, go to Academic Years above and check “Active” for the current year, then go to Semesters and check “Current semester.” New sections will be linked to those selections automatically.')}</p>}
        {sections.filter((section) => section.id).length > 0 && <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Grade')}</th><th className="px-4 py-3">{t('Section')}</th><th className="px-4 py-3">{t('Homeroom teacher')}</th><th className="px-4 py-3">{t('Status')}</th><th className="px-4 py-3 text-right">{t('Actions')}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{sections.map((section, index) => <tr key={`summary-${section.id}`}>
              <td className="px-4 py-3 font-semibold text-slate-800">{t(section.gradeLevel)}</td>
              <td className="px-4 py-3">{t(section.sectionName)}</td>
              <td className="px-4 py-3"><select aria-label={t('Homeroom teacher for {section}', { section: `${t(section.gradeLevel)} ${t(section.sectionName)}` })} value={advisorSelections[section.id] ?? section.homeroomTeacherId ?? ''} onChange={(event) => setAdvisorSelections((current) => ({ ...current, [section.id]: event.target.value }))} className={inputClass}><option value="">{t('Not assigned')}</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></td>
              <td className="px-4 py-3"><span className={section.isActive ? 'font-medium text-success-700' : 'font-medium text-slate-500'}>{t(section.isActive ? 'Active' : 'Inactive')}</span></td>
              <td className="px-4 py-3"><div className="flex justify-end gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => saveAdvisor(section)} className="rounded-md border border-primary-700 px-3 py-1.5 text-xs font-semibold text-primary-800 disabled:opacity-50">{t('Save advisor')}</button><button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('sections', index, section, 'Grade section')} title={t('Delete grade section')} aria-label={t('Delete {grade} {section}', { grade: t(section.gradeLevel), section: section.sectionName })} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {sectionDrafts.map((section, index) => <form key={`section-draft-${index}`} onSubmit={(event) => saveRow(event, 'sections', index, section, 'Grade section')} className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="block text-sm font-medium text-slate-700">{t('Grade')}<select value={section.gradeLevel} onChange={(event) => updateRow('sections', index, 'gradeLevel', event.target.value)} className={inputClass}>{grades.map((grade) => <option key={grade}>{t(grade)}</option>)}</select></label>
          <AdminField label={t('Section name')} required maxLength={30} pattern="[A-Za-z0-9 -]+" placeholder={t('e.g. Section A')} value={section.sectionName} onChange={(event) => updateRow('sections', index, 'sectionName', event.target.value)} />
          <div className="flex items-end gap-2"><button type="submit" disabled={Boolean(busy) || !canAssignSection} title={t(canAssignSection ? 'Save grade section' : 'Set an active year and semester above to enable Save')} aria-label={t('Save grade section')} aria-describedby={!canAssignSection && !loading ? 'active-period-warning' : undefined} className="grid h-10 w-10 place-items-center rounded-md bg-primary-800 text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" /></button><button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('sections', index, section, 'Grade section')} title={t('Remove section row')} aria-label={t('Remove unsaved section row')} className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>
        </form>)}
        {!sections.length && !loading && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t('No grade sections yet for this active semester. Add the sections your students and teachers will use.')}</p>}
      </section>
    </div>
  )
}