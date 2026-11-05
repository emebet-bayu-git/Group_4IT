import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { CheckCircle2, Search } from 'lucide-react'
import { toast } from 'react-hot-toast'
import Button from './ui/Button.jsx'
import { readSessionToken } from '../pages/LoginPage.jsx'
import { useTranslation } from '../i18n/I18nContext.jsx'
import { useAcademicContext } from '../contexts/AcademicContext.jsx'

const authConfig = () => ({ headers: { Authorization: 'Bearer ' + readSessionToken() } })

export default function ReEnrollmentView() {
  const { t } = useTranslation()
  const { period: activePeriod, refresh: refreshAcademicPeriod } = useAcademicContext()
  const [search, setSearch] = useState('')
  const [students, setStudents] = useState([])
  const [academicYear, setAcademicYear] = useState('')
  const [semester, setSemester] = useState('')
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState('')
  const currentAcademicYear = academicYear || activePeriod?.academicYear || ''
  const currentSemester = semester || activePeriod?.semester || ''

  const load = async () => {
    setLoading(true)
    try {
      const [{ data }, refreshedPeriod] = await Promise.all([
        axios.get('/api/registrar/re-enrollment', {
          ...authConfig(),
          params: { search },
        }),
        refreshAcademicPeriod(),
      ])
      setStudents(Array.isArray(data?.students) ? data.students : [])
      setAcademicYear(refreshedPeriod?.academicYear || data?.academicYear || '')
      setSemester(refreshedPeriod?.semester || data?.semester || '')
    } catch (error) {
      setStudents([])
      toast.error(t(error.response?.data?.message || 'Unable to load students awaiting check-in.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search])

  const checkIn = async (student) => {
    if (!currentAcademicYear || !currentSemester) {
      toast.error(t('Configure an active academic year before checking students in.'))
      return
    }
    if (!window.confirm(t('Confirm that {name} has completed re-enrollment for {year}?', {
      name: student.name,
      year: currentAcademicYear,
    }))) return
    setCheckingIn(String(student.id))
    try {
      await axios.post(`/api/registrar/re-enrollment/${student.id}/check-in`, {}, authConfig())
      toast.success(t('{name} checked in for {year}.', { name: student.name, year: currentAcademicYear }))
      await load()
    } catch (error) {
      toast.error(t(error.response?.data?.message || 'Unable to check in this student.'))
    } finally {
      setCheckingIn('')
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="reenrollment-heading">
      <header>
        <p className="text-sm font-semibold text-primary-700">{t('Registrar workspace')}</p>
        <h1 id="reenrollment-heading" className="mt-1 text-2xl font-bold text-slate-900">{t('Student Re-Enrollment / Check-In')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('Confirm returning and promoted students for the active academic year before section assignment.')}</p>
        <p className="mt-2 text-sm font-semibold text-primary-800">{t('Active academic period')}: {currentAcademicYear || t('No active academic period')}{currentSemester ? ` · ${t(currentSemester)}` : ''}</p>
        {!currentAcademicYear && <p role="status" className="mt-2 text-sm text-warning-700">{t('Your school has no active academic year and current semester. Ask the School Admin to mark them active in Academic Infrastructure.')}</p>}
      </header>

      <label className="relative block max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('Search by student name, student ID, or number')}
          aria-label={t('Search students awaiting check-in')}
          className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm"
        />
      </label>

      {loading ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('Loading students…')}</p>
        : !students.length ? <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">{t('No students are awaiting check-in.')}</p>
          : <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-panel">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t('Student')}</th>
                  <th className="px-4 py-3">{t('Student ID')}</th>
                  <th className="px-4 py-3">{t('Grade')}</th>
                  <th className="px-4 py-3">{t('Academic status')}</th>
                  <th className="px-4 py-3">{t('Check-in status')}</th>
                  <th className="px-4 py-3">{t('Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => <tr key={student.id}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{student.name}</td>
                  <td className="px-4 py-3 text-slate-600">{student.studentNumber || student.id}</td>
                  <td className="px-4 py-3 text-slate-600">{t(student.gradeLevel)}</td>
                  <td className="px-4 py-3 text-slate-600">{t(student.academicStatus)}</td>
                  <td className="px-4 py-3 text-warning-700">{t(student.sectionStatus)}</td>
                  <td className="px-4 py-3">
                    <Button
                      disabled={!currentAcademicYear || !currentSemester || loading || Boolean(checkingIn)}
                      loading={checkingIn === String(student.id)}
                      onClick={() => checkIn(student)}
                    >
                      <CheckCircle2 className="h-4 w-4" />{t('Confirm / Enroll')}
                    </Button>
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>}
    </section>
  )
}
