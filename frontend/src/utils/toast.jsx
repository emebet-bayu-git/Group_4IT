import { AlertTriangle } from 'lucide-react'
import { toast } from 'react-hot-toast'

const toastClassName = 'flex items-center gap-2 rounded-lg border px-4 py-3 shadow-md'
const businessRulePatterns = [
  /The official Grade 9–12 transcript is available after Grade 12 completion or an official transfer out\./i,
  /(?:teacher )?period limit exceeded/i,
  /weekly periods.*exceeding the school limit/i,
]

export function toastWarning(message) {
  return toast(message, {
    className: `${toastClassName} bg-amber-50 border-amber-300 text-amber-900`,
    icon: <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />,
  })
}

export function toastApiError(error, fallback, translate) {
  const message = error.response?.data?.message || fallback
  const translatedMessage = translate(message)
  if (businessRulePatterns.some((pattern) => pattern.test(message))) {
    return toastWarning(translatedMessage)
  }
  return toast.error(translatedMessage)
}
