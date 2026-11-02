import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { AlertCircle, ArrowRight, CalendarDays, ChevronRight, ClipboardList, Clock3, Users } from 'lucide-react'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'

const notices = [
  { title: 'Grade submission deadline', description: 'Enter and review scores for your assigned classes.', date: 'Oct 28', type: 'Deadline', urgent: true },
  { title: 'Staff coordination meeting', description: 'Academic department heads will meet in the conference room.', date: 'Oct 30', type: 'Meeting', urgent: false },
  { title: 'Semester examination timetable', description: 'The final examination timetable has been published for review.', date: 'Nov 02', type: 'Academic', urgent: false },
]

export default function TeacherDashboard({ teacherName = 'Teacher', onEnterGrades, onViewRoster }) {
  const [classes, setClasses] = useState([])
  const [period, setPeriod] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    axios.get('/api/teacher/classes', {
      headers: { Authorization: `Bearer ${readSessionToken()}` },
    }).then(({ data }) => {
      if (!active) return
      setClasses(data.classes || [])
      setPeriod(data.period)
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.message || 'Unable to load your assigned classes.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return (
    <>
      <section className="workspace-hover-card relative overflow-hidden rounded-lg border border-transparent bg-primary-900 px-5 py-6 text-white shadow-panel sm:px-7 sm:py-8">
        <div className="absolute right-0 top-0 h-full w-2/5 bg-primary-800/40" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <p className="text-sm font-semibold text-primary-200">Teacher dashboard</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Welcome back, {teacherName}</h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary-100">
            <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" />Assigned teaching workload</span>
            <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Active semester: {period ? `${period.semester} · ${period.academicYear}` : 'No active academic semester'}</span>
          </div>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="assigned-classes-heading">
        <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Teaching workload</p><h2 id="assigned-classes-heading" className="mt-1 text-xl font-bold text-slate-900">Assigned classes</h2></div><span className="text-sm text-slate-500">{classes.length} classes</span></div>
        {error && <p role="alert" className="mb-4 rounded-md border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
        {loading ? <p role="status" className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading assigned classes…</p>
          : classes.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {classes.map((classItem) => (
              <article key={classItem.id} className="workspace-hover-card flex min-h-56 flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-primary-700">{classItem.subject}</p><h3 className="mt-2 text-lg font-bold leading-6 text-slate-900">{classItem.gradeLevel} · {classItem.sectionName}</h3></div><div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-700"><ClipboardList className="h-5 w-5" /></div></div>
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users className="h-4 w-4 text-slate-400" />{classItem.studentCount} students</div>
                <p className="mt-2 text-xs text-slate-500">{period ? `${period.semester} · ${period.academicYear}` : 'Academic period not set'}</p>
                <div className="mt-auto grid grid-cols-2 gap-2 pt-5"><Button onClick={() => onEnterGrades?.(classItem)} className="px-2 text-xs">Enter Grades</Button><Button variant="secondary" onClick={() => onViewRoster?.(classItem)} className="px-2 text-xs">View Roster</Button></div>
              </article>
            ))}
          </div> : <p className="rounded-md border border-slate-200 bg-white p-5 text-sm text-slate-600">No classes have been assigned to your account.</p>}
      </section>

      <section className="workspace-hover-card mt-6 rounded-lg border border-slate-200 bg-white shadow-panel" aria-labelledby="notice-board-heading">
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