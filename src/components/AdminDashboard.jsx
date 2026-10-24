import React from 'react'
import { ArrowDownRight, ArrowUpRight, BookOpenCheck, ChevronRight, ClipboardCheck, Download, GraduationCap, Megaphone, School, UserPlus, Users, UserRoundCheck } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const metrics = [
  { label: 'Total Students', value: '1,248', trend: '+8.2%', direction: 'up', icon: Users, accent: 'bg-primary-50 text-primary-700' },
  { label: 'Total Teachers', value: '64', trend: '+2.1%', direction: 'up', icon: GraduationCap, accent: 'bg-success-50 text-success-700' },
  { label: 'Active Classes', value: '42', trend: '+4 this term', direction: 'up', icon: School, accent: 'bg-warning-50 text-warning-700' },
  { label: 'Pending Grade Approvals', value: '17', trend: '-12.5%', direction: 'down', icon: ClipboardCheck, accent: 'bg-danger-50 text-danger-700' },
]

const enrollment = [
  { grade: 'Grade 9', students: 318 },
  { grade: 'Grade 10', students: 296 },
  { grade: 'Grade 11', students: 284 },
  { grade: 'Grade 12', students: 350 },
]

const genderDistribution = [
  { name: 'Female', value: 638, color: '#164aaf' },
  { name: 'Male', value: 610, color: '#10b981' },
]

const actions = [
  { title: 'Register New Student', detail: 'Create an enrollment record', icon: UserPlus, color: 'bg-primary-50 text-primary-700' },
  { title: 'Assign Teacher to Class', detail: 'Manage class allocations', icon: UserRoundCheck, color: 'bg-success-50 text-success-700' },
  { title: 'Publish Term Results', detail: 'Release approved grades', icon: Megaphone, color: 'bg-warning-50 text-warning-700' },
  { title: 'Generate Reports', detail: 'Export school summaries', icon: Download, color: 'bg-slate-100 text-slate-700' },
]

const activity = [
  { title: 'Grade 11 results published', detail: 'By Rebecca Mensah · 12 minutes ago', icon: BookOpenCheck, color: 'bg-success-100 text-success-700' },
  { title: '18 students registered', detail: 'Registrar office · 46 minutes ago', icon: UserPlus, color: 'bg-primary-100 text-primary-700' },
  { title: 'Physics class reassigned', detail: 'By Daniel Owusu · 2 hours ago', icon: School, color: 'bg-warning-100 text-warning-700' },
  { title: 'October report generated', detail: 'System export · Yesterday', icon: Download, color: 'bg-slate-200 text-slate-700' },
]

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-panel"><p className="font-semibold text-slate-700">{label || payload[0].name}</p><p className="text-slate-500">{payload[0].value} students</p></div>
}

export default function AdminDashboard({ onRegisterStudent }) {
  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary-700">Administration</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">School overview</h1>
        <p className="mt-1 text-sm text-slate-500">Monday, October 24 · Term 1 performance at a glance</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="School metrics">
        {metrics.map(({ label, value, trend, direction, icon: Icon, accent }) => {
          const TrendIcon = direction === 'up' ? ArrowUpRight : ArrowDownRight
          return <article key={label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
            <div className="flex items-start justify-between"><div className={`grid h-10 w-10 place-items-center rounded-md ${accent}`}><Icon className="h-5 w-5" /></div><span className={`flex items-center text-xs font-semibold ${direction === 'up' ? 'text-success-700' : 'text-danger-600'}`}><TrendIcon className="h-4 w-4" />{trend}</span></div>
            <p className="mt-4 text-sm font-medium text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          </article>
        })}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(240px,1fr)]">
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
              <div className="mb-5"><h2 className="font-bold text-slate-900">Student enrollment</h2><p className="text-sm text-slate-500">Students enrolled by grade level</p></div>
              <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={enrollment} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="grade" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} /><Bar dataKey="students" fill="#164aaf" radius={[4, 4, 0, 0]} maxBarSize={52} /></BarChart></ResponsiveContainer></div>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
              <div><h2 className="font-bold text-slate-900">Gender distribution</h2><p className="text-sm text-slate-500">Current student population</p></div>
              <div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={genderDistribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>{genderDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => `${value} students`} /></PieChart></ResponsiveContainer></div>
              <div className="flex justify-center gap-5 text-sm">{genderDistribution.map((item) => <div key={item.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} /><span className="text-slate-600">{item.name}</span></div>)}</div>
            </article>
          </div>

          <section aria-labelledby="quick-actions-heading">
            <div className="mb-3"><h2 id="quick-actions-heading" className="font-bold text-slate-900">Quick actions</h2></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {actions.map(({ title, detail, icon: Icon, color }, index) => <button key={title} onClick={index === 0 ? onRegisterStudent : undefined} className="group flex min-h-36 flex-col items-start rounded-lg border border-slate-200 bg-white p-4 text-left shadow-panel transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg"><span className={`grid h-10 w-10 place-items-center rounded-md ${color}`}><Icon className="h-5 w-5" /></span><span className="mt-auto pt-5 text-sm font-bold text-slate-900">{title}</span><span className="mt-1 flex w-full items-center justify-between text-xs text-slate-500">{detail}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></button>)}
            </div>
          </section>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white shadow-panel" aria-label="Recent system activity">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-slate-900">Recent activity</h2><p className="text-xs text-slate-500">System log</p></div><button className="text-xs font-semibold text-primary-700 hover:text-primary-900">View all</button></div>
          <ol className="divide-y divide-slate-100 px-5">
            {activity.map(({ title, detail, icon: Icon, color }) => <li key={title} className="flex gap-3 py-4"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${color}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-semibold leading-5 text-slate-800">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div></li>)}
          </ol>
        </aside>
      </section>
    </>
  )
}
