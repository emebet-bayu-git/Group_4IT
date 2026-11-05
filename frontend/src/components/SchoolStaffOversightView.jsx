import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Eye, Pencil, Search, Trash2, UserRound } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const emptyStaff = { id: null, name: '', email: '', role: 'Teacher', department: '', subjects: '', isActive: true }
const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
const staffRoles = [
  { value: 'Teacher', label: 'Teacher' },
  { value: 'Registrar', label: 'Registrar' },
  { value: 'Headmaster', label: 'Principal (እርዕሰ መምህር)' },
  { value: 'Vice Principal', label: 'Vice Principal (ምክትል እርዕሰ መምህር)' },
  { value: 'Supervisor', label: 'Supervisor' },
]
const roleLabel = (role, t) => t(role)

function StaffField({ label, ...props }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input {...props} className={inputClass} /></label>
}

function Detail({ label, value }) {
  return <div className="rounded-md bg-slate-50 p-3"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{value || '—'}</dd></div>
}

export default function SchoolStaffOversightView() {
  const { t } = useTranslation()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [viewStaff, setViewStaff] = useState(null)
  const [editStaff, setEditStaff] = useState(null)
  const [editForm, setEditForm] = useState(emptyStaff)
  const [deleteStaff, setDeleteStaff] = useState(null)
  const tokenHeaders = () => ({ Authorization: `Bearer ${readSessionToken()}` })

  const loadStaff = async () => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/admin/staff', { headers: tokenHeaders() })
      setStaff(Array.isArray(data) ? data : [])
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to load school staff.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStaff() }, [])
  const filteredStaff = useMemo(() => staff.filter((member) => {
    const matchesText = `${member.name} ${member.email} ${member.department || ''} ${member.subjects || ''} ${member.woredaEmployeeId || ''}`.toLowerCase().includes(query.toLowerCase())
    return matchesText
      && (roleFilter === 'All' || member.role === roleFilter)
      && (statusFilter === 'All' || (statusFilter === 'Active' ? member.isActive : !member.isActive))
  }), [staff, query, roleFilter, statusFilter])

  const viewDetails = async (member) => {
    setBusy(true)
    try {
      const { data } = await axios.get(`/api/admin/staff/${member.id}`, { headers: tokenHeaders() })
      setViewStaff(data)
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to load staff details.'))
    } finally {
      setBusy(false)
    }
  }

  const openEdit = async (member) => {
    setBusy(true)
    try {
      const { data } = await axios.get(`/api/admin/staff/${member.id}`, { headers: tokenHeaders() })
      setEditStaff(data)
      setEditForm({ ...emptyStaff, ...data, isActive: Boolean(data.isActive) })
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to load staff details for editing.'))
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const editableFields = {
        name: editForm.name,
        department: editForm.department || '',
        isActive: Boolean(editForm.isActive),
        ...(editForm.username ? {} : { email: editForm.email }),
      }
      await axios.put(`/api/admin/staff/${editStaff.id}`, editableFields, { headers: tokenHeaders() })
      setEditStaff(null)
      toast.success(t('Staff member updated successfully.'))
      await loadStaff()
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to update staff member.'))
    } finally {
      setBusy(false)
    }
  }

  const permanentlyDeleteStaff = async () => {
    if (!deleteStaff) return
    const targetId = deleteStaff.id
    setBusy(true)
    try {
      await axios.delete(`/api/school-admin/staff/${targetId}`, { headers: tokenHeaders() })
      setStaff(prevList => prevList.filter(user => user.id !== targetId))
      setDeleteStaff(null)
      toast.success(t('Staff member permanently deleted from database.'))
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to permanently delete staff member.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-primary-700">{t('School Admin workspace')}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{t('School Staff Oversight')}</h1><p className="mt-1 text-sm text-slate-500">{t('{count} staff members', { count: filteredStaff.length })}</p></div>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
          <label className="relative"><span className="sr-only">{t('Search staff')}</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search name, email, department, subjects')} className={`${inputClass} pl-9`} /></label>
          <select aria-label={t('Filter staff by role')} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className={inputClass}><option value="All">{t('All roles')}</option>{staffRoles.map((role) => <option key={role.value} value={role.value}>{t(role.value)}</option>)}</select>
          <select aria-label={t('Filter staff by status')} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}><option value="All">{t('All')}</option><option value="Active">{t('Active')}</option><option value="Inactive">{t('Inactive')}</option></select>
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">{t('Staff member')}</th><th className="px-4 py-3">{t('Role')}</th><th className="px-4 py-3">{t('Department')}</th><th className="px-4 py-3">{t('Subjects')}</th><th className="px-4 py-3">{t('Status')}</th><th className="px-5 py-3 text-right">{t('Actions')}</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500">{t('Loading staff…')}</td></tr>
              : filteredStaff.length ? filteredStaff.map((member) => <tr key={member.id}>
                <td className="px-5 py-4"><span className="block font-semibold text-slate-900">{member.name}</span><span className="text-xs text-slate-500">{t('ID {id}', { id: member.id })} · {member.username || member.email}</span></td>
                <td className="px-4 py-4">{roleLabel(member.role, t)}</td><td className="px-4 py-4">{member.department || '—'}</td><td className="max-w-xs truncate px-4 py-4">{member.subjects || '—'}</td>
                <td className="px-4 py-4"><span className={member.isActive ? 'font-medium text-emerald-700' : 'font-medium text-slate-500'}>{t(member.isActive ? 'Active' : 'Inactive')}</span></td>
                <td className="px-5 py-4"><div className="flex justify-end gap-1">
                  <button type="button" disabled={busy} onClick={() => viewDetails(member)} title={t('View staff details')} aria-label={t('View {name}', { name: member.name })} className="rounded-md p-2 text-slate-500 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"><Eye className="h-4 w-4" /></button>
                  <button type="button" disabled={busy} onClick={() => openEdit(member)} title={t('Edit staff member')} aria-label={t('Edit {name}', { name: member.name })} className="rounded-md p-2 text-slate-500 hover:bg-warning-50 hover:text-warning-700 disabled:opacity-50"><Pencil className="h-4 w-4" /></button>
                  <button type="button" disabled={busy} onClick={() => setDeleteStaff(member)} title={t('Permanently delete staff member')} aria-label={t('Delete {name}', { name: member.name })} className="rounded-md p-2 text-slate-500 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                </div></td>
              </tr>) : <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500"><UserRound className="mx-auto mb-2 h-6 w-6 text-slate-300" />{t('No staff members match these filters.')}</td></tr>}
          </tbody>
        </table></div>
      </section>

      <Modal open={Boolean(viewStaff)} onClose={() => setViewStaff(null)} title={t('Staff details')} description={viewStaff ? `${viewStaff.name} · ${roleLabel(viewStaff.role, t)}` : ''}>
        {viewStaff && <dl className="grid gap-3 sm:grid-cols-2"><Detail label={t('System credential')} value={viewStaff.username || viewStaff.email} /><Detail label={t('Role')} value={roleLabel(viewStaff.role, t)} /><Detail label={t('Woreda Employee ID')} value={viewStaff.woredaEmployeeId} /><Detail label={t('Phone Number')} value={viewStaff.phoneNumber} /><Detail label={t('Specialization (Major Subject)')} value={viewStaff.specialization || viewStaff.department} /><Detail label={t('Qualification Degree')} value={viewStaff.qualificationDegree} /><Detail label={t('Assigned subjects')} value={viewStaff.subjects} /><Detail label={t('Status')} value={t(viewStaff.isActive ? 'Active' : 'Inactive')} /><Detail label={t('Registered')} value={viewStaff.createdAt ? new Date(viewStaff.createdAt).toLocaleDateString() : ''} /></dl>}
      </Modal>

      <Modal open={Boolean(editStaff)} onClose={() => !busy && setEditStaff(null)} title={t('Edit staff member')} description={editStaff?.name || ''}>
        <form onSubmit={saveEdit} className="space-y-4">
          <StaffField label={t('Full name')} required maxLength={100} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
          {editForm.username
            ? <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{t('System credential')}</p><p className="mt-1 text-sm font-semibold text-slate-800">{editForm.username}</p></div>
            : <StaffField label={t('Email')} type="email" required maxLength={100} value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />}
          <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{t('Assigned role')}</p><p className="mt-1 text-sm font-semibold text-slate-800">{roleLabel(editForm.role, t)}</p></div>
          {editForm.role === 'Teacher' && <>
            <StaffField label={t('Department')} maxLength={100} value={editForm.department || ''} onChange={(event) => setEditForm({ ...editForm, department: event.target.value })} />
            <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{t('Assigned subjects')}</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{editForm.subjects || '—'}</p><p className="mt-1 text-xs text-slate-500">{t('Subject and section assignments are managed by the Vice Principal.')}</p></div>
          </>}
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={Boolean(editForm.isActive)} onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} />{t('Account active')}</label>
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" type="button" disabled={busy} onClick={() => setEditStaff(null)}>{t('Cancel')}</Button><Button loading={busy} type="submit">{t('Save changes')}</Button></div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteStaff)}
        onClose={() => !busy && setDeleteStaff(null)}
        title={t('Permanently delete staff member')}
        description={deleteStaff?.name || ''}
      >
        <p className="text-sm text-slate-700">
          {t('Are you sure you want to permanently delete this staff member? This will remove their record entirely from the school system.')}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" type="button" disabled={busy} onClick={() => setDeleteStaff(null)}>{t('Cancel')}</Button>
          <Button loading={busy} type="button" onClick={permanentlyDeleteStaff}>{t('Delete permanently')}</Button>
        </div>
      </Modal>
    </div>
  )
}