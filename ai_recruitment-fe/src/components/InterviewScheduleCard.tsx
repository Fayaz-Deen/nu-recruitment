import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Calendar, Plus, Pencil, Trash2, Copy, CheckCircle,
  Clock, Link, Loader2, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { scheduleApi } from '../services/api'
import type { DraftedEmail, InterviewSlot, InterviewSchedule } from '../types'
import { C } from '../tokens'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatSlot(slot: InterviewSlot): string {
  const start = new Date(slot.startTime)
  const end   = new Date(slot.endTime)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Invalid slot date'
  const date  = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const from  = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const to    = end.toLocaleTimeString('en-GB',   { hour: '2-digit', minute: '2-digit' })
  return `${date}  ·  ${from} – ${to}`
}

function statusBadge(status: InterviewSchedule['status']): { label: string; color: string; bg: string; border: string } {
  switch (status) {
    case 'confirmed':            return { label: 'Interview Scheduled',               color: C.SUCCESS,    bg: C.SUCCESS_BG,    border: C.SUCCESS_BORDER }
    case 'pending_reminder_1':   return { label: 'Awaiting Response · Reminder Sent', color: C.WARNING,    bg: C.WARNING_BG,    border: C.WARNING_BORDER }
    case 'needs_manual_followup':return { label: 'Manual Follow-up',                 color: C.RED,        bg: C.ACCENT_BG,     border: C.ACCENT_BORDER  }
    case 'expired':              return { label: 'Awaiting Response',                 color: C.LAPIS,      bg: C.PRIMARY_LIGHT, border: C.PRIMARY_RING   }
    default:                     return { label: 'Awaiting Response',                color: C.LAPIS,      bg: C.PRIMARY_LIGHT, border: C.PRIMARY_RING   }
  }
}

// ── Slot row ───────────────────────────────────────────────────────────────

function SlotRow({
  slot, onEdit, onDelete, isConfirmed,
}: {
  slot: InterviewSlot
  onEdit: (slot: InterviewSlot) => void
  onDelete: (slotId: string) => void
  isConfirmed: boolean
}) {
  const isBooked = slot.isBooked
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-xl"
      style={{ backgroundColor: isBooked ? C.SUCCESS_BG : C.BG, border: `1px solid ${isBooked ? C.SUCCESS_BORDER : C.BORDER}` }}>
      <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: isBooked ? C.SUCCESS : C.TEXT_MUTED }} />
      <p className="flex-1 text-xs font-medium" style={{ color: isBooked ? C.SUCCESS : C.TEXT }}>
        {formatSlot(slot)}
        {isBooked && <span className="ml-2 text-[10px] font-bold">(Selected)</span>}
      </p>
      {!isBooked && !isConfirmed && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(slot)}
            className="p-1 rounded-lg transition-colors hover:bg-white"
            title="Edit slot" aria-label="Edit slot">
            <Pencil className="w-3 h-3" style={{ color: C.TEXT_MUTED }} />
          </button>
          <button onClick={() => onDelete(slot.id)}
            className="p-1 rounded-lg transition-colors hover:bg-white"
            title="Remove slot" aria-label="Remove slot">
            <Trash2 className="w-3 h-3" style={{ color: C.RED }} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Slot form (add / edit) ─────────────────────────────────────────────────

function SlotForm({
  initial, onSave, onCancel, loading,
}: {
  initial?: { startTime: string; endTime: string }
  onSave: (startTime: string, endTime: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const pad = (d: Date) => {
    const yyyy = d.getFullYear()
    const MM   = String(d.getMonth() + 1).padStart(2, '0')
    const dd   = String(d.getDate()).padStart(2, '0')
    const hh   = String(d.getHours()).padStart(2, '0')
    const mm   = String(d.getMinutes()).padStart(2, '0')
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`
  }
  const now  = new Date()
  const hour = new Date(now); hour.setMinutes(0, 0, 0); hour.setHours(hour.getHours() + 1)
  const hour2 = new Date(hour); hour2.setHours(hour2.getHours() + 1)

  const [start, setStart] = useState(initial?.startTime ? pad(new Date(initial.startTime)) : pad(hour))
  const [end,   setEnd]   = useState(initial?.endTime   ? pad(new Date(initial.endTime))   : pad(hour2))

  const handleSave = () => {
    if (!start || !end) { toast.error('Both times are required'); return }
    if (new Date(end) <= new Date(start)) { toast.error('End time must be after start time'); return }
    onSave(new Date(start).toISOString(), new Date(end).toISOString())
  }

  return (
    <div className="rounded-xl p-3 space-y-2.5"
      style={{ backgroundColor: C.PRIMARY_LIGHT, border: `1px solid ${C.PRIMARY_RING}` }}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: C.TEXT_MUTED }}>Start</p>
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
            className="w-full text-xs rounded-lg px-2.5 py-1.5 outline-none"
            style={{ border: `1px solid ${C.BORDER}`, color: C.TEXT, backgroundColor: '#fff' }} />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: C.TEXT_MUTED }}>End</p>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}
            className="w-full text-xs rounded-lg px-2.5 py-1.5 outline-none"
            style={{ border: `1px solid ${C.BORDER}`, color: C.TEXT, backgroundColor: '#fff' }} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={loading}
          className="btn-primary text-xs py-1.5 flex items-center gap-1.5">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {initial ? 'Save Changes' : 'Add Slot'}
        </button>
        <button onClick={onCancel} className="btn-secondary text-xs py-1.5">Cancel</button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function InterviewScheduleCard({ email, jobId, jobTitle, inline = false }: { email: DraftedEmail; jobId: string; jobTitle?: string; inline?: boolean }) {
  const queryClient = useQueryClient()
  const [editingSlot, setEditingSlot] = useState<InterviewSlot | null>(null)
  const [addingSlot,  setAddingSlot]  = useState(false)
  const [copied,      setCopied]      = useState(false)

  const scheduleKey = ['interview-schedule', email.emailId]

  const { data: schedule, isLoading, isError } = useQuery({
    queryKey: scheduleKey,
    queryFn:  async () => {
      const existing = await scheduleApi.getByEmail(email.emailId)
      if (existing) return existing
      return scheduleApi.init({
        emailId:        email.emailId,
        candidateId:    email.candidateId,
        jobId,
        jobTitle,
        candidateName:  email.candidateName,
        candidateEmail: email.candidateEmail ?? email.extractedEmail ?? undefined,
      })
    },
    staleTime: 30_000,
  })

  const addSlot = useMutation({
    mutationFn: ({ start, end }: { start: string; end: string }) =>
      scheduleApi.addSlot(schedule!.id, start, end),
    onSuccess: (newSlot) => {
      queryClient.setQueryData<InterviewSchedule>(scheduleKey, old =>
        old ? { ...old, slots: [...old.slots, newSlot] } : old!
      )
      setAddingSlot(false)
      toast.success('Slot added')
    },
    onError: () => toast.error('Failed to add slot'),
  })

  const editSlot = useMutation({
    mutationFn: ({ slotId, start, end }: { slotId: string; start: string; end: string }) =>
      scheduleApi.editSlot(slotId, start, end),
    onSuccess: (updated) => {
      queryClient.setQueryData<InterviewSchedule>(scheduleKey, old =>
        old ? { ...old, slots: old.slots.map(s => s.id === updated.id ? updated : s) } : old!
      )
      setEditingSlot(null)
      toast.success('Slot updated')
    },
    onError: () => toast.error('Failed to update slot'),
  })

  const deleteSlot = useMutation({
    mutationFn: (slotId: string) => scheduleApi.deleteSlot(slotId),
    onSuccess: (_, slotId) => {
      queryClient.setQueryData<InterviewSchedule>(scheduleKey, old =>
        old ? { ...old, slots: old.slots.filter(s => s.id !== slotId) } : old!
      )
      toast.success('Slot removed')
    },
    onError: () => toast.error('Failed to remove slot'),
  })

  const copyLink = () => {
    if (!schedule?.link) return
    navigator.clipboard.writeText(schedule.link)
    setCopied(true)
    toast.success('Scheduling link copied')
    setTimeout(() => setCopied(false), 2000)
  }

  const isConfirmed = schedule?.status === 'confirmed'

  const outerClass   = inline ? 'pt-4 pb-2 px-4 space-y-4' : 'card space-y-4 animate-fade-in-up'
  const outerStyle   = inline ? { borderTop: `1px solid ${C.BORDER}` } : undefined
  const stateWrapper = inline ? 'flex items-center gap-2 py-2 px-4' : 'card flex items-center gap-2 py-3'

  if (isLoading) {
    return (
      <div className={stateWrapper}>
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.LAPIS }} />
        <p className="text-sm" style={{ color: C.TEXT_MUTED }}>Setting up scheduling…</p>
      </div>
    )
  }

  if (isError || !schedule) {
    return (
      <div className={stateWrapper}>
        <AlertCircle className="w-4 h-4" style={{ color: C.RED }} />
        <p className="text-sm" style={{ color: C.RED }}>Failed to load scheduling. Refresh to retry.</p>
      </div>
    )
  }

  const badge = statusBadge(schedule.status)

  return (
    <div className={outerClass} style={outerStyle}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ backgroundColor: C.PRIMARY_LIGHT }}>
            <Calendar className="w-3.5 h-3.5" style={{ color: C.LAPIS }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: C.TEXT }}>Interview Scheduling</p>
            <p className="text-xs" style={{ color: C.TEXT_MUTED }}>{email.candidateName}</p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
          {badge.label}
        </span>
      </div>

      {/* Confirmed banner */}
      {isConfirmed && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ backgroundColor: C.SUCCESS_BG, border: `1px solid ${C.SUCCESS_BORDER}` }}>
          <CheckCircle className="w-4 h-4 shrink-0" style={{ color: C.SUCCESS }} />
          <p className="text-xs font-medium" style={{ color: C.SUCCESS }}>
            Interview scheduled. Confirmation email sent to the candidate.
          </p>
        </div>
      )}

      {/* Scheduling link */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: C.TEXT_MUTED }}>
          Candidate Scheduling Link
        </p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ backgroundColor: C.BG, border: `1px solid ${C.BORDER}` }}>
          <Link className="w-3.5 h-3.5 shrink-0" style={{ color: C.TEXT_SUBTLE }} />
          <p className="flex-1 text-xs truncate font-mono" style={{ color: C.TEXT_MUTED }}>
            {schedule.link}
          </p>
          <button onClick={copyLink}
            className="flex items-center gap-1 text-xs shrink-0 transition-colors"
            style={{ color: copied ? C.SUCCESS : C.LAPIS }}>
            {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-[11px] mt-1" style={{ color: C.TEXT_SUBTLE }}>
          Share this link with the candidate to let them pick a slot.
        </p>
      </div>

      {/* Slots */}
      {!isConfirmed && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: C.TEXT_MUTED }}>
              Available Slots
              {schedule.slots.length > 0 && (
                <span className="ml-1.5 normal-case text-[10px] font-normal">
                  ({schedule.slots.filter(s => !s.isBooked).length} open)
                </span>
              )}
            </p>
            {!addingSlot && (
              <button onClick={() => { setAddingSlot(true); setEditingSlot(null) }}
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: C.LAPIS }}>
                <Plus className="w-3.5 h-3.5" />
                Add Slot
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            {schedule.slots.length === 0 && !addingSlot && (
              <p className="text-xs py-2 text-center" style={{ color: C.TEXT_SUBTLE }}>
                No slots added yet. Add slots so the candidate can pick a time.
              </p>
            )}
            {schedule.slots.map(slot =>
              editingSlot?.id === slot.id ? (
                <SlotForm
                  key={slot.id}
                  initial={{ startTime: slot.startTime, endTime: slot.endTime }}
                  onSave={(start, end) => editSlot.mutate({ slotId: slot.id, start, end })}
                  onCancel={() => setEditingSlot(null)}
                  loading={editSlot.isPending}
                />
              ) : (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  onEdit={s => { setEditingSlot(s); setAddingSlot(false) }}
                  onDelete={slotId => deleteSlot.mutate(slotId)}
                  isConfirmed={isConfirmed}
                />
              )
            )}
            {addingSlot && (
              <SlotForm
                onSave={(start, end) => addSlot.mutate({ start, end })}
                onCancel={() => setAddingSlot(false)}
                loading={addSlot.isPending}
              />
            )}
          </div>
        </div>
      )}

      {/* Confirmed selected slot */}
      {isConfirmed && schedule.slots.filter(s => s.isBooked).map(slot => (
        <div key={slot.id}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: C.TEXT_MUTED }}>
            Scheduled Time
          </p>
          <SlotRow slot={slot} onEdit={() => {}} onDelete={() => {}} isConfirmed />
        </div>
      ))}
    </div>
  )
}
