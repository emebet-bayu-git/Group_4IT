import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const leadershipRoles = [
  { value: 'Headmaster', label: 'እርዕሰ መምህር (Headmaster / Principal)' },
  { value: 'Vice Principal', label: 'ምክትል ርዕሰ መምህር (Vice Principal)' },
  { value: 'Supervisor', label: 'ሱፐርቫይዘር (Supervisor)' },
]
const staffRoles = ['Teacher', 'Registrar', ...leadershipRoles.map(({ value }) => value)]

export default function RoleAssignView() {
  const { t } = useTranslation()
  const [staff, setStaff] = useState([])
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [selectedRole, setSelectedRole] = useState(leadershipRoles[0].value)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      const message = requestError.response?.data?.message || 'Unable to load teachers and registrars.'
      setError(message)
      toast.error(t(message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  const assignRole = async (event) => {
    event.preventDefault()
    if (!selectedStaffId) {
      toast.error(t('Select a teacher or registrar first.'))
      return
    }
    setBusy(true)
    try {
      await axios.post(`/api/admin/users/${selectedStaffId}/assign-role`, { role: selectedRole }, requestConfig)
      toast.success(t('Leadership role assigned successfully.'))
      setSelectedStaffId('')
      await loadStaff()
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || 'Unable to assign this leadership role.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{t('Role Assign')}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('Assign Headmaster, Vice Principal, or Supervisor responsibilities to staff registered at your school.')}
        </p>
      </header>


      <form onSubmit={assignRole} className="grid gap-4 rounded-md bg-slate-50 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block text-sm font-medium text-slate-700">
          {t('Staff member')}
          <select
            required
            value={selectedStaffId}
            onChange={(event) => setSelectedStaffId(event.target.value)}
            disabled={loading || busy || staff.length === 0}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{loading ? t('Loading staff…') : t('Select a staff member')}</option>
            {staff.map((user) => (
              <option key={user.id} value={user.id}>{user.name} · {t(user.role)}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          {t('Leadership role')}
          <select
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value)}
            disabled={busy}
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {leadershipRoles.map(({ value }) => <option key={value} value={value}>{t(value)}</option>)}
          </select>
        </label>

        <button
          type="submit"
          disabled={busy || loading || staff.length === 0}
          className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t('Assigning…') : t('Assign Role')}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          {t(error)}
        </p>
      )}

      {!loading && staff.length === 0 && !error && (
        <p className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">
          {t('There are no eligible staff members available to assign a leadership role.')}
        </p>
      )}
    </section>
  )
}
