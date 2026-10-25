import React from 'react'

const styles = {
  Active: 'bg-success-50 text-success-700 ring-success-500/20',
  Pending: 'bg-warning-50 text-warning-700 ring-warning-500/20',
  Approved: 'bg-primary-50 text-primary-700 ring-primary-500/20',
  Failed: 'bg-danger-50 text-danger-700 ring-danger-500/20',
}

export default function StatusBadge({ status }) {
  const normalized = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[normalized] ?? styles.Active}`}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current opacity-70" />{normalized}</span>
}
