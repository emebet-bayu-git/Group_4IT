import React, { useState } from 'react'
import { Camera, Check, ChevronLeft, ChevronRight, GraduationCap, ShieldCheck, Upload, UserRound } from 'lucide-react'
import Button from './ui/Button.jsx'

const steps = [
  { title: 'Personal details', short: 'Personal Details & Photo', icon: UserRound },
  { title: 'Guardian info', short: 'Guardian / Parent Info', icon: ShieldCheck },
  { title: 'Academic assignment', short: 'Class & Academic Year', icon: GraduationCap },
]

const initialData = { firstName: '', lastName: '', dob: '', gender: '', photo: '', email: '', phone: '', guardianName: '', relationship: '', guardianPhone: '', guardianEmail: '', address: '', className: '', section: '', academicYear: '2026/2027' }

export default function RegisterStudent({ onCancel, onComplete }) {
  const [step, setStep] = useState(0)
  const [data, setData] = useState(initialData)
  const [touched, setTouched] = useState({})
  const setField = (field, value) => setData((current) => ({ ...current, [field]: value }))
  const touch = (field) => setTouched((current) => ({ ...current, [field]: true }))
  const isValid = (field) => {
    const value = data[field]?.trim?.() ?? data[field]
    if (field === 'email' || field === 'guardianEmail') return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    if (field === 'phone' || field === 'guardianPhone') return !value || value.replace(/\D/g, '').length >= 7
    return value !== undefined && value !== '' && value !== null
  }
  const required = { 0: ['firstName', 'lastName', 'dob', 'gender'], 1: ['guardianName', 'relationship', 'guardianPhone', 'address'], 2: ['className', 'section', 'academicYear'] }
  const hasError = (field) => touched[field] && !isValid(field)
  const stepValid = () => required[step].every((field) => isValid(field))
  const next = () => { required[step].forEach(touch); if (stepValid()) setStep((current) => Math.min(2, current + 1)) }
  const inputClass = (field) => `mt-1.5 h-10 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${hasError(field) ? 'border-danger-500 ring-2 ring-danger-100' : touched[field] && isValid(field) ? 'border-success-500 ring-2 ring-success-100' : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'}`
  const Field = ({ name, label, type = 'text', requiredField = true, placeholder, options }) => <label className="block text-sm font-semibold text-slate-700">{label}{requiredField && <span className="ml-1 text-danger-600">*</span>}<div className="relative">{options ? <select value={data[name]} onChange={(event) => setField(name, event.target.value)} onBlur={() => touch(name)} className={inputClass(name)}><option value="">Select {label.toLowerCase()}</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input type={type} value={data[name]} onChange={(event) => setField(name, event.target.value)} onBlur={() => touch(name)} placeholder={placeholder} className={inputClass(name)} />}{touched[name] && isValid(name) && data[name] && <Check className="absolute right-3 top-[19px] h-4 w-4 text-success-600" />}</div>{hasError(name) && <span className="mt-1 block text-xs font-medium text-danger-600">{name.toLowerCase().includes('email') && !data[name] ? '' : 'Enter a valid value.'}</span>}</label>

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6"><p className="text-sm font-semibold text-primary-700">Enrollment</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Register new student</h1></div>
      <nav className="mb-6 rounded-lg border border-slate-200 bg-white px-4 py-5 shadow-panel" aria-label="Registration progress">
        <ol className="grid grid-cols-3 gap-2">{steps.map((item, index) => { const Icon = item.icon; return <li key={item.title} className="relative flex items-center gap-2 sm:gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${index < step ? 'bg-success-600 text-white' : index === step ? 'bg-primary-800 text-white' : 'bg-slate-100 text-slate-500'}`}>{index < step ? <Check className="h-4 w-4" /> : index + 1}</span><div className="hidden min-w-0 sm:block"><p className={`truncate text-xs font-semibold ${index <= step ? 'text-slate-900' : 'text-slate-400'}`}>{item.short}</p><p className="mt-0.5 text-xs text-slate-400">Step {index + 1}</p></div>{index < 2 && <span className={`absolute left-[calc(50%+20px)] right-0 top-4 hidden h-px sm:block ${index < step ? 'bg-success-500' : 'bg-slate-200'}`} />}</li> })}</ol>
      </nav>
      <section className="rounded-lg border border-slate-200 bg-white shadow-panel"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-slate-900">{steps[step].short}</h2><p className="mt-1 text-sm text-slate-500">Step {step + 1} of 3</p></div><div className="p-5 sm:p-6">
        {step === 0 && <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]"><div><p className="mb-2 text-sm font-semibold text-slate-700">Student photo</p><div className="grid aspect-square w-full place-items-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400"><Camera className="h-9 w-9" /></div><label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Upload className="h-4 w-4" />Upload photo<input type="file" accept="image/*" className="hidden" /></label></div><div className="grid gap-4 sm:grid-cols-2"><Field name="firstName" label="First name" placeholder="First name" /><Field name="lastName" label="Last name" placeholder="Last name" /><Field name="dob" label="Date of birth" type="date" /><Field name="gender" label="Gender" options={["Female", "Male"]} /><Field name="email" label="Email address" requiredField={false} type="email" placeholder="student@school.edu" /><Field name="phone" label="Phone number" requiredField={false} type="tel" placeholder="+233 ..." /></div></div>}
        {step === 1 && <div className="grid gap-4 sm:grid-cols-2"><Field name="guardianName" label="Guardian full name" placeholder="Parent or guardian name" /><Field name="relationship" label="Relationship" options={["Mother", "Father", "Guardian", "Other"]} /><Field name="guardianPhone" label="Guardian phone" type="tel" placeholder="+233 ..." /><Field name="guardianEmail" label="Guardian email" requiredField={false} type="email" placeholder="guardian@email.com" /><label className="sm:col-span-2 text-sm font-semibold text-slate-700">Home address<span className="ml-1 text-danger-600">*</span><textarea value={data.address} onChange={(event) => setField('address', event.target.value)} onBlur={() => touch('address')} placeholder="Residential address" className={`${inputClass('address')} h-24 resize-none py-2.5`} />{hasError('address') && <span className="mt-1 block text-xs font-medium text-danger-600">Enter the home address.</span>}</label></div>}
        {step === 2 && <div className="grid gap-4 sm:grid-cols-2"><Field name="className" label="Class" options={["Grade 9", "Grade 10", "Grade 11", "Grade 12"]} /><Field name="section" label="Section" options={["Section A", "Section B", "Section C"]} /><Field name="academicYear" label="Academic year" options={["2026/2027", "2027/2028"]} /><div className="rounded-md border border-primary-100 bg-primary-50 p-4 sm:col-span-2"><p className="text-sm font-semibold text-primary-900">Registration summary</p><p className="mt-1 text-sm text-primary-700">{data.firstName} {data.lastName} will be assigned to {data.className || 'a class'} · {data.section || 'a section'} for {data.academicYear}.</p></div></div>}
      </div><div className="flex items-center justify-between border-t border-slate-200 px-5 py-4"><Button variant="secondary" onClick={step === 0 ? onCancel : () => setStep((current) => current - 1)}><ChevronLeft className="h-4 w-4" />{step === 0 ? 'Cancel' : 'Previous'}</Button>{step < 2 ? <Button onClick={next}>Continue<ChevronRight className="h-4 w-4" /></Button> : <Button variant="success" onClick={() => { required[2].forEach(touch); if (stepValid()) onComplete?.() }}><Check className="h-4 w-4" />Complete registration</Button>}</div></section>
    </div>
  )
}
