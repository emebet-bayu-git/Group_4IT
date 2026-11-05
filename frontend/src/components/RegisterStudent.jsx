import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { Camera, Check, ChevronLeft, ChevronRight, GraduationCap, ShieldCheck, Upload, UserRound } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const steps = [
  { title: 'Personal details', short: 'Personal Details & Photo', icon: UserRound },
  { title: 'Guardian info', short: 'Guardian / Parent Info', icon: ShieldCheck },
  { title: 'Academic assignment', short: 'Class & Academic Year', icon: GraduationCap },
]

const getTodayDate = () => {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}
const initialData = {
  fullName: '', dob: '', gender: '', photoFile: null, parentPhoto: null, email: '', password: '',
  phoneNumber: '', previousSchool: '', guardianName: '', guardianRelation: '', guardianPhone: '',
  guardianEmail: '', emergencyContactName: '', emergencyContactPhone: '',
  region: '', zone: '', woreda: '', kebele: '', houseNo: '',
  grade: '', section: '', academicYear: '', registrationDate: getTodayDate(),
}
const fallbackAcademicOptions = {
  years: [],
  sections: ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].flatMap((gradeLevel) => (
    ['Section A', 'Section B', 'Section C'].map((sectionName) => ({ gradeLevel, sectionName }))
  )),
}

function Field({ name, label, type = 'text', requiredField = true, placeholder, options, onChange, data, setField, touch, inputClass, hasError, touched, isValid }) {
  const { t } = useTranslation()
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {t(label)}{requiredField && <span className="ml-1 text-danger-600">*</span>}
      <div className="relative">
        {options ? <select value={data[name]} onChange={(event) => onChange ? onChange(event.target.value) : setField(name, event.target.value)} onBlur={() => touch(name)} className={inputClass(name)}><option value="">{t('Select {field}', { field: label.toLowerCase() })}</option>{options.map((option) => <option key={option} value={option}>{t(option)}</option>)}</select> : <input type={type} value={data[name]} onChange={(event) => setField(name, event.target.value)} onBlur={() => touch(name)} placeholder={placeholder ? t(placeholder) : undefined} className={inputClass(name)} />}
        {touched[name] && isValid(name) && data[name] && <Check className="absolute right-3 top-[19px] h-4 w-4 text-success-600" />}
      </div>
      {hasError(name) && <span className="mt-1 block text-xs font-medium text-danger-600">{t(name === 'password' ? 'Password must be 8–72 characters.' : 'Enter a valid value.')}</span>}
    </label>
  )
}

