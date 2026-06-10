import { useState, FormEvent } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Zap, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { authApi } from '../services/api'
import { C } from '../tokens'
import { getApiErrorMessage } from '../lib/errors'

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <PageShell>
        <p className="text-sm text-center" style={{ color: C.RED }}>
          Invalid invite link. Please ask your admin to resend.
        </p>
      </PageShell>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await authApi.acceptInvite(token, name.trim(), password)
      setDone(true)
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to activate account')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-4 py-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: C.SUCCESS_BG }}
          >
            <CheckCircle className="w-7 h-7" style={{ color: C.SUCCESS }} />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold mb-1" style={{ color: C.TEXT }}>Account activated!</h3>
            <p className="text-sm" style={{ color: C.TEXT_MUTED }}>You can now sign in.</p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary px-6 py-2.5"
          >
            Go to login
          </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <h2 className="text-lg font-semibold mb-1" style={{ color: C.TEXT }}>Set up your account</h2>
      <p className="text-sm mb-6" style={{ color: C.TEXT_MUTED }}>
        Choose a name and password to activate your invite.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your name">
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Jane Smith"
            className="input-field"
          />
        </Field>

        <Field label="Password">
          <PasswordInput
            value={password}
            onChange={setPassword}
            show={showPass}
            onToggle={() => setShowPass((v) => !v)}
            placeholder="Min. 8 characters"
          />
        </Field>

        <Field label="Confirm password">
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            show={showPass}
            onToggle={() => setShowPass((v) => !v)}
            placeholder="Repeat password"
          />
        </Field>

        {error && <ErrorBox message={error} />}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
        >
          {loading
            ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            : 'Activate account'
          }
        </button>
      </form>

      <p className="text-center text-xs mt-4" style={{ color: C.TEXT_SUBTLE }}>
        Already have an account? <Link to="/login" style={{ color: C.LAPIS }}>Sign in</Link>
      </p>
    </PageShell>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: C.BG }}>
      <div className="w-full max-w-sm">
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
        <div className="bg-white rounded-2xl shadow-sm p-8" style={{ border: `1px solid ${C.BORDER}` }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.TEXT }}>{label}</label>
      {children}
    </div>
  )
}

function PasswordInput({
  value, onChange, show, onToggle, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm outline-none transition-all"
        style={{ border: `1.5px solid ${C.BORDER}`, color: C.TEXT }}
        onFocus={(e) => (e.currentTarget.style.borderColor = C.LAPIS)}
        onBlur={(e) => (e.currentTarget.style.borderColor = C.BORDER)}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: C.TEXT_MUTED }}
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      className="text-sm px-4 py-3 rounded-xl"
      style={{ backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }}
    >
      {message}
    </div>
  )
}
