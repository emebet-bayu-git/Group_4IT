import React, { useState } from 'react'
import { Clock3, Mail, MapPin, Phone, Send } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useTranslation } from '../i18n/I18nContext.jsx'

const contactItems = [
  { icon: MapPin, title: 'School address', lines: ['14 Academic Avenue', 'Northfield District, Accra, Ghana'] },
  { icon: Phone, title: 'Phone number', lines: ['+233 30 555 0180', '+233 24 555 0181'] },
  { icon: Mail, title: 'Support email', lines: ['support@northfield.edu', 'registrar@northfield.edu'] },
  { icon: Clock3, title: 'Operating hours', lines: ['Monday - Friday: 7:30 AM - 4:30 PM', 'Saturday: Closed'] },
]

const emptyForm = { name: '', email: '', subject: '', message: '' }

export default function ContactPage() {
  const { t } = useTranslation()
  const [form, setForm] = useState(emptyForm)
  const [touched, setTouched] = useState({})
  const errors = {
    name: form.name.trim().length < 2 ? t('Enter your full name.') : '',
    email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? t('Enter a valid email address.') : '',
    subject: !form.subject.trim() ? t('Enter a subject.') : '',
    message: form.message.trim().length < 10 ? t('Message must be at least 10 characters.') : '',
  }
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const submit = (event) => { event.preventDefault(); setTouched({ name: true, email: true, subject: true, message: true }); if (Object.values(errors).every((error) => !error)) { toast.success(t('Message sent successfully')); setForm(emptyForm); setTouched({}) } }
  const fieldClass = (field) => `mt-1.5 w-full rounded-md border bg-white px-3 text-sm outline-none transition ${touched[field] ? errors[field] ? 'border-danger-500 ring-2 ring-danger-100' : 'border-success-500 ring-2 ring-success-100' : 'border-slate-300 focus:border-primary-500 focus:ring-2 focus:ring-primary-100'}`

  return (
    <div className="flex-1 bg-white text-slate-900">
      <main>
        <section className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8"><p className="text-sm font-semibold text-slate-600">{t('Amhara Region Secondary School')}</p><h1 className="mt-2 text-4xl font-bold text-slate-900 sm:text-5xl">{t('Contact Us')}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{t('Questions about admissions, student records, or school services? Our team is ready to help.')}</p></div></section>

        <section className="py-14 sm:py-20"><div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8"><div><p className="text-sm font-bold uppercase tracking-wider text-primary-700">{t('Get in touch')}</p><h2 className="mt-3 text-2xl font-bold text-slate-950">{t('We are here to support you')}</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">{contactItems.map(({ icon: Icon, title, lines }) => <article key={title} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-panel"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary-50 text-primary-800"><Icon className="h-5 w-5" /></span><div><h3 className="text-sm font-bold text-slate-900">{t(title)}</h3>{lines.map((line) => <p key={line} className="mt-1 text-sm leading-6 text-slate-600">{t(line)}</p>)}</div></article>)}</div></div>
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-panel sm:p-7" aria-labelledby="contact-form-heading"><h2 id="contact-form-heading" className="text-xl font-bold text-slate-900">{t('Send us a message')}</h2><p className="mt-1 text-sm text-slate-500">{t('Complete the form and a member of our team will respond.')}</p><form onSubmit={submit} noValidate className="mt-6 grid gap-5 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-700">{t('Full Name')}<span className="ml-1 text-danger-600">*</span><input value={form.name} onChange={(event) => update('name', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, name: true }))} placeholder={t('Your full name')} className={`${fieldClass('name')} h-11`} />{touched.name && errors.name && <span className="mt-1 block text-xs font-medium text-danger-600">{errors.name}</span>}</label><label className="block text-sm font-semibold text-slate-700">{t('Email Address')}<span className="ml-1 text-danger-600">*</span><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, email: true }))} placeholder={t('name@example.com')} className={`${fieldClass('email')} h-11`} />{touched.email && errors.email && <span className="mt-1 block text-xs font-medium text-danger-600">{errors.email}</span>}</label><label className="block text-sm font-semibold text-slate-700 sm:col-span-2">{t('Subject')}<span className="ml-1 text-danger-600">*</span><input value={form.subject} onChange={(event) => update('subject', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, subject: true }))} placeholder={t('How can we help?')} className={`${fieldClass('subject')} h-11`} />{touched.subject && errors.subject && <span className="mt-1 block text-xs font-medium text-danger-600">{errors.subject}</span>}</label><label className="block text-sm font-semibold text-slate-700 sm:col-span-2">{t('Message')}<span className="ml-1 text-danger-600">*</span><textarea value={form.message} onChange={(event) => update('message', event.target.value)} onBlur={() => setTouched((current) => ({ ...current, message: true }))} placeholder={t('Write your message here...')} className={`${fieldClass('message')} min-h-36 resize-y py-3`} />{touched.message && errors.message && <span className="mt-1 block text-xs font-medium text-danger-600">{errors.message}</span>}</label><div className="sm:col-span-2"><button type="submit" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary-900 px-5 text-sm font-bold text-white hover:bg-primary-800 sm:w-auto"><Send className="h-4 w-4" />{t('Send Message')}</button></div></form></section>
        </div></section>

        <section className="border-t border-slate-200 bg-slate-50 py-14"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-bold uppercase tracking-wider text-primary-700">{t('Find us')}</p><h2 className="mt-2 text-2xl font-bold text-slate-950">{t('Amhara Region campus')}</h2></div><p className="hidden text-sm text-slate-500 sm:block">{t('14 Academic Avenue, Accra')}</p></div><div className="relative h-80 overflow-hidden rounded-lg border border-slate-300 bg-slate-200 shadow-panel" role="img" aria-label={t('Map showing Amhara Region Secondary School campus')}><iframe title={t('Amhara Region Secondary School campus map')} src="https://www.openstreetmap.org/export/embed.html?bbox=-0.245%2C5.565%2C-0.165%2C5.625&amp;layer=mapnik" className="h-full w-full border-0 grayscale-[15%]" loading="lazy" /></div></div></section>
      </main>
    </div>
  )
}
