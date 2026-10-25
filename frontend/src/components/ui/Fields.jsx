import React, { useId } from 'react'
import { AlertCircle } from 'lucide-react'

const control = 'mt-1.5 block w-full rounded-md border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500'

function Field({ label, error, children, required }) {
  const id = useId()
  return (
    <div>
      {label && <label htmlFor={id} className="block text-sm font-semibold text-slate-700">{label}{required && <span className="ml-1 text-danger-600">*</span>}</label>}
      {React.cloneElement(children, { id, 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined })}
      {error && <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger-600"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
    </div>
  )
}

export function TextInput({ label, error, required, className = '', ...props }) {
  return <Field label={label} error={error} required={required}><input className={`${control} h-10 ${error ? 'border-danger-500 focus:border-danger-500 focus:ring-danger-100' : 'border-slate-300 focus:border-primary-500 focus:ring-primary-100'} ${className}`} {...props} /></Field>
}

export function Select({ label, error, required, options = [], placeholder = 'Select an option', className = '', ...props }) {
  return (
    <Field label={label} error={error} required={required}>
      <select className={`${control} h-10 ${error ? 'border-danger-500 focus:ring-danger-100' : 'border-slate-300 focus:border-primary-500 focus:ring-primary-100'} ${className}`} {...props}>
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}
      </select>
    </Field>
  )
}

export function Textarea({ label, error, required, className = '', ...props }) {
  return <Field label={label} error={error} required={required}><textarea className={`${control} min-h-24 resize-y py-2.5 ${error ? 'border-danger-500 focus:ring-danger-100' : 'border-slate-300 focus:border-primary-500 focus:ring-primary-100'} ${className}`} {...props} /></Field>
}
