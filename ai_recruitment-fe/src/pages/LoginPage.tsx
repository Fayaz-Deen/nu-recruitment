import { useState, FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Zap, Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { C } from '../tokens'
import { getApiErrorMessage } from '../lib/errors'

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
      const msg = getApiErrorMessage(err, 'Login failed. Please try again.')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: C.BG }}
    >
      <div className="w-full max-w-sm animate-pop-in">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg mb-4"
            style={{ background: C.GRAD_BRAND, boxShadow: '0 6px 20px rgba(123,70,155,0.35)' }}
          >
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: C.TEXT }}>Recruit360</h1>
          <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>NULogic Recruitment AI</p>
        </div>

        {/* Card */}
        <div
          className="bg-white rounded-2xl shadow-sm p-8"
          style={{ border: `1px solid ${C.BORDER}` }}
        >
          <h2 className="text-lg font-semibold mb-1" style={{ color: C.TEXT }}>Sign in</h2>
          <p className="text-sm mb-6" style={{ color: C.TEXT_MUTED }}>
            Enter your work email and password
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.TEXT }}>
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  border: `1.5px solid ${C.BORDER}`,
                  color: C.TEXT,
                  backgroundColor: '#fff',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = C.LAPIS)}
                onBlur={(e) => (e.currentTarget.style.borderColor = C.BORDER)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium" style={{ color: C.TEXT }}>
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium transition-colors"
                  style={{ color: C.LAPIS }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm outline-none transition-all"
                  style={{
                    border: `1.5px solid ${C.BORDER}`,
                    color: C.TEXT,
                    backgroundColor: '#fff',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = C.LAPIS)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = C.BORDER)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: C.TEXT_MUTED }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="text-sm px-4 py-3 rounded-xl"
                style={{
                  backgroundColor: C.ACCENT_BG,
                  color: C.RED,
                  border: `1px solid ${C.ACCENT_BORDER}`,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
            >
              {loading
                ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                : <><LogIn className="w-4 h-4" /> Sign in</>
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: C.TEXT_SUBTLE }}>
          Don't have an account? Ask your administrator to invite you.
        </p>
      </div>
    </div>
  )
}
