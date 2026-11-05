import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const capabilities = ['users', 'setup', 'security', 'health', 'delegations', 'archive']
const capabilityLabels = {
  users: 'User accounts',
  setup: 'Academic & school setup',
  security: 'Security policy',
  health: 'Server health',
  delegations: 'Temporary delegations',
  archive: 'Student archive & purge',
}
const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const blankYear = { name: '', startDate: '', endDate: '', isActive: false }
const blankTerm = { academicYearId: '', name: '', startDate: '', endDate: '', isActive: false }
const blankSection = { gradeLevel: 'Grade 9', sectionName: '', isActive: true }
const blankSchool = { school_id: '', school_name: '', school_code: '', region: '', zone: '', wereda: '', contact: '', contact_details: '', stamp_path: '', logo_path: '' }
const blankRegisteredSchool = { name: '', code: '', region: '', zone: '', wereda: '', contactDetails: '', stamp: null, logo: null, stampPath: '', logoPath: '' }
const registrationRoles = [
  { role: 'School Admin', label: 'School Admin' },
  { role: 'Registrar', label: 'Registrar' },
]
const blankUser = { name: '', email: '', role: 'School Admin', schoolId: '' }
const userFilters = [
  { label: 'All', role: null },
  { label: 'School Admins', role: 'School Admin' },
  { label: 'Teachers', role: 'Teacher' },
  { label: 'Registrars', role: 'Registrar' },
  { label: 'Students', role: 'Student' },
  { label: 'Headmasters', role: 'Headmaster' },
  { label: 'Vice Principals', role: 'Vice Principal' },
  { label: 'Supervisors', role: 'Supervisor' },
]
const workspaceTitles = {
  schools: 'Register School',
  'role-assign': 'Role Assign',
  'all-users': 'Register School Admin',
  'audit-logs': 'System Security & Audit Logs',
  infrastructure: 'Database & Infrastructure Setup',
  'system-access': 'System Enable/Disable',
  'academic-infrastructure': 'Academic Infrastructure',
  'school-profile': 'School Profile & Metadata',
  'staff-registration': 'Register Staff',
  'staff-oversight': 'School Staff Oversight',
  'student-rosters': 'Student Rosters',
}

function SectionTitle({ title, description, children }) {
  const { t } = useTranslation()
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">{t(title)}</h2><p className="mt-1 text-sm text-slate-500">{t(description)}</p></div>
        {children}
      </div>
    </section>
  )
}

function Field({ label, ...props }) {
  const { t } = useTranslation()
  return <label className="block text-sm font-medium text-slate-700">{t(label)}<input {...props} placeholder={props.placeholder ? t(props.placeholder) : undefined} className={`mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${props.className || ''}`} /></label>
}

function getWorkspaceErrorMessage(error, fallback) {
  if (error.response?.status === 503) {
    return 'Administrative service is temporarily unavailable. Please try again.'
  }
  const message = error.response?.data?.message
  return message || fallback
}

