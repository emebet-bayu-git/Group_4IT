import React from 'react'

export default function AppFooter({ schoolName = 'Amhara Region Secondary School' }) {
  return (
    <footer className="bg-emerald-800 px-5 py-4 text-sm text-emerald-50 sm:px-6">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col items-center justify-between gap-2 sm:flex-row">
        <p className="text-center sm:text-left">&copy; {new Date().getFullYear()} {schoolName} Information Management System. All rights reserved.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-emerald-100">
          <span>SIMS v0.1.0</span>
          <a className="underline-offset-4 hover:text-white hover:underline" href="mailto:support@northfield.edu">Support</a>
          <a className="underline-offset-4 hover:text-white hover:underline" href="mailto:registrar@northfield.edu">Registrar</a>
        </div>
      </div>
    </footer>
  )
}