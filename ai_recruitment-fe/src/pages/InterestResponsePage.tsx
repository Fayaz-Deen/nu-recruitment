import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resumeApi } from '../services/api'
import { C } from '../tokens'
import { CheckCircle, XCircle, Loader, Zap } from 'lucide-react'

type State = 'loading' | 'interested' | 'not_looking' | 'already_recorded' | 'error'

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
      setError('Invalid link — missing token or response.')
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
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: C.BG }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 mb-8">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md"
          style={{ background: C.GRAD_BRAND }}
        >
          <Zap style={{ width: 18, height: 18, color: '#fff' }} />
        </div>
        <span className="font-bold text-sm" style={{ color: C.TEXT }}>NULogic Recruitment</span>
      </div>

      <div
        className="w-full max-w-md rounded-2xl p-10 text-center shadow-sm"
        style={{ backgroundColor: '#fff', border: `1px solid ${C.BORDER}` }}
      >
        {state === 'loading' && (
          <>
            <Loader className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: C.LAPIS }} />
            <p className="text-sm font-medium" style={{ color: C.TEXT_MUTED }}>Recording your response…</p>
          </>
        )}

        {state === 'interested' && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.SUCCESS }} />
            <h2 className="text-xl font-bold mb-2" style={{ color: C.TEXT }}>Great to hear!</h2>
            <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>
              We've noted your interest. The team at <strong>{companyName}</strong> will be in touch with you soon.
            </p>
          </>
        )}

        {state === 'not_looking' && (
          <>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: C.ACCENT_BG }}
            >
              <span className="text-2xl">👋</span>
            </div>
            <h2 className="text-xl font-bold mb-2" style={{ color: C.TEXT }}>Thanks for letting us know</h2>
            <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>
              No problem at all — we'll keep your profile on file at <strong>{companyName}</strong>.
              Feel free to reach out whenever you're ready to explore new opportunities.
            </p>
          </>
        )}

        {state === 'already_recorded' && (
          <>
            <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.TEXT_MUTED }} />
            <h2 className="text-xl font-bold mb-2" style={{ color: C.TEXT }}>Already recorded</h2>
            <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
              Your response has already been recorded. You can close this tab.
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <XCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.RED }} />
            <h2 className="text-xl font-bold mb-2" style={{ color: C.TEXT }}>Link issue</h2>
            <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>{errorMsg}</p>
          </>
        )}

        {state !== 'loading' && (
          <p className="text-xs mt-6" style={{ color: C.TEXT_SUBTLE }}>You can safely close this tab.</p>
        )}
      </div>

      <p className="text-xs mt-6" style={{ color: C.TEXT_SUBTLE }}>
        Powered by NULogic Recruitment AI
      </p>
    </div>
  )
}