export default function RegisterStudent({ onCancel, onComplete, student = null, allowUnassigned = false }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [data, setData] = useState(() => student ? {
    ...initialData,
    ...student,
    dob: String(student.dob || '').slice(0, 10),
    registrationDate: String(student.registrationDate || '').slice(0, 10),
    photoFile: null,
    parentPhoto: null,
    password: '',
  } : initialData)
  const [touched, setTouched] = useState({})
  const [photoPreview, setPhotoPreview] = useState(student?.photoUrl || '')
  const [parentPhotoPreview, setParentPhotoPreview] = useState(student?.parentPhotoUrl || '')
  const [saving, setSaving] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [academicOptions, setAcademicOptions] = useState(fallbackAcademicOptions)
  const setField = (field, value) => setData((current) => ({ ...current, [field]: value }))
  const touch = (field) => setTouched((current) => ({ ...current, [field]: true }))
  useEffect(() => {
    let active = true
    axios.get('/api/academic-options', {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    }).then(({ data }) => {
      if (!active) return
      setAcademicOptions(data)
      const token = readSessionToken()
      axios.get('/api/academic/active-year', {
        headers: { Authorization: `Bearer ${token}` },
      }).then(({ data: activePeriod }) => {
        if (!active) return
        setData((current) => ({
          ...current,
          academicYear: student?.academicYear || activePeriod?.academicYear || data.years[0] || '',
          section: data.sections.some((section) => section.gradeLevel === current.grade && section.sectionName === current.section)
            ? current.section
            : '',
        }))
      }).catch(() => {
        if (!active) return
        setData((current) => ({
          ...current,
          academicYear: student?.academicYear || data.years[0] || '',
          section: '',
        }))
      })
    }).catch((error) => {
      if (active) toast.error(t(error.response?.data?.message || 'Unable to load current academic assignments.'))
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const refreshActiveAcademicContext = async () => {
      if (student) return
      try {
        const token = readSessionToken()
        const [{ data: activePeriod }, { data: options }] = await Promise.all([
          axios.get('/api/academic/active-year', { headers: { Authorization: `Bearer ${token}` } }),
          axios.get('/api/academic-options', { headers: { Authorization: `Bearer ${token}` } }),
        ])
        setAcademicOptions(options)
        setData((current) => ({
          ...current,
          academicYear: activePeriod?.academicYear || options.years?.[0] || '',
        }))
      } catch (error) {
        toast.error(t(error.response?.data?.message || 'Unable to refresh the active academic year.'))
      }
    }
    window.addEventListener('academic-context-changed', refreshActiveAcademicContext)
    let channel
    if ('BroadcastChannel' in window) {
      channel = new BroadcastChannel('academic-context')
      channel.addEventListener('message', refreshActiveAcademicContext)
    }
    return () => {
      window.removeEventListener('academic-context-changed', refreshActiveAcademicContext)
      channel?.close()
    }
  }, [student, t])
  useEffect(() => {
    if (!data.photoFile) return undefined
    const previewUrl = URL.createObjectURL(data.photoFile)
    setPhotoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [data.photoFile])
  useEffect(() => {
    if (!data.parentPhoto) return undefined
    const previewUrl = URL.createObjectURL(data.parentPhoto)
    setParentPhotoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [data.parentPhoto])
  const isValid = (field) => {
    const value = data[field]?.trim?.() ?? data[field]
    if (field === 'password') return typeof value === 'string' && value.length >= 8 && value.length <= 72
    if (field === 'houseNo') return !value || value.length <= 40
    if (field === 'email') return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    if (field === 'guardianEmail') return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    if (['phoneNumber', 'guardianPhone', 'emergencyContactPhone'].includes(field)) return value.replace(/\D/g, '').length >= 7
    return value !== undefined && value !== '' && value !== null
  }
  const required = {
    0: ['fullName', 'dob', 'gender', 'phoneNumber', 'previousSchool', ...(!student ? ['password'] : [])],
    1: ['region', 'zone', 'woreda', 'kebele', 'guardianName', 'guardianRelation', 'guardianPhone', 'emergencyContactName', 'emergencyContactPhone'],
    2: ['grade', ...(!allowUnassigned || student ? ['section'] : []), 'academicYear', 'registrationDate'],
  }
  const hasError = (field) => touched[field] && !isValid(field)
  const stepValid = () => required[step].every((field) => isValid(field))
    && (!student || step !== 0 || !data.password || isValid('password'))
  const next = () => {
    required[step].forEach(touch)
    if (student && step === 0 && data.password) touch('password')
    if (stepValid()) setStep((current) => Math.min(2, current + 1))
  }
  const inputClass = (field) => `mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${hasError(field) ? 'border-danger-500 ring-2 ring-danger-100' : touched[field] && isValid(field) ? 'border-success-500 ring-2 ring-success-100' : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'}`
  const fieldProps = { data, setField, touch, inputClass, hasError, touched, isValid }
  const selectParentPhoto = (file) => {
    if (file && /^image\/(jpeg|png|webp)$/.test(file.type)) setField('parentPhoto', file)
  }
  const completeRegistration = async () => {
    required[2].forEach(touch)
    if (!stepValid()) return
    setSaving(true)
    try {
      const createdStudent = await onComplete?.(data)
      setStudentId(createdStudent.studentId)
      toast.success(t(student ? 'Student details updated successfully.' : 'Student registration saved successfully.'))
      setData((current) => ({ ...current, password: '' }))
    } catch (error) {
      const message = error.response?.data?.message || error.message || t('Unable to save student registration.')
      toast.error(t(message))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="mx-auto max-w-5xl">
      {studentId ? <section className="rounded-lg border border-success-200 bg-white p-8 text-center shadow-panel"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success-50 text-success-700"><Check className="h-6 w-6" /></span><h1 className="mt-4 text-2xl font-bold text-slate-900">{t(student ? 'Student updated' : 'Student registered')}</h1><p className="mt-2 text-sm text-slate-600">{data.fullName} {t(student ? 'has been updated.' : 'is saved and can sign in with this Student ID:')}</p>{!student && <p className="mt-3 text-2xl font-bold text-primary-800">{studentId}</p>}{!student && <p className="mt-2 text-xs text-slate-500">{t('The temporary password is the one entered during registration.')}</p>}<Button className="mt-6" onClick={onCancel}>{t('Back to student directory')}</Button></section> : <>
      <div className="mb-6"><p className="text-sm font-semibold text-primary-700">{t(student ? 'Student records' : 'Enrollment')}</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{student ? t('Edit {name}', { name: student.fullName }) : t('Register new student')}</h1></div>
      <nav className="mb-6 rounded-lg border border-slate-200 bg-white px-4 py-5 shadow-panel" aria-label={t('Registration progress')}>
        <ol className="grid grid-cols-3 gap-2">{steps.map((item, index) => { const Icon = item.icon; return <li key={item.title} className="relative flex items-center gap-2 sm:gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${index < step ? 'bg-success-600 text-white' : index === step ? 'bg-primary-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{index < step ? <Check className="h-4 w-4" /> : index + 1}</span><div className="hidden min-w-0 sm:block"><p className={`truncate text-xs font-semibold ${index <= step ? 'text-slate-900' : 'text-slate-400'}`}>{t(item.short)}</p><p className="mt-0.5 text-xs text-slate-400">{t('Step {step}', { step: index + 1 })}</p></div>{index < 2 && <span className={`absolute left-[calc(50%+20px)] right-0 top-4 hidden h-px sm:block ${index < step ? 'bg-success-500' : 'bg-slate-200'}`} />}</li> })}</ol>
      </nav>
      <section className="rounded-lg border border-slate-200 bg-white shadow-panel"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-slate-900">{t(steps[step].short)}</h2><p className="mt-1 text-sm text-slate-500">{t('Step {step} of 3', { step: step + 1 })}</p></div><div className="p-5 sm:p-6">
        {step === 0 && <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">{t('Student photo')}</p>
            <div className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400">{photoPreview ? <img src={photoPreview} alt={t('Student preview')} className="h-full w-full object-cover" /> : <Camera className="h-9 w-9" />}</div>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-4 w-4" />{t('Upload photo')}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => setField('photoFile', event.target.files?.[0] || null)} /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field {...fieldProps} name="fullName" label="Full name" placeholder="Student full name" />
            <Field {...fieldProps} name="dob" label="Date of birth" type="date" />
            <Field {...fieldProps} name="gender" label="Gender" options={["Female", "Male"]} />
            <Field {...fieldProps} name="phoneNumber" label="Phone number" type="tel" placeholder="Student phone number" />
            <Field {...fieldProps} name="previousSchool" label="Previous school" placeholder="Previous school" />
            <Field {...fieldProps} name="email" label="Email (optional)" type="email" requiredField={false} placeholder="student@example.com" />
            <Field {...fieldProps} name="password" label={student ? 'New password (optional)' : 'Temporary password'} requiredField={!student} type="password" placeholder={student ? 'Leave blank to keep current password' : 'At least 8 characters'} />
          </div>
        </div>}
        {step === 1 && <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">{t('Parent photo')}</p>
            <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectParentPhoto(event.dataTransfer.files?.[0]) }} className="grid aspect-square w-full place-items-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400">
              {parentPhotoPreview ? <img src={parentPhotoPreview} alt={t('Parent or guardian preview')} className="h-full w-full object-cover" /> : <Camera className="h-9 w-9" />}
            </div>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-4 w-4" />{t('Upload photo')}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => selectParentPhoto(event.target.files?.[0] || null)} /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field {...fieldProps} name="region" label="Region" placeholder="Region" />
            <Field {...fieldProps} name="zone" label="Zone" placeholder="Zone" />
            <Field {...fieldProps} name="woreda" label="Woreda" placeholder="Woreda" />
            <Field {...fieldProps} name="kebele" label="Kebele" placeholder="Kebele" />
            <Field {...fieldProps} name="houseNo" label="House number (optional)" requiredField={false} placeholder="House number" />
            <Field {...fieldProps} name="guardianName" label="Guardian name" placeholder="Parent or guardian full name" />
            <Field {...fieldProps} name="guardianRelation" label="Guardian relation" options={["Mother", "Father", "Guardian", "Other"]} />
            <Field {...fieldProps} name="guardianPhone" label="Guardian phone" type="tel" placeholder="Guardian phone number" />
            <Field {...fieldProps} name="guardianEmail" label="Guardian email (optional)" requiredField={false} type="email" placeholder="guardian@example.com" />
            <Field {...fieldProps} name="emergencyContactName" label="Emergency contact name" placeholder="Emergency contact full name" />
            <Field {...fieldProps} name="emergencyContactPhone" label="Emergency contact phone" type="tel" placeholder="Emergency contact phone" />
          </div>
        </div>}
        {step === 2 && <div className="grid gap-4 sm:grid-cols-2">
          <Field {...fieldProps} name="grade" label="Grade" options={['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']} onChange={(grade) => { setField('grade', grade); if (!academicOptions.sections.some((item) => item.gradeLevel === grade && item.sectionName === data.section)) setField('section', '') }} />
          {allowUnassigned
            ? <div className="rounded-md border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
              {t('Section assignment is locked until the Registrar completes student check-in.')}
            </div>
            : <Field {...fieldProps} name="section" label="Section" options={academicOptions.sections.filter((item) => item.gradeLevel === data.grade).map((item) => item.sectionName)} />}
          <Field {...fieldProps} name="academicYear" label="Academic year" options={academicOptions.years} />
          <Field {...fieldProps} name="registrationDate" label="Registration date" type="date" />
          <div className="rounded-md border border-primary-100 bg-primary-50 p-4 sm:col-span-2"><p className="text-sm font-semibold text-primary-900">{t('Registration summary')}</p><p className="mt-1 text-sm text-primary-700">{data.fullName || t('Student')} will be assigned to {data.grade || t('a grade')} · {data.section || (allowUnassigned ? t('Unassigned — assign a section later') : t('a section'))} for {data.academicYear}.</p></div>
        </div>}
      </div><div className="flex items-center justify-between border-t border-slate-200 px-5 py-4"><Button variant="secondary" disabled={saving} onClick={step === 0 ? onCancel : () => setStep((current) => current - 1)}><ChevronLeft className="h-4 w-4" />{step === 0 ? 'Cancel' : t('Previous')}</Button>{step < 2 ? <Button onClick={next}>{t('Continue')}<ChevronRight className="h-4 w-4" /></Button> : <Button variant="success" loading={saving} onClick={completeRegistration}><Check className="h-4 w-4" />{t('Complete registration')}</Button>}</div></section>
      </>}
    </div>
  )
}
