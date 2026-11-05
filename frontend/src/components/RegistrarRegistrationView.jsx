import React, { useState } from 'react'
import axios from 'axios'
import { UserPlus } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const initialForm = {
  fullName: '',
  employeeId: '',
  phoneNumber: '',
  gender: '',
  usernameOrEmail: '',
}
const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export default function RegistrarRegistrationView() {
  const { t } = useTranslation()
  const [form, setForm] = useState(initialForm)
  const [busy, setBusy] = useState(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await axios.post('/api/admin/users', {
        fullName: form.fullName,
        employeeId: form.employeeId,
        phoneNumber: form.phoneNumber,
        gender: form.gender,
        usernameOrEmail: form.usernameOrEmail,
        role: 'Registrar',
      }, {
        headers: { Authorization: `Bearer ${readSessionToken()}` },
      })
      setForm(initialForm)
      toast.success(t('Successfully registered {role}.', { role: t('Registrar') }))
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Registration failed. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">{t('Register Registrar')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            {t('Full Name')}
            <input required maxLength={100} autoComplete="name" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('Employee ID / Staff ID')}
            <input required maxLength={50} value={form.employeeId} onChange={(event) => update('employeeId', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('Phone Number')}
            <input required type="tel" maxLength={40} autoComplete="tel" value={form.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('Gender')}
            <select required value={form.gender} onChange={(event) => update('gender', event.target.value)} className={inputClass}>
              <option value="">{t('Select gender')}</option>
              <option value="Male">{t('Male')}</option>
              <option value="Female">{t('Female')}</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {t('Email or username')}
            <input required maxLength={100} autoComplete="username" value={form.usernameOrEmail} onChange={(event) => update('usernameOrEmail', event.target.value)} className={inputClass} />
          </label>
        </div>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <UserPlus className="h-4 w-4" />
          {t('Register Registrar')}
        </button>
      </form>
    </section>
  )
}
