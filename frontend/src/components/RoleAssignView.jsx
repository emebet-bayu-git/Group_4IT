import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { readSessionToken } from '../pages/LoginPage.jsx'

const leadershipRoles = [
  { value: 'Headmaster', label: 'እርዕሰ መምህር (Headmaster / Principal)' },
  { value: 'Vice Principal', label: 'ምክትል ርዕሰ መምህር (Vice Principal)' },
  { value: 'Supervisor', label: 'ሱፐርቫይዘር (Supervisor)' },
]
const staffRoles = ['Teacher', 'Registrar', ...leadershipRoles.map(({ value }) => value)]

export default function RoleAssignView() {
  const [staff, setStaff] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [selectedRole, setSelectedRole] = useState(leadershipRoles[0].value)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const requestConfig = useMemo(() => ({
    headers: { Authorization: `Bearer ${readSessionToken()}` },
  }), [])

  const loadStaff = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await axios.get('/api/admin/users', requestConfig)
      setStaff(data.filter((user) => staffRoles.includes(user.role)))
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load teachers and registrars.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const assignRole = async (event) => {
    event.preventDefault()
    if (!selectedStaffId) {
      setError('Select a teacher or registrar first.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await axios.post(`/api/admin/users/${selectedStaffId}/assign-role`, { role: selectedRole }, requestConfig)
      setNotice('Leadership role assigned successfully.')
      setSelectedStaffId('')
      await loadStaff()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to assign this leadership role.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">Role Assign</h1>
        <p className="mt-1 text-sm text-slate-600">
          Assign Headmaster, Vice Principal, or Supervisor responsibilities to staff registered at your school.
        </p>
      </header>

      {error && <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
      {notice && <p role="status" className="fixed right-5 top-5 z-50 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 shadow-lg">{notice}</p>}

      <form onSubmit={assignRole} className="grid gap-4 rounded-md bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block text-sm font-medium text-slate-700">
          Staff member
          <select
            required
            value={selectedStaffId}
            onChange={(event) => setSelectedStaffId(event.target.value)}
            disabled={loading || busy || staff.length === 0}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{loading ? 'Loading staff…' : 'Select a staff member'}</option>
            {staff.map((user) => (
              <option key={user.id} value={user.id}>{user.name} · {user.role}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Leadership role
          <select
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {leadershipRoles.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <button
          type="submit"
          disabled={busy || loading || staff.length === 0}
          className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Assigning…' : 'Assign Role'}
        </button>
      </form>

      {!loading && staff.length === 0 && !error && (
        <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
          There are no eligible staff members available to assign a leadership role.
        </p>
      )}
    </section>
  )
}
