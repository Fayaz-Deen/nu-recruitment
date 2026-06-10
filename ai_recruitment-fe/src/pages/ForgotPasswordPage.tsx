import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Zap, Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { authApi } from '../services/api'
import { C } from '../tokens'

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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: C.BG }}>
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg mb-4"
            style={{ background: C.GRAD_BRAND, boxShadow: '0 6px 20px rgba(123,70,155,0.35)' }}
          >
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: C.TEXT }}>Recruit360</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-8" style={{ border: `1px solid ${C.BORDER}` }}>
          {done ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: C.SUCCESS_BG }}
              >
                <CheckCircle className="w-7 h-7" style={{ color: C.SUCCESS }} />
              </div>
              <div>
                <h3 className="font-semibold mb-1" style={{ color: C.TEXT }}>Check your inbox</h3>
                <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
                  If <strong>{email}</strong> is registered, we've sent a reset link. Check your spam folder too.
                </p>
              </div>
              <Link to="/login" className="text-sm font-medium" style={{ color: C.LAPIS }}>
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-1" style={{ color: C.TEXT }}>Forgot password?</h2>
              <p className="text-sm mb-6" style={{ color: C.TEXT_MUTED }}>
                Enter your work email and we'll send a reset link.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: C.TEXT }}>
                    Work email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: C.TEXT_MUTED }} />
                    <input
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                      style={{ border: `1.5px solid ${C.BORDER}`, color: C.TEXT }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = C.LAPIS)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = C.BORDER)}
                    />
                  </div>
                </div>

                {error && (
                  <div
                    className="text-sm px-4 py-3 rounded-xl"
                    style={{ backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }}
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
                    : 'Send reset link'
                  }
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                  style={{ color: C.TEXT_MUTED }}
                >
                  <ArrowLeft className="w-4 h-4" /> Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
