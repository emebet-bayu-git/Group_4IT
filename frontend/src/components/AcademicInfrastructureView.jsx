import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { readSessionToken } from '../pages/LoginPage.jsx'

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
  const [years, setYears] = useState([])
  const [terms, setTerms] = useState([])
  const [sections, setSections] = useState([])
  const [sectionDrafts, setSectionDrafts] = useState([{ ...blankSection }])
  const [editingYears, setEditingYears] = useState(new Set())
  const [editingTerms, setEditingTerms] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState(null)

  const request = (method, url, data) => axios({
    method,
    url: `/api/academic/${url}`,
    data,
    headers: { Authorization: `Bearer ${readSessionToken()}` },
  })

  const load = async () => {
    setLoading(true)
    try {
      const [yearResult, termResult, sectionResult] = await Promise.all([
        request('get', 'years'),
        request('get', 'terms'),
        request('get', 'sections'),
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
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.message || 'Unable to load academic configuration.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

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
      setToast({ type: 'success', message: `${label} saved successfully.` })
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.message || `Unable to save ${label.toLowerCase()}.` })
    } finally {
      setBusy('')
    }
  }

  const deleteRow = async (resource, index, item, label) => {
    if (!item.id) {
      setRows(resource, (current) => current.filter((_, rowIndex) => rowIndex !== index))
      return
    }
    if (!window.confirm(`Delete this ${label.toLowerCase()}? This action cannot be undone.`)) return
    const actionKey = `${resource}-${item.id}`
    setBusy(actionKey)
    try {
      await request('delete', `${resource}/${item.id}`)
      await load()
      await onConfigurationChange?.()
      setToast({ type: 'success', message: `${label} deleted successfully.` })
    } catch (error) {
      setToast({ type: 'error', message: error.response?.data?.message || `Unable to delete ${label.toLowerCase()}.` })
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
        <p className="text-sm font-semibold text-primary-700">School Admin workspace</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Academic Infrastructure</h1>
        <p className="mt-1 text-sm text-slate-500">Configure the academic calendar and the grade sections used by your school.</p>
      </header>
      {toast && <div role={toast.type === 'error' ? 'alert' : 'status'} className={`fixed right-4 top-20 z-[60] max-w-sm rounded-md border p-4 text-sm shadow-lg ${toast.type === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'}`}>{toast.message}</div>}
      {loading && <p role="status" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading academic configuration…</p>}

      <section className="workspace-hover-card space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="academic-years-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="academic-years-heading" className="text-lg font-bold text-slate-900">Academic Years</h2><p className="mt-1 text-sm text-slate-600">Define school academic years and date ranges. Check 'Active' for the current operating year.</p></div><button type="button" disabled={Boolean(busy)} onClick={() => setYears((current) => [...current, { ...blankYear }])} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />Add year</button></div>
        {years.map((year, index) => {
          const locked = isCalendarRowLocked(year, editingYears)
          return <form key={year.id || `new-year-${index}`} onSubmit={(event) => saveRow(event, 'years', index, year, 'Academic year')} className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <AdminField label="Academic year name" disabled={locked} required pattern="\d{4}/\d{4}" placeholder="e.g. 2026/2027" value={year.name} onChange={(event) => updateRow('years', index, 'name', event.target.value)} />
          <AdminField label="Start date" disabled={locked} required type="date" value={year.startDate} onChange={(event) => updateRow('years', index, 'startDate', event.target.value)} />
          <AdminField label="End date" disabled={locked} required type="date" value={year.endDate} onChange={(event) => updateRow('years', index, 'endDate', event.target.value)} />
          <label title="Only one academic year can be active at a time." className={`flex items-center gap-2 self-end pb-2 text-sm font-medium ${locked ? 'text-slate-400' : 'text-slate-700'}`}><input type="checkbox" disabled={locked} checked={year.isActive} onChange={(event) => updateRow('years', index, 'isActive', event.target.checked)} />Active</label>
          <div className="flex items-end gap-2">{locked ? <button type="button" disabled={Boolean(busy)} onClick={() => unlockCalendarRow(setEditingYears, year.id)} className="inline-flex h-10 items-center gap-2 rounded-md border border-primary-700 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"><Pencil className="h-4 w-4" />Update</button> : <button type="submit" disabled={Boolean(busy)} title={year.id ? 'Save academic year changes' : 'Save academic year'} aria-label={year.id ? 'Save academic year changes' : 'Save academic year'} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-800 px-3 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" />{year.id ? 'Save changes' : 'Save'}</button>}<button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('years', index, year, 'Academic year')} title="Delete academic year" aria-label="Delete academic year" className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>
        </form>
        })}
        {!years.length && !loading && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No academic years yet. Add a year to begin setting up the school calendar.</p>}
      </section>

      <section className="workspace-hover-card space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="semesters-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="semesters-heading" className="text-lg font-bold text-slate-900">Semesters</h2><p className="mt-1 text-sm text-slate-600">Divide the academic year into semesters (e.g., Semester 1, Semester 2) and specify their schedules.</p></div><button type="button" disabled={Boolean(busy) || !years.length} onClick={() => setTerms((current) => [...current, { ...blankTerm, academicYearId: String(years[0]?.id || '') }])} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />Add semester</button></div>
        {terms.map((term, index) => {
          const locked = isCalendarRowLocked(term, editingTerms)
          return <form key={term.id || `new-semester-${index}`} onSubmit={(event) => saveRow(event, 'terms', index, term, 'Semester')} className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <label className="block text-sm font-medium text-slate-700">Academic year<select required disabled={locked} value={term.academicYearId} onChange={(event) => updateRow('terms', index, 'academicYearId', event.target.value)} className={inputClass}><option value="">Select academic year</option>{years.map((year) => <option key={year.id || `draft-${year.name}`} value={year.id || ''}>{year.name || 'Unsaved year'}</option>)}</select></label>
          <AdminField label="Semester name" disabled={locked} required maxLength={40} placeholder="e.g. Semester 1" value={term.name} onChange={(event) => updateRow('terms', index, 'name', event.target.value)} />
          <AdminField label="Start date" disabled={locked} required type="date" value={term.startDate} onChange={(event) => updateRow('terms', index, 'startDate', event.target.value)} />
          <AdminField label="End date" disabled={locked} required type="date" value={term.endDate} onChange={(event) => updateRow('terms', index, 'endDate', event.target.value)} />
          <label title="The current semester is displayed in teacher workspaces and used when saving grades." className={`flex items-center gap-2 self-end pb-2 text-sm font-medium ${locked ? 'text-slate-400' : 'text-slate-700'}`}><input type="checkbox" disabled={locked} checked={term.isActive} onChange={(event) => updateRow('terms', index, 'isActive', event.target.checked)} />Current semester</label>
          <div className="flex items-end gap-2">{locked ? <button type="button" disabled={Boolean(busy)} onClick={() => unlockCalendarRow(setEditingTerms, term.id)} className="inline-flex h-10 items-center gap-2 rounded-md border border-primary-700 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"><Pencil className="h-4 w-4" />Update</button> : <button type="submit" disabled={Boolean(busy)} title={term.id ? 'Save semester changes' : 'Save semester'} aria-label={term.id ? 'Save semester changes' : 'Save semester'} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-800 px-3 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" />{term.id ? 'Save changes' : 'Save'}</button>}<button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('terms', index, term, 'Semester')} title="Delete semester" aria-label="Delete semester" className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>
        </form>
        })}
        {!terms.length && !loading && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No semesters yet. Add an academic year before creating its semesters.</p>}
      </section>

      <section className="workspace-hover-card space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="grade-sections-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="grade-sections-heading" className="text-lg font-bold text-slate-900">Grade Levels &amp; Sections (Grades 9–12)</h2><p className="mt-1 text-sm text-slate-600">Manage grade levels (9, 10, 11, 12) and their corresponding section streams (e.g., Section A, B, C).</p><p className="mt-2 text-sm font-semibold text-primary-800">{canAssignSection ? `New sections will be linked to ${activeYear.name} · ${activeSemester.name}.` : 'New sections are automatically linked to the active academic year and semester.'}</p></div><button type="button" disabled={Boolean(busy)} onClick={addSection} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />Add grade section</button></div>
        {!canAssignSection && !loading && <p id="active-period-warning" role="alert" className="rounded-md border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800">To enable Save, go to Academic Years above and check “Active” for the current year, then go to Semesters and check “Current semester.” New sections will be linked to those selections automatically.</p>}
        {sections.filter((section) => section.id).length > 0 && <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Section</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{sections.map((section, index) => <tr key={`summary-${section.id}`}>
              <td className="px-4 py-3 font-semibold text-slate-800">{section.gradeLevel}</td>
              <td className="px-4 py-3">{section.sectionName}</td>
              <td className="px-4 py-3"><span className={section.isActive ? 'font-medium text-success-700' : 'font-medium text-slate-500'}>{section.isActive ? 'Active' : 'Inactive'}</span></td>
              <td className="px-4 py-3 text-right"><button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('sections', index, section, 'Grade section')} title="Delete grade section" aria-label={`Delete ${section.gradeLevel} ${section.sectionName}`} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {sectionDrafts.map((section, index) => <form key={`section-draft-${index}`} onSubmit={(event) => saveRow(event, 'sections', index, section, 'Grade section')} className="grid gap-3 rounded-md bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="block text-sm font-medium text-slate-700">Grade<select value={section.gradeLevel} onChange={(event) => updateRow('sections', index, 'gradeLevel', event.target.value)} className={inputClass}>{grades.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
          <AdminField label="Section name" required maxLength={30} pattern="[A-Za-z0-9 -]+" placeholder="e.g. Section A" value={section.sectionName} onChange={(event) => updateRow('sections', index, 'sectionName', event.target.value)} />
          <div className="flex items-end gap-2"><button type="submit" disabled={Boolean(busy) || !canAssignSection} title={canAssignSection ? 'Save grade section' : 'Set an active year and semester above to enable Save'} aria-label="Save grade section" aria-describedby={!canAssignSection && !loading ? 'active-period-warning' : undefined} className="grid h-10 w-10 place-items-center rounded-md bg-primary-800 text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" /></button><button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('sections', index, section, 'Grade section')} title="Remove section row" aria-label="Remove unsaved section row" className="grid h-10 w-10 place-items-center rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-50"><Trash2 className="h-4 w-4" /></button></div>
        </form>)}
        {!sections.length && !loading && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No grade sections yet for this active semester. Add the sections your students and teachers will use.</p>}
      </section>
    </div>
  )
}