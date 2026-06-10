import { useState, FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Zap, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { C } from '../tokens'
import { getApiErrorMessage } from '../lib/errors'

/* Stagger helper — entrance cascade driven by pure CSS animation-delay */
const stagger = (i: number) => ({ animationDelay: `${90 + i * 70}ms` })

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location })?.from?.pathname || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Login failed. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-4 py-3 rounded-xl text-sm outline-none bg-white transition-all ' +
    'border-[1.5px] focus:shadow-[0_0_0_4px_var(--brand-primary-ring)]'

  return (
    <div className="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-[1.25fr_1fr]">

      {/* ── Brand panel — dark, asymmetric, alive ─────────────────────────── */}
      <section
        aria-hidden="true"
        className="relative hidden lg:flex flex-col justify-between p-14 xl:p-20 overflow-hidden"
        style={{ backgroundColor: '#070833', color: '#fff' }}
      >
        {/* Atmosphere: one slow off-center glow, no purple neon */}
        <div
          className="absolute inset-0 pointer-events-none animate-fade-in"
          style={{
            background:
              'radial-gradient(820px 520px at 18% 110%, rgba(230,42,50,0.16), transparent 64%),' +
              'radial-gradient(640px 420px at 105% -10%, rgba(97,98,157,0.22), transparent 60%)',
          }}
        />

        {/* Wordmark */}
        <div className="relative flex items-center gap-3 animate-fade-in-up" style={stagger(0)}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: C.GRAD_BRAND }}
          >
            <Zap className="w-[18px] h-[18px] text-white" strokeWidth={2} />
          </div>
          <span className="font-display font-semibold tracking-tight text-lg">Recruit360</span>
        </div>

        {/* Display statement — left aligned, tight, no scream */}
        <div className="relative max-w-xl">
          <p
            className="text-xs font-medium uppercase tracking-[0.22em] mb-6 animate-fade-in-up"
            style={{ color: 'rgba(238,119,124,0.9)', ...stagger(1) }}
          >
            NULogic Recruitment AI
          </p>
          <h1
            className="font-display text-4xl xl:text-5xl font-semibold tracking-tighter leading-[1.04] animate-fade-in-up"
            style={stagger(2)}
          >
            Shortlists in hours,
            <br />
            <span style={{ color: 'rgba(255,255,255,0.44)' }}>not weeks.</span>
          </h1>
          <p
            className="mt-6 text-base leading-relaxed max-w-[46ch] animate-fade-in-up"
            style={{ color: 'rgba(255,255,255,0.62)', ...stagger(3) }}
          >
            One pipeline from job description to interview guide — drafted,
            screened and scheduled by your recruiting copilot.
          </p>
        </div>

        {/* Live footer strip — breathing status + organic metrics */}
        <div
          className="relative flex items-center gap-8 text-sm animate-fade-in-up"
          style={{ color: 'rgba(255,255,255,0.55)', ...stagger(4) }}
        >
          <span className="flex items-center gap-2.5">
            <span className="relative flex w-2 h-2">
              <span
                className="absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping"
                style={{ backgroundColor: '#34d399', animationDuration: '2.4s' }}
              />
              <span className="relative inline-flex w-2 h-2 rounded-full" style={{ backgroundColor: '#34d399' }} />
            </span>
            Screening engine online
          </span>
          <span className="hidden xl:inline border-l pl-8" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
            1,284 resumes screened this quarter
          </span>
        </div>
      </section>

      {/* ── Form panel — left-aligned, calm ───────────────────────────────── */}
      <main
        className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-24"
        style={{ backgroundColor: C.BG }}
      >
        <div className="w-full max-w-sm">

          {/* Mobile-only brand strip */}
          <div className="flex lg:hidden items-center gap-3 mb-10 animate-fade-in-up" style={stagger(0)}>
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

          <div className="animate-fade-in-up" style={stagger(1)}>
            <h2 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>
              Welcome back
            </h2>
            <p className="text-sm mt-1.5 mb-9" style={{ color: C.TEXT_MUTED }}>
              Sign in with your work email
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="flex flex-col gap-2 animate-fade-in-up" style={stagger(2)}>
              <label htmlFor="login-email" className="text-sm font-medium" style={{ color: C.TEXT }}>
                Email
              </label>
              <input
                id="login-email"
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

            <div className="flex flex-col gap-2 animate-fade-in-up" style={stagger(3)}>
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-sm font-medium" style={{ color: C.TEXT }}>
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium hover:opacity-70 transition-opacity"
                  style={{ color: C.LAPIS }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Your password"
                  className={`${inputClass} pr-11`}
                  style={{ borderColor: error ? C.ACCENT_BORDER : C.BORDER, color: C.TEXT }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors hover:opacity-70"
                  style={{ color: C.TEXT_MUTED }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
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

            <div className="animate-fade-in-up pt-1" style={stagger(4)}>
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {loading ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" strokeWidth={2} />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="text-xs mt-10 animate-fade-in-up" style={{ color: C.TEXT_SUBTLE, ...stagger(5) }}>
            Don&apos;t have an account? Ask your administrator to invite you.
          </p>
        </div>
      </main>
    </div>
  )
}
