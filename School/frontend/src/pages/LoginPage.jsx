import React, { useState } from 'react'
import { ArrowLeft, Eye, EyeOff, GraduationCap, LoaderCircle, LockKeyhole } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useTranslation } from '../i18n/I18nContext.jsx'

const validRoles = ['Super Admin', 'School Admin', 'Registrar', 'Teacher', 'Student', 'Headmaster', 'Vice Principal', 'Supervisor']

export function readSessionToken() {
  return localStorage.getItem('sims_auth_token') || sessionStorage.getItem('sims_auth_token')
}

export function updateSessionToken(token) {
  if (!token) return
  const storage = localStorage.getItem('sims_auth_token') ? localStorage : sessionStorage
  storage.setItem('sims_auth_token', token)
}

export function updateSessionUser(profile) {
  const storage = localStorage.getItem('sims_auth_token') ? localStorage : sessionStorage
  const savedUser = storage.getItem('sims_auth_user')
  if (!savedUser || !profile?.role || !profile?.name || !profile?.id) return
  try {
    const user = JSON.parse(savedUser)
    storage.setItem('sims_auth_user', JSON.stringify({
      ...user,
      role: profile.role,
      systemRole: profile.role,
      name: profile.name,
      identifier: String(profile.id),
      avatarPath: profile.avatarPath || '',
    }))
  } catch (error) {
    console.error('Unable to update saved sign-in profile:', error.message)
  }
}

export function readSessionUser() {
  for (const storage of [localStorage, sessionStorage]) {
    const token = storage.getItem('sims_auth_token')
    const savedUser = storage.getItem('sims_auth_user')
    if (!token || !savedUser) continue

    try {
      const user = JSON.parse(savedUser)
      if (validRoles.includes(user.role)) {
        return {
          role: user.role,
          systemRole: typeof user.systemRole === 'string' ? user.systemRole : '',
          name: typeof user.name === 'string' ? user.name : '',
          identifier: typeof user.identifier === 'string' ? user.identifier : '',
          avatarPath: typeof user.avatarPath === 'string' ? user.avatarPath : '',
        }
      }
    } catch (error) {
      console.error('Unable to read saved sign-in profile:', error.message)
    }
  }
  return null
}

export function storeSessionToken(token, rememberMe, user) {
  if (!token) return
  if (!user || !validRoles.includes(user.role)) throw new Error('Invalid authentication role.')
  const storage = rememberMe ? localStorage : sessionStorage
  const otherStorage = rememberMe ? sessionStorage : localStorage
  otherStorage.removeItem('sims_auth_token')
  otherStorage.removeItem('sims_auth_user')
  storage.setItem('sims_auth_token', token)
  storage.setItem('sims_auth_user', JSON.stringify({
    role: user.role,
    systemRole: user.systemRole || '',
    name: user.name || user.identifier || '',
    identifier: user.identifier || '',
    avatarPath: user.avatarPath || '',
  }))
}

export function clearSession() {
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index)
      if (key?.startsWith('sims_auth_')) storage.removeItem(key)
    }
  }
}

export default function LoginPage({ onLogin, onBack }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ identifier: '', password: '', remember: false })
  const [touched, setTouched] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const identifier = form.identifier.trim()
  const identifierIsId = /^\d+$/.test(identifier)
    && Number.isSafeInteger(Number(identifier))
    && Number(identifier) > 0
  const identifierIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
  const identifierIsUsername = /^[a-zA-Z0-9._-]{3,60}$/.test(identifier)
  const identifierError = !identifierIsId && !identifierIsEmail && !identifierIsUsername
    ? t('Enter a valid email address, username, or numeric school ID.')
    : ''
  const passwordError = form.password.length < 8 ? t('Password must contain at least 8 characters.') : ''
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setTouched({ identifier: true, password: true })
    if (identifierError || passwordError) return
    setLoading(true)
    try {
      const result = await onLogin({
        identifier,
        password: form.password,
        rememberMe: form.remember,
      })
      if (!result?.token || !validRoles.includes(result.role)) throw new Error(t('Invalid authentication response.'))
      const role = result.role
      if (!validRoles.includes(role)) throw new Error(t('Invalid authentication role.'))
      storeSessionToken(result.token, form.remember, {
        role,
        systemRole: result.systemRole,
        name: result.name || identifier,
        identifier: result.identifier || identifier,
        avatarPath: result.avatarPath || '',
      })
    } catch (requestError) {
      toast.error(t(requestError.response?.data?.message || requestError.message || 'Unable to sign in. Check your details and try again.'))
    } finally {
      setLoading(false)
    }
  }

  const controlClass = (field, invalid) => `h-11 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${touched[field] && invalid ? 'border-danger-500 ring-2 ring-danger-100' : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'}`

  return (
    <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-10 sm:px-8">
      <section className="w-full max-w-md">
        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary-800"><ArrowLeft className="h-4 w-4" />{t('Back to website')}</button><div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.25)] sm:p-8"><div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-primary-900 text-white"><GraduationCap className="h-6 w-6" /></span><div><p className="font-bold text-slate-900">{t('Amhara Region')}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('Secondary School')}</p></div></div><div><span className="grid h-11 w-11 place-items-center rounded-md bg-primary-50 text-primary-800"><LockKeyhole className="h-5 w-5" /></span><h2 className="mt-4 text-2xl font-bold text-slate-950">{t('Sign in to your portal')}</h2><p className="mt-1 text-sm text-slate-500">{t('Use your school account to continue.')}</p></div>
        <form onSubmit={submit} noValidate className="mt-6 space-y-5"><label className="block text-sm font-semibold text-slate-700">{t('Email, Username, or School ID')}<span className="ml-1 text-danger-600">*</span><input value={form.identifier} onChange={(event) => update('identifier', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, identifier: true }))} autoComplete="username" placeholder={t('Enter your email, username, or school ID')} className={`${controlClass('identifier', identifierError)} mt-1.5`} />{touched.identifier && identifierError && <span className="mt-1.5 block text-xs font-medium text-danger-600">{identifierError}</span>}</label>
          <label className="block text-sm font-semibold text-slate-700">{t('Password')}<span className="ml-1 text-danger-600">*</span><span className="relative block"><input value={form.password} onChange={(event) => update('password', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, password: true }))} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder={t('Enter at least 8 characters')} className={`${controlClass('password', passwordError)} mt-1.5 pr-11`} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-[10px] rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? t('Hide password') : t('Show password')}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span>{touched.password && passwordError && <span className="mt-1.5 block text-xs font-medium text-danger-600">{passwordError}</span>}</label>
          <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.remember} onChange={(event) => update('remember', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-700 focus:ring-primary-500" /> {t('Remember me')}</label><button type="button" onClick={() => window.alert(t('Password reset instructions would be sent to your registered email.'))} className="text-sm font-semibold text-primary-700 hover:text-primary-900">{t('Forgot password?')}</button></div>
          <button type="submit" disabled={loading} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary-900 px-5 text-sm font-bold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-70">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? t('Signing in...') : t('Sign in')}</button>
        </form><p className="mt-6 text-center text-xs leading-5 text-slate-400">{t('Only access accounts authorized by your school administrator.')}</p></div>
      </section>
    </main>
  )
}
