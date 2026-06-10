import { C } from '../tokens'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Copy, Mail, Send, Pencil, Check, X, Calendar } from 'lucide-react'
import toast from 'react-hot-toast'
import { jdApi, resumeApi, communicationApi } from '../services/api'
import type { CandidateResult, DraftedEmail } from '../types'
import JobSelect from '../components/JobSelect'
import InterviewScheduleCard from '../components/InterviewScheduleCard'

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreStyle(pct: number): React.CSSProperties {
  if (pct >= 80) return { color: C.SUCCESS, backgroundColor: C.SUCCESS_BG, border: `1px solid ${C.SUCCESS_BORDER}` }
  if (pct >= 65) return { color: C.WARNING, backgroundColor: C.WARNING_BG, border: `1px solid ${C.WARNING_BORDER}` }
  return              { color: C.RED, backgroundColor: C.ACCENT_BG, border: `1px solid ${C.ACCENT_BORDER}` }
}

function typeBadge(type: 'invitation' | 'rejection') {
  return type === 'invitation' ? 'badge-green' : 'badge-red'
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CommunicationPage() {
  const queryClient    = useQueryClient()
  const [searchParams] = useSearchParams()

  const [selectedJobId,    setSelectedJobId]    = useState<string | null>(null)
  const [loadedEmails,     setLoadedEmails]     = useState<DraftedEmail[]>([])
  const [expandedEmailId,  setExpandedEmailId]  = useState<string | null>(null)
  const [draftingIds,      setDraftingIds]      = useState<Set<string>>(new Set())
  const [draftAllProgress, setDraftAllProgress] = useState<{ current: number; total: number } | null>(null)
  const [sendingIds,   setSendingIds]   = useState<Set<string>>(new Set())
  const [editingIds,      setEditingIds]      = useState<Set<string>>(new Set())
  const [editDrafts,      setEditDrafts]      = useState<Map<string, { subject: string; body: string }>>(new Map())
  const [schedulingOpenId, setSchedulingOpenId] = useState<string | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: jdList = [] } = useQuery({
    queryKey: ['jd-list'],
    queryFn:  jdApi.list,
  })

  // Pre-select job from URL param (?jobId=)
  useEffect(() => {
    if (selectedJobId || jdList.length === 0) return
    const param = searchParams.get('jobId')
    if (param && jdList.some((j) => j.id === param)) {
      setSelectedJobId(param)
    }
  }, [jdList]) // eslint-disable-line react-hooks/exhaustive-deps

  const { data: candidates = [], isFetching: candidatesFetching } = useQuery<CandidateResult[]>({
    queryKey: ['resume-results', selectedJobId],
    queryFn:  () => resumeApi.results(selectedJobId!),
    enabled:  !!selectedJobId,
  })

  const { data: existingEmails = [] } = useQuery<DraftedEmail[]>({
    queryKey: ['drafted-emails', selectedJobId],
    queryFn:  () => communicationApi.getDraftedEmails(selectedJobId!),
    enabled:  !!selectedJobId,
  })

  const shortlisted    = candidates.filter((c) => c.matchPercentage >= 65)
  const notShortlisted = candidates.filter((c) => c.matchPercentage < 65)
  const draftedIds     = new Set(existingEmails.map((e) => e.candidateId))

  const isAnyDrafting  = draftingIds.size > 0 || draftAllProgress !== null

  // ── Actions ───────────────────────────────────────────────────────────────

  const addEmail = (email: DraftedEmail) => {
    setLoadedEmails((prev) =>
      prev.some((e) => e.emailId === email.emailId) ? prev : [email, ...prev]
    )
    setExpandedEmailId(email.emailId)
    queryClient.invalidateQueries({ queryKey: ['drafted-emails', selectedJobId] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  const draftOne = async (c: CandidateResult): Promise<boolean> => {
    if (!selectedJobId) return false
    const displayName = c.fileName.replace(/\.[^/.]+$/, '')
    setDraftingIds((prev) => new Set(prev).add(c.candidateId))
    try {
      const email = await communicationApi.draftEmail(selectedJobId, c.candidateId)
      addEmail(email)
      return true
    } catch (err) {
      toast.error(`Failed to draft email for ${displayName} — please try again`)
      return false
    } finally {
      setDraftingIds((prev) => { const s = new Set(prev); s.delete(c.candidateId); return s })
    }
  }

  const draftAll = async () => {
    const toProcess = [...shortlisted, ...notShortlisted].filter(
      (c) => !draftedIds.has(c.candidateId) && !draftingIds.has(c.candidateId)
    )
    if (!toProcess.length) return
    setDraftAllProgress({ current: 0, total: toProcess.length })
    for (let i = 0; i < toProcess.length; i++) {
      setDraftAllProgress({ current: i + 1, total: toProcess.length })
      await draftOne(toProcess[i])
      if (i < toProcess.length - 1) await new Promise<void>((r) => setTimeout(r, 1000))
    }
    setDraftAllProgress(null)
    toast.success('All emails drafted')
  }

  const viewExisting = (candidateId: string) => {
    // Prefer the sent email — prevents loading an unsent re-draft when a sent one exists for this candidate
    const found = existingEmails.find((e) => e.candidateId === candidateId && !!e.sentAt)
               ?? existingEmails.find((e) => e.candidateId === candidateId)
    if (!found) return
    // Always sync from existingEmails so sentAt is up-to-date (stale loadedEmails may have sentAt: null)
    setLoadedEmails((prev) =>
      prev.some((e) => e.emailId === found.emailId)
        ? prev.map((e) => e.emailId === found.emailId ? { ...e, sentAt: found.sentAt, scheduleStatus: found.scheduleStatus } : e)
        : [found, ...prev]
    )
    setExpandedEmailId(found.emailId)
  }

  const copySubject   = (email: DraftedEmail) => {
    navigator.clipboard.writeText(email.subject)
    toast.success('Subject copied to clipboard')
  }

  const copyFullEmail = (email: DraftedEmail) => {
    navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`)
    toast.success('Copied to clipboard')
  }

  const sendEmail = async (email: DraftedEmail) => {
    if (sendingIds.has(email.emailId) || email.sentAt) return
    setSendingIds((prev) => new Set(prev).add(email.emailId))
    const edits = editDrafts.get(email.emailId)
    try {
      const result = await communicationApi.sendEmail(email.emailId, edits)
      setLoadedEmails((prev) =>
        prev.map((e) => e.emailId === email.emailId ? { ...e, sentAt: result.sentAt } : e)
      )
      toast.success(`Email sent to ${email.candidateName}`)
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      toast.error(data?.message ?? data?.error ?? 'Something went wrong')
    } finally {
      setSendingIds((prev) => { const s = new Set(prev); s.delete(email.emailId); return s })
    }
  }

  const startEdit = (email: DraftedEmail) => {
    const current = editDrafts.get(email.emailId)
    if (!current) {
      setEditDrafts((prev) => new Map(prev).set(email.emailId, { subject: email.subject, body: email.body }))
    }
    setEditingIds((prev) => new Set(prev).add(email.emailId))
  }

  const cancelEdit = (emailId: string) => {
    setEditingIds((prev) => { const s = new Set(prev); s.delete(emailId); return s })
  }

  const saveEdit = (emailId: string) => {
    setEditingIds((prev) => { const s = new Set(prev); s.delete(emailId); return s })
    toast.success('Edits saved — will be used when you send')
  }

  const updateEditField = (emailId: string, field: 'subject' | 'body', value: string) => {
    setEditDrafts((prev) => {
      const next = new Map(prev)
      const cur  = next.get(emailId) ?? { subject: '', body: '' }
      next.set(emailId, { ...cur, [field]: value })
      return next
    })
  }

  // ── Candidate row ─────────────────────────────────────────────────────────

  const CandidateRow = ({ c }: { c: CandidateResult }) => {
    const displayName  = c.fileName.replace(/\.[^/.]+$/, '')
    const hasDraft     = draftedIds.has(c.candidateId) || loadedEmails.some((e) => e.candidateId === c.candidateId)
    const isSent            = existingEmails.some((e) => e.candidateId === c.candidateId && !!e.sentAt)
                           || loadedEmails.some((e) => e.candidateId === c.candidateId && !!e.sentAt)
    const isInvitation      = c.matchPercentage >= 65
    const isDrafting        = draftingIds.has(c.candidateId)
    const emailBadge        = isInvitation ? 'badge-green' : 'badge-red'
    const emailLabel        = isInvitation ? 'Invitation' : 'Rejection'
    const canDraft          = !isSent

    // Schedule status badge — only for sent invitations
    const schedEmail      = existingEmails.find(e => e.candidateId === c.candidateId && !!e.sentAt)
                         ?? existingEmails.find(e => e.candidateId === c.candidateId)
    const schedStatus     = isInvitation && isSent ? schedEmail?.scheduleStatus : null
    const schedBadge: { label: string; color: string; bg: string; border: string } | null =
      schedStatus === 'confirmed'
        ? { label: 'Interview Scheduled',      color: '#15803d', bg: '#f0fdf4', border: '#86efac' }
        : schedStatus === 'needs_manual_followup' || schedStatus === 'expired'
        ? { label: 'Manual Follow-up',         color: '#b91c1c', bg: '#fff1f2', border: '#fca5a5' }
        : schedStatus === 'pending_reminder_1'
        ? { label: 'Awaiting · Reminder Sent', color: '#92400e', bg: '#fffbeb', border: '#fcd34d' }
        : schedStatus === 'pending'
        ? { label: 'Awaiting Response',        color: '#050766', bg: '#eef0fb', border: '#c7d2fe' }
        : null

    return (
      <div
        className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-xl last:border-0 transition-colors duration-150"
        style={{ borderBottom: `1px solid ${C.DIVIDER}` }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = C.PRIMARY_LIGHT }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: C.TEXT }}>{displayName}</p>
          <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>{c.recommendation}</p>
        </div>
        <span
          className="text-xs font-bold px-2.5 py-0.5 rounded-lg shrink-0 tabular-nums"
          style={scoreStyle(c.matchPercentage)}
        >
          {c.matchPercentage}%
        </span>
        <span className={`${emailBadge} shrink-0`}>{emailLabel}</span>
        {schedBadge && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0"
            style={{ color: schedBadge.color, backgroundColor: schedBadge.bg, border: `1px solid ${schedBadge.border}` }}>
            {schedBadge.label}
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {hasDraft && (
            <button
              className="btn-secondary text-xs py-1.5 flex items-center gap-1.5"
              style={isSent ? { color: C.SUCCESS, borderColor: C.SUCCESS_BORDER } : undefined}
              onClick={() => viewExisting(c.candidateId)}
            >
              {isSent ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: C.SUCCESS }} />
                  Email Sent
                </>
              ) : 'View Email'}
            </button>
          )}
          {canDraft && (
            <button
              className="btn-primary text-xs py-1.5"
              disabled={isDrafting || !!draftAllProgress}
              onClick={() => draftOne(c)}
            >
              {isDrafting ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                  Drafting…
                </span>
              ) : hasDraft ? 'Re-draft' : 'Draft Email'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in-up">

      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.TEXT }}>Communications</h1>
        <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>
          Draft personalised candidate emails based on screening results
        </p>
      </div>

      {/* ── Step 1 — JD selector ─────────────────────────────────────── */}
      <div className="card">
        <h2 className="font-bold mb-3" style={{ color: C.TEXT }}>
          <span className="mr-1.5" style={{ color: C.LAPIS }}>01</span> Select Job Description
        </h2>
        {jdList.length === 0 ? (
          <p className="text-sm py-1" style={{ color: C.TEXT_MUTED }}>
            No job descriptions yet.{' '}
            <a href="/jd-generator" style={{ color: C.LAPIS }} className="hover:underline">
              Go to JD Generator
            </a>{' '}
            to create one first.
          </p>
        ) : (
          <JobSelect
            jobs={jdList}
            value={selectedJobId}
            onChange={(id) => {
              setSelectedJobId(id)
              setLoadedEmails([])
              setExpandedEmailId(null)
            }}
          />
        )}
      </div>

      {/* ── Step 2 — Candidates ──────────────────────────────────────── */}
      {selectedJobId && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold" style={{ color: C.TEXT }}>
                <span className="mr-1.5" style={{ color: C.LAPIS }}>02</span> Candidates
              </h2>
              {!candidatesFetching && candidates.length > 0 && (
                <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
                  {candidates.length} candidate{candidates.length > 1 ? 's' : ''} screened for this role
                </p>
              )}
            </div>
            {!candidatesFetching && candidates.length > 0 && (
              <button
                className="btn-primary text-xs py-1.5"
                disabled={
                  isAnyDrafting ||
                  [...shortlisted, ...notShortlisted].every(
                    (c) => draftedIds.has(c.candidateId) || loadedEmails.some((e) => e.candidateId === c.candidateId)
                  )
                }
                onClick={draftAll}
              >
                {draftAllProgress
                  ? `Drafting ${draftAllProgress.current} of ${draftAllProgress.total}…`
                  : 'Draft All Emails'}
              </button>
            )}
          </div>

          {/* Loading skeleton */}
          {candidatesFetching ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 px-3 -mx-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 rounded w-2/5 shimmer" />
                    <div className="h-3   rounded w-1/4 shimmer" />
                  </div>
                  <div className="h-5 rounded w-10 shrink-0 shimmer" />
                  <div className="h-5 rounded w-16 shrink-0 shimmer" />
                  <div className="h-7 rounded w-24 shrink-0 shimmer" />
                </div>
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: C.TEXT_MUTED }}>
              No resumes screened for this role yet.{' '}
              <a href="/resume-screener" style={{ color: C.LAPIS }} className="hover:underline">
                Go to Resume Screener
              </a>{' '}
              to screen candidates first.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Shortlisted group */}
              {shortlisted.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="section-label">Shortlisted</span>
                    <span className="badge-green">{shortlisted.length}</span>
                  </div>
                  {shortlisted.map((c) => <CandidateRow key={c.candidateId} c={c} />)}
                </div>
              )}
              {/* Not shortlisted group */}
              {notShortlisted.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="section-label">Not Shortlisted</span>
                    <span className="badge-gray">{notShortlisted.length}</span>
                  </div>
                  {notShortlisted.map((c) => <CandidateRow key={c.candidateId} c={c} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Section 3 — Drafted emails ───────────────────────────────── */}
      {loadedEmails.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="font-bold" style={{ color: C.TEXT }}>Drafted Emails</h2>
            <span className="badge-primary">{loadedEmails.length}</span>
          </div>

          {loadedEmails.map((email) => {
            const isExpanded = expandedEmailId === email.emailId
            const showScheduling = email.emailType === 'invitation' && !!selectedJobId

            return (
              <div key={email.emailId} className="space-y-3 animate-fade-in-up">
              <div className="card p-0 overflow-hidden">
                {/* Header */}
                <button
                  className="w-full flex items-center justify-between p-5 text-left transition-colors duration-150"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = C.PRIMARY_LIGHT }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                  onClick={() => setExpandedEmailId(isExpanded ? null : email.emailId)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Mail className="w-4 h-4 shrink-0" style={{ color: C.TEXT_MUTED }} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold" style={{ color: C.TEXT }}>{email.candidateName}</p>
                        <span className={`${typeBadge(email.emailType)} shrink-0`}>
                          {email.emailType === 'invitation' ? 'Invitation' : 'Rejection'}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
                        {new Date(email.generatedAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp   className="w-4 h-4 shrink-0 ml-3" style={{ color: C.TEXT_SUBTLE }} />
                    : <ChevronDown className="w-4 h-4 shrink-0 ml-3" style={{ color: C.TEXT_SUBTLE }} />}
                </button>

                {isExpanded && (() => {
                  const isEditing = editingIds.has(email.emailId)
                  const edits     = editDrafts.get(email.emailId)
                  const subject   = edits?.subject ?? email.subject
                  const body      = edits?.body    ?? email.body

                  return (
                  <div className="p-5 space-y-4 animate-fade-in" style={{ borderTop: `1px solid ${C.BORDER}` }}>

                    {/* Subject */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="section-label">Subject</p>
                        {!isEditing && (
                          <button className="flex items-center gap-1 text-xs transition-colors hover:underline"
                            style={{ color: C.TEXT_MUTED }} onClick={() => copySubject(email)}>
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                        )}
                      </div>
                      {isEditing ? (
                        <input
                          className="w-full text-sm font-medium px-3 py-2 rounded-xl outline-none"
                          style={{ backgroundColor: C.BG, color: C.TEXT, border: `1.5px solid ${C.LAPIS}` }}
                          value={subject}
                          onChange={(e) => updateEditField(email.emailId, 'subject', e.target.value)}
                        />
                      ) : (
                        <p className="text-sm font-medium px-3 py-2 rounded-xl" style={{ backgroundColor: C.BG, color: C.TEXT }}>
                          {subject}
                        </p>
                      )}
                    </div>

                    {/* Body */}
                    <div>
                      <p className="section-label mb-1.5">Body</p>
                      {isEditing ? (
                        <textarea
                          rows={10}
                          className="w-full text-sm px-3 py-3 rounded-xl font-sans leading-relaxed resize-y outline-none"
                          style={{ backgroundColor: C.BG, color: C.TEXT, border: `1.5px solid ${C.LAPIS}` }}
                          value={body}
                          onChange={(e) => updateEditField(email.emailId, 'body', e.target.value)}
                        />
                      ) : (
                        <pre className="text-sm px-3 py-3 rounded-xl whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto"
                          style={{ backgroundColor: C.BG, color: C.TEXT }}>
                          {body}
                        </pre>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-1 flex-wrap" style={{ borderTop: `1px solid ${C.BORDER}` }}>
                      {isEditing ? (
                        <>
                          <button className="btn-primary text-xs py-1.5" onClick={() => saveEdit(email.emailId)}>
                            <Check className="w-3.5 h-3.5" /> Save Edits
                          </button>
                          <button className="btn-secondary text-xs py-1.5" onClick={() => cancelEdit(email.emailId)}>
                            <X className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {!email.sentAt && (
                            <button className="btn-secondary text-xs py-1.5" onClick={() => startEdit(email)}>
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                          )}
                          <button className="btn-secondary text-xs py-1.5" onClick={() => copyFullEmail(email)}>
                            <Copy className="w-3.5 h-3.5" /> Copy
                          </button>
                          <button
                            className="btn-primary text-xs py-1.5"
                            disabled={!!email.sentAt || sendingIds.has(email.emailId)}
                            onClick={() => sendEmail(email)}
                          >
                            {sendingIds.has(email.emailId) ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                                Sending…
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <Send className="w-3.5 h-3.5" />
                                {email.sentAt ? 'Email Sent' : 'Send Email'}
                              </span>
                            )}
                          </button>

                          {showScheduling && (
                            <button
                              className="btn-secondary text-xs py-1.5"
                              disabled={!!email.sentAt && email.scheduleStatus !== 'confirmed'}
                              style={
                                email.sentAt && email.scheduleStatus !== 'confirmed'
                                  ? { opacity: 0.45, cursor: 'not-allowed' }
                                  : email.scheduleStatus === 'confirmed'
                                  ? { color: C.SUCCESS, borderColor: C.SUCCESS_BORDER }
                                  : schedulingOpenId === email.emailId
                                  ? { color: C.LAPIS, borderColor: C.LAPIS }
                                  : undefined
                              }
                              onClick={() => {
                                if (!email.sentAt || email.scheduleStatus === 'confirmed') {
                                  setSchedulingOpenId(
                                    schedulingOpenId === email.emailId ? null : email.emailId
                                  )
                                }
                              }}
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              {email.scheduleStatus === 'confirmed' ? 'View Scheduled Slot' : 'Interview Scheduling'}
                            </button>
                          )}
                        </>
                      )}
                    </div>

                  </div>
                  )
                })()}

                {/* Interview scheduling — toggled via button in actions row */}
                {isExpanded && showScheduling && schedulingOpenId === email.emailId && (
                  <InterviewScheduleCard
                    email={email}
                    jobId={selectedJobId!}
                    jobTitle={jdList.find(j => j.id === selectedJobId)?.title}
                    inline
                  />
                )}
              </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
