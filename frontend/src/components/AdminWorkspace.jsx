import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { readSessionToken } from '../pages/LoginPage.jsx'
import TeacherClassAssignments from './TeacherClassAssignments.jsx'

const roleOptions = ['Super Admin', 'School Admin', 'Registrar', 'Headmaster', 'Vice Principal', 'Supervisor', 'Teacher', 'Student']
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
const blankRegisteredSchool = { name: '', code: '', region: '', zone: '', wereda: '', contactDetails: '', stamp: null, logo: null }
const registrationRoles = [
  { role: 'School Admin', label: 'School Admin' },
  { role: 'Teacher', label: 'Teacher' },
  { role: 'Registrar', label: 'Registrar' },
  { role: 'Student', label: 'Student' },
]
const blankUser = { name: '', email: '', password: '', role: 'School Admin', schoolId: '', gradeLevel: '', section: '', studentNumber: '', department: '', subjects: '', classAssignments: [] }
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
  schools: 'Schools',
  'role-assign': 'Role Assign',
  'all-users': 'Register Users',
  'audit-logs': 'System Security & Audit Logs',
  infrastructure: 'Database & Infrastructure Setup',
  'system-access': 'System Administration',
  'academic-infrastructure': 'Academic Infrastructure',
  'school-profile': 'School Profile & Metadata',
  'staff-registration': 'Register Staff',
  'staff-oversight': 'School Staff Oversight',
  'student-rosters': 'Student Rosters',
}

function SectionTitle({ title, description, children }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
        {children}
      </div>
    </section>
  )
}

function Field({ label, ...props }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input {...props} className={`mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 ${props.className || ''}`} /></label>
}

function getWorkspaceErrorMessage(error, fallback) {
  if (error.response?.status === 503) {
    return 'Administrative service is temporarily unavailable. Please try again.'
  }
  const message = error.response?.data?.message
  return message || fallback
}

