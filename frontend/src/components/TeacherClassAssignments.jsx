import React from 'react'

const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export default function TeacherClassAssignments({ sections = [], value = [], onChange, disabled = false }) {
  const activeSections = sections.filter((section) => section.isActive !== false)
  const updateAssignment = (index, key, nextValue) => {
    onChange(value.map((assignment, assignmentIndex) => (
      assignmentIndex === index ? { ...assignment, [key]: nextValue } : assignment
    )))
  }

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-semibold text-slate-800">Assigned classes</legend>
      {value.map((assignment, index) => (
        <div key={`${index}-${assignment.sectionId}`} className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="block text-sm font-medium text-slate-700">Grade and section
            <select required value={assignment.sectionId || ''} onChange={(event) => updateAssignment(index, 'sectionId', event.target.value)} className={inputClass}>
              <option value="">Select a class section</option>
              {activeSections.map((section) => <option key={section.id} value={section.id}>{section.gradeLevel} · {section.sectionName}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Subject
            <input required maxLength={100} value={assignment.subject || ''} onChange={(event) => updateAssignment(index, 'subject', event.target.value)} className={inputClass} />
          </label>
          <button type="button" onClick={() => onChange(value.filter((_, assignmentIndex) => assignmentIndex !== index))} className="self-end rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Remove</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!activeSections.length} onClick={() => onChange([...value, { sectionId: '', subject: '' }])} className="rounded-md border border-primary-700 px-3 py-2 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50">Add class</button>
        {!activeSections.length && <p className="text-sm text-amber-700">Add active grade sections in Academic Infrastructure before assigning classes.</p>}
        {activeSections.length > 0 && value.length === 0 && <p className="text-sm text-slate-500">Assign at least one section and subject.</p>}
      </div>
    </fieldset>
  )
}