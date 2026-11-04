import React, { useState } from 'react'
import axios from 'axios'
import { Copy, UserPlus } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const blankTeacher = {
  woredaEmployeeId: '',
  name: '',
  phoneNumber: '',
  specialization: '',
  qualificationDegree: '',
  usernameOrEmail: '',
}
const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export default function WoredaTeacherRegistrationView() {
  const { t } = useTranslation()
  const [form, setForm] = useState(blankTeacher)
  const [credential, setCredential] = useState(null)
  const [busy, setBusy] = useState(false)
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setCredential(null)
    try {
      const { data } = await axios.post('/api/admin/teachers/woreda', form, {
        headers: { Authorization: `Bearer ${readSessionToken()}` },
      })
      setCredential(data)
      setForm(blankTeacher)
      toast.success(t('Teacher onboarded successfully.'))
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to onboard this teacher.'))
    } finally {
      setBusy(false)
    }
  }

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credential.initialPassword)
      toast.success(t('Initial password copied.'))
    } catch {
      toast.error(t('Unable to copy the password. Select and copy it manually.'))
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6" aria-labelledby="woreda-teacher-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('School Admin workspace')}</p>
        <h2 id="woreda-teacher-heading" className="mt-1 text-xl font-bold text-slate-900">{t('Woreda-Deployed Teacher Registration')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t('Create a teacher account and save the Woreda deployment details. Assign teaching workloads separately from Vice Principal workspace.')}</p>
      </header>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">{t('Woreda Employee ID')}<input required maxLength={50} value={form.woredaEmployeeId} onChange={(event) => update('woredaEmployeeId', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-medium text-slate-700">{t('Full Name')}<input required maxLength={100} autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-medium text-slate-700">{t('Phone Number')}<input required type="tel" maxLength={40} autoComplete="tel" value={form.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-medium text-slate-700">{t('Specialization (Major Subject)')}<input required maxLength={100} value={form.specialization} onChange={(event) => update('specialization', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-medium text-slate-700">{t('Qualification Degree')}<input required maxLength={100} placeholder={t('e.g. B.Ed., BSc, MSc')} value={form.qualificationDegree} onChange={(event) => update('qualificationDegree', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-medium text-slate-700">{t('System Credential (Email or Username)')}<input required maxLength={100} autoComplete="username" value={form.usernameOrEmail} onChange={(event) => update('usernameOrEmail', event.target.value)} className={inputClass} /></label>
        </div>
        <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          <UserPlus className="h-4 w-4" />{busy ? t('Registering…') : t('Register Woreda Teacher')}
        </button>
      </form>
      {credential && <aside className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4" role="status">
        <div>
          <h3 className="font-semibold text-emerald-950">{t('Teacher account created')}</h3>
          <p className="mt-1 text-sm text-emerald-900">{t('Share this initial password securely. It is shown only in this screen and will not be available again.')}</p>
          <p className="mt-2 text-sm text-emerald-900"><strong>{t('Sign-in')}: </strong>{credential.usernameOrEmail}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 text-sm font-medium text-emerald-950">{t('Initial Password')}<input readOnly value={credential.initialPassword} className={`${inputClass} font-mono`} /></label>
          <button type="button" onClick={copyPassword} className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-700 px-3 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"><Copy className="h-4 w-4" />{t('Copy password')}</button>
        </div>
      </aside>}
    </section>
  )
}
