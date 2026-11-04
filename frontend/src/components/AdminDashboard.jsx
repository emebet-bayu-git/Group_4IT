import React, { useEffect } from 'react'
import { CalendarDays, ChevronRight, Download, GraduationCap, Megaphone, School, UserPlus, Users, UserRoundCheck } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'react-hot-toast'
import { useTranslation } from '../i18n/I18nContext.jsx'

const genderColors = { Female: '#164aaf', Male: '#10b981' }

const actions = [
  { title: 'Register New Student', detail: 'Create an enrollment record', icon: UserPlus, color: 'bg-primary-50 text-primary-700' },
  { title: 'Assign Teacher to Class', detail: 'Manage class allocations', icon: UserRoundCheck, color: 'bg-success-50 text-success-700' },
  { title: 'Publish Semester Results', detail: 'Release approved grades', icon: Megaphone, color: 'bg-warning-50 text-warning-700' },
  { title: 'Generate Reports', detail: 'Export school summaries', icon: Download, color: 'bg-slate-100 text-slate-700' },
]

function ChartTooltip({ active, payload, label }) {
  const { t } = useTranslation()
  if (!active || !payload?.length) return null
  return <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-panel"><p className="font-semibold text-slate-700">{t(label || payload[0].name)}</p><p className="text-slate-500">{t('{count} students', { count: payload[0].value })}</p></div>
}

export default function AdminDashboard({ onRegisterStudent, stats, loading = false, error = '' }) {
  const { t } = useTranslation()
  useEffect(() => {
    if (error) toast.error(t(error))
  }, [error, t])
  const academicPeriod = stats?.academicPeriod
  const metricValue = (value) => loading ? '—' : Number(value || 0).toLocaleString()
  const enrollment = stats?.enrollmentByGrade || []
  const genderDistribution = (stats?.genderDistribution || []).map((item) => ({
    ...item,
    color: genderColors[item.name] || '#64748b',
  }))
  const metrics = [
    { label: 'Total Registered Students', value: metricValue(stats?.totalRegisteredStudents), icon: Users, accent: 'bg-primary-50 text-primary-700' },
    { label: 'Total Active Teachers', value: metricValue(stats?.totalActiveTeachers), icon: GraduationCap, accent: 'bg-success-50 text-success-700' },
    { label: 'Active Classes / Sections', value: metricValue(stats?.totalActiveSections), icon: School, accent: 'bg-warning-50 text-warning-700' },
    { label: 'Current Semester', value: loading ? '—' : academicPeriod?.semester || t('Not configured'), detail: academicPeriod?.academicYear || t('No active academic year'), icon: CalendarDays, accent: 'bg-danger-50 text-danger-700' },
  ]
  const visibleActions = actions.filter((_, index) => index !== 0 || onRegisterStudent)
  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary-700">{t('Administration')}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{t('School overview')}</h1>
        <p className="mt-1 text-sm text-slate-500">{academicPeriod?.academicYear ? `${academicPeriod.academicYear}${academicPeriod.semester ? ` · ${academicPeriod.semester}` : ''} ${t('performance at a glance')}` : t('Academic year or semester not configured')}</p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('School metrics')}>
        {metrics.map(({ label, value, detail, icon: Icon, accent }) => <article key={label} className="workspace-hover-card rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
          <div className={`grid h-10 w-10 place-items-center rounded-md ${accent}`}><Icon className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-medium text-slate-500">{t(label)}</p><p className="mt-1 break-words text-2xl font-bold text-slate-900">{t(value)}</p>
          {detail && <p className="mt-1 text-sm font-medium text-slate-500">{t(detail)}</p>}
        </article>)}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(240px,1fr)]">
            <article className="workspace-hover-card rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
              <div className="mb-5"><h2 className="font-bold text-slate-900">{t('Student enrollment')}</h2><p className="text-sm text-slate-500">{t('Active students enrolled by grade level')}</p></div>
              <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={enrollment} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}><CartesianGrid stroke="#e2e8f0" vertical={false} /><XAxis dataKey="grade" tickFormatter={t} tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} /><Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} /><Bar dataKey="students" fill="#164aaf" radius={[4, 4, 0, 0]} maxBarSize={52} /></BarChart></ResponsiveContainer></div>
            </article>
            <article className="workspace-hover-card rounded-lg border border-slate-200 bg-white p-5 shadow-panel">
              <div><h2 className="font-bold text-slate-900">{t('Gender distribution')}</h2><p className="text-sm text-slate-500">{t('Current student population')}</p></div>
              <div className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={genderDistribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3}>{genderDistribution.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value) => t('{count} students', { count: value })} /></PieChart></ResponsiveContainer></div>
              <div className="flex justify-center gap-5 text-sm">{genderDistribution.map((item) => <div key={item.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} /><span className="text-slate-600">{t(item.name)}: {item.value}</span></div>)}</div>
            </article>
          </div>

          <section aria-labelledby="quick-actions-heading">
            <div className="mb-3"><h2 id="quick-actions-heading" className="font-bold text-slate-900">{t('Quick actions')}</h2></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleActions.map(({ title, detail, icon: Icon, color }) => <button key={title} onClick={title === 'Register New Student' ? onRegisterStudent : undefined} className="workspace-hover-card group flex min-h-36 flex-col items-start rounded-lg border border-slate-200 bg-white p-4 text-left shadow-panel"><span className={`grid h-10 w-10 place-items-center rounded-md ${color}`}><Icon className="h-5 w-5" /></span><span className="mt-auto pt-5 text-sm font-bold text-slate-900">{t(title)}</span><span className="mt-1 flex w-full items-center justify-between text-xs text-slate-500">{t(detail)}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></button>)}
            </div>
          </section>
        </div>

        <aside className="workspace-hover-card rounded-lg border border-slate-200 bg-white shadow-panel" aria-label={t('Configured grade sections')}>
          <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-slate-900">{t('Configured grade sections')}</h2><p className="text-xs text-slate-500">{t('Active class streams by grade')}</p></div>
          <div className="divide-y divide-slate-100 px-5">
            {(stats?.sectionsByGrade || []).map(({ gradeLevel, sections }) => <div key={gradeLevel} className="py-4"><p className="text-sm font-semibold text-slate-800">{t(gradeLevel)}</p><p className="mt-1 text-sm text-slate-500">{sections.length ? sections.map((section) => t(section.sectionName)).join(', ') : t('No active sections')}</p></div>)}
            {!stats?.sectionsByGrade?.length && <p className="py-5 text-sm text-slate-500">{loading ? t('Loading sections…') : t('No configured grade sections.')}</p>}
          </div>
        </aside>
      </section>
    </>
  )
}
