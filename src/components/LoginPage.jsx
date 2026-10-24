import React, { useState } from 'react'
import { AlertCircle, ArrowLeft, Eye, EyeOff, GraduationCap, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'

const identifierValid = (value) => value.includes('@') ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : /^[a-zA-Z0-9._-]{3,}$/.test(value)

export function storeSessionToken(token, rememberMe) {
  if (!token) return
  if (rememberMe) localStorage.setItem('sims_auth_token', token)
  else sessionStorage.setItem('sims_auth_token', token)
}

export default function LoginPage({ onLogin, onBack }) {
  const [form, setForm] = useState({ identifier: '', password: '', role: 'Admin', remember: false })
  const [touched, setTouched] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const identifierError = !identifierValid(form.identifier) ? 'Enter a valid email address or username.' : ''
  const passwordError = form.password.length < 8 ? 'Password must contain at least 8 characters.' : ''
  const update = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setError('') }

  const submit = async (event) => {
    event.preventDefault()
    setTouched({ identifier: true, password: true })
    if (identifierError || passwordError) return
    setLoading(true); setError('')
    try {
      const response = await Promise.resolve(onLogin?.({
        identifier: form.identifier,
        password: form.password,
        role: form.role,
        rememberMe: form.remember,
      }))
      const result = response && typeof response === 'object' ? response : { token: 'demo-jwt-token', role: form.role }
      if (!result.token) throw new Error('Invalid authentication response.')
      storeSessionToken(result.token, form.remember)
    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Check your details and try again.')
    } finally {
      setLoading(false)
    }
  }

  const controlClass = (field, invalid) => `h-11 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${touched[field] && invalid ? 'border-danger-500 ring-2 ring-danger-100' : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'}`

  return (
    <main className="min-h-screen bg-primary-950 lg:grid lg:grid-cols-[1fr_0.72fr]">
      <section className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(22,74,175,.55),rgba(8,24,49,.96))]" aria-hidden="true" /><div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full border-[70px] border-white/[0.04]" aria-hidden="true" /><div className="relative"><button onClick={onBack} className="flex items-center gap-3 text-left text-white"><span className="grid h-11 w-11 place-items-center rounded-md bg-white text-primary-900"><GraduationCap className="h-7 w-7" /></span><span><span className="block text-lg font-bold">Northfield</span><span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-200">Secondary School</span></span></button></div>
        <div className="relative max-w-xl"><span className="inline-flex items-center gap-2 rounded-full border border-primary-300/30 bg-primary-900/40 px-3 py-1.5 text-xs font-semibold text-primary-100"><ShieldCheck className="h-4 w-4" />Secure school access</span><h1 className="mt-6 text-5xl font-bold leading-tight text-white">Everything your school needs, in one place.</h1><p className="mt-5 max-w-lg text-lg leading-8 text-primary-100">A secure workspace for academic records, classroom operations, reporting, and student success.</p></div>
        <p className="relative text-xs text-primary-300">© 2026 Northfield Secondary School</p>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 sm:px-8"><div className="w-full max-w-md"><button onClick={onBack} className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-primary-800"><ArrowLeft className="h-4 w-4" />Back to website</button><div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.25)] sm:p-8"><div className="lg:hidden mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-primary-900 text-white"><GraduationCap className="h-6 w-6" /></span><div><p className="font-bold text-slate-900">Northfield</p><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Secondary School</p></div></div><div><span className="grid h-11 w-11 place-items-center rounded-md bg-primary-50 text-primary-800"><LockKeyhole className="h-5 w-5" /></span><h2 className="mt-4 text-2xl font-bold text-slate-950">Sign in to your portal</h2><p className="mt-1 text-sm text-slate-500">Use your school account to continue.</p></div>
        {error && <div role="alert" className="mt-5 flex items-start gap-3 rounded-md border border-danger-200 bg-danger-50 p-3 text-danger-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-sm font-bold">Authentication failed</p><p className="mt-0.5 text-xs leading-5">{error}</p></div></div>}
        <form onSubmit={submit} noValidate className="mt-6 space-y-5"><label className="block text-sm font-semibold text-slate-700">Email or username<span className="ml-1 text-danger-600">*</span><input value={form.identifier} onChange={(event) => update('identifier', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, identifier: true }))} autoComplete="username" placeholder="you@northfield.edu" className={`${controlClass('identifier', identifierError)} mt-1.5`} />{touched.identifier && identifierError && <span className="mt-1.5 block text-xs font-medium text-danger-600">{identifierError}</span>}</label>
          <label className="block text-sm font-semibold text-slate-700">Password<span className="ml-1 text-danger-600">*</span><span className="relative block"><input value={form.password} onChange={(event) => update('password', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, password: true }))} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter at least 8 characters" className={`${controlClass('password', passwordError)} mt-1.5 pr-11`} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-[10px] rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span>{touched.password && passwordError && <span className="mt-1.5 block text-xs font-medium text-danger-600">{passwordError}</span>}</label>
          <div><label className="block text-sm font-semibold text-slate-700">Portal role<span className="text-xs font-normal text-slate-400"> (optional)</span></label><select value={form.role} onChange={(event) => update('role', event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"><option>Admin</option><option>Registrar</option><option>Teacher</option><option>Student</option></select></div>
          <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.remember} onChange={(event) => update('remember', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary-700 focus:ring-primary-500" />Remember me</label><button type="button" onClick={() => window.alert('Password reset instructions would be sent to your registered email.')} className="text-sm font-semibold text-primary-700 hover:text-primary-900">Forgot password?</button></div>
          <button type="submit" disabled={loading} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary-900 px-5 text-sm font-bold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-70">{loading && <LoaderCircle className="h-4 w-4 animate-spin" />}{loading ? 'Signing in...' : 'Sign in'}</button>
        </form><p className="mt-6 text-center text-xs leading-5 text-slate-400">Only access accounts authorized by your school administrator.</p></div></div>
      </section>
    </main>
  )
}