export default function AdminWorkspace({ activeTask }) {
  const [access, setAccess] = useState(null)
  const [users, setUsers] = useState([])
  const [userFilter, setUserFilter] = useState('All')
  const [schools, setSchools] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [newSchool, setNewSchool] = useState(blankRegisteredSchool)
  const [registrationRole, setRegistrationRole] = useState('School Admin')
  const [newUser, setNewUser] = useState(blankUser)
  const [registrationSuccess, setRegistrationSuccess] = useState('')
  const [registrationError, setRegistrationError] = useState('')
  const [registrationToast, setRegistrationToast] = useState(null)
  const [workspaceToast, setWorkspaceToast] = useState(null)
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
  const [notice, setNotice] = useState('')

  const request = async (method, url, data) => axios({
    method,
    url: `/api/admin${url}`,
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
      if ((section === 'schools' || section === 'system-access') && accessData.isSuperAdmin) {
        tasks.push(request('get', '/schools').then(({ data }) => setSchools(data)))
      }
      if ((section === 'all-users' || section === 'system-access') && granted.has('users')) {
        tasks.push(request('get', '/users').then(({ data }) => {
          setUsers(data)
        }))
      }
      if (section === 'all-users') {
        tasks.push(request('get', '/schools').then(({ data }) => setSchools(data)))
      }
      if (section === 'audit-logs' && accessData.isSuperAdmin) {
        tasks.push(request('get', '/activity-logs').then(({ data }) => setActivityLogs(data)))
      }
      if (['system-access', 'academic-infrastructure', 'school-profile', 'staff-registration'].includes(section)
        && (granted.has('setup') || accessData.role === 'School Admin')) {
        tasks.push(request('get', '/setup').then(({ data }) => setSetup({
          ...data,
          school: { ...blankSchool, ...data.school },
          years: data.years.map((item) => ({ ...item, isActive: Boolean(item.isActive) })),
          terms: data.terms.map((item) => ({ ...item, name: String(item.name || '').replace(/^(?:term|semester|semister)\s*/i, 'Semester ').trim(), isActive: Boolean(item.isActive) })),
          sections: data.sections.map((item) => ({ ...item, isActive: Boolean(item.isActive) })),
        })))
      }
      if (['audit-logs', 'infrastructure', 'system-access'].includes(section) && granted.has('health')) {
        tasks.push(request('get', '/health').then(({ data }) => setHealth(data)))
      }
      if (section === 'system-access' && granted.has('delegations')) {
        tasks.push(request('get', '/delegations').then(({ data }) => setDelegations(data)))
      }
      if (section === 'system-access' && granted.has('archive')) {
        tasks.push(request('get', '/archive').then(({ data }) => setArchived(data)))
        tasks.push(request('get', '/graduates').then(({ data }) => setGraduates(data)))
        tasks.push(request('get', '/graduation-candidates').then(({ data }) => setGraduationCandidates(data)))
      }
      await Promise.all(tasks)
    } catch (requestError) {
      setError(getWorkspaceErrorMessage(requestError, 'Unable to load administrative workspace.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [activeTask])
  useEffect(() => {
    if (!registrationToast) return undefined
    const timer = window.setTimeout(() => setRegistrationToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [registrationToast])
  useEffect(() => {
    if (!workspaceToast) return undefined
    const timer = window.setTimeout(() => setWorkspaceToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [workspaceToast])
  useEffect(() => {
    if (activeTask !== 'audit-logs') return undefined
    const timer = window.setInterval(() => {
      request('get', '/activity-logs')
        .then(({ data }) => setActivityLogs(data))
        .catch((requestError) => setError(getWorkspaceErrorMessage(requestError, 'Unable to refresh audit logs.')))
    }, 15000)
    return () => window.clearInterval(timer)
  }, [activeTask])
  const permitted = useMemo(() => new Set(access?.isSuperAdmin ? capabilities : access?.permissions || []), [access])
  const isSuperAdmin = access?.isSuperAdmin === true
  const isSchoolAdmin = access?.role === 'School Admin'
  const canManageSetup = permitted.has('setup') || isSchoolAdmin
  const canRegisterUsers = permitted.has('users') && ['all-users', 'system-access'].includes(activeTask)
    || isSchoolAdmin && activeTask === 'staff-registration'
  const visibleRegistrationRoles = isSuperAdmin
    ? registrationRoles.filter(({ role }) => role === 'School Admin')
    : isSchoolAdmin
      ? registrationRoles.filter(({ role }) => !['School Admin', 'Student'].includes(role))
      : registrationRoles
  const visibleUserFilters = isSuperAdmin
    ? userFilters.filter(({ label }) => ['All', 'School Admins'].includes(label))
    : isSchoolAdmin
      ? userFilters.filter(({ label }) => ['All', 'Teachers', 'Registrars', 'Students', 'Headmasters', 'Vice Principals', 'Supervisors'].includes(label))
      : userFilters

  useEffect(() => {
    if (isSchoolAdmin && activeTask === 'staff-registration' && registrationRole === 'School Admin') {
      setRegistrationRole('Teacher')
      setNewUser((current) => ({ ...current, role: 'Teacher' }))
    }
  }, [activeTask, isSchoolAdmin, registrationRole])

  const doAction = async (action, successMessage) => {
    setBusy(true); setError(''); setNotice(''); setVerificationCode('')
    try {
      await action()
      setNotice(successMessage)
      setWorkspaceToast({ type: 'success', message: successMessage })
      await load(activeTask)
    } catch (requestError) {
      setError(getWorkspaceErrorMessage(requestError, 'The requested change could not be completed.'))
      setWorkspaceToast({ type: 'error', message: getWorkspaceErrorMessage(requestError, 'The requested change could not be completed.') })
    } finally { setBusy(false) }
  }

  const updateUser = (id, patch) => setUsers((current) => current.map((user) => user.id === id ? { ...user, ...patch } : user))
  const updateSetup = (key, value) => setSetup((current) => ({ ...current, [key]: value }))
  const updateSchool = (key, value) => setSetup((current) => ({ ...current, school: { ...current.school, [key]: value } }))
  const registerSchool = async (event) => {
    event.preventDefault()
    await doAction(async () => {
      const formData = new FormData()
      Object.entries(newSchool).forEach(([key, value]) => {
        if (value) formData.append(key, value)
      })
      await request('post', '/schools', formData)
      setNewSchool(blankRegisteredSchool)
    }, 'School registered.')
  }
  const registerUser = async (event) => {
    event.preventDefault()
    setBusy(true)
    setRegistrationSuccess('')
    setRegistrationError('')
    setError('')
    try {
      const { schoolId, ...userDetails } = newUser
      await request('post', '/users', { ...userDetails, school_id: schoolId, role: registrationRole })
      setNewUser({ ...blankUser, role: registrationRole })
      setRegistrationSuccess(`${registrationRole} registered successfully!`)
      setRegistrationToast({ type: 'success', message: `${registrationRole} registered successfully.` })
      await load(activeTask)
    } catch (requestError) {
      const message = requestError.response?.data?.message || 'Registration failed. Please try again.'
      setRegistrationError(message)
      setRegistrationToast({ type: 'error', message })
    } finally {
      setBusy(false)
    }
  }
  const uploadAsset = async (type, file) => {
    if (!file) return
    const formData = new FormData()
    formData.append('assetType', type)
    formData.append('asset', file)
    setBusy(true); setError(''); setNotice('')
    try {
      const { data } = await request('post', '/school-assets', formData)
      updateSchool(data.settingKey, data.path)
      setNotice(`${type === 'logo' ? 'School logo' : 'Official stamp'} uploaded.`)
      setWorkspaceToast({ type: 'success', message: `${type === 'logo' ? 'School logo' : 'Official stamp'} uploaded.` })
    } catch (requestError) {
      setError(getWorkspaceErrorMessage(requestError, 'Unable to upload school image.'))
      setWorkspaceToast({ type: 'error', message: getWorkspaceErrorMessage(requestError, 'Unable to upload school image.') })
    } finally { setBusy(false) }
  }

  if (loading && !access) return <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading {workspaceTitles[activeTask] || 'workspace'}…</p>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{workspaceTitles[activeTask] || 'Administration'}</h2>
        {loading && <p role="status" className="mt-1 text-xs text-slate-500">Refreshing workspace data…</p>}
      </div>
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {workspaceToast && <div role={workspaceToast.type === 'error' ? 'alert' : 'status'} className={`fixed right-4 top-20 z-50 max-w-sm rounded-md border p-4 text-sm shadow-lg ${workspaceToast.type === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'}`}>{workspaceToast.message}</div>}
      {registrationToast && <div role={registrationToast.type === 'error' ? 'alert' : 'status'} className={`fixed right-4 top-20 z-50 max-w-sm rounded-md border p-4 text-sm shadow-lg ${registrationToast.type === 'error' ? 'border-danger-200 bg-danger-50 text-danger-800' : 'border-success-200 bg-success-50 text-success-800'}`}>{registrationToast.message}</div>}
      {verificationCode && <p className="rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900">Transcript verification code: <strong className="select-all font-mono">{verificationCode}</strong></p>}
      {!access && !error && <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading workspace…</p>}
      {!isSuperAdmin && ['schools', 'all-users', 'audit-logs', 'infrastructure'].includes(activeTask) && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This system-level workspace is available to Super Admins only.</p>}

      {isSuperAdmin && activeTask === 'schools' && <>
        <SectionTitle title="Register a school" description="Add an institution and its official contact and identity information.">
          <form onSubmit={registerSchool} className="w-full space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="School name" required maxLength={150} value={newSchool.name} onChange={(event) => setNewSchool({ ...newSchool, name: event.target.value })} />
              <Field label="School code" required maxLength={50} value={newSchool.code} onChange={(event) => setNewSchool({ ...newSchool, code: event.target.value })} />
              <Field label="Region" maxLength={100} value={newSchool.region} onChange={(event) => setNewSchool({ ...newSchool, region: event.target.value })} />
              <Field label="Zone" maxLength={100} value={newSchool.zone} onChange={(event) => setNewSchool({ ...newSchool, zone: event.target.value })} />
              <Field label="Wereda" maxLength={100} value={newSchool.wereda} onChange={(event) => setNewSchool({ ...newSchool, wereda: event.target.value })} />
              <Field label="Contact details" maxLength={255} placeholder="Phone or email" value={newSchool.contactDetails} onChange={(event) => setNewSchool({ ...newSchool, contactDetails: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Official stamp (optional; JPEG, PNG, WebP; max 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setNewSchool({ ...newSchool, stamp: event.target.files?.[0] || null })} className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" /></label>
              <label className="block text-sm font-medium text-slate-700">School logo (optional; JPEG, PNG, WebP; max 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setNewSchool({ ...newSchool, logo: event.target.files?.[0] || null })} className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm" /></label>
            </div>
            <button disabled={busy} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Register school</button>
          </form>
        </SectionTitle>
        <SectionTitle title="Registered schools" description="Review and activate or deactivate institutions in the system.">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">School</th><th className="p-3">Code</th><th className="p-3">Location</th><th className="p-3">Contact</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{schools.map((school) => <tr key={school.id}><td className="p-3 font-semibold">{school.name}</td><td className="p-3">{school.code}</td><td className="p-3">{[school.region, school.zone, school.wereda].filter(Boolean).join(', ') || '—'}</td><td className="p-3">{school.contact_details || '—'}</td><td className="p-3">{school.status}</td><td className="p-3"><button disabled={busy} onClick={() => doAction(() => request('patch', `/schools/${school.id}/status`, { status: school.status === 'active' ? 'inactive' : 'active' }), 'School status updated.')} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{school.status === 'active' ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody>
            </table>
            {!schools.length && !loading && <p className="p-3 text-sm text-slate-500">No schools have been registered yet.</p>}
          </div>
        </SectionTitle>
      </>}

      {canRegisterUsers && <SectionTitle title={isSchoolAdmin ? activeTask === 'staff-registration' ? 'Register School Staff' : 'User accounts' : 'User accounts'} description={isSchoolAdmin ? activeTask === 'staff-registration' ? 'Create Teacher and Registrar accounts for your assigned school.' : 'Manage accounts for your assigned school.' : 'Activate accounts, manage roles, reset passwords, and clear login lockouts.'}>
        {['all-users', 'staff-registration'].includes(activeTask) && <div className="w-full space-y-5">
          <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4" role="tablist" aria-label="Choose user type to register">
            {visibleRegistrationRoles.map(({ role: itemRole, label }) => <button
              key={itemRole}
              id={`register-tab-${itemRole.replaceAll(' ', '-')}`}
              type="button"
              role="tab"
              aria-selected={registrationRole === itemRole}
              aria-controls="user-registration-form"
              onClick={() => {
                setRegistrationRole(itemRole)
                setNewUser((current) => ({ ...current, role: itemRole }))
                setRegistrationSuccess('')
                setRegistrationError('')
              }}
              className={`rounded-md border px-3 py-2 text-sm font-semibold transition ${registrationRole === itemRole ? 'border-primary-800 bg-primary-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
            >Register {label}</button>)}
          </div>
          <form id="user-registration-form" role="tabpanel" aria-labelledby={`register-tab-${registrationRole.replaceAll(' ', '-')}`} onSubmit={registerUser} className="space-y-4 rounded-md bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">Register {registrationRole}</h3>
            {registrationSuccess && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{registrationSuccess}</p>}
            {registrationError && <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{registrationError}</p>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={registrationRole === 'Student' ? 'Student name' : 'Name'} required maxLength={100} autoComplete="name" value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} />
              <Field label="Email" type="email" required maxLength={100} autoComplete="email" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} />
              <Field label="Password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
              {isSchoolAdmin
                ? <p className="self-end rounded-md bg-white p-3 text-sm text-slate-600">New accounts will be assigned to your school.</p>
                : <label className="block text-sm font-medium text-slate-700">{registrationRole === 'School Admin' ? 'Assigned School ID' : 'Assigned School'}<select required value={newUser.schoolId} onChange={(event) => setNewUser({ ...newUser, schoolId: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Select an active school</option>{schools.filter((school) => school.status === 'active').map((school) => <option key={school.id} value={school.id}>{registrationRole === 'School Admin' ? `${school.id} — ${school.name}` : school.name}</option>)}</select></label>}
              {registrationRole === 'Teacher' && <>
                <Field label="Department" required maxLength={100} value={newUser.department} onChange={(event) => setNewUser({ ...newUser, department: event.target.value })} />
                <Field label="Subjects" required maxLength={2000} placeholder="Separate subjects with commas" value={newUser.subjects} onChange={(event) => setNewUser({ ...newUser, subjects: event.target.value })} />
                <div className="sm:col-span-2 lg:col-span-3"><TeacherClassAssignments sections={setup.sections} value={newUser.classAssignments} onChange={(classAssignments) => setNewUser({ ...newUser, classAssignments })} disabled={busy} /></div>
              </>}
              {registrationRole === 'Student' && <>
                <Field label="Student ID (optional)" maxLength={50} value={newUser.studentNumber} onChange={(event) => setNewUser({ ...newUser, studentNumber: event.target.value })} />
                <label className="block text-sm font-medium text-slate-700">Grade level<select required value={newUser.gradeLevel} onChange={(event) => setNewUser({ ...newUser, gradeLevel: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Select grade</option>{grades.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
                <Field label="Section" required maxLength={30} placeholder="e.g. 9A" value={newUser.section} onChange={(event) => setNewUser({ ...newUser, section: event.target.value })} />
              </>}
            </div>
            <button disabled={busy || (registrationRole === 'Teacher' && !newUser.classAssignments.length) || (!isSchoolAdmin && !schools.some((school) => school.status === 'active'))} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Registering…' : `Register ${registrationRole}`}</button>
          </form>
          {activeTask !== 'staff-registration' && <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4" role="group" aria-label="Filter users by role">
            {visibleUserFilters.map(({ label }) => <button key={label} type="button" onClick={() => setUserFilter(label)} aria-pressed={userFilter === label} className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${userFilter === label ? 'border-primary-800 bg-primary-800 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}
          </div>}
        </div>}
        {activeTask !== 'staff-registration' && <div className="w-full overflow-x-auto">
          <table className="min-w-[850px] w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status / lock</th><th className="p-3">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{users.filter((user) => {
              const filter = visibleUserFilters.find(({ label }) => label === userFilter)
              return !filter?.role || user.role === filter.role
            }).map((user) => {
              const protectedDefaultAdmin = isProtectedDefaultAdmin(user)
              return (
                <tr key={user.id}>
                  <td className="p-3"><strong className="block text-slate-800">{user.name}</strong><span className="text-xs text-slate-500">ID {user.id} · {user.email}</span></td>
                  <td className="p-3">{isSuperAdmin
                    ? <><select disabled={protectedDefaultAdmin} value={user.role} onChange={(event) => updateUser(user.id, { role: event.target.value })} className="rounded border border-slate-300 px-2 py-1.5 disabled:cursor-not-allowed disabled:bg-slate-100">{roleOptions.map((role) => <option key={role}>{role}</option>)}</select>{!protectedDefaultAdmin && <button disabled={busy} onClick={() => doAction(() => request('patch', `/users/${user.id}`, { role: user.role }), 'Role updated.')} className="ml-2 rounded bg-primary-700 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save role</button>}</>
                    : user.role}</td>
                  <td className="p-3"><span className={user.isActive ? 'text-emerald-700' : 'text-danger-700'}>{user.isActive ? 'Enabled' : 'Disabled'}</span>{user.lockedUntil && <span className="mt-1 block text-xs text-amber-700">Locked until {new Date(user.lockedUntil).toLocaleString()}</span>}</td>
                  <td className="space-x-2 p-3">{isSuperAdmin ? protectedDefaultAdmin ? <span className="text-xs font-semibold text-slate-500">Protected</span> : <><button disabled={busy} onClick={() => doAction(() => request('patch', `/users/${user.id}`, { isActive: !user.isActive }), 'Account status updated.')} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold">{user.isActive ? 'Disable' : 'Enable'}</button><button disabled={busy} onClick={() => doAction(() => request('post', `/users/${user.id}/unlock`), 'Account unlocked.')} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold">Unlock</button><ResetPassword user={user} busy={busy} onReset={(password) => doAction(() => request('post', `/users/${user.id}/reset-password`, { password }), 'Password reset and account unlocked.')} /></> : <span className="text-xs text-slate-500">School account</span>}</td>
                </tr>
              )
            })}</tbody>
          </table>
          {!users.some((user) => {
            const filter = visibleUserFilters.find(({ label }) => label === userFilter)
            return !filter?.role || user.role === filter.role
          }) && !loading && <p className="p-3 text-sm text-slate-500">No users found in this category.</p>}
        </div>}
      </SectionTitle>}

      {canManageSetup && ['system-access', 'academic-infrastructure', 'school-profile'].includes(activeTask) && <SectionTitle title={activeTask === 'school-profile' ? 'School Profile & Metadata' : activeTask === 'academic-infrastructure' ? 'Academic Infrastructure' : 'Academic and school setup'} description={activeTask === 'school-profile' ? 'Review and update your assigned school information.' : 'Maintain academic years, semesters, active grade sections, and school metadata.'}>
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
              <label className="block text-sm font-medium text-slate-700">Upload school logo (JPEG, PNG, WebP; max 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('logo', event.target.files?.[0])} className="mt-1 block w-full text-sm" /></label>
              {setup.school.logo_path && <img src={setup.school.logo_path} alt="School logo" className="h-16 max-w-48 object-contain" />}
            </div>
            <div className="space-y-3">
              <Field label="Official stamp URL" maxLength={500} value={setup.school.stamp_path || ''} onChange={(event) => updateSchool('stamp_path', event.target.value)} />
              <label className="block text-sm font-medium text-slate-700">Upload official stamp (JPEG, PNG, WebP; max 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('stamp', event.target.files?.[0])} className="mt-1 block w-full text-sm" /></label>
              {setup.school.stamp_path && <img src={setup.school.stamp_path} alt="Official school stamp" className="h-16 max-w-48 object-contain" />}
            </div>
          </div>
          <button disabled={busy} onClick={() => {
            const { school_name, region, zone, wereda, contact_details, logo_path, stamp_path } = setup.school
            doAction(() => request('put', '/setup', { school: { school_name, region, zone, wereda, contact_details, logo_path, stamp_path } }), 'School profile saved.')
          }} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save school profile</button>
        </div> : <div className="w-full space-y-6">
          {activeTask === 'system-access' && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(setup.school).map(([key, value]) => <Field key={key} label={key.replaceAll('_', ' ')} value={value || ''} onChange={(event) => updateSchool(key, event.target.value)} />)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Upload school logo (JPEG, PNG, WebP; max 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('logo', event.target.files?.[0])} className="mt-1 block w-full text-sm" />{setup.school.logo_path && <img src={setup.school.logo_path} alt="Current school logo" className="mt-2 h-16 max-w-48 object-contain" />}</label>
              <label className="block text-sm font-medium text-slate-700">Upload official stamp (JPEG, PNG, WebP; max 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => uploadAsset('stamp', event.target.files?.[0])} className="mt-1 block w-full text-sm" />{setup.school.stamp_path && <img src={setup.school.stamp_path} alt="Current official stamp" className="mt-2 h-16 max-w-48 object-contain" />}</label>
            </div>
          </>}
          <div><div className="mb-1 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-800">Academic years</h3><button onClick={() => updateSetup('years', [...setup.years, { ...blankYear }])} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">Add year</button></div>
            <p className="mb-3 text-sm text-slate-500">Define each school year and its dates. Mark the year currently in progress as active; only one year can be active at a time.</p>
            {setup.years.map((year, index) => <div key={`${year.id || 'new'}-${index}`} className="mb-2 grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-4">
              <Field label="Academic year name" placeholder="e.g. 2026/2027" value={year.name} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
              <Field label="First day of the school year" type="date" value={year.startDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, startDate: event.target.value } : item))} />
              <Field label="Last day of the school year" type="date" value={year.endDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, endDate: event.target.value } : item))} />
              <label title="The active year is used for current student and teacher records." className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(year.isActive)} onChange={(event) => updateSetup('years', setup.years.map((item, i) => i === index ? { ...item, isActive: event.target.checked } : { ...item, isActive: false }))} />Current academic year</label>
            </div>)}
          </div>
          <div><div className="mb-1 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-800">Semesters</h3><button onClick={() => updateSetup('terms', [...setup.terms, { ...blankTerm }])} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">Add semester</button></div>
            <p className="mb-3 text-sm text-slate-500">Break a school year into semesters, link each semester to its year, and enter its dates. Mark the semester currently in progress as current.</p>
            {setup.terms.map((term, index) => <div key={term.id || `semester-${index}`} className="mb-2 grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-4">
              <label className="block text-sm font-medium text-slate-700">School year<select value={term.academicYearId} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, academicYearId: event.target.value } : item))} className="mt-1 block w-full rounded border border-slate-300 p-2"><option value="">Choose a school year</option>{setup.years.filter((year) => year.id).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
              <Field label="Semester name" placeholder="e.g. Semester 1" value={term.name} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
              <Field label="First day of the semester" type="date" value={term.startDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, startDate: event.target.value } : item))} />
              <Field label="Last day of the semester" type="date" value={term.endDate?.slice(0, 10) || ''} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, endDate: event.target.value } : item))} />
              <label title="The current semester is shown in teacher workspaces and used when saving grades." className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(term.isActive)} onChange={(event) => updateSetup('terms', setup.terms.map((item, i) => i === index ? { ...item, isActive: event.target.checked } : { ...item, isActive: false }))} />Current semester</label>
            </div>)}
          </div>
          <div><div className="mb-1 flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-800">Grade sections (9–12)</h3><button onClick={() => updateSetup('sections', [...setup.sections, { ...blankSection }])} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">Add grade section</button></div>
            <p className="mb-3 text-sm text-slate-500">Create the class groups used for enrollment and teacher assignments. Add one row per grade and section, such as Grade 10 · Section A.</p>
            <div className="space-y-2">{setup.sections.map((section, index) => <div key={section.id || `section-${index}`} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-3">
              <label className="block text-sm font-medium text-slate-700">Grade<select aria-label="Grade level" value={section.gradeLevel} onChange={(event) => updateSetup('sections', setup.sections.map((item, i) => i === index ? { ...item, gradeLevel: event.target.value } : item))} className="mt-1 rounded border border-slate-300 p-2">{grades.map((grade) => <option key={grade}>{grade}</option>)}</select></label>
              <label className="block text-sm font-medium text-slate-700">Section name<input required maxLength={30} value={section.sectionName} onChange={(event) => updateSetup('sections', setup.sections.map((item, i) => i === index ? { ...item, sectionName: event.target.value } : item))} placeholder="e.g. Section A" className="mt-1 rounded border border-slate-300 p-2 text-sm" /></label>
              <label title="Only active sections can be assigned to teachers or selected during enrollment." className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(section.isActive)} onChange={(event) => updateSetup('sections', setup.sections.map((item, i) => i === index ? { ...item, isActive: event.target.checked } : item))} />Available for enrollment</label>
            </div>)}</div>
          </div>
          <button disabled={busy} onClick={() => doAction(() => request('put', '/setup', { ...setup, school: activeTask === 'system-access' ? setup.school : {} }), 'Academic configuration saved.')} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save academic configuration</button>
        </div>}
      </SectionTitle>}

      {permitted.has('delegations') && activeTask === 'system-access' && <SectionTitle title="Temporary role delegation" description="Delegate selected system capabilities for up to 4 hours. Delegations can be revoked early.">
        <div className="w-full space-y-4">
          {access.isSuperAdmin && <><div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Administrator<select value={newDelegation.userId} onChange={(event) => setNewDelegation({ ...newDelegation, userId: event.target.value })} className="mt-1 block w-full rounded border border-slate-300 p-2"><option value="">Select active non-Super Admin</option>{users.filter((user) => user.isActive && user.role !== 'Super Admin').map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}</select></label>
            <Field label="Duration in minutes (1–240)" type="number" min="1" max="240" value={newDelegation.durationMinutes} onChange={(event) => setNewDelegation({ ...newDelegation, durationMinutes: Number(event.target.value) })} />
            <div className="flex items-end"><button disabled={busy} onClick={() => doAction(() => request('post', '/delegations', newDelegation), 'Temporary delegation created.')} className="rounded-md bg-primary-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create delegation</button></div>
          </div>
          <div className="flex flex-wrap gap-3">{capabilities.map((capability) => <label key={capability} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={newDelegation.permissions.includes(capability)} onChange={(event) => setNewDelegation({ ...newDelegation, permissions: event.target.checked ? [...newDelegation.permissions, capability] : newDelegation.permissions.filter((item) => item !== capability) })} />{capabilityLabels[capability]}</label>)}</div>
          </>}
          <div className="divide-y rounded border border-slate-200">{delegations.map((delegation) => <div key={delegation.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><span><strong>{delegation.userName}</strong> · {new Date(delegation.expiresAt).toLocaleString()} · {String(delegation.permissions)}</span>{access.isSuperAdmin && !delegation.revokedAt && new Date(delegation.expiresAt) > new Date() && <button onClick={() => doAction(() => request('delete', `/delegations/${delegation.id}`), 'Delegation revoked.')} className="rounded border border-danger-300 px-3 py-1.5 text-xs font-semibold text-danger-700">Revoke</button>}</div>)}</div>
        </div>
      </SectionTitle>}

      {permitted.has('archive') && activeTask === 'system-access' && <SectionTitle title="Graduate archive and purge" description="Archive first. Purge requires exact confirmation and preserves a minimal transcript-verification record.">
        <div className="w-full space-y-4">
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Grade 12 student</th><th className="p-3">Section</th><th className="p-3">Year</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y">{graduationCandidates.map((student) => <tr key={student.id}><td className="p-3">{student.name} · ID {student.id}</td><td className="p-3">{student.section}</td><td className="p-3">{student.academicYear}</td><td className="p-3"><button disabled={busy} onClick={() => { const confirmation = window.prompt(`Mark student ${student.id} as graduated? Type GRADUATED ${student.id} to confirm.`); if (confirmation === `GRADUATED ${student.id}`) doAction(() => request('post', `/graduates/${student.id}`, { confirmation }), 'Student marked graduated.') }} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">Mark graduated…</button></td></tr>)}</tbody></table></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Graduated student</th><th className="p-3">Grade / section</th><th className="p-3">Year</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y">{graduates.map((student) => <tr key={student.id}><td className="p-3">{student.name} · ID {student.id}</td><td className="p-3">{student.gradeLevel} / {student.section}</td><td className="p-3">{student.academicYear}</td><td className="p-3"><button disabled={busy} onClick={() => { const confirmation = window.prompt(`Archive graduated student ${student.id}? Type ARCHIVE ${student.id} to confirm.`); if (confirmation === `ARCHIVE ${student.id}`) doAction(async () => { const { data } = await request('post', `/archive/${student.id}`, { confirmation }); setVerificationCode(data.verificationCode) }, 'Student archived; transcript verification retained.') }} className="rounded border border-primary-300 px-3 py-1.5 text-xs font-semibold text-primary-800">Archive…</button></td></tr>)}</tbody></table></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Archived student</th><th className="p-3">Grade / section</th><th className="p-3">Academic year</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y">{archived.map((student) => <tr key={student.id}><td className="p-3">{student.name} · ID {student.id}</td><td className="p-3">{student.gradeLevel} / {student.section}</td><td className="p-3">{student.academicYear}</td><td className="p-3"><button disabled={busy} onClick={() => { const confirmation = window.prompt(`Purge student ${student.id}? Type PURGE ${student.id} to confirm.`); if (confirmation === `PURGE ${student.id}`) doAction(() => request('delete', `/archive/${student.id}`, { confirmation }), 'Student data purged; verification record retained.') }} className="rounded border border-danger-300 px-3 py-1.5 text-xs font-semibold text-danger-700">Purge…</button></td></tr>)}</tbody></table></div>
          <p className="text-xs text-slate-500">Public verification endpoint: GET /api/admin/transcript-verification/&lt;verification-code&gt;</p>
        </div>
      </SectionTitle>}

      {permitted.has('health') && health && ['audit-logs', 'infrastructure', 'system-access'].includes(activeTask) && <SectionTitle title="System health" description="Live API process and database connection measurements.">
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
          ['Overall', health.status], ['Database', `${health.database.status} · ${health.database.responseMs} ms`],
          ['Process uptime', `${health.process.uptimeSeconds}s`], ['Process RSS', `${Math.round(health.process.memoryBytes / 1024 / 1024)} MB`],
          ['Host platform', health.host.platform], ['CPU cores', health.host.cpus],
          ['Free memory', `${Math.round(health.host.freeMemoryBytes / 1024 / 1024)} MB`],
          ['Total memory', `${Math.round(health.host.totalMemoryBytes / 1024 / 1024)} MB`],
        ].map(([label, value]) => <div key={label} className="rounded bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div>)}</div>
      </SectionTitle>}

      {isSuperAdmin && activeTask === 'audit-logs' && <SectionTitle title="Recent activity" description="Latest system-wide security and activity events. Updates automatically every 15 seconds.">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Time</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Module</th><th className="p-3">Details</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{activityLogs.map((entry) => <tr key={entry.id}><td className="p-3 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td><td className="p-3">{entry.actor_id || 'System'}{entry.actor_role ? ` · ${entry.actor_role}` : ''}</td><td className="p-3 font-semibold">{entry.action}</td><td className="p-3">{entry.module}</td><td className="max-w-sm truncate p-3">{typeof entry.details === 'string' ? entry.details : JSON.stringify(entry.details || {})}</td></tr>)}</tbody>
          </table>
          {!activityLogs.length && !loading && <p className="p-3 text-sm text-slate-500">No activity events have been recorded yet.</p>}
        </div>
      </SectionTitle>}

    </div>
  )
}

function ResetPassword({ user, busy, onReset }) {
  const [password, setPassword] = useState('')
  return <span className="inline-flex items-center gap-1"><input aria-label={`New password for ${user.name}`} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" className="w-28 rounded border border-slate-300 px-2 py-1.5 text-xs" /><button disabled={busy || !password} onClick={() => { onReset(password); setPassword('') }} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold disabled:opacity-50">Reset</button></span>
}
