import React from 'react'
import { AlertCircle, ArrowRight, CalendarDays, ChevronRight, ClipboardList, Clock3, Users } from 'lucide-react'
import Button from './ui/Button.jsx'

const classes = [
  { title: 'Grade 10 Section A', subject: 'Mathematics', students: 32, progress: 85, room: 'Room 204', schedule: 'Mon, Wed, Fri · 8:00 AM' },
  { title: 'Grade 11 Section B', subject: 'Physics', students: 28, progress: 72, room: 'Science Lab 2', schedule: 'Tue, Thu · 10:30 AM' },
  { title: 'Grade 12 Section A', subject: 'Mathematics', students: 30, progress: 94, room: 'Room 208', schedule: 'Mon, Wed · 1:00 PM' },
  { title: 'Grade 9 Section C', subject: 'General Science', students: 35, progress: 58, room: 'Science Lab 1', schedule: 'Tue, Thu, Fri · 9:00 AM' },
]

const notices = [
  { title: 'Grade submission deadline', description: 'Enter and submit continuous assessment scores for Grade 10 and 11.', date: 'Oct 28', type: 'Deadline', urgent: true },
  { title: 'Staff coordination meeting', description: 'Academic department heads will meet in the conference room.', date: 'Oct 30', type: 'Meeting', urgent: false },
  { title: 'Term examination timetable', description: 'The final examination timetable has been published for review.', date: 'Nov 02', type: 'Academic', urgent: false },
]

export default function TeacherDashboard({ teacherName = 'Rebecca Mensah', department = 'Mathematics & Science', term = 'Term 1 · 2026/2027', onEnterGrades, onViewRoster }) {
  return (
    <>
      <section className="relative overflow-hidden rounded-lg bg-primary-900 px-5 py-6 text-white shadow-panel sm:px-7 sm:py-8">
        <div className="absolute right-0 top-0 h-full w-2/5 bg-primary-800/40" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <p className="text-sm font-semibold text-primary-200">Teacher dashboard</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome back, {teacherName}</h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary-100">
            <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" />{department}</span>
            <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Active term: {term}</span>
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="assigned-classes-heading">
        <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Teaching workload</p><h2 id="assigned-classes-heading" className="mt-1 text-xl font-bold text-slate-900">Assigned classes</h2></div><span className="text-sm text-slate-500">{classes.length} classes</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {classes.map((classItem) => (
            <article key={`${classItem.title}-${classItem.subject}`} className="flex min-h-72 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-primary-700">{classItem.subject}</p><h3 className="mt-2 text-lg font-bold leading-6 text-slate-900">{classItem.title}</h3></div><div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-700"><ClipboardList className="h-5 w-5" /></div></div>
              <div className="mt-4 space-y-1 text-xs text-slate-500"><p>{classItem.room}</p><p>{classItem.schedule}</p></div>
              <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users className="h-4 w-4 text-slate-400" />{classItem.students} students</div>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs"><span className="font-medium text-slate-600">Grade entry</span><span className="font-bold text-slate-800">{classItem.progress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={`${classItem.subject} grade entry progress`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={classItem.progress}><div className={`h-full rounded-full ${classItem.progress >= 85 ? 'bg-success-500' : classItem.progress >= 70 ? 'bg-primary-500' : 'bg-warning-500'}`} style={{ width: `${classItem.progress}%` }} /></div>
                <p className="mt-1.5 text-xs text-slate-500">{classItem.progress}% grades entered</p>
              </div>
              <div className="mt-auto grid grid-cols-2 gap-2 pt-5"><Button onClick={() => onEnterGrades?.(classItem)} className="px-2 text-xs">Enter Grades</Button><Button variant="secondary" onClick={() => onViewRoster?.(classItem)} className="px-2 text-xs">View Roster</Button></div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white shadow-panel" aria-labelledby="notice-board-heading">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="notice-board-heading" className="font-bold text-slate-900">Notice board</h2><p className="mt-0.5 text-xs text-slate-500">Administration alerts and deadlines</p></div><button className="hidden items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-900 sm:flex">View all notices<ArrowRight className="h-4 w-4" /></button></div>
        <div className="divide-y divide-slate-100">
          {notices.map((notice) => (
            <button key={notice.title} className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-50">
              <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md ${notice.urgent ? 'bg-danger-50 text-danger-600' : 'bg-warning-50 text-warning-700'}`}>{notice.urgent ? <AlertCircle className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}</span>
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-900">{notice.title}</span>{notice.urgent && <span className="rounded-full bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700">Action required</span>}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{notice.description}</span></span>
              <span className="shrink-0 text-right"><span className="block text-xs font-semibold text-slate-700">{notice.date}</span><span className="mt-1 block text-xs text-slate-400">{notice.type}</span></span>
              <ChevronRight className="mt-2 hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
