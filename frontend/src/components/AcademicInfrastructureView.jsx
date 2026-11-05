import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const blankYear = { name: '', startDate: '', endDate: '', isActive: false }
const blankTerm = { academicYearId: '', name: '', startDate: '', endDate: '', isActive: false }
const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

const notifyAcademicContextChanged = () => {
  window.dispatchEvent(new CustomEvent('academic-context-changed'))
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel('academic-context')
    channel.postMessage({ type: 'refresh' })
    channel.close()
  }
}

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
      const [yearResult, termResult] = await Promise.all([
        request('get', 'years'),
        request('get', 'terms'),
      ])
      const loadedYears = yearResult.data.map((year) => ({ ...year, startDate: dateInputValue(year.startDate), endDate: dateInputValue(year.endDate), isActive: Boolean(year.isActive) }))
      const loadedTerms = termResult.data.map((term) => ({ ...term, name: String(term.name || '').replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim(), academicYearId: String(term.academicYearId), startDate: dateInputValue(term.startDate), endDate: dateInputValue(term.endDate), isActive: Boolean(term.isActive) }))
      setYears(loadedYears)
      setTerms(loadedTerms)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to load academic configuration.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  const setRows = (resource, update) => {
    const setters = { years: setYears, terms: setTerms }
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
      const { data: savedItem } = await request(item.id ? 'put' : 'post', `${resource}${item.id ? `/${item.id}` : ''}`, item)
      const normalizedItem = {
        ...savedItem,
        startDate: dateInputValue(savedItem.startDate),
        endDate: dateInputValue(savedItem.endDate),
        isActive: Boolean(savedItem.isActive),
        ...(resource === 'terms' ? {
          academicYearId: String(savedItem.academicYearId),
          name: String(savedItem.name || '').replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim(),
        } : {}),
      }
      if (resource === 'years') {
        setYears((current) => {
          if (item.id) {
            return current.map((year) => year.id === normalizedItem.id
              ? normalizedItem
              : normalizedItem.isActive ? { ...year, isActive: false } : year)
          }
          return [...current, normalizedItem]
        })
        if (item.id) {
          setEditingYears((current) => {
            const updated = new Set(current)
            updated.delete(item.id)
            return updated
          })
        }
      } else {
        setTerms((current) => {
          if (item.id) {
            return current.map((term) => term.id === normalizedItem.id
              ? normalizedItem
              : normalizedItem.isActive ? { ...term, isActive: false } : term)
          }
          return [...current, normalizedItem]
        })
        if (item.id) {
          setEditingTerms((current) => {
            const updated = new Set(current)
            updated.delete(item.id)
            return updated
          })
        }
      }
      await onConfigurationChange?.()
      notifyAcademicContextChanged()
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
      if (resource === 'years') setYears((current) => current.filter((year) => year.id !== item.id))
      if (resource === 'terms') setTerms((current) => current.filter((term) => term.id !== item.id))
      await onConfigurationChange?.()
      notifyAcademicContextChanged()
      toast.success(t('{label} deleted successfully.', { label: t(label) }))
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to delete {label}.', { label: t(label) }))
    } finally {
      setBusy('')
    }
  }

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
    </div>
  )
}