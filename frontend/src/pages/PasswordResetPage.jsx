import React, { useState } from 'react'
import axios from 'axios'
import { KeyRound } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useTranslation } from '../i18n/I18nContext.jsx'
import { readSessionToken } from './LoginPage.jsx'

export default function PasswordResetPage({ user, onPasswordChanged, onLogout }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const passwordBytes = new TextEncoder().encode(password).length
  const validationMessage = passwordBytes < 8 || passwordBytes > 72
    ? t('Password must be between 8 and 72 bytes.')
    : password !== confirmPassword
      ? t('Passwords do not match.')
      : ''

  const submit = async (event) => {
    event.preventDefault()
    if (validationMessage) {
      toast.error(validationMessage)
      return
    }
    setBusy(true)
    try {
      const { data } = await axios.post('/api/auth/change-password', {
        password,
        confirmPassword,
      }, {
        headers: { Authorization: `Bearer ${readSessionToken()}` },
      })
      if (!data.token) throw new Error(t('Invalid password update response.'))
      onPasswordChanged(data.token)
      toast.success(t('Password changed successfully.'))
    } catch (error) {
      toast.error(t(error.response?.data?.message || error.message || 'Unable to change password.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-panel sm:p-8">
        <div className="mb-5 grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary-800">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{t('Change your password')}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t('A password change is required before you can access your dashboard.')}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-700">{user.name}</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-700">
            {t('New password')}
            <input
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            {t('Confirm new password')}
            <input
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <button
            type="submit"
            disabled={busy || Boolean(validationMessage)}
            className="w-full rounded-md bg-primary-800 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('Saving…') : t('Save new password')}
          </button>
        </form>
        <button type="button" onClick={onLogout} className="mt-4 w-full text-sm font-semibold text-slate-600 hover:text-slate-900">
          {t('Log out')}
        </button>
      </section>
    </main>
  )
}
