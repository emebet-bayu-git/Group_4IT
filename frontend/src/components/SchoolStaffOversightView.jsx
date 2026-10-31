import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Eye, Pencil, Search, Trash2, UserRound } from 'lucide-react'
import Button from './ui/Button.jsx'
import Modal from './ui/Modal.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import TeacherClassAssignments from './TeacherClassAssignments.jsx'

const emptyStaff = { id: null, name: '', email: '', role: 'Teacher', department: '', subjects: '', isActive: true }
const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
const staffRoles = [
  { value: 'Teacher', label: 'Teacher' },
  { value: 'Registrar', label: 'Registrar' },
  { value: 'Headmaster', label: 'Principal (እርዕሰ መምህር)' },
  { value: 'Vice Principal', label: 'Vice Principal (ምክትል እርዕሰ መምህር)' },
  { value: 'Supervisor', label: 'Supervisor' },
]
const roleLabel = (role) => staffRoles.find((item) => item.value === role)?.label || role

function StaffField({ label, ...props }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input {...props} className={inputClass} /></label>
}

function Detail({ label, value }) {
  return <div className="rounded-md bg-slate-50 p-3"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{value || '—'}</dd></div>
}

export default function SchoolStaffOversightView() {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(null)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [viewStaff, setViewStaff] = useState(null)
  const [editStaff, setEditStaff] = useState(null)
  const [editForm, setEditForm] = useState(emptyStaff)
  const [sections, setSections] = useState([])
  const tokenHeaders = () => ({ Authorization: `Bearer ${readSessionToken()}` })

  const loadStaff = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/admin/staff', { headers: tokenHeaders() })
      setStaff(Array.isArray(data) ? data : [])
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load school staff.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStaff() }, [])
  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const filteredStaff = useMemo(() => staff.filter((member) => {
    const matchesText = `${member.name} ${member.email} ${member.department || ''} ${member.subjects || ''}`.toLowerCase().includes(query.toLowerCase())
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
      setToast({ type: 'error', message: requestError.response?.data?.message || 'Unable to load staff details.' })
    } finally {
      setBusy(false)
    }
  }

  const openEdit = async (member) => {
    setBusy(true)
    try {
      const [{ data }, { data: setup }] = await Promise.all([
        axios.get(`/api/admin/staff/${member.id}`, { headers: tokenHeaders() }),
        axios.get('/api/admin/setup', { headers: tokenHeaders() }),
      ])
      setSections(setup.sections || [])
      setEditStaff(data)
      setEditForm({ ...emptyStaff, ...data, isActive: Boolean(data.isActive) })
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.response?.data?.message || 'Unable to load staff details for editing.' })
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { role: _role, ...editableFields } = editForm
      await axios.put(`/api/admin/staff/${editStaff.id}`, editableFields, { headers: tokenHeaders() })
      setEditStaff(null)
      setToast({ type: 'success', message: 'Staff member updated successfully.' })
      await loadStaff()
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.response?.data?.message || 'Unable to update staff member.' })
    } finally {
      setBusy(false)
    }
  }

  const deactivateStaff = async (member) => {
    if (!window.confirm(`Deactivate ${member.name}'s account? They will no longer be able to sign in.`)) return
    setBusy(true)
    try {
      await axios.delete(`/api/admin/staff/${member.id}`, { headers: tokenHeaders() })
      setToast({ type: 'success', message: 'Staff account deactivated.' })
      await loadStaff()
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.response?.data?.message || 'Unable to deactivate staff member.' })
    } finally {
      setBusy(false)
    }
  }

  const toggleStaffStatus = async (member) => {
    setBusy(true)
    try {
      await axios.put(`/api/admin/staff/${member.id}`, { isActive: !member.isActive }, { headers: tokenHeaders() })
      setToast({ type: 'success', message: `Staff account ${member.isActive ? 'activated' : 'deactivated'}.` })
      await loadStaff()
    } catch (requestError) {
      setToast({ type: 'error', message: requestError.response?.data?.message || 'Unable to update staff status.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {toast && <div role={toast.type === 'error' ? 'alert' : 'status'} className={`fixed right-4 top-20 z-[60] max-w-sm rounded-md border p-4 text-sm shadow-lg ${toast.type === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'}`}>{toast.message}</div>}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-semibold text-primary-700">School Admin workspace</p><h1 className="mt-1 text-2xl font-bold text-slate-900">School Staff Oversight</h1><p className="mt-1 text-sm text-slate-500">{filteredStaff.length} staff members</p></div>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
          <label className="relative"><span className="sr-only">Search staff</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, department, subjects" className={`${inputClass} pl-9`} /></label>
          <select aria-label="Filter staff by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className={inputClass}><option value="All">All roles</option>{staffRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
          <select aria-label="Filter staff by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}><option>All</option><option>Active</option><option>Inactive</option></select>
        </div>
      </section>
      {error && <div role="alert" className="flex items-center justify-between rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"><span>{error}</span><button type="button" onClick={loadStaff} className="font-semibold underline">Retry</button></div>}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Staff member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Subjects</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500">Loading staff…</td></tr>
              : filteredStaff.length ? filteredStaff.map((member) => <tr key={member.id}>
                <td className="px-5 py-4"><span className="block font-semibold text-slate-900">{member.name}</span><span className="text-xs text-slate-500">ID {member.id} · {member.email}</span></td>
                <td className="px-4 py-4">{roleLabel(member.role)}</td><td className="px-4 py-4">{member.department || '—'}</td><td className="max-w-xs truncate px-4 py-4">{member.subjects || '—'}</td>
                <td className="px-4 py-4"><span className={member.isActive ? 'font-medium text-emerald-700' : 'font-medium text-slate-500'}>{member.isActive ? 'Active' : 'Inactive'}</span></td>
                <td className="px-5 py-4"><div className="flex justify-end gap-1">
                  <button type="button" disabled={busy} onClick={() => viewDetails(member)} title="View staff details" aria-label={`View ${member.name}`} className="rounded-md p-2 text-slate-500 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"><Eye className="h-4 w-4" /></button>
                  <button type="button" disabled={busy} onClick={() => openEdit(member)} title="Edit staff member" aria-label={`Edit ${member.name}`} className="rounded-md p-2 text-slate-500 hover:bg-warning-50 hover:text-warning-700 disabled:opacity-50"><Pencil className="h-4 w-4" /></button>
                  {member.isActive ? <button type="button" disabled={busy} onClick={() => deactivateStaff(member)} title="Deactivate staff member" aria-label={`Deactivate ${member.name}`} className="rounded-md p-2 text-slate-500 hover:bg-danger-50 hover:text-danger-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button> : <button type="button" disabled={busy} onClick={() => toggleStaffStatus(member)} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold disabled:opacity-50">Reactivate</button>}
                </div></td>
              </tr>) : <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500"><UserRound className="mx-auto mb-2 h-6 w-6 text-slate-300" />No staff members match these filters.</td></tr>}
          </tbody>
        </table></div>
      </section>

      <Modal open={Boolean(viewStaff)} onClose={() => setViewStaff(null)} title="Staff details" description={viewStaff ? `${viewStaff.name} · ${roleLabel(viewStaff.role)}` : ''}>
        {viewStaff && <dl className="grid gap-3 sm:grid-cols-2"><Detail label="Email" value={viewStaff.email} /><Detail label="Role" value={roleLabel(viewStaff.role)} /><Detail label="Department" value={viewStaff.department} /><Detail label="Assigned subjects" value={viewStaff.subjects} /><Detail label="Status" value={viewStaff.isActive ? 'Active' : 'Inactive'} /><Detail label="Registered" value={viewStaff.createdAt ? new Date(viewStaff.createdAt).toLocaleDateString() : ''} /></dl>}
      </Modal>

      <Modal open={Boolean(editStaff)} onClose={() => !busy && setEditStaff(null)} title="Edit staff member" description={editStaff?.name || ''}>
        <form onSubmit={saveEdit} className="space-y-4">
          <StaffField label="Full name" required maxLength={100} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
          <StaffField label="Email" type="email" required maxLength={100} value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
          <div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">Assigned role</p><p className="mt-1 text-sm font-semibold text-slate-800">{roleLabel(editForm.role)}</p></div>
          {editForm.role === 'Teacher' && <>
            <StaffField label="Department" maxLength={100} value={editForm.department || ''} onChange={(event) => setEditForm({ ...editForm, department: event.target.value })} />
            <label className="block text-sm font-medium text-slate-700">Assigned subjects<textarea maxLength={2000} value={editForm.subjects || ''} onChange={(event) => setEditForm({ ...editForm, subjects: event.target.value })} className="mt-1 min-h-24 w-full rounded-md border border-slate-300 p-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></label>
            <TeacherClassAssignments sections={sections} value={editForm.classAssignments || []} onChange={(classAssignments) => setEditForm({ ...editForm, classAssignments })} disabled={busy} />
          </>}
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={Boolean(editForm.isActive)} onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} />Account active</label>
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" type="button" disabled={busy} onClick={() => setEditStaff(null)}>Cancel</Button><Button loading={busy} type="submit">Save changes</Button></div>
        </form>
      </Modal>
    </div>
  )
}