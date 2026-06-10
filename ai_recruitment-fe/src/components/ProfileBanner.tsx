import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { companyApi } from '../services/api'
import { C } from '../tokens'

export default function ProfileBanner() {
  const navigate = useNavigate()
  const { data: completeness } = useQuery({
    queryKey: ['company-completeness'],
    queryFn: companyApi.completeness,
    staleTime: 60_000,
  })

  if (!completeness || completeness.isComplete) return null

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl mb-6"
      style={{
        backgroundColor: C.WARNING_BG,
        border: `1px solid ${C.WARNING_BORDER}`,
      }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="w-4 h-4 mt-0.5 shrink-0"
          style={{ color: C.WARNING }}
        />
        <div>
          <p className="text-sm font-semibold" style={{ color: C.WARNING }}>
            Company profile is incomplete ({completeness.score}%)
          </p>
          <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
            AI outputs will be generic until you fill in{' '}
            <span className="font-medium">
              {completeness.missing.slice(0, 3).join(', ')}
              {completeness.missing.length > 3 && ` +${completeness.missing.length - 3} more`}
            </span>
            .
          </p>
        </div>
      </div>

      <button
        onClick={() => navigate('/profile')}
        className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap px-3 py-1.5 rounded-xl transition-all shrink-0"
        style={{
          backgroundColor: C.WARNING,
          color: 'white',
        }}
      >
        Complete profile
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
