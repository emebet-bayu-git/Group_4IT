import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const blankYear = { name: '', startDate: '', endDate: '', isActive: false }
const blankTerm = { academicYearId: '', name: 'Semester 1', startDate: '', endDate: '', isActive: false }
const semesterNames = ['Semester 1', 'Semester 2']
let draftSequence = 0
const createDraftKey = () => `draft-${++draftSequence}`
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
      const loadedTerms = termResult.data.map((term) => ({ ...term, name: String(term.name || '').replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim(), academicYearId: String(term.academicYearId), startDate: dateInputValue(term.startDate), endDate: dateInputValue(term.endDate), isActive: Boolean(term.isCurrent ?? term.isActive) }))
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
    event?.preventDefault()
    const actionKey = `${resource}-${item.id || `new-${index}`}`
    setBusy(actionKey)
    try {
      const { draftKey, ...requestData } = item
      const { data: savedItem } = await request(item.id ? 'put' : 'post', `${resource}${item.id ? `/${item.id}` : ''}`, requestData)
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
        const draftYearId = item.draftKey ? `draft:${item.draftKey}` : ''
        const pendingTerms = draftYearId
          ? terms.filter((term) => !term.id && term.academicYearId === draftYearId)
          : []
        setYears((current) => {
          if (item.id) {
            return current.map((year) => year.id === normalizedItem.id
              ? normalizedItem
              : normalizedItem.isActive ? { ...year, isActive: false } : year)
          }
          const hasDraftYear = current.some((year) => year.draftKey === item.draftKey)
          const savedYear = { ...normalizedItem, draftKey: item.draftKey }
          if (!hasDraftYear) return [...current, savedYear]
          return current.map((year) => year.draftKey === item.draftKey
            ? savedYear
            : normalizedItem.isActive ? { ...year, isActive: false } : year)
        })
        if (draftYearId) {
          setTerms((current) => current.map((term) => (
            term.academicYearId === draftYearId
              ? { ...term, academicYearId: String(normalizedItem.id) }
              : term
          )))
        }
        setTerms((current) => current.map((term) => {
          const sameYear = term.academicYearId === String(normalizedItem.id)
            || Boolean(draftYearId && term.academicYearId === draftYearId)
          return normalizedItem.isActive
            ? sameYear ? term : { ...term, isActive: false }
            : sameYear ? { ...term, isActive: false } : term
        }))
        if (normalizedItem.id) {
          setEditingYears((current) => {
            const updated = new Set(current)
            updated.delete(normalizedItem.id)
            return updated
          })
        }
        let failedTerms = 0
        for (const term of pendingTerms) {
          const { draftKey: termDraftKey, ...termData } = term
          try {
            const { data } = await request('post', 'terms', {
              ...termData,
              academicYearId: String(normalizedItem.id),
            })
            const savedTerm = {
              ...data,
              academicYearId: String(data.academicYearId),
              startDate: dateInputValue(data.startDate),
              endDate: dateInputValue(data.endDate),
              isActive: Boolean(data.isActive),
            }
            setTerms((current) => current.map((currentTerm) => (
              currentTerm.draftKey === termDraftKey
                ? savedTerm
                : savedTerm.isActive ? { ...currentTerm, isActive: false } : currentTerm
            )))
          } catch (termError) {
            failedTerms += 1
            toast.error(t(termError.response?.data?.message || 'Academic year saved, but a semester could not be saved. Review its dates and try again.'))
          }
        }
        await onConfigurationChange?.()
        notifyAcademicContextChanged()
        toast.success(t('{label} saved successfully.', { label: t(label) }))
        if (failedTerms) toast.error(t('{count} semester(s) still need to be saved.', { count: failedTerms }))
        return
      } else {
        setTerms((current) => {
          if (item.id) {
            return current.map((term) => term.id === normalizedItem.id
              ? normalizedItem
              : normalizedItem.isActive ? { ...term, isActive: false } : term)
          }
          const hasDraft = current.some((term) => item.draftKey && term.draftKey === item.draftKey)
          const updated = current.map((term) => (
            item.draftKey && term.draftKey === item.draftKey
              ? normalizedItem
              : normalizedItem.isActive ? { ...term, isActive: false } : term
          ))
          return hasDraft ? updated : [...updated, normalizedItem]
        })
        if (normalizedItem.id) {
          setEditingTerms((current) => {
            const updated = new Set(current)
            updated.delete(normalizedItem.id)
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
      if (resource === 'years' && item.draftKey) {
        setTerms((current) => current.filter((term) => term.academicYearId !== `draft:${item.draftKey}`))
      }
      return
    }
    if (!window.confirm(t('Delete this {item}? This action cannot be undone.', { item: t(label.toLowerCase()) }))) return
    const actionKey = `${resource}-${item.id}`
    setBusy(actionKey)
    try {
      await request('delete', `${resource}/${item.id}`)
      if (resource === 'years') setYears((current) => current.filter((year) => year.id !== item.id))
      if (resource === 'years') {
        setTerms((current) => current.filter((term) => String(term.academicYearId) !== String(item.id)))
      }
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

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('School Admin workspace')}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{t('Academic Infrastructure')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Configure the academic calendar and the grade sections used by your school.')}</p>
      </header>
      {loading && <p role="status" className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">{t('Loading academic configuration…')}</p>}

      <section className="workspace-hover-card space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel" aria-labelledby="academic-years-heading">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="academic-years-heading" className="text-lg font-bold text-slate-900">{t('Academic Years')}</h2><p className="mt-1 text-sm text-slate-600">{t("Define school academic years and date ranges. Check 'Active' for the current operating year.")}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => setYears((current) => [...current, { ...blankYear, draftKey: createDraftKey() }])} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Plus className="h-4 w-4" />{t('Add year')}</button></div>
        {years.map((year, index) => {
          const isEditingYear = !year.id || editingYears.has(year.id)
          const yearTerms = terms.flatMap((term, termIndex) => (
            term.academicYearId === (year.id ? String(year.id) : `draft:${year.draftKey}`)
              ? [{ term, termIndex }]
              : []
          ))
          const availableSemesterName = semesterNames.find((name) => !yearTerms.some(({ term }) => term.name === name))
          return <article key={year.id || year.draftKey || `new-year-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{year.name || t('New academic year')}</h3>
                  {year.isActive && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{t('Active')}</span>}
                </div>
                {year.id && <p className="mt-1 text-sm text-slate-600">{year.startDate} – {year.endDate}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {year.id && <button type="button" disabled={Boolean(busy)} onClick={() => setEditingYears((current) => new Set(current).add(year.id))} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"><Pencil className="h-4 w-4" />{t('Edit Year')}</button>}
                <button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('years', index, year, 'Academic year')} title={t('Delete academic year')} aria-label={t('Delete academic year')} className="grid h-10 w-10 place-items-center rounded-md border border-danger-200 bg-white text-danger-700 hover:bg-danger-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                <button type="button" disabled={Boolean(busy) || !availableSemesterName} title={availableSemesterName ? undefined : t('All semester options are already used for this academic year.')} onClick={() => {
                  setTerms((current) => [...current, {
                    ...blankTerm,
                    name: availableSemesterName,
                    academicYearId: year.id ? String(year.id) : `draft:${year.draftKey}`,
                    draftKey: createDraftKey(),
                  }])
                }} className="inline-flex items-center gap-2 rounded-md border border-primary-700 bg-white px-3 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50"><Plus className="h-4 w-4" />{t('Add semester')}</button>
              </div>
            </header>

            {isEditingYear && <form onSubmit={(event) => saveRow(event, 'years', index, year, 'Academic year')} className="grid gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
              <AdminField label={t('Academic year name')} required pattern="\d{4}/\d{4}" placeholder={t('e.g. 2026/2027')} value={year.name} onChange={(event) => updateRow('years', index, 'name', event.target.value)} />
              <AdminField label={t('Start date')} required type="date" value={year.startDate} onChange={(event) => updateRow('years', index, 'startDate', event.target.value)} />
              <AdminField label={t('End date')} required type="date" value={year.endDate} onChange={(event) => updateRow('years', index, 'endDate', event.target.value)} />
              <label title={t('Only one academic year can be active at a time.')} className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={year.isActive} onChange={(event) => updateRow('years', index, 'isActive', event.target.checked)} />{t('Active')}</label>
              <button type="submit" disabled={Boolean(busy)} className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-primary-800 px-3 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" />{year.id ? t('Save changes') : t('Save')}</button>
            </form>}

            <section aria-label={t('Semesters for {year}', { year: year.name || t('New academic year') })} className="p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold text-slate-800">{t('Semesters')}</h4>
                {!year.id && <p className="text-sm text-slate-500">{t('New semesters will be saved when you save this academic year.')}</p>}
              </div>
              {yearTerms.length ? <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-3 py-2">{t('Semester name')}</th><th className="px-3 py-2">{t('Start date')}</th><th className="px-3 py-2">{t('End date')}</th><th className="px-3 py-2">{t('Current semester')}</th><th className="px-3 py-2">{t('Actions')}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {yearTerms.map(({ term, termIndex }) => {
                      const isNewYear = !year.id
                      const isDraftTerm = !term.id
                      const isEditingTerm = isDraftTerm || editingTerms.has(term.id)
                      const semesterOptions = semesterNames.filter((name) => name === term.name || !yearTerms.some(({ term: other }) => other !== term && other.name === name))
                      return <tr key={term.id || term.draftKey}>
                        {isEditingTerm ? <>
                          <td className="p-2"><select required aria-label={t('Semester name')} value={term.name} onChange={(event) => updateRow('terms', termIndex, 'name', event.target.value)} className={inputClass}><option value="">{t('Select a semester')}</option>{semesterOptions.map((name) => <option key={name} value={name}>{t(name)}</option>)}</select></td>
                          <td className="p-2"><input required aria-label={t('Start date')} type="date" value={term.startDate} onChange={(event) => updateRow('terms', termIndex, 'startDate', event.target.value)} className={inputClass} /></td>
                          <td className="p-2"><input required aria-label={t('End date')} type="date" value={term.endDate} onChange={(event) => updateRow('terms', termIndex, 'endDate', event.target.value)} className={inputClass} /></td>
                          <td className="p-2"><label className="inline-flex items-center gap-2"><input type="checkbox" disabled={isNewYear && !year.isActive} checked={term.isActive} onChange={(event) => updateRow('terms', termIndex, 'isActive', event.target.checked)} />{t('Current semester')}</label></td>
                          <td className="p-2"><div className="flex items-center gap-2">
                            {!isNewYear && <button type="button" disabled={Boolean(busy)} onClick={() => saveRow(null, 'terms', termIndex, term, 'Semester')} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary-800 px-3 text-sm font-semibold text-white hover:bg-primary-900 disabled:opacity-50"><Save className="h-4 w-4" />{t('Save Semester')}</button>}
                            <button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('terms', termIndex, term, 'Semester')} aria-label={t('Delete semester')} title={t('Delete semester')} className="grid h-9 w-9 place-items-center rounded-md border border-danger-200 text-danger-700 hover:bg-danger-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                          </div></td>
                        </> : <>
                          <td className="px-3 py-3 font-medium text-slate-800">{t(term.name)}</td>
                          <td className="px-3 py-3">{term.startDate}</td>
                          <td className="px-3 py-3">{term.endDate}</td>
                          <td className="px-3 py-3">{term.isActive ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{t('Current semester')}</span> : '—'}</td>
                          <td className="px-3 py-2"><div className="flex items-center gap-2">
                            <button type="button" disabled={Boolean(busy)} onClick={() => setEditingTerms((current) => new Set(current).add(term.id))} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Pencil className="h-4 w-4" />{t('Edit')}</button>
                            <button type="button" disabled={Boolean(busy)} onClick={() => deleteRow('terms', termIndex, term, 'Semester')} aria-label={t('Delete semester')} title={t('Delete semester')} className="grid h-9 w-9 place-items-center rounded-md border border-danger-200 text-danger-700 hover:bg-danger-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                          </div></td>
                        </>}
                      </tr>
                    })}
                  </tbody>
                </table>
              </div> : <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">{t('No semesters in this academic year yet.')}</p>}
            </section>
          </article>
        })}
        {!years.length && !loading && <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">{t('No academic years yet. Add a year to begin setting up the school calendar.')}</p>}
      </section>
    </div>
  )
}