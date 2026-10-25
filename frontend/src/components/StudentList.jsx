import React, { useMemo, useState } from 'react'
import { Archive, ChevronLeft, ChevronRight, Download, Eye, Pencil, Search, SlidersHorizontal, UserPlus } from 'lucide-react'
import Button from './ui/Button.jsx'
import StatusBadge from './ui/Badge.jsx'

const students = [
  { id: 1, name: 'Amara Okafor', roll: 'NFS-2026-1048', className: 'Grade 10', section: 'A', gender: 'Female', status: 'Active', initials: 'AO' },
  { id: 2, name: 'Daniel Reed', roll: 'NFS-2026-1122', className: 'Grade 11', section: 'B', gender: 'Male', status: 'Pending', initials: 'DR' },
  { id: 3, name: 'Maya Chen', roll: 'NFS-2026-0984', className: 'Grade 9', section: 'C', gender: 'Female', status: 'Active', initials: 'MC' },
  { id: 4, name: 'Kwame Mensah', roll: 'NFS-2026-1207', className: 'Grade 12', section: 'A', gender: 'Male', status: 'Active', initials: 'KM' },
  { id: 5, name: 'Nia Wilson', roll: 'NFS-2026-1319', className: 'Grade 10', section: 'B', gender: 'Female', status: 'Active', initials: 'NW' },
  { id: 6, name: 'Leo Thompson', roll: 'NFS-2026-1410', className: 'Grade 9', section: 'A', gender: 'Male', status: 'Archived', initials: 'LT' },
  { id: 7, name: 'Zara Bello', roll: 'NFS-2026-1504', className: 'Grade 11', section: 'C', gender: 'Female', status: 'Pending', initials: 'ZB' },
]

const selectClass = 'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'

export default function StudentList({ onRegister, onAction }) {
  const [query, setQuery] = useState('')
  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 5
  const filtered = useMemo(() => students.filter((student) => {
    const matchesQuery = `${student.name} ${student.roll}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (!className || student.className === className) && (!section || student.section === section) && (!gender || student.gender === gender) && (!status || student.status === status)
  }), [query, className, section, gender, status])
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const resetPage = (setter) => (event) => { setter(event.target.value); setPage(1) }
  const exportCsv = () => {
    const rows = [['Name', 'Roll Number', 'Class', 'Section', 'Gender', 'Status'], ...filtered.map((student) => [student.name, student.roll, student.className, student.section, student.gender, student.status])]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a'); link.href = url; link.download = 'student-directory.csv'; link.click(); URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold text-primary-700">Student records</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Student directory</h1><p className="mt-1 text-sm text-slate-500">{filtered.length} students found</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button><Button onClick={onRegister}><UserPlus className="h-4 w-4" />Register student</Button></div></div>
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-panel"><div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(130px,auto))]"><label className="relative"><span className="sr-only">Search students</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={resetPage(setQuery)} placeholder="Search name or roll number" className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" /></label><select aria-label="Filter by class" value={className} onChange={resetPage(setClassName)} className={selectClass}><option value="">All classes</option>{['Grade 9','Grade 10','Grade 11','Grade 12'].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by section" value={section} onChange={resetPage(setSection)} className={selectClass}><option value="">All sections</option>{['A','B','C'].map((item) => <option key={item}>Section {item}</option>)}</select><select aria-label="Filter by gender" value={gender} onChange={resetPage(setGender)} className={selectClass}><option value="">All genders</option><option>Female</option><option>Male</option></select><select aria-label="Filter by status" value={status} onChange={resetPage(setStatus)} className={selectClass}><option value="">All statuses</option><option>Active</option><option>Pending</option><option>Archived</option></select></div></section>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel"><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3 font-semibold">Student</th><th className="px-4 py-3 font-semibold">Roll number</th><th className="px-4 py-3 font-semibold">Class</th><th className="px-4 py-3 font-semibold">Gender</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.length ? visible.map((student) => <tr key={student.id} className="hover:bg-slate-25"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-800">{student.initials}</span><span className="font-semibold text-slate-900">{student.name}</span></div></td><td className="px-4 py-4 text-slate-600">{student.roll}</td><td className="px-4 py-4"><span className="font-medium text-slate-700">{student.className}</span><span className="text-slate-400"> · {student.section}</span></td><td className="px-4 py-4 text-slate-600">{student.gender}</td><td className="px-4 py-4"><StatusBadge status={student.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button onClick={() => onAction?.('View Profile', student)} className="rounded-md p-2 text-slate-500 hover:bg-primary-50 hover:text-primary-700" title="View profile"><Eye className="h-4 w-4" /></button><button onClick={() => onAction?.('Edit', student)} className="rounded-md p-2 text-slate-500 hover:bg-warning-50 hover:text-warning-700" title="Edit student"><Pencil className="h-4 w-4" /></button><button onClick={() => onAction?.('Archive', student)} className="rounded-md p-2 text-slate-500 hover:bg-danger-50 hover:text-danger-700" title="Archive student"><Archive className="h-4 w-4" /></button></div></td></tr>) : <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-500"><SlidersHorizontal className="mx-auto mb-2 h-6 w-6 text-slate-300" />No students match these filters.</td></tr>}</tbody></table></div><div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Showing {visible.length ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}</p><div className="flex items-center gap-1"><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>{Array.from({ length: pages }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} onClick={() => setPage(pageNumber)} className={`h-8 w-8 rounded-md text-xs font-semibold ${pageNumber === page ? 'bg-primary-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{pageNumber}</button>)}<button onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page === pages} className="flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2 text-xs font-semibold text-slate-600 disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div></section>
    </div>
  )
}