export default function AdminWorkspace({ activeTask }) {
  const { t } = useTranslation()
  const [access, setAccess] = useState(null)
  const [users, setUsers] = useState([])
  const [userFilter, setUserFilter] = useState('School Admins')
  const [schools, setSchools] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [newSchool, setNewSchool] = useState(blankRegisteredSchool)
  const [editingSchoolId, setEditingSchoolId] = useState(null)
  const [registrationRole, setRegistrationRole] = useState(activeTask === 'staff-registration' ? 'Registrar' : 'School Admin')
  const [newUser, setNewUser] = useState({ ...blankUser, role: activeTask === 'staff-registration' ? 'Registrar' : 'School Admin' })
  const [setup, setSetup] = useState({ years: [], terms: [], sections: [], school: { ...blankSchool } })
  const [delegations, setDelegations] = useState([])
  const [archived, setArchived] = useState([])
  const [graduates, setGraduates] = useState([])
  const [graduationCandidates, setGraduationCandidates] = useState([])
  const [verificationCode, setVerificationCode] = useState('')
  const [health, setHealth] = useState(null)
  const [newDelegation, setNewDelegation] = useState({ userId: '', permissions: [], durationMinutes: 60 })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [systemStatus, setSystemStatus] = useState({ isSystemActive: true, closureMessage: '' })
  const [closureMessage, setClosureMessage] = useState('')

  const request = async (method, url, data) => axios({
    method,
    url: `/api/admin${url}`,
    data,
    headers: { Authorization: `Bearer ${readSessionToken()}` },
  })
  const requestSchool = async (method, url, data) => axios({
    method,
    url: `/api/schools${url}`,
    data,
    headers: { Authorization: `Bearer ${readSessionToken()}` },
  })

  const isProtectedDefaultAdmin = (user) => (
    user?.role === 'Super Admin' && String(user.email || '').trim().toLowerCase() === 'admin@gmail.com'
  )

  const load = async (section = activeTask) => {
    setLoading(true)
    setError('')
    try {
      const { data: accessData } = await request('get', '/access')
      setAccess(accessData)
      const granted = new Set(accessData.isSuperAdmin ? capabilities : accessData.permissions || [])
      const tasks = []
      if (section === 'schools' && accessData.isSuperAdmin) {
        tasks.push(request('get', '/schools').then(({ data }) => setSchools(data)))
      }
      if (section === 'all-users' && granted.has('users')) {
        tasks.push((accessData.isSuperAdmin && section === 'all-users'
          ? axios.get('/api/system-admin/school-admins', { headers: { Authorization: `Bearer ${readSessionToken()}` } })
          : request('get', '/users')).then(({ data }) => {
            setUsers(data.filter((user) => !accessData.isSuperAdmin || user.role === 'School Admin'))
          }))
      }
      if (section === 'system-access' && accessData.isSuperAdmin) {
        tasks.push(axios.get('/api/system-admin/status', { headers: { Authorization: `Bearer ${readSessionToken()}` } }).then(({ data }) => {
          const active = data.isSystemActive !== false
          setSystemStatus({ isSystemActive: active, closureMessage: data.closureMessage || '' })
          setClosureMessage(data.closureMessage || '')
        }))
      }
      if (section === 'all-users') {
        tasks.push(request('get', '/schools').then(({ data }) => setSchools(data)))
      }
      if (section === 'audit-logs' && accessData.isSuperAdmin) {
        tasks.push(request('get', '/activity-logs').then(({ data }) => setActivityLogs(data)))
      }
      if (['academic-infrastructure', 'school-profile', 'staff-registration'].includes(section)
        && (granted.has('setup') || accessData.role === 'School Admin')) {
        tasks.push(request('get', '/setup').then(({ data }) => setSetup({
          ...data,
          school: { ...blankSchool, ...data.school },
          years: data.years.map((item) => ({ ...item, isActive: Boolean(item.isActive) })),
          terms: data.terms.map((item) => ({ ...item, name: String(item.name || '').replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim(), isActive: Boolean(item.isActive) })),
          sections: data.sections.map((item) => ({ ...item, isActive: Boolean(item.isActive) })),
        })))
      }
      if (['audit-logs', 'infrastructure'].includes(section) && granted.has('health')) {
        tasks.push(request('get', '/health').then(({ data }) => setHealth(data)))
      }
      await Promise.all(tasks)
    } catch (requestError) {
      const message = getWorkspaceErrorMessage(requestError, 'Unable to load administrative workspace.')
      setError(message)
      toast.error(t(message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeTask])
  useEffect(() => {
    if (activeTask !== 'audit-logs') return undefined
    const timer = window.setInterval(() => {
      request('get', '/activity-logs')
        .then(({ data }) => setActivityLogs(data))
        .catch((requestError) => {
          const message = getWorkspaceErrorMessage(requestError, 'Unable to refresh audit logs.')
          setError(message)
          toast.error(t(message))
        })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [activeTask])
  const permitted = useMemo(() => new Set(access?.isSuperAdmin ? capabilities : access?.permissions || []), [access])
  const isSuperAdmin = access?.isSuperAdmin === true
  const isSchoolAdmin = access?.role === 'School Admin'
  const canManageSetup = (permitted.has('setup') || isSchoolAdmin) && ['academic-infrastructure', 'school-profile'].includes(activeTask)
  const canRegisterUsers = permitted.has('users') && activeTask === 'all-users'
    || isSchoolAdmin && activeTask === 'staff-registration'
  const visibleRegistrationRoles = isSuperAdmin
    ? registrationRoles.filter(({ role }) => role === 'School Admin')
    : isSchoolAdmin
      ? registrationRoles.filter(({ role }) => role === 'Registrar')
      : registrationRoles
  const visibleUserFilters = isSuperAdmin
    ? userFilters.filter(({ label }) => ['All', 'School Admins'].includes(label))
    : isSchoolAdmin
      ? userFilters.filter(({ label }) => ['All', 'Teachers', 'Registrars', 'Students', 'Headmasters', 'Vice Principals', 'Supervisors'].includes(label))
      : userFilters

  useEffect(() => {
    if (isSchoolAdmin && canRegisterUsers && registrationRole !== 'Registrar') {
      setRegistrationRole('Registrar')
      setNewUser((current) => ({ ...current, role: 'Registrar' }))
    }
  }, [activeTask, canRegisterUsers, isSchoolAdmin, registrationRole])

  const doAction = async (action, successMessage) => {
    setBusy(true); setError(''); setVerificationCode('')
    try {
      await action()
      if (successMessage) toast.success(t(successMessage))
      await load(activeTask)
    } catch (requestError) {
      const message = getWorkspaceErrorMessage(requestError, 'The requested change could not be completed.')
      setError(message)
      toast.error(t(message))
    } finally { setBusy(false) }
  }

  const updateSetup = (key, value) => setSetup((current) => ({ ...current, [key]: value }))
  const updateSchool = (key, value) => setSetup((current) => ({ ...current, school: { ...current.school, [key]: value } }))
  const registerSchool = async (event) => {
    event.preventDefault()
    await doAction(async () => {
      const formData = new FormData()
      Object.entries(newSchool).forEach(([key, value]) => {
        if (['name', 'code', 'region', 'zone', 'wereda', 'contactDetails'].includes(key) && value) {
          formData.append(key, value)
        } else if (['stamp', 'logo'].includes(key) && value) {
          formData.append(key, value)
        }
      })
      if (editingSchoolId) {
        await requestSchool('put', `/${editingSchoolId}`, formData)
      } else {
        await request('post', '/schools', formData)
      }
      setNewSchool(blankRegisteredSchool)
      setEditingSchoolId(null)
    }, editingSchoolId ? 'School updated.' : 'School registered.')
  }
  const editSchool = (school) => {
    setNewSchool({
      name: school.name || '',
      code: school.code || '',
      region: school.region || '',
      zone: school.zone || '',
      wereda: school.wereda || '',
      contactDetails: school.contact_details || '',
      stamp: null,
      logo: null,
      stampPath: school.stamp_path || '',
      logoPath: school.logo_path || '',
    })
    setEditingSchoolId(school.id)
  }
  const cancelSchoolEdit = () => {
    setNewSchool(blankRegisteredSchool)
    setEditingSchoolId(null)
  }
  const deleteSchool = async (school) => {
    if (!window.confirm(t('Are you sure you want to delete this school? This permanently removes associated school data.'))) return
    await doAction(() => requestSchool('delete', `/${school.id}`), 'School deleted.')
  }
  const registerUser = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { schoolId, ...userDetails } = newUser
      await request('post', '/users', { ...userDetails, school_id: schoolId, role: registrationRole })
      setNewUser({ ...blankUser, role: registrationRole })
      toast.success(t('Successfully registered {role}.', { role: t(registrationRole) }))
      await load(activeTask)
    } catch (requestError) {
      const message = requestError.response?.data?.message || 'Registration failed. Please try again.'
      toast.error(t(message))
    } finally {
      setBusy(false)
    }
  }
  const uploadAsset = async (type, file) => {
    if (!file) return
    const formData = new FormData()
    formData.append('assetType', type)
    formData.append('asset', file)
    setBusy(true); setError('')
    try {
      const { data } = await request('post', '/school-assets', formData)
      updateSchool(data.settingKey, data.path)
      const assetLabel = type === 'logo' ? 'School logo' : type === 'stamp' ? 'Official stamp' : 'Principal signature'
      const message = t('{asset} uploaded.', { asset: t(assetLabel) })
      toast.success(message)
    } catch (requestError) {
      const message = getWorkspaceErrorMessage(requestError, 'Unable to upload school image.')
      setError(message)
      toast.error(t(message))
    } finally { setBusy(false) }
  }

  if (loading && !access) return <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('Loading {workspace}…', { workspace: t(workspaceTitles[activeTask] || 'workspace') })}</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t(workspaceTitles[activeTask] || 'Administration')}</h2>
        {loading && <p role="status" className="mt-1 text-xs text-slate-500">{t('Refreshing workspace data…')}</p>}
      </div>
      {verificationCode && <p className="rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900">{t('Transcript verification code')}: <strong className="select-all font-mono">{verificationCode}</strong></p>}
      {!access && !error && <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('Loading workspace…')}</p>}
      {!isSuperAdmin && ['schools', 'all-users', 'audit-logs', 'infrastructure'].includes(activeTask) && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t('This system-level workspace is available to Super Admins only.')}</p>}

      {isSuperAdmin && activeTask === 'schools' && <>
        <SectionTitle title="Register a school" description="Add an institution and its official contact and identity information.">
          <form key={editingSchoolId || 'new-school'} onSubmit={registerSchool} className="w-full space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="School name" required maxLength={150} value={newSchool.name} onChange={(event) => setNewSchool({ ...newSchool, name: event.target.value })} />
              <Field label="School code" required maxLength={50} value={newSchool.code} onChange={(event) => setNewSchool({ ...newSchool, code: event.target.value })} />
              <Field label="Region" maxLength={100} value={newSchool.region} onChange={(event) => setNewSchool({ ...newSchool, region: event.target.value })} />
              <Field label="Zone" maxLength={100} value={newSchool.zone} onChange={(event) => setNewSchool({ ...newSchool, zone: event.target.value })} />
              <Field label="Wereda" maxLength={100} value={newSchool.wereda} onChange={(event) => setNewSchool({ ...newSchool, wereda: event.target.value })} />
              <Field label="Contact details" maxLength={255} placeholder="Phone or email" value={newSchool.contactDetails} onChange={(event) => setNewSchool({ ...newSchool, contactDetails: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t('Official stamp (optional; JPEG, PNG, WebP; max 3 MB)')}
                {editingSchoolId && newSchool.stampPath && <a className="mt-2 flex w-fit flex-col text-primary-700 underline" href={newSchool.stampPath} target="_blank" rel="noreferrer"><span>{t('Current stamp')}</span><img src={newSchool.stampPath} alt={t('Current stamp')} className="mt-1 h-16 w-16 rounded border border-slate-200 object-contain" /></a>}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setNewSchool({ ...newSchool, stamp: event.target.files?.[0] || null })} className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t('School logo (optional; JPEG, PNG, WebP; max 3 MB)')}
                {editingSchoolId && newSchool.logoPath && <a className="mt-2 flex w-fit flex-col text-primary-700 underline" href={newSchool.logoPath} target="_blank" rel="noreferrer"><span>{t('Current logo')}</span><img src={newSchool.logoPath} alt={t('Current logo')} className="mt-1 h-16 w-16 rounded border border-slate-200 object-contain" /></a>}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setNewSchool({ ...newSchool, logo: event.target.files?.[0] || null })} className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t(editingSchoolId ? 'Update school' : 'Register school')}</button>
              {editingSchoolId && <button type="button" disabled={busy} onClick={cancelSchoolEdit} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{t('Cancel edit')}</button>}
            </div>
          </form>
        </SectionTitle>
        <SectionTitle title="Registered schools" description="Review and activate or deactivate institutions in the system.">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">{t('School')}</th><th className="p-3">{t('Code')}</th><th className="p-3">{t('Location')}</th><th className="p-3">{t('Contact')}</th><th className="p-3">{t('Status')}</th><th className="p-3">{t('Actions')}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{schools.map((school) => <tr key={school.id}><td className="p-3 font-semibold">{school.name}</td><td className="p-3">{school.code}</td><td className="p-3">{[school.region, school.zone, school.wereda].filter(Boolean).join(', ') || '—'}</td><td className="p-3">{school.contact_details || '—'}</td><td className="p-3">{t(school.status)}</td><td className="p-3"><div className="flex flex-wrap gap-1"><button type="button" disabled={busy} onClick={() => editSchool(school)} aria-label={t('Edit school')} title={t('Edit school')} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50">✏️ {t('Edit')}</button><button type="button" disabled={busy} onClick={() => doAction(() => request('patch', `/schools/${school.id}/status`, { status: school.status === 'active' ? 'inactive' : 'active' }), 'School status updated.')} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{t(school.status === 'active' ? 'Deactivate' : 'Activate')}</button><button type="button" disabled={busy} onClick={() => deleteSchool(school)} aria-label={t('Delete school')} title={t('Delete school')} className="rounded border border-danger-200 px-2 py-1.5 text-xs font-semibold text-danger-700 hover:bg-danger-50 disabled:opacity-50">🗑️ {t('Delete')}</button></div></td></tr>)}</tbody>
            </table>
            {!schools.length && !loading && <p className="p-3 text-sm text-slate-500">{t('No schools have been registered yet.')}</p>}
          </div>
        </SectionTitle>
      </>}

      {canRegisterUsers && <SectionTitle title={isSuperAdmin ? 'Register School Admin' : isSchoolAdmin ? activeTask === 'staff-registration' ? 'Register School Staff' : 'User accounts' : 'User accounts'} description={isSuperAdmin ? 'Manage School Admin accounts and review their assigned schools. Only School Admin users are shown here.' : isSchoolAdmin ? activeTask === 'staff-registration' ? '' : 'Manage accounts for your assigned school.' : 'Activate accounts, manage roles, reset passwords, and clear login lockouts.'}>
        {['all-users', 'staff-registration'].includes(activeTask) && <div className="w-full space-y-5">
          {activeTask === 'all-users' && <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4" role="tablist" aria-label={t('Choose user type to register')}>
            {visibleRegistrationRoles.map(({ role: itemRole }) => <button
              key={itemRole}
              id={`register-tab-${itemRole.replaceAll(' ', '-')}`}
              type="button"
              role="tab"
              aria-selected={registrationRole === itemRole}
              aria-controls="user-registration-form"
              onClick={() => {
                setRegistrationRole(itemRole)
                setNewUser((current) => ({ ...current, role: itemRole }))
              }}
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${registrationRole === itemRole ? 'border-primary-800 bg-primary-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >{t('Register {role}', { role: t(itemRole) })}</button>)}
          </div>}
          <form id={activeTask === 'all-users' ? 'user-registration-form' : undefined} role={activeTask === 'all-users' ? 'tabpanel' : undefined} aria-labelledby={activeTask === 'all-users' ? `register-tab-${registrationRole.replaceAll(' ', '-')}` : undefined} onSubmit={registerUser} className="space-y-4 rounded-md bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">{t('Register {role}', { role: t(registrationRole) })}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={registrationRole === 'Student' ? 'Student name' : 'Name'} required maxLength={100} autoComplete="name" value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} />
              <Field label="Email" type="email" required maxLength={100} autoComplete="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} />
              {isSchoolAdmin
                ? <p className="self-end rounded-md bg-white p-3 text-sm text-slate-600">{t('New accounts will be assigned to your school.')}</p>
                  : <label className="block text-sm font-medium text-slate-700">{t(registrationRole === 'School Admin' ? 'Assigned School ID' : 'Assigned School')}<select required value={newUser.schoolId} onChange={(event) => setNewUser({ ...newUser, schoolId: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">{t('Select an active school')}</option>{schools.filter((school) => school.status === 'active').map((school) => <option key={school.id} value={school.id}>{registrationRole === 'School Admin' ? `${school.id} — ${school.name}` : school.name}</option>)}</select></label>}
            </div>
            <button disabled={busy || (!isSchoolAdmin && !schools.some((school) => school.status === 'active'))} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? t('Registering…') : t('Register {role}', { role: t(registrationRole) })}</button>
          </form>
          {activeTask !== 'staff-registration' && <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4" role="group" aria-label={t('Filter users by role')}>
            {!isSuperAdmin && visibleUserFilters.map(({ label }) => <button key={label} type="button" onClick={() => setUserFilter(label)} aria-pressed={userFilter === label} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${userFilter === label ? 'border-primary-800 bg-primary-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{t(label)}</button>)}
          </div>}
        </div>}
        {activeTask !== 'staff-registration' && <div className="w-full overflow-x-auto">
          <table className="min-w-[850px] w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">{t('User')}</th><th className="p-3">{t('Role')}</th>{isSuperAdmin && <th className="p-3">{t('Assigned schools')}</th>}<th className="p-3">{t('Status / lock')}</th><th className="p-3">{t('Actions')}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{users.filter((user) => user.role === 'School Admin' || !isSuperAdmin).filter((user) => {
              const filter = visibleUserFilters.find(({ label }) => label === userFilter)
              return !filter?.role || user.role === filter.role
            }).map((user) => {
              const protectedDefaultAdmin = isProtectedDefaultAdmin(user)
              return (
                <tr key={user.id}>
                  <td className="p-3"><strong className="block text-slate-800">{user.name}</strong><span className="text-xs text-slate-500">ID {user.id} · {user.email}</span></td>
                  <td className="p-3">{t(user.role)}</td>
                  {isSuperAdmin && <td className="p-3">{Array.isArray(user.assignedSchools) && user.assignedSchools.length
                    ? <ul className="space-y-2">{user.assignedSchools.map((school) => {
                      const location = [school.region, school.zone, school.woreda].filter(Boolean).join(' | ')
                      return (
                        <li key={school.id} className="text-slate-700">
                          <span className="block font-semibold">{school.name}{school.code ? ` (${school.code})` : ''}</span>
                          {location && <span className="mt-0.5 block text-xs text-slate-500">{location}</span>}
                        </li>
                      )
                    })}</ul>
                    : <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{t('Unassigned / No School')}</span>}</td>}
                  <td className="p-3"><span className={user.isActive ? 'text-emerald-700' : 'text-danger-700'}>{t(user.isActive ? 'Enabled' : 'Disabled')}</span>{user.lockedUntil && <span className="mt-1 block text-xs text-amber-700">{t('Locked until {date}', { date: new Date(user.lockedUntil).toLocaleString() })}</span>}</td>
                  <td className="space-x-2 p-3">{isSuperAdmin ? protectedDefaultAdmin ? <span className="text-xs font-semibold text-slate-500">{t('Protected')}</span> : <><button disabled={busy} onClick={() => doAction(() => request('patch', `/users/${user.id}`, { isActive: !user.isActive }), 'Account status updated.')} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold">{t(user.isActive ? 'Disable' : 'Enable')}</button><button disabled={busy} onClick={() => doAction(() => request('post', `/users/${user.id}/unlock`), 'Account unlocked.')} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold">{t('Unlock')}</button><ResetPassword user={user} busy={busy} onReset={(password) => doAction(() => request('post', `/users/${user.id}/reset-password`, { password }), 'Password reset and account unlocked.')} /></> : <span className="text-xs text-slate-500">{t('School account')}</span>}</td>
                </tr>
              )
            })}</tbody>
          </table>
          {!users.filter((user) => user.role === 'School Admin' || !isSuperAdmin).some((user) => {
            const filter = visibleUserFilters.find(({ label }) => label === userFilter)
            return !filter?.role || user.role === filter.role
          }) && !loading && <p className="p-3 text-sm text-slate-500">{t('No users found in this category.')}</p>}
        </div>}
      </SectionTitle>}

      {isSuperAdmin && activeTask === 'system-access' && <SectionTitle title="Regional System Control" description="Open or close the regional SIMS for all non-administrator users.">
        <div className="w-full max-w-2xl space-y-5">
          <div className={`rounded-lg border p-4 ${systemStatus.isSystemActive ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('Current status')}</p>
            <p className={`mt-1 text-lg font-bold ${systemStatus.isSystemActive ? 'text-emerald-700' : 'text-amber-800'}`}>
              {systemStatus.isSystemActive ? t('System Open / Active') : t('System Closed / Maintenance Mode')}
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            {t('Closure or maintenance message')}
            <textarea
              rows="3"
              maxLength={500}
              value={closureMessage}
              onChange={(event) => setClosureMessage(event.target.value)}
              placeholder={t('Enter a message users will see while the system is closed.')}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => doAction(async () => {
              const { data } = await axios.put(
                '/api/system-admin/toggle-status',
                { isSystemActive: !systemStatus.isSystemActive, closureMessage: closureMessage.trim() },
                { headers: { Authorization: `Bearer ${readSessionToken()}` } }
              )
              setSystemStatus({
                isSystemActive: data.isSystemActive,
                closureMessage: data.closureMessage || '',
              })
              setClosureMessage(data.closureMessage || '')
            }, systemStatus.isSystemActive ? 'System closed successfully.' : 'System opened successfully.')}
            className={`rounded-md px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${systemStatus.isSystemActive ? 'bg-danger-700 hover:bg-danger-800' : 'bg-emerald-700 hover:bg-emerald-800'}`}
          >
            {busy ? t('Updating…') : systemStatus.isSystemActive ? t('Close System') : t('Open System')}
          </button>
        </div>
      </SectionTitle>}

      {canManageSetup && ['academic-infrastructure', 'school-profile'].includes(activeTask) && <SectionTitle title={activeTask === 'school-profile' ? 'School Profile & Metadata' : 'Academic Infrastructure'} description={activeTask === 'school-profile' ? 'Review and update your assigned school information.' : 'Maintain academic years, semesters, active grade sections, and school metadata.'}>
        {activeTask === 'school-profile' ? <div className="w-full space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="School name" required maxLength={150} value={setup.school.school_name || ''} onChange={(event) => updateSchool('school_name', event.target.value)} />
            <Field label="School code" value={setup.school.school_code || ''} readOnly />
            <Field label="Region" maxLength={100} value={setup.school.region || ''} onChange={(event) => updateSchool('region', event.target.value)} />
            <Field label="Zone" maxLength={100} value={setup.school.zone || ''} onChange={(event) => updateSchool('zone', event.target.value)} />
            <Field label="Woreda" maxLength={100} value={setup.school.wereda || ''} onChange={(event) => updateSchool('wereda', event.target.value)} />
            <Field label="Contact information" maxLength={255} placeholder="Phone or email" value={setup.school.contact_details || setup.school.contact || ''} onChange={(event) => updateSchool('contact_details', event.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <Field label="Logo URL" maxLength={500} value={setup.school.logo_path || ''} onChange={(event) => updateSchool('logo_path', event.target.value)} />
              <label className="block text-sm font-medium text-slate-700">{t('Upload school logo (JPEG, PNG, WebP; max 3 MB)')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('logo', event.target.files?.[0])} className="mt-1 block w-full text-sm" /></label>
              {setup.school.logo_path && <img src={setup.school.logo_path} alt={t('School logo')} className="h-16 max-w-48 object-contain" />}
            </div>
            <div className="space-y-3">
              <Field label="Official stamp URL" maxLength={500} value={setup.school.stamp_path || ''} onChange={(event) => updateSchool('stamp_path', event.target.value)} />
              <label className="block text-sm font-medium text-slate-700">{t('Upload official stamp (JPEG, PNG, WebP; max 3 MB)')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('stamp', event.target.files?.[0])} className="mt-1 block w-full text-sm" /></label>
              {setup.school.stamp_path && <img src={setup.school.stamp_path} alt={t('Official school stamp')} className="h-16 max-w-48 object-contain" />}
            </div>
            <div className="space-y-3">
              <Field label="Principal signature URL" maxLength={500} value={setup.school.signature_path || ''} onChange={(event) => updateSchool('signature_path', event.target.value)} />
              <label className="block text-sm font-medium text-slate-700">{t('Upload principal digital signature (JPEG, PNG, WebP; max 3 MB)')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('signature', event.target.files?.[0])} className="mt-1 block w-full text-sm" /></label>
              {setup.school.signature_path && <img src={setup.school.signature_path} alt={t('Principal digital signature')} className="h-16 max-w-48 object-contain" />}
            </div>
          </div>
          <button disabled={busy} onClick={() => {
            const { school_name, region, zone, wereda, contact_details, logo_path, stamp_path, signature_path } = setup.school
            doAction(() => request('put', '/setup', { school: { school_name, region, zone, wereda, contact_details, logo_path, stamp_path, signature_path } }), 'School profile saved.')
          }} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t('Save school profile')}</button>
        </div> : <div className="w-full space-y-6">
          {activeTask === 'system-access' && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(setup.school).map(([key, value]) => <Field key={key} label={key.replaceAll('_', ' ')} value={value || ''} onChange={(event) => updateSchool(key, event.target.value)} />)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">{t('Upload school logo (JPEG, PNG, WebP; max 3 MB)')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('logo', event.target.files?.[0])} className="mt-1 block w-full text-sm" />{setup.school.logo_path && <img src={setup.school.logo_path} alt={t('Current school logo')} className="mt-2 h-16 max-w-48 object-contain" />}</label>
              <label className="block text-sm font-medium text-slate-700">{t('Upload official stamp (JPEG, PNG, WebP; max 3 MB)')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('stamp', event.target.files?.[0])} className="mt-1 block w-full text-sm" />{setup.school.stamp_path && <img src={setup.school.stamp_path} alt={t('Current official stamp')} className="mt-2 h-16 max-w-48 object-contain" />}</label>
            </div>
          </>}
          <div><div className="mb-1 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-800">{t('Academic years')}</h3><button onClick={() => updateSetup('years', [...setup.years, { ...blankYear }])} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">{t('Add year')}</button></div>
            <p className="mb-3 text-sm text-slate-500">{t('Define each school year and its dates. Mark the year currently in progress as active; only one year can be active at a time.')}</p>
            {setup.years.map((year, index) => <div key={`${year.id || 'new'}-${index}`} className="mb-2 grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-4">
              <Field label="Academic year name" placeholder="e.g. 2026/2027" value={year.name} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
              <Field label="First day of the school year" type="date" value={year.startDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, startDate: event.target.value } : item))} />
              <Field label="Last day of the school year" type="date" value={year.endDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, endDate: event.target.value } : item))} />
              <label title={t('The active year is used for current student and teacher records.')} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(year.isActive)} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, isActive: event.target.checked } : { ...item, isActive: false }))} />{t('Current academic year')}</label>
            </div>)}
          </div>
          <div><div className="mb-1 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-800">{t('Semesters')}</h3><button onClick={() => updateSetup('terms', [...setup.terms, { ...blankTerm }])} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">{t('Add semester')}</button></div>
            <p className="mb-3 text-sm text-slate-500">{t('Break a school year into semesters, link each semester to its year, and enter its dates. Mark the semester currently in progress as current.')}</p>
            {setup.terms.map((term, index) => <div key={term.id || `semester-${index}`} className="mb-2 grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-4">
              <label className="block text-sm font-medium text-slate-700">{t('School year')}<select value={term.academicYearId} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, academicYearId: event.target.value } : item))} className="mt-1 block w-full rounded border border-slate-300 p-2"><option value="">{t('Choose a school year')}</option>{setup.years.filter((year) => year.id).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
              <Field label="Semester name" placeholder="e.g. Semester 1" value={term.name} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
              <Field label="First day of the semester" type="date" value={term.startDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, startDate: event.target.value } : item))} />
              <Field label="Last day of the semester" type="date" value={term.endDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, endDate: event.target.value } : item))} />
              <label title={t('The current semester is shown in teacher workspaces and used when saving grades.')} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(term.isActive)} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, isActive: event.target.checked } : { ...item, isActive: false }))} />{t('Current semester')}</label>
            </div>)}
          </div>
          <div><div className="mb-1 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-800">{t('Grade sections (9–12)')}</h3><button onClick={() => updateSetup('sections', [...setup.sections, { ...blankSection }])} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">{t('Add grade section')}</button></div>
            <p className="mb-3 text-sm text-slate-500">{t('Create the class groups used for enrollment and teacher assignments. Add one row per grade and section, such as Grade 10 · Section A.')}</p>
            <div className="space-y-2">{setup.sections.map((section, index) => <div key={section.id || `section-${index}`} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-3">
              <label className="block text-sm font-medium text-slate-700">{t('Grade')}<select aria-label={t('Grade level')} value={section.gradeLevel} onChange={(event) => updateSetup('sections', setup.sections.map((item, i) => i === index ? { ...item, gradeLevel: event.target.value } : item))} className="mt-1 rounded border border-slate-300 p-2">{grades.map((grade) => <option key={grade}>{t(grade)}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700">{t('Section name')}<input required maxLength={30} value={section.sectionName} onChange={(event) => updateSetup('sections', setup.sections.map((item, i) => i === index ? { ...item, sectionName: event.target.value } : item))} placeholder={t('e.g. Section A')} className="mt-1 rounded border border-slate-300 p-2 text-sm" /></label>
              <label title={t('Only active sections can be assigned to teachers or selected during enrollment.')} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(section.isActive)} onChange={(event) => updateSetup('sections', setup.sections.map((item, i) => i === index ? { ...item, isActive: event.target.checked } : item))} />{t('Available for enrollment')}</label>
            </div>)}</div>
          </div>
          <button disabled={busy} onClick={() => doAction(() => request('put', '/setup', { ...setup, school: activeTask === 'system-access' ? setup.school : {} }), 'Academic configuration saved.')} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t('Save academic configuration')}</button>
        </div>}
      </SectionTitle>}

      {permitted.has('health') && health && ['audit-logs', 'infrastructure'].includes(activeTask) && <SectionTitle title="System health" description="Live API process and database connection measurements.">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Overall', health.status], ['Database', `${health.database.status} · ${health.database.responseMs} ms`],
          ['Process uptime', `${health.process.uptimeSeconds}s`], ['Process RSS', `${Math.round(health.process.memoryBytes / 1024 / 1024)} MB`],
          ['Host platform', health.host.platform], ['CPU cores', health.host.cpus],
          ['Free memory', `${Math.round(health.host.freeMemoryBytes / 1024 / 1024)} MB`],
          ['Total memory', `${Math.round(health.host.totalMemoryBytes / 1024 / 1024)} MB`],
        ].map(([label, value]) => <div key={label} className="rounded bg-slate-50 p-3"><p className="text-xs text-slate-500">{t(label)}</p><p className="mt-1 font-bold text-slate-800">{typeof value === 'string' ? t(value) : value}</p></div>)}</div>
      </SectionTitle>}

      {isSuperAdmin && activeTask === 'audit-logs' && <SectionTitle title="Recent activity" description="Latest system-wide security and activity events. Updates automatically every 15 seconds.">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">{t('Time')}</th><th className="p-3">{t('Actor')}</th><th className="p-3">{t('Action')}</th><th className="p-3">{t('Module')}</th><th className="p-3">{t('Details')}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{activityLogs.map((entry) => <tr key={entry.id}><td className="p-3 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td><td className="p-3">{entry.actor_id || t('System')}{entry.actor_role ? ` · ${t(entry.actor_role)}` : ''}</td><td className="p-3 font-semibold">{t(entry.action || '')}</td><td className="p-3">{t(entry.module || '')}</td><td className="max-w-sm truncate p-3">{typeof entry.details === 'string' ? t(entry.details) : JSON.stringify(entry.details || {})}</td></tr>)}</tbody>
          </table>
          {!activityLogs.length && !loading && <p className="p-3 text-sm text-slate-500">{t('No activity events have been recorded yet.')}</p>}
        </div>
      </SectionTitle>}

    </div>
  )
}

function ResetPassword({ user, busy, onReset }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  return <span className="inline-flex items-center gap-1"><input aria-label={t('New password for {name}', { name: user.name })} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('New password')} className="w-28 rounded border border-slate-300 px-2 py-1.5 text-xs" /><button disabled={busy || !password} onClick={() => { onReset(password); setPassword('') }} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold disabled:opacity-50">{t('Reset')}</button></span>
}
