import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

const WORKFLOW_STEPS = [
  { path: '/dashboard',        label: 'Dashboard' },
  { path: '/jd-generator',     label: 'JD Generator' },
  { path: '/resume-screener',  label: 'Resume Screener' },
  { path: '/interview-guide',  label: 'Interview Guide' },
  { path: '/communication',    label: 'Communications' },
]

export default function NextStepButton({ enabled = true }: { enabled?: boolean }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const idx  = WORKFLOW_STEPS.findIndex((s) => s.path === pathname)
  const next = WORKFLOW_STEPS[idx + 1]

  if (!next || !enabled) return null   // last page, or actions not complete

  return (
    <div className="flex justify-end mt-6 animate-fade-in-up">
      <button
        className="btn-primary py-2.5 px-5"
        onClick={() => navigate(next.path)}
      >
        Next: {next.label}
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}