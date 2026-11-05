import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, Pencil, Search, SlidersHorizontal, Trash2 as Archive, Upload, UserPlus, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import StatusBadge from './ui/Badge.jsx'
import Modal from './ui/Modal.jsx'
import RegisterStudent from './RegisterStudent.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'
import { useAcademicContext } from '../contexts/AcademicContext.jsx'

const selectClass = 'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

function DetailsGroup({ title, items }) {
  const { t } = useTranslation()
  return (
    <section>
      <h3 className="mb-2 text-sm font-bold text-slate-800">{t(title)}</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        {items.map(([label, value]) => <div key={label} className="rounded-md bg-slate-50 p-2.5">
          <dt className="text-xs font-medium text-slate-500">{t(label)}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-800">{value ? t(String(value)) : '—'}</dd>
        </div>)}
      </dl>
    </section>
  )
}

export default function StudentList({ onRegisterStudent, onAction: onExternalAction, viewOnly = false }) {
  const { t } = useTranslation()
  const { period } = useAcademicContext()
  const canManageStudents = !viewOnly
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [detailStudent, setDetailStudent] = useState(null)
  const [editStudent, setEditStudent] = useState(null)
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
  const [bulkFile, setBulkFile] = useState(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkResults, setBulkResults] = useState(null)
  const [query, setQuery] = useState('')
  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 5
  const headers = { Authorization: `Bearer ${readSessionToken()}` }
  useEffect(() => {
    let active = true
    setLoading(true)
    axios.get('/api/students', {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    }).then(({ data }) => {
      if (active) setStudents((Array.isArray(data) ? data : []).map((student) => ({
        ...student,
        roll: String(student.id),
        section: student.section || '—',
        status: student.status || '',
        academicStatus: student.academicStatus || '',
        initials: String(student.name || '').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      })))
    }).catch((error) => {
      if (active) {
        setStudents([])
        toast.error(t(error.response?.data?.message || 'Student records could not be loaded. Retry the request.'))
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey])
  const filtered = useMemo(() => students.filter((student) => {
    const matchesQuery = `${student.name} ${student.roll}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (!className || student.className === className) && (!section || student.section === section) && (!gender || student.gender === gender) && (!status || student.status === status || student.academicStatus === status)
  }), [students, query, className, section, gender, status])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const sectionOptions = [...new Set((students || []).map((student) => student.section).filter((value) => value && value !== '—'))].sort()
  const resetPage = (setter) => (event) => { setter(event.target.value); setPage(1) }
  const loadStudent = async (id) => {
    const { data } = await axios.get(`/api/students/${id}`, { headers })
    return data
  }
  const handleAction = async (action, student) => {
    if (!canManageStudents && action !== 'View Profile') return
    if (action === 'View Profile') {
      setActionBusy(true)
      try {
        setDetailStudent(await loadStudent(student.id))
      } catch (error) {
        toast.error(t(error.response?.data?.message || 'Unable to load student details.'))
      } finally {
        setActionBusy(false)
      }
      return
    }
    if (action === 'Edit' && canManageStudents) {
      setActionBusy(true)
      try {
        setEditStudent(await loadStudent(student.id))
      } catch (error) {
        toast.error(t(error.response?.data?.message || 'Unable to load student for editing.'))
      } finally {
        setActionBusy(false)
      }
      return
    }
    if (action === 'Delete' && canManageStudents) {
      if (!window.confirm(t('Permanently delete {name}? This cannot be undone.', { name: student.name }))) return
      setActionBusy(true)
      try {
        await axios.delete(`/api/students/${student.id}`, { headers })
        toast.success(t('Student deleted successfully.'))
        setRefreshKey((current) => current + 1)
      } catch (error) {
        toast.error(t(error.response?.data?.message || 'Unable to delete student.'))
      } finally {
        setActionBusy(false)
      }
      return
    }
    onExternalAction?.(action, student)
  }
  const onAction = (action, student) => handleAction(action === 'Archive' ? 'Delete' : action, student)
  const saveStudentChanges = async (studentData) => {
    const formData = new FormData()
    Object.entries(studentData).forEach(([key, value]) => {
      if (key === 'photoFile') {
        if (value) formData.append('photo', value)
      } else if (key === 'parentPhoto') {
        if (value) formData.append('parent_photo', value)
      } else {
        formData.append(key, value ?? '')
      }
    })
    const { data } = await axios.put(`/api/students/${editStudent.id}`, formData, { headers })
    return data
  }
  const exportCsv = () => {
    const rows = [['Name', 'Student ID', 'Class', 'Section', 'Gender', 'Status'], ...filtered.map((student) => [student.name, student.roll, student.className, student.section, student.gender, student.status])]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = 'student-directory.csv'; link.click(); URL.revokeObjectURL(url)
  }
  const downloadTemplate = async () => {
    try {
      const { data } = await axios.get('/api/students/bulk-template', { headers, responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = 'student-registration-template.xlsx'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to download the Excel template.'))
    }
  }
  const uploadBulkStudents = async () => {
    if (!bulkFile) return
    setBulkUploading(true)
    setBulkResults(null)
    const formData = new FormData()
    formData.append('file', bulkFile)
    try {
      const { data } = await axios.post('/api/students/bulk-import', formData, { headers })
      setBulkResults(data)
      const message = t('Bulk import finished: {inserted} inserted, {skipped} skipped.', { inserted: data.inserted, skipped: data.skipped })
      if (data.skipped) toast.error(message)
      else toast.success(message)
      if (data.inserted) setRefreshKey((current) => current + 1)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Bulk import failed.'))
    } finally {
      setBulkUploading(false)
    }
  }
  const chooseBulkFile = (file) => {
    if (!file) return
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setBulkFile(null)
      toast.error(t('Choose an .xlsx or .csv file.'))
      return
    }
    setBulkFile(file)
    setBulkResults(null)
  }

  return (
    canManageStudents && editStudent ? <RegisterStudent
      key={editStudent.id}
      student={editStudent}
      onCancel={() => { setEditStudent(null); setRefreshKey((current) => current + 1) }}
      onComplete={saveStudentChanges}
    /> : canManageStudents && registrationOpen ? <RegisterStudent
      key="new-student"
      onCancel={() => setRegistrationOpen(false)}
      onComplete={async (studentData) => {
        const result = await onRegisterStudent(studentData)
        setRefreshKey((current) => current + 1)
        return result
      }}
      allowUnassigned
    /> : <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-primary-700">{t('Student records')}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{t('Student directory')}</h1><p className="mt-1 text-sm text-slate-500">{t('{count} students found', { count: filtered.length })}{period?.academicYear ? ` · ${period.academicYear}${period.semester ? ` · ${t(period.semester)}` : ''}` : ''}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />{t('Export CSV')}</Button>
          {canManageStudents && <Button variant="secondary" onClick={() => { setBulkUploadOpen(true); setBulkResults(null) }}><Upload className="h-4 w-4" />{t('Bulk Upload / Import Excel')}</Button>}
          {canManageStudents && onRegisterStudent && <Button onClick={() => setRegistrationOpen(true)}><UserPlus className="h-4 w-4" />{t('Register student')}</Button>}
        </div>
      </div>
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-panel"><div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(130px,auto))]"><label className="relative"><span className="sr-only">{t('Search students')}</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={resetPage(setQuery)} placeholder={t('Search name or Student ID')} className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></label><select aria-label={t('Filter by class')} value={className} onChange={resetPage(setClassName)} className={selectClass}><option value="">{t('All classes')}</option>{['Grade 9','Grade 10','Grade 11','Grade 12'].map((item) => <option key={item}>{t(item)}</option>)}</select><select aria-label={t('Filter by section')} value={section} onChange={resetPage(setSection)} className={selectClass}><option value="">{t('All sections')}</option>{sectionOptions.map((item) => <option key={item}>{t(item)}</option>)}</select><select aria-label={t('Filter by gender')} value={gender} onChange={resetPage(setGender)} className={selectClass}><option value="">{t('All genders')}</option><option value="Female">{t('Female')}</option><option value="Male">{t('Male')}</option></select><select aria-label={t('Filter by status')} value={status} onChange={resetPage(setStatus)} className={selectClass}><option value="">{t('All statuses')}</option><option value="Active">{t('Active')}</option><option value="Pending">{t('Pending')}</option><option value="Archived">{t('Archived')}</option></select></div></section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel"><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3 font-semibold">{t('Student')}</th><th className="px-4 py-3 font-semibold">{t('Student ID')}</th><th className="px-4 py-3 font-semibold">{t('Class')}</th><th className="px-4 py-3 font-semibold">{t('Gender')}</th><th className="px-4 py-3 font-semibold">{t('Status')}</th><th className="px-5 py-3 text-right font-semibold">{t('Actions')}</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500">{t('Loading student records…')}</td></tr> : visible.length ? visible.map((student) => <tr key={student.id} className="hover:bg-slate-25"><td className="px-5 py-4"><div className="flex items-center gap-3">{student.photoUrl ? <img src={student.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-800">{student.initials}</span>}<span className="font-semibold text-slate-900">{student.name}</span></div></td><td className="px-4 py-4 text-slate-600">{student.roll}</td><td className="px-4 py-4"><span className="font-medium text-slate-700">{t(student.className || '—')}</span><span className="text-slate-400"> · {t(student.section || '—')}</span></td><td className="px-4 py-4 text-slate-600">{student.gender ? t(student.gender) : '—'}</td><td className="px-4 py-4"><div className="flex flex-wrap items-center gap-1.5">{student.academicStatus && <StatusBadge status={student.academicStatus} />}<StatusBadge status={student.sectionId ? 'Assigned' : 'Unassigned'} />{student.sectionId && <span className="text-xs font-medium text-slate-600">{t(student.className || '')} · {t(student.section || '')}</span>}</div></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button onClick={() => onAction('View Profile', student)} disabled={actionBusy} className="rounded-md p-2 text-slate-500 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50" title={t('View profile')} aria-label={t('View {name}', { name: student.name })}><Eye className="h-4 w-4" /></button>{!viewOnly && <><button onClick={() => onAction('Edit', student)} disabled={actionBusy} className="rounded-md p-2 text-slate-500 hover:bg-warning-50 hover:text-warning-700 disabled:opacity-50" title={t('Edit student')} aria-label={t('Edit {name}', { name: student.name })}><Pencil className="h-4 w-4" /></button><button onClick={() => onAction('Archive', student)} disabled={actionBusy} className="rounded-md p-2 text-slate-500 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50" title={t('Delete student')} aria-label={t('Delete {name}', { name: student.name })}><Archive className="h-4 w-4" /></button></>}</div></td></tr>) : <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500"><SlidersHorizontal className="mx-auto mb-2 h-6 w-6 text-slate-300" />{t('No students match these filters.')}</td></tr>}</tbody></table></div><div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">{t('Showing {start}-{end} of {total}', { start: visible.length ? (page - 1) * pageSize + 1 : 0, end: Math.min(page * pageSize, filtered.length), total: filtered.length })}</p><div className="flex items-center gap-1"><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />{t('Previous')}</button>{Array.from({ length: pages }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} onClick={() => setPage(pageNumber)} className={`h-8 w-8 rounded-md text-xs font-semibold ${pageNumber === page ? 'bg-primary-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{pageNumber}</button>)}<button onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page === pages} className="flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-600 disabled:opacity-40">{t('Next')}<ChevronRight className="h-4 w-4" /></button></div></div></section>
      {canManageStudents && <Modal open={bulkUploadOpen} onClose={() => { if (!bulkUploading) setBulkUploadOpen(false) }} title={t('Bulk student upload')} description={t('Import student registrations from an Excel workbook or CSV file. New accounts receive temporary password 12345678 and must change it at first sign-in.')}>
        <div className="space-y-4">
          <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-800 underline underline-offset-2"><FileSpreadsheet className="h-4 w-4" />{t('Download Excel Template')}</button>
          <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseBulkFile(event.dataTransfer.files?.[0]) }} className="grid min-h-40 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-primary-500 hover:bg-primary-50">
            <span className="grid justify-items-center gap-2 text-sm text-slate-600"><Upload className="h-7 w-7 text-slate-400" /><span className="font-semibold">{t('Drop an .xlsx or .csv file here, or browse')}</span><span className="text-xs text-slate-500">{t('Maximum file size: 5 MB')}</span></span>
            <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(event) => chooseBulkFile(event.target.files?.[0])} />
          </label>
          {bulkFile && <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"><span className="truncate pr-3">{bulkFile.name}</span><button type="button" onClick={() => setBulkFile(null)} aria-label={t('Remove selected file')} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>}
          {bulkResults && <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">{t('{inserted} inserted · {skipped} skipped', { inserted: bulkResults.inserted, skipped: bulkResults.skipped })}</p>
            {bulkResults.results.filter((item) => item.status === 'skipped').map((item) => <p key={`${item.row}-${item.message}`} className="text-xs text-danger-700">{t('Row {row}: {message}', { row: item.row, message: item.message })}</p>)}
          </div>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" disabled={bulkUploading} onClick={() => setBulkUploadOpen(false)}>{t('Close')}</Button>
          <Button loading={bulkUploading} disabled={!bulkFile} onClick={uploadBulkStudents}><Upload className="h-4 w-4" />{t('Upload & Process')}</Button>
        </div>
      </Modal>}
      <Modal open={Boolean(detailStudent)} onClose={() => setDetailStudent(null)} title={t('Student details')} description={detailStudent ? `${detailStudent.fullName} · ${t('Student ID')} ${detailStudent.id}` : ''}>
        {detailStudent && <div className="max-h-[70vh] space-y-5 overflow-y-auto">
          <div className="flex items-center gap-4">{detailStudent.photoUrl && <img src={detailStudent.photoUrl} alt={t('Student')} className="h-16 w-16 rounded-full object-cover" />}<div><h3 className="font-semibold text-slate-900">{detailStudent.fullName}</h3><p className="text-sm text-slate-500">{detailStudent.grade} · {detailStudent.section} · {t(detailStudent.gender)}</p></div></div>
          <DetailsGroup title="Personal information" items={[
            ['Date of birth', detailStudent.dob], ['Previous school', detailStudent.previousSchool],
            ['Phone', detailStudent.phoneNumber], ['Email', detailStudent.email], ['Registration date', detailStudent.registrationDate],
          ]} />
          <DetailsGroup title="Address" items={[
            ['Region', detailStudent.region], ['Zone', detailStudent.zone], ['Woreda', detailStudent.woreda],
            ['Kebele', detailStudent.kebele], ['House number', detailStudent.houseNo], ['Address', detailStudent.address],
          ]} />
          <DetailsGroup title="Parent / guardian" items={[
            ['Name', detailStudent.guardianName], ['Relation', detailStudent.guardianRelation],
            ['Phone', detailStudent.guardianPhone], ['Email', detailStudent.guardianEmail],
          ]} />
          <DetailsGroup title="Emergency contact" items={[
            ['Name', detailStudent.emergencyContactName], ['Phone', detailStudent.emergencyContactPhone],
          ]} />
          {detailStudent.parentPhotoUrl && <div><p className="mb-2 text-sm font-semibold text-slate-700">{t('Parent/guardian photo')}</p><img src={detailStudent.parentPhotoUrl} alt={t('Parent or guardian')} className="h-32 w-32 rounded-md object-cover" /></div>}
        </div>}
      </Modal>
    </div>
  )
}
