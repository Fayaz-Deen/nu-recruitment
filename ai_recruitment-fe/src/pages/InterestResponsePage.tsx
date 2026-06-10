import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resumeApi } from '../services/api'
import { C } from '../tokens'
import { CheckCircle, XCircle, Loader, Zap, Hand } from 'lucide-react'

type State = 'loading' | 'interested' | 'not_looking' | 'already_recorded' | 'error'

/* Stagger helper - entrance cascade driven by pure CSS animation-delay */
const stagger = (i: number) => ({ animationDelay: `${90 + i * 70}ms` })

export default function InterestResponsePage() {
  const [searchParams] = useSearchParams()
  const [state, setState]       = useState<State>('loading')
  const [companyName, setCompany] = useState('')
  const [errorMsg, setError]    = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const r     = searchParams.get('r')

    if (!token || !r) {
      setState('error')
      setError('Invalid link. The token or response is missing.')
      return
    }

    resumeApi.interestResponse(token, r)
      .then((data) => {
        setCompany(data.companyName ?? 'the company')
        if (!data.success) {
          setState('error')
          setError(data.error ?? 'Something went wrong.')
          return
        }
        if (data.alreadyRecorded) {
          setState('already_recorded')
          return
        }
        setState(data.response === 'interested' ? 'interested' : 'not_looking')
      })
      .catch(() => {
        setState('error')
        setError('Something went wrong. Please try again or contact the recruiter.')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: C.BG }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 mb-8 animate-fade-in-up" style={stagger(0)}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: C.GRAD_BRAND }}
        >
          <Zap className="w-[18px] h-[18px] text-white" strokeWidth={2} />
        </div>
        <span className="font-display font-semibold tracking-tight text-sm" style={{ color: C.TEXT }}>
          NULogic Recruitment
        </span>
      </div>

      <div
        className="w-full max-w-md rounded-2xl p-10 text-center shadow-sm animate-fade-in-up"
        style={{ backgroundColor: '#fff', border: `1px solid ${C.BORDER}`, ...stagger(1) }}
      >
        {state === 'loading' && (
          <>
            <Loader className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: C.LAPIS }} />
            <p className="text-sm font-medium" style={{ color: C.TEXT_MUTED }}>Recording your response…</p>
          </>
        )}

        {state === 'interested' && (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 animate-pop-in"
              style={{ backgroundColor: C.SUCCESS_BG }}
            >
              <CheckCircle className="w-6 h-6" style={{ color: C.SUCCESS }} />
            </div>
            <h2 className="font-display text-xl font-semibold tracking-tight mb-2" style={{ color: C.TEXT }}>
              Great to hear!
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>
              We've noted your interest. The team at <strong>{companyName}</strong> will be in touch with you soon.
            </p>
          </>
        )}

        {state === 'not_looking' && (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 animate-pop-in"
              style={{ backgroundColor: C.PRIMARY_LIGHT }}
            >
              <Hand className="w-6 h-6" style={{ color: C.LAPIS }} />
            </div>
            <h2 className="font-display text-xl font-semibold tracking-tight mb-2" style={{ color: C.TEXT }}>
              Thanks for letting us know
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>
              No problem at all. We'll keep your profile on file at <strong>{companyName}</strong>.
              Feel free to reach out whenever you're ready to explore new opportunities.
            </p>
          </>
        )}

        {state === 'already_recorded' && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.TEXT_MUTED }} />
            <h2 className="font-display text-xl font-semibold tracking-tight mb-2" style={{ color: C.TEXT }}>
              Already recorded
            </h2>
            <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
              Your response has already been recorded. You can close this tab.
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.RED }} />
            <h2 className="font-display text-xl font-semibold tracking-tight mb-2" style={{ color: C.TEXT }}>
              Link issue
            </h2>
            <p
              role="alert"
              className="text-sm leading-relaxed px-4 py-3 rounded-xl text-left"
              style={{ backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }}
            >
              {errorMsg}
            </p>
          </>
        )}

        {state !== 'loading' && (
          <p className="text-xs mt-6" style={{ color: C.TEXT_SUBTLE }}>You can safely close this tab.</p>
        )}
      </div>

      <p className="text-xs mt-6 animate-fade-in-up" style={{ color: C.TEXT_SUBTLE, ...stagger(2) }}>
        Powered by NULogic Recruitment AI
      </p>
    </div>
  )
}
