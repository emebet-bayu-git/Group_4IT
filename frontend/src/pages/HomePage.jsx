import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { BookOpen, CalendarCheck, FileText, LockKeyhole, Users, GraduationCap } from 'lucide-react'
import HeroCarousel from '../components/HeroCarousel.jsx'

const quickFeatures = [
  {
    title: 'Student Records',
    description: 'Secure profiles and grade-level tracking for secondary students.',
    icon: BookOpen,
  },
  {
    title: 'Grade Reports',
    description: 'Subject grading, GPA calculation, and official high school transcripts.',
    icon: FileText,
  },
  {
    title: 'Daily Attendance',
    description: 'Classroom attendance monitoring and homeroom tracking.',
    icon: CalendarCheck,
  },
  {
    title: 'Role-Based Access',
    description: 'Secure permissions for administrators, registrars, teachers, and students.',
    icon: LockKeyhole,
  },
]

const schoolStats = [
  { value: '1,450+', label: 'Grade 9–12 Students', icon: GraduationCap },
  { value: '75+', label: 'High School Teachers', icon: Users },
  { value: '98%', label: 'National Exam Pass Rate', icon: GraduationCap },
  { value: '4', label: 'User Roles', icon: LockKeyhole },
]

const announcements = [
  {
    date: 'October 26, 2026',
    title: 'Grade 9–12 Mid-Semester Exams',
    description: 'First semester mid-semester assessments for all secondary grade levels begin next Monday.',
    accentClass: 'border-t-emerald-600',
    dateClass: 'bg-emerald-50 text-emerald-700',
  },
  {
    date: 'November 02, 2026',
    title: 'Parent-Teacher Association Meeting',
    description: 'Parents of high school students are invited to discuss academic progress and preparation for national examinations.',
    accentClass: 'border-t-sky-600',
    dateClass: 'bg-sky-50 text-sky-700',
  },
  {
    date: 'November 15, 2026',
    title: 'Annual High School Science Fair',
    description: 'Secondary students from grades 9 through 12 will showcase their academic projects in the main hall.',
    accentClass: 'border-t-amber-600',
    dateClass: 'bg-amber-50 text-amber-700',
  },
]

const fallbackImages = [
  {
    id: 1,
    imageUrl: '/school-images/flag-raising.png',
    title: 'Grade 9–12 Flag Raising Ceremony',
    description: 'Students gather for the school flag ceremony.',
  },
  {
    id: 2,
    imageUrl: '/school-images/morning-assembly.png',
    title: 'Morning Assembly & Homeroom',
    description: 'Students take part in the morning assembly.',
  },
  {
    id: 3,
    imageUrl: '/school-images/campus-life.png',
    title: 'Secondary School Student Life',
    description: 'A glimpse of daily life at school.',
  },
]

export default function HomePage() {
  const [homeImages, setHomeImages] = useState(fallbackImages)

  useEffect(() => {
    let ignore = false
    axios.get('/api/home-images')
      .then(({ data }) => {
        const images = Array.isArray(data) ? data : data.items || []
        if (!ignore && images.length) setHomeImages(images)
      })
      .catch((error) => console.error('Unable to load home images:', error.message))
    return () => { ignore = true }
  }, [])

  return (
    <div id="home" className="flex-1 bg-slate-50">
      <main className="flex-grow">
        <header className="relative h-[450px] w-full overflow-hidden bg-slate-900 shadow-lg md:h-[550px]">
          <HeroCarousel
            slides={homeImages.map((image, index) => ({
              id: image.id ?? index,
              imageUrl: image.imageUrl || image.image_path,
              title: image.title,
              description: image.description,
            }))}
            variant="hero"
          />
        </header>

        <section className="bg-emerald-700 px-6 py-8 text-white shadow-inner" aria-label="School statistics">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            {schoolStats.map(({ value, label, icon: Icon }) => (
              <div key={label}>
                <Icon className="mx-auto mb-2 h-6 w-6 text-emerald-100" aria-hidden="true" />
                <p className="text-3xl font-bold">{value}</p>
                <p className="mt-1 text-sm text-emerald-100">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="announcements" className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <div className="mb-12 text-center">
            <h1 className="text-3xl font-extrabold text-slate-900 md:text-4xl">Secondary School Announcements</h1>
            <p className="mt-2 text-slate-600">Stay updated with grade-level notices, department schedules, and high school events.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {announcements.map(({ date, title, description, accentClass, dateClass }) => (
              <article key={title} className={`rounded-xl border border-slate-200 border-t-4 ${accentClass} bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg`}>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${dateClass}`}>{date}</span>
                <h2 className="mb-2 mt-4 text-xl font-bold text-slate-900">{title}</h2>
                <p className="text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="bg-slate-100 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mb-12 text-center">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Designed for the school community</p>
              <h2 className="mt-3 text-3xl font-extrabold text-slate-900 md:text-4xl">Student Information System Features</h2>
              <p className="mt-2 text-slate-600">Tailored for secondary school administration, teachers, and grade 9–12 students.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              {quickFeatures.map(({ title, description, icon: Icon }) => (
                <article key={title} className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mb-1 mt-4 font-bold text-slate-900">{title}</h3>
                  <p className="text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

    </div>
  )
}
