import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Zap, ArrowLeft, CheckCircle } from 'lucide-react'
import { authApi } from '../services/api'
import { C } from '../tokens'

/* Stagger helper - entrance cascade driven by pure CSS animation-delay */
const stagger = (i: number) => ({ animationDelay: `${90 + i * 70}ms` })

const inputClass =
  'w-full px-4 py-3 rounded-xl text-sm outline-none bg-white transition-all ' +
  'border-[1.5px] focus:shadow-[0_0_0_4px_var(--brand-primary-ring)]'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.forgotPassword(email.trim())
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="min-h-[100dvh] flex flex-col justify-center px-6 py-12 sm:px-12"
      style={{ backgroundColor: C.BG }}
    >
      <div className="w-full max-w-sm mx-auto">

        {/* Brand strip */}
        <div className="flex items-center gap-3 mb-10 animate-fade-in-up" style={stagger(0)}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: C.GRAD_BRAND }}
          >
            <Zap className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <div>
            <span className="font-display font-semibold tracking-tight" style={{ color: C.TEXT }}>Recruit360</span>
            <p className="text-xs" style={{ color: C.TEXT_MUTED }}>NULogic Recruitment AI</p>
          </div>
        </div>

        {done ? (
          <div className="animate-fade-in-up" style={stagger(1)}>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-5"
              style={{ backgroundColor: C.SUCCESS_BG }}
            >
              <CheckCircle className="w-6 h-6" style={{ color: C.SUCCESS }} />
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>
              Check your inbox
            </h2>
            <p className="text-sm mt-1.5 leading-relaxed" style={{ color: C.TEXT_MUTED }}>
              If <strong>{email}</strong> is registered, we've sent a reset link. Check your spam folder too.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium mt-8 hover:opacity-70 transition-opacity"
              style={{ color: C.LAPIS }}
            >
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="animate-fade-in-up" style={stagger(1)}>
              <h2 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>
                Forgot password?
              </h2>
              <p className="text-sm mt-1.5 mb-9" style={{ color: C.TEXT_MUTED }}>
                Enter your work email and we'll send a reset link.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex flex-col gap-2 animate-fade-in-up" style={stagger(2)}>
                <label htmlFor="forgot-email" className="text-sm font-medium" style={{ color: C.TEXT }}>
                  Work email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                  className={inputClass}
                  style={{ borderColor: error ? C.ACCENT_BORDER : C.BORDER, color: C.TEXT }}
                />
              </div>

              {error && (
                <p
                  role="alert"
                  className="text-sm px-4 py-3 rounded-xl animate-pop-in"
                  style={{
                    backgroundColor: C.ACCENT_BG,
                    color: C.RED,
                    border: `1px solid ${C.ACCENT_BORDER}`,
                  }}
                >
                  {error}
                </p>
              )}

              <div className="animate-fade-in-up pt-1" style={stagger(3)}>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  {loading
                    ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    : 'Send reset link'
                  }
                </button>
              </div>
            </form>

            <div className="mt-8 animate-fade-in-up" style={stagger(4)}>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-70 transition-opacity"
                style={{ color: C.TEXT_MUTED }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
