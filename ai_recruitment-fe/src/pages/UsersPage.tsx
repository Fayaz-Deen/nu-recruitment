import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, RefreshCw, MoreVertical, CheckCircle, Clock, XCircle, Mail, Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { usersApi } from '../services/api'
import type { User, UserRole, UserStatus } from '../types'
import { C } from '../tokens'
import { useAuth } from '../contexts/AuthContext'
import { getApiErrorMessage } from '../lib/errors'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'super_admin',    label: 'Super Admin'    },
  { value: 'hr_admin',       label: 'HR Admin'       },
  { value: 'recruiter',      label: 'Recruiter'      },
  { value: 'hiring_manager', label: 'Hiring Manager' },
  { value: 'interviewer',    label: 'Interviewer'    },
]

const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r

const statusConfig: Record<UserStatus, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  active:   { label: 'Active',   color: C.SUCCESS, bg: C.SUCCESS_BG,   Icon: CheckCircle },
  invited:  { label: 'Pending',  color: C.WARNING, bg: C.WARNING_BG,   Icon: Clock       },
  disabled: { label: 'Disabled', color: C.RED,     bg: C.ACCENT_BG,    Icon: XCircle     },
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { role?: string; status?: string } }) =>
      usersApi.update(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('User updated')
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, 'Failed to update user')
      toast.error(msg)
    },
  })

  const resendMutation = useMutation({
    mutationFn: usersApi.resendInvite,
    onSuccess: (data) => {
      toast.success('Invite resent')
      if (data?.inviteUrl) copyToClipboard(data.inviteUrl)
    },
    onError: () => toast.error('Failed to resend invite'),
  })

  async function copyToClipboard(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch {
      // fallback: silent
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: C.TEXT }}>Team Members</h1>
          <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>
            Manage users, roles, and invite new team members.
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="btn-primary flex items-center gap-2 px-4 py-2.5"
        >
          <UserPlus className="w-4 h-4" />
          Invite member
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: `1px solid ${C.BORDER}` }}>
        <div
          className="px-5 py-3.5 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${C.BORDER}` }}
        >
          <span className="text-sm font-semibold" style={{ color: C.TEXT }}>
            {users.length} {users.length === 1 ? 'member' : 'members'}
          </span>
        </div>

        {/* Column headers */}
        <div
          className="px-5 py-2.5 flex items-center gap-4 text-xs font-semibold uppercase tracking-wide"
          style={{ borderBottom: `1px solid ${C.BORDER}`, color: C.TEXT_MUTED, backgroundColor: C.BG }}
        >
          <div className="w-9 shrink-0" />
          <div className="flex-1 min-w-[140px]">Member</div>
          <div className="w-44 shrink-0">Role</div>
          <div className="w-28 shrink-0">Status</div>
          <div className="w-24 shrink-0 text-right">Last Login</div>
          <div className="w-44 shrink-0">Invited By</div>
          <div className="w-7 shrink-0" />
        </div>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <div
              className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: C.LAPIS, borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: C.DIVIDER }}>
            {users.map((user) => {
              const status = statusConfig[user.status] ?? statusConfig.invited
              const StatusIcon = status.Icon
              const isSelf = user.id === me?.id

              return (
                <div
                  key={user.id}
                  className="px-5 py-4 flex items-center gap-4"
                  style={{ backgroundColor: 'white' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.ROW_HOVER)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-semibold text-sm"
                    style={{ background: C.GRAD_JD, color: 'white' }}
                  >
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>

                  {/* Name + email */}
                  <div className="flex-1 min-w-[140px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate" style={{ color: C.TEXT }}>
                        {user.name || '—'}
                      </span>
                      {isSelf && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-md font-medium"
                          style={{ backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS }}
                        >
                          you
                        </span>
                      )}
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{ color: C.TEXT_MUTED }}>{user.email}</p>
                  </div>

                  {/* Role */}
                  <div className="w-44 shrink-0">
                    {isSelf ? (
                      <span
                        className="text-xs font-medium px-2.5 py-1 rounded-lg"
                        style={{ backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS }}
                      >
                        {roleLabel(user.role)}
                      </span>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => updateMutation.mutate({ id: user.id, updates: { role: e.target.value } })}
                        className="text-xs px-2.5 py-1.5 rounded-lg outline-none w-full cursor-pointer"
                        style={{
                          border: `1.5px solid ${C.BORDER}`,
                          color: C.TEXT,
                          backgroundColor: 'white',
                        }}
                      >
                        {ROLES.filter((r) =>
                          me?.role === 'super_admin' || me?.role === 'hr_admin' || r.value !== 'super_admin'
                        ).map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="w-28 shrink-0">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg"
                      style={{ backgroundColor: status.bg, color: status.color }}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>

                  {/* Last login */}
                  <div className="w-24 shrink-0 text-right">
                    <span className="text-xs" style={{ color: C.TEXT_MUTED }}>
                      {user.last_login
                        ? new Date(user.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                        : 'Never'
                      }
                    </span>
                  </div>

                  {/* Invited by */}
                  <div className="w-44 shrink-0">
                    {user.invited_by_email ? (
                      <span
                        className="text-xs truncate block"
                        style={{ color: C.TEXT_MUTED }}
                        title={user.invited_by_email}
                      >
                        {user.invited_by_email}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: C.TEXT_MUTED }}>—</span>
                    )}
                  </div>

                  {/* Actions menu */}
                  <div className="relative w-7 shrink-0">
                    {!isSelf && (
                      <>
                        <button
                          onClick={() => setActiveMenu(activeMenu === user.id ? null : user.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                          style={{ color: C.TEXT_MUTED }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.PRIMARY_LIGHT)}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {activeMenu === user.id && (
                          <ActionMenu
                            user={user}
                            copiedUrl={copiedUrl}
                            onClose={() => setActiveMenu(null)}
                            onToggleStatus={() => {
                              updateMutation.mutate({
                                id: user.id,
                                updates: { status: user.status === 'disabled' ? 'active' : 'disabled' },
                              })
                              setActiveMenu(null)
                            }}
                            onResendInvite={() => {
                              resendMutation.mutate(user.id)
                              setActiveMenu(null)
                            }}
                            onCopyInvite={async () => {
                              const data = await usersApi.resendInvite(user.id).catch(() => null)
                              if (data?.inviteUrl) copyToClipboard(data.inviteUrl)
                              setActiveMenu(null)
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <InviteModal
          canInviteAdmin={me?.role === 'super_admin' || me?.role === 'hr_admin'}
          onClose={() => setInviteOpen(false)}
          onInvited={() => {
            qc.invalidateQueries({ queryKey: ['users'] })
            setInviteOpen(false)
          }}
        />
      )}

      {/* Click outside to close menus */}
      {activeMenu && (
        <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
      )}
    </div>
  )
}

// ── Action menu ───────────────────────────────────────────────────────────────

function ActionMenu({
  user, copiedUrl, onToggleStatus, onResendInvite, onCopyInvite,
}: {
  user: User
  copiedUrl: string | null
  onClose: () => void
  onToggleStatus: () => void
  onResendInvite: () => void
  onCopyInvite: () => void
}) {
  return (
    <div
      className="absolute right-0 top-8 bg-white rounded-xl shadow-lg z-20 py-1 w-44"
      style={{ border: `1px solid ${C.BORDER}`, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
    >
      {user.status === 'invited' && (
        <>
          <MenuItem icon={Mail} label="Resend invite" onClick={onResendInvite} />
          <MenuItem
            icon={copiedUrl ? Check : Copy}
            label={copiedUrl ? 'Copied!' : 'Copy invite link'}
            onClick={onCopyInvite}
          />
          <div style={{ borderTop: `1px solid ${C.BORDER}`, margin: '4px 0' }} />
        </>
      )}
      <MenuItem
        icon={user.status === 'disabled' ? CheckCircle : XCircle}
        label={user.status === 'disabled' ? 'Enable account' : 'Disable account'}
        onClick={onToggleStatus}
        danger={user.status !== 'disabled'}
      />
    </div>
  )
}

function MenuItem({
  icon: Icon, label, onClick, danger = false,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors text-left"
      style={{ color: danger ? C.RED : C.TEXT }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = danger ? C.ACCENT_BG : C.PRIMARY_LIGHT)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </button>
  )
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({
  canInviteAdmin, onClose, onInvited,
}: {
  canInviteAdmin: boolean
  onClose: () => void
  onInvited: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('recruiter')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ inviteUrl: string } | null>(null)
  const [copiedInvite, setCopiedInvite] = useState(false)

  const mutation = useMutation({
    mutationFn: () => usersApi.invite(email.trim(), role),
    onSuccess: (data) => {
      setResult(data)
      toast.success(`Invite sent to ${email}`)
      onInvited()
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, 'Failed to send invite')
      setError(msg)
    },
  })

  async function copyInviteUrl() {
    if (!result?.inviteUrl) return
    try {
      await navigator.clipboard.writeText(result.inviteUrl)
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    } catch { /* silent */ }
  }

  const availableRoles = ROLES.filter((r) => canInviteAdmin || r.value !== 'super_admin')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        style={{ border: `1px solid ${C.BORDER}` }}
      >
        <h3 className="text-base font-semibold mb-4" style={{ color: C.TEXT }}>
          Invite team member
        </h3>

        {result ? (
          <div className="space-y-4">
            <div
              className="p-3 rounded-xl text-sm"
              style={{ backgroundColor: C.SUCCESS_BG, color: C.SUCCESS_TEXT }}
            >
              Invite sent to <strong>{email}</strong>. If email delivery fails, share the link below manually.
            </div>
            <div
              className="p-3 rounded-xl text-xs font-mono break-all"
              style={{ backgroundColor: C.BG, color: C.TEXT_MUTED, border: `1px solid ${C.BORDER}` }}
            >
              {result.inviteUrl}
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyInviteUrl}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  backgroundColor: copiedInvite ? C.SUCCESS_BG : C.PRIMARY_LIGHT,
                  color: copiedInvite ? C.SUCCESS : C.LAPIS,
                }}
              >
                {copiedInvite ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy link</>}
              </button>
              <button onClick={onClose} className="flex-1 btn-secondary py-2 text-sm">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.TEXT }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ border: `1.5px solid ${C.BORDER}`, color: C.TEXT }}
                onFocus={(e) => (e.currentTarget.style.borderColor = C.LAPIS)}
                onBlur={(e) => (e.currentTarget.style.borderColor = C.BORDER)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: C.TEXT }}>
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ border: `1.5px solid ${C.BORDER}`, color: C.TEXT }}
                onFocus={(e) => (e.currentTarget.style.borderColor = C.LAPIS)}
                onBlur={(e) => (e.currentTarget.style.borderColor = C.BORDER)}
              >
                {availableRoles.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <RoleDescription role={role} />
            </div>

            {error && (
              <div
                className="text-sm px-4 py-3 rounded-xl"
                style={{ backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 btn-secondary py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={!email || mutation.isPending}
                className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2"
              >
                {mutation.isPending
                  ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <><RefreshCw className="w-4 h-4" /> Send invite</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RoleDescription({ role }: { role: UserRole }) {
  const descriptions: Record<UserRole, string> = {
    super_admin:    'Full access — user management, all data, settings.',
    hr_admin:       'Manage all jobs and candidates. Cannot manage users.',
    recruiter:      'Create JDs, screen resumes, guides, and emails for own jobs.',
    hiring_manager: 'View JDs and screened candidates. Can add comments.',
    interviewer:    'View only interview guides explicitly shared with them.',
  }
  return (
    <p className="text-xs mt-1.5" style={{ color: C.TEXT_MUTED }}>
      {descriptions[role]}
    </p>
  )
}
