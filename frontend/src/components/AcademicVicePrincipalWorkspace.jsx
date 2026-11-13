import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { BookOpen, CalendarDays, GraduationCap, ListPlus, Save, Trash2, Users } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'

const grades = ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']
const inputClass = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100'
const authConfig = () => ({ headers: { Authorization: `Bearer ${readSessionToken()}` } })

function MetricCard({ label, value, icon: Icon }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-panel">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-600">{label}</p><Icon className="h-5 w-5 text-primary-700" /></div>
    <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
  </article>
}

export default function AcademicVicePrincipalWorkspace({ view = 'overview' }) {
  const { t } = useTranslation()
  const [workspace, setWorkspace] = useState(null)
  const [grade, setGrade] = useState(grades[0])
  const [sectionId, setSectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [showAllTeachers, setShowAllTeachers] = useState(false)
  const [showAllSubjectTeachers, setShowAllSubjectTeachers] = useState(false)
  const [teacherSearch, setTeacherSearch] = useState({})
  const [curriculumForm, setCurriculumForm] = useState({
    subjectName: '', department: '', weeklyPeriods: '4',
  })

  const load = async (nextGrade = grade, nextSectionId = sectionId) => {
    setLoading(true)
    try {
      const { data } = await axios.get('/api/vice-principal/academic-workspace', {
        ...authConfig(),
        params: {
          ...(nextGrade ? { grade: nextGrade } : {}),
          ...(nextSectionId ? { sectionId: nextSectionId } : {}),
        },
      })
      setWorkspace(data)
      const sectionExists = data.sections.some((section) => String(section.id) === String(nextSectionId))
      if (!sectionExists) {
        const firstSection = data.sections.find((section) => section.gradeLevel === nextGrade) || data.sections[0]
        setSectionId(firstSection ? String(firstSection.id) : '')
        if (firstSection) setGrade(firstSection.gradeLevel)
      }
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to load the academic director workspace.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load('', '') }, [])
  useEffect(() => {
    if (sectionId && workspace) load(grade, sectionId)
  }, [sectionId])

  const sections = workspace?.sections || []
  const gradeSections = sections.filter((section) => section.gradeLevel === grade)
  const selectedSection = sections.find((section) => String(section.id) === sectionId)
  const subjectSlots = workspace?.subjectSlots || []
  const teachers = workspace?.teachers || []
  const stats = workspace?.stats || {}
  const sectionLoads = useMemo(() => {
    const grouped = new Map()
    for (const loadItem of workspace?.loads || []) {
      const key = Number(loadItem.teacherId)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(loadItem)
    }
    return grouped
  }, [workspace?.loads])

  const refresh = () => load(grade, sectionId)
  const assignSubject = async (slot, teacherId) => {
    const key = `subject-${slot.subjectId}`
    setBusy(key)
    try {
      await axios.put(
        `/api/vice-principal/sections/${sectionId}/subjects/${slot.subjectId}`,
        { teacherId: teacherId || null },
        authConfig(),
      )
      toast.success(t(teacherId ? 'Subject teacher assigned.' : 'Subject assignment removed.'))
      await load(grade, sectionId)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to save the subject teacher assignment.'))
    } finally {
      setBusy('')
    }
  }

  const assignHomeroom = async (teacherId) => {
    setBusy('homeroom')
    try {
      await axios.put(
        `/api/vice-principal/sections/${sectionId}/homeroom`,
        { teacherId: teacherId || null },
        authConfig(),
      )
      toast.success(t('Homeroom teacher assignment saved.'))
      await load(grade, sectionId)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to save the homeroom teacher assignment.'))
    } finally {
      setBusy('')
    }
  }

  const saveCurriculumSubject = async (event) => {
    event.preventDefault()
    setBusy('curriculum')
    try {
      await axios.post('/api/vice-principal/curriculum', {
        gradeLevel: grade,
        subjectName: curriculumForm.subjectName,
        department: curriculumForm.department,
        weeklyPeriods: Number(curriculumForm.weeklyPeriods),
      }, authConfig())
      toast.success(t('Curriculum subject saved.'))
      setCurriculumForm({ subjectName: '', department: '', weeklyPeriods: '4' })
      await load(grade, sectionId)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to save the curriculum subject.'))
    } finally {
      setBusy('')
    }
  }

  const initializeCurriculum = async () => {
    setBusy('curriculum-init')
    try {
      await axios.post('/api/vice-principal/curriculum/initialize', {}, authConfig())
      toast.success(t('Default curriculum subjects initialized.'))
      await load(grade, sectionId)
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to initialize the default curriculum.'))
    } finally {
      setBusy('')
    }
  }

  const matchesSubjectDepartment = (teacher, slot) => {
    const specialization = String(teacher.specialization || '').toLowerCase().trim()
    const subject = String(slot.name || '').toLowerCase().trim()
    const department = String(slot.department || '').toLowerCase().trim()
    if (!specialization) return false
    return specialization.includes(subject) || subject.includes(specialization)
      || department && (specialization.includes(department) || department.includes(specialization))
  }

  const getTeacherOptions = (slot) => {
    const eligible = showAllSubjectTeachers
      ? teachers
      : teachers.filter((teacher) => matchesSubjectDepartment(teacher, slot))
    const assignedTeacher = teachers.find((teacher) => Number(teacher.id) === Number(slot.teacherId))
    const candidates = assignedTeacher && !eligible.some((teacher) => Number(teacher.id) === Number(assignedTeacher.id))
      ? [...eligible, assignedTeacher]
      : eligible
    const search = (teacherSearch[slot.subjectId] || '').toLowerCase()
    return candidates.filter((teacher) => `${teacher.name} ${teacher.specialization || ''}`.toLowerCase().includes(search))
  }

  const isOverview = view === 'overview'
  const isWorkload = view === 'teacher-workloads'
  const isHomeroom = view === 'homeroom-management'
  const title = isOverview ? 'Academic Overview'
    : isWorkload ? 'Teacher Workload & Schedule Overview'
      : isHomeroom ? 'Homeroom Teacher Management'
        : 'Teacher Section & Subject Assignment'

  return (
    <section className="space-y-5" aria-labelledby="academic-vp-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary-700">{t('Academic Vice Principal Workspace')}</p>
          <h1 id="academic-vp-heading" className="mt-1 text-2xl font-bold text-slate-900">{t(title)}</h1>
          <p className="mt-1 text-sm text-slate-500">{workspace?.academicYear
            ? `${workspace.academicYear}${workspace.semester ? ` · ${t(workspace.semester)}` : ''}`
            : t('Loading active academic year…')}</p>
        </div>
        {!isOverview && !isWorkload && <label className="w-full max-w-[220px] text-sm font-medium text-slate-700">{t('Grade Level')}
          <select value={grade} onChange={(event) => {
            setGrade(event.target.value)
            const first = sections.find((section) => section.gradeLevel === event.target.value)
            setSectionId(first ? String(first.id) : '')
          }} className={inputClass}>
            {grades.map((item) => <option key={item} value={item}>{t(item)}</option>)}
          </select>
        </label>}
      </header>

      {loading && !workspace
        ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading the academic director workspace…')}</p>
        : isOverview
          ? <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label={t('Total Sections')} value={stats.totalSections || 0} icon={GraduationCap} />
              <MetricCard label={t('Unassigned Subject Slots')} value={stats.unassignedSubjectSlots || 0} icon={BookOpen} />
              <MetricCard label={t('Teachers Near Period Limit')} value={stats.teachersNearPeriodLimit || 0} icon={Users} />
              <MetricCard label={t('Sections Without Homeroom Teachers')} value={stats.sectionsWithoutHomeroomTeachers || 0} icon={CalendarDays} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-white shadow-panel">
              <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-bold text-slate-900">{t('Section overview')}</h2></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Grade Level')}</th><th className="px-4 py-3">{t('Section')}</th><th className="px-4 py-3">{t('Homeroom Teacher')}</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{sections.map((section) => <tr key={section.id}>
                  <td className="px-4 py-3">{t(section.gradeLevel)}</td><td className="px-4 py-3">{t(section.sectionName)}</td>
                  <td className="px-4 py-3">{section.homeroomTeacherName || t('Unassigned')}</td>
                </tr>)}
                  {!sections.length && <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">{t('No active sections are configured for the current academic year.')}</td></tr>}
                </tbody>
              </table></div>
            </div>
          </div>
          : <div className="space-y-4">
            {!isWorkload && <label className="block max-w-sm text-sm font-medium text-slate-700">{t('Section')}
              <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className={inputClass}>
                <option value="">{t('Select a section')}</option>
                {gradeSections.map((section) => <option key={section.id} value={section.id}>{t(section.sectionName)}</option>)}
              </select>
            </label>}
            {!selectedSection && !isWorkload
              ? <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('No active sections are configured for this grade in the current academic year.')}</p>
              : <>
                {(isHomeroom || !isWorkload) && <article className="rounded-lg border border-primary-100 bg-white p-5 shadow-panel">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-primary-700">{t('Homeroom Teacher')}</p>
                      <h2 className="mt-1 text-lg font-bold text-slate-900">{t(selectedSection.gradeLevel)} · {t(selectedSection.sectionName)}</h2>
                      <p className="mt-1 text-sm text-slate-600">{t('A teacher may be assigned as homeroom teacher for only one section per academic year.')}</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={showAllTeachers} onChange={(event) => setShowAllTeachers(event.target.checked)} />
                      {t('Show all eligible teachers')}
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="block text-sm font-medium text-slate-700">{t('Assign Homeroom Teacher')}
                      <select disabled={busy === 'homeroom'} value={selectedSection.homeroomTeacherId || ''} onChange={(event) => assignHomeroom(event.target.value)} className={inputClass}>
                        <option value="">{t('No homeroom teacher assigned')}</option>
                        {(workspace?.homeroomCandidates || [])
                          .filter((teacher) => showAllTeachers || teacher.teachesSection || Number(teacher.id) === Number(selectedSection.homeroomTeacherId))
                          .map((teacher) => <option key={teacher.id} value={teacher.id}>
                            {teacher.name}{teacher.specialization ? ` (${teacher.specialization})` : ''}{teacher.teachesSection ? ` · ${t('Teaching this section')}` : ''}
                          </option>)}
                      </select>
                    </label>
                    <p className="self-end pb-2 text-sm text-slate-600">{selectedSection.homeroomTeacherName || t('No homeroom teacher assigned')}</p>
                  </div>
                </article>}

                {!isWorkload && !isHomeroom && <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4"><div><h2 className="font-bold text-slate-900">{t('Curriculum subject assignments')}</h2>
                    <p className="mt-1 text-sm text-slate-500">{t('Teacher weekly loads include assignments across every section in the active academic year. Maximum: {limit} periods.', { limit: workspace?.maxWeeklyPeriods || 24 })}</p>
                    <p className="mt-1 text-xs text-slate-500">{t('Default subjects use 4 periods per week; adjust them to match your school curriculum.')}</p>
                  </div><button type="button" disabled={busy !== ''} onClick={initializeCurriculum} className="inline-flex h-9 items-center gap-2 rounded-md border border-primary-200 px-3 text-sm font-semibold text-primary-800 disabled:opacity-50"><ListPlus className="h-4 w-4" />{t(busy === 'curriculum-init' ? 'Initializing…' : 'Initialize Grades 9–12 subjects')}</button></div>
                  <label className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-sm text-slate-600"><input type="checkbox" checked={showAllSubjectTeachers} onChange={(event) => setShowAllSubjectTeachers(event.target.checked)} />{t('Show all active teachers instead of department matches')}</label>
                  <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Subject')}</th><th className="px-4 py-3">{t('Weekly Periods')}</th><th className="px-4 py-3">{t('Teacher')}</th><th className="px-4 py-3">{t('Assignment')}</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{subjectSlots.map((slot) => {
                      const options = getTeacherOptions(slot)
                      const hasSpecializationMatch = teachers.some((teacher) => matchesSubjectDepartment(teacher, slot))
                      return <tr key={slot.subjectId}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{t(slot.name)}{slot.department && <span className="block text-xs font-normal text-slate-500">{t(slot.department)}</span>}</td>
                        <td className="px-4 py-3 tabular-nums">{slot.weeklyPeriods}</td>
                        <td className="px-4 py-3">
                          <input type="search" value={teacherSearch[slot.subjectId] || ''} onChange={(event) => setTeacherSearch((current) => ({ ...current, [slot.subjectId]: event.target.value }))} placeholder={t('Search teachers')} className="mb-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" />
                          <div className="flex items-center gap-2">
                            <select disabled={busy === `subject-${slot.subjectId}`} value={slot.teacherId || ''} onChange={(event) => assignSubject(slot, event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm">
                              <option value="">{t('Unassigned')}</option>
                              {options.map((teacher) => <option key={teacher.id} value={teacher.id}>
                                {teacher.name}{teacher.specialization ? ` (${teacher.specialization})` : ''} - {teacher.currentPeriods}/{workspace?.maxWeeklyPeriods || 24} {t('periods')}
                              </option>)}
                            </select>
                            {slot.teacherId && <button type="button" disabled={busy === `subject-${slot.subjectId}`} onClick={() => assignSubject(slot, '')} aria-label={`${t('Clear assignment for')} ${t(slot.name)}`} title={t('Clear assignment')} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
                          </div>
                          {!hasSpecializationMatch && !showAllSubjectTeachers && <p className="mt-1 text-xs text-amber-700">{t('No active teachers match this subject department. Enable all active teachers to see other options.')}</p>}
                        </td>
                        <td className="px-4 py-3">{slot.teacherName || t('Unassigned')}</td>
                      </tr>
                    })}
                      {!subjectSlots.length && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-500">{t('No curriculum subjects are configured for this grade. Add a subject below to create its curriculum slot.')}</td></tr>}
                    </tbody>
                  </table></div>
                  <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">{t('Teacher changes save automatically when selected. Clearing an assignment frees the teacher’s periods immediately.')}</p>
                  <form onSubmit={saveCurriculumSubject} className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-4">
                    <label className="text-sm font-medium text-slate-700">{t('Add curriculum subject')}<input required maxLength={100} value={curriculumForm.subjectName} onChange={(event) => setCurriculumForm((current) => ({ ...current, subjectName: event.target.value }))} className={inputClass} /></label>
                    <label className="text-sm font-medium text-slate-700">{t('Department / Specialization')}<input maxLength={100} value={curriculumForm.department} onChange={(event) => setCurriculumForm((current) => ({ ...current, department: event.target.value }))} className={inputClass} /></label>
                    <label className="text-sm font-medium text-slate-700">{t('Weekly Periods')}<input required type="number" min="1" max="40" value={curriculumForm.weeklyPeriods} onChange={(event) => setCurriculumForm((current) => ({ ...current, weeklyPeriods: event.target.value }))} className={inputClass} /></label>
                    <button disabled={busy === 'curriculum'} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary-800 px-3 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{t(busy === 'curriculum' ? 'Saving…' : 'Save Curriculum')}</button>
                  </form>
                </article>}

                {isWorkload && <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-panel">
                  <div className="border-b border-slate-200 px-4 py-4"><h2 className="font-bold text-slate-900">{t('Weekly teacher workload')}</h2><p className="mt-1 text-sm text-slate-500">{t('Teachers near the maximum are highlighted. School limit: {limit} periods/week.', { limit: workspace?.maxWeeklyPeriods || 24 })}</p></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">{t('Teacher')}</th><th className="px-4 py-3">{t('Weekly Load')}</th><th className="px-4 py-3">{t('Assigned Sections & Subjects')}</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{teachers.map((teacher) => {
                      const periods = Number(teacher.currentPeriods)
                      const near = periods >= (workspace?.maxWeeklyPeriods || 24) * 0.8
                      const items = sectionLoads.get(Number(teacher.id)) || []
                      return <tr key={teacher.id} className={near ? 'bg-amber-50/60' : ''}>
                        <td className="px-4 py-3"><p className="font-semibold text-slate-900">{teacher.name}</p><p className="text-xs text-slate-500">{teacher.specialization || t('No specialization recorded')}</p></td>
                        <td className={`px-4 py-3 font-bold tabular-nums ${near ? 'text-amber-800' : 'text-slate-700'}`}>{periods}/{workspace?.maxWeeklyPeriods || 24} {t('periods')}</td>
                        <td className="px-4 py-3">{items.length ? items.map((item, index) => <span key={`${item.sectionName}-${item.subject}-${index}`} className="mr-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{t(item.gradeLevel)} · {t(item.sectionName)} · {t(item.subject)} ({item.weeklyPeriods})</span>) : <span className="text-slate-500">{t('No subject assignments')}</span>}</td>
                      </tr>
                    })}
                      {!teachers.length && <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">{t('No active teachers are registered.')}</td></tr>}
                    </tbody>
                  </table></div>
                </article>}
              </>}
          </div>}
    </section>
  )
}
