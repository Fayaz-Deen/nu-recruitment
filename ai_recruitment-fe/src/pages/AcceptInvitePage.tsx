import { useState, FormEvent } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Zap, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { authApi } from '../services/api'
import { C } from '../tokens'
import { getApiErrorMessage } from '../lib/errors'

/* Stagger helper - entrance cascade driven by pure CSS animation-delay */
const stagger = (i: number) => ({ animationDelay: `${90 + i * 70}ms` })

const inputClass =
  'w-full px-4 py-3 rounded-xl text-sm outline-none bg-white transition-all ' +
  'border-[1.5px] focus:shadow-[0_0_0_4px_var(--brand-primary-ring)]'

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
        <p
          role="alert"
          className="text-sm px-4 py-3 rounded-xl animate-pop-in"
          style={{ backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }}
        >
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
        <div className="animate-fade-in-up" style={stagger(1)}>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mb-5"
            style={{ backgroundColor: C.SUCCESS_BG }}
          >
            <CheckCircle className="w-6 h-6" style={{ color: C.SUCCESS }} />
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>
            Account activated
          </h2>
          <p className="text-sm mt-1.5" style={{ color: C.TEXT_MUTED }}>You can now sign in.</p>
          <button
            onClick={() => navigate('/login')}
            className="btn-primary px-6 py-2.5 mt-8 active:scale-[0.98]"
          >
            Go to login
          </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="animate-fade-in-up" style={stagger(1)}>
        <h2 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>
          Set up your account
        </h2>
        <p className="text-sm mt-1.5 mb-9" style={{ color: C.TEXT_MUTED }}>
          Choose a name and password to activate your invite.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field id="invite-name" label="Your name" index={2}>
          <input
            id="invite-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Jane Smith"
            className={inputClass}
            style={{ borderColor: C.BORDER, color: C.TEXT }}
          />
        </Field>

        <Field id="invite-password" label="Password" index={3}>
          <PasswordInput
            id="invite-password"
            value={password}
            onChange={setPassword}
            show={showPass}
            onToggle={() => setShowPass((v) => !v)}
            placeholder="Min. 8 characters"
          />
        </Field>

        <Field id="invite-confirm" label="Confirm password" index={4}>
          <PasswordInput
            id="invite-confirm"
            value={confirm}
            onChange={setConfirm}
            show={showPass}
            onToggle={() => setShowPass((v) => !v)}
            placeholder="Repeat password"
          />
        </Field>

        {error && <ErrorBox message={error} />}

        <div className="animate-fade-in-up pt-1" style={stagger(5)}>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {loading
              ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : 'Activate account'
            }
          </button>
        </div>
      </form>

      <p className="text-xs mt-10 animate-fade-in-up" style={{ color: C.TEXT_SUBTLE, ...stagger(6) }}>
        Already have an account?{' '}
        <Link to="/login" className="font-medium hover:opacity-70 transition-opacity" style={{ color: C.LAPIS }}>
          Sign in
        </Link>
      </p>
    </PageShell>
  )
}

// -- Shared sub-components ----------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="min-h-[100dvh] flex flex-col justify-center px-6 py-12 sm:px-12"
      style={{ backgroundColor: C.BG }}
    >
      <div className="w-full max-w-sm mx-auto">
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
        {children}
      </div>
    </main>
  )
}

function Field({
  id, label, index, children,
}: {
  id: string
  label: string
  index: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 animate-fade-in-up" style={stagger(index)}>
      <label htmlFor={id} className="text-sm font-medium" style={{ color: C.TEXT }}>{label}</label>
      {children}
    </div>
  )
}

function PasswordInput({
  id, value, onChange, show, onToggle, placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder={placeholder}
        className={`${inputClass} pr-11`}
        style={{ borderColor: C.BORDER, color: C.TEXT }}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors hover:opacity-70"
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
    <p
      role="alert"
      className="text-sm px-4 py-3 rounded-xl animate-pop-in"
      style={{ backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }}
    >
      {message}
    </p>
  )
}
