import { useEffect, useState } from 'react'
import axios from 'axios'
import { GraduationCap } from 'lucide-react'

export function useSchoolProfile() {
  const [school, setSchool] = useState({})
  useEffect(() => {
    let active = true
    axios.get('/api/school-profile')
      .then(({ data }) => { if (active) setSchool(data) })
      .catch((error) => console.error('Unable to load public school information:', error.message))
    return () => { active = false }
  }, [])
  return school
}

export function SchoolMark({ school, className = 'h-16 w-16' }) {
  return school.logo_path
    ? <img src={school.logo_path} alt={`${school.school_name || 'School'} logo`} className={`${className} shrink-0 object-contain`} />
    : <div className={`${className} grid shrink-0 place-items-center rounded-full border-2 border-primary-900 text-primary-900`}><GraduationCap className="h-9 w-9" /></div>
}

export function SchoolAddress({ school }) {
  const address = [school.region, school.wereda].filter(Boolean).join(' · ')
  return address
}
