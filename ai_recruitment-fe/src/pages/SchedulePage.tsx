import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Calendar, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { scheduleApi } from '../services/api'
import type { InterviewSlot } from '../types'
import { C } from '../tokens'

function formatSlot(slot: InterviewSlot): { date: string; time: string } | null {
  const start = new Date(slot.startTime)
  const end   = new Date(slot.endTime)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
  const date  = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const from  = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const to    = end.toLocaleTimeString('en-GB',   { hour: '2-digit', minute: '2-digit' })
  return { date, time: `${from} – ${to}` }
}

export default function SchedulePage() {
  const { token } = useParams<{ token: string }>()
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [noneSelected, setNoneSelected] = useState(false)
  const [confirmedSlot, setConfirmedSlot] = useState<InterviewSlot | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['schedule-public', token],
    queryFn:  () => scheduleApi.getPublic(token!),
    enabled:  !!token,
    retry: false,
  })

  const confirm = useMutation({
    mutationFn: ({ slotId }: { slotId: string }) =>
      scheduleApi.selectSlot(token!, slotId),
    onSuccess: (result, vars) => {
      if ((result as { noneSelected?: boolean }).noneSelected) {
        setNoneSelected(true)
        return
      }
      const slot = data?.slots.find(s => s.id === vars.slotId) ?? null
      setConfirmedSlot(slot)
      setConfirmed(true)
    },
  })

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.BG }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: C.LAPIS }} />
      </div>
    )
  }

  // ── Error / not found ────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.BG }}>
        <div className="text-center max-w-sm px-6">
          <AlertCircle className="w-10 h-10 mx-auto mb-4" style={{ color: C.RED }} />
          <p className="text-lg font-semibold mb-1" style={{ color: C.TEXT }}>Link not found</p>
          <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
            This scheduling link is invalid or has expired. Please contact the recruiter.
          </p>
        </div>
      </div>
    )
  }

  // ── Link expired ─────────────────────────────────────────────────────────
  if (data.isUnavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.BG }}>
        <div className="text-center max-w-sm px-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ backgroundColor: C.BG, border: `1px solid ${C.BORDER}` }}>
            <Clock className="w-6 h-6" style={{ color: C.TEXT_SUBTLE }} />
          </div>
          <p className="text-xl font-bold mb-2" style={{ color: C.TEXT }}>These slots are no longer available</p>
          <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
            This scheduling link has expired. Our team will be in touch to arrange a suitable time.
          </p>
          <p className="text-xs mt-4" style={{ color: C.TEXT_SUBTLE }}>Powered by NULogic ATS</p>
        </div>
      </div>
    )
  }

  // ── "None of these work" state ───────────────────────────────────────────
  if (noneSelected) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.BG }}>
        <div className="text-center max-w-sm px-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ backgroundColor: C.WARNING_BG }}>
            <Calendar className="w-6 h-6" style={{ color: C.WARNING }} />
          </div>
          <p className="text-xl font-bold mb-1" style={{ color: C.TEXT }}>We'll be in touch</p>
          <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>
            Thanks for letting us know. Our team has been notified and will reach out to schedule a time that works for you.
          </p>
          <p className="text-xs mt-4" style={{ color: C.TEXT_SUBTLE }}>Powered by NULogic ATS</p>
        </div>
      </div>
    )
  }

  // ── Already confirmed (from server) ─────────────────────────────────────
  if (data.alreadyConfirmed || confirmed) {
    const slot = confirmedSlot
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.BG }}>
        <div className="text-center max-w-sm px-6">
          <CheckCircle className="w-12 h-12 mx-auto mb-4" style={{ color: C.SUCCESS }} />
          <p className="text-xl font-bold mb-1" style={{ color: C.TEXT }}>Interview Confirmed!</p>
          <p className="text-sm mb-4" style={{ color: C.TEXT_MUTED }}>
            Your interview for <strong>{data.jobTitle}</strong> at NULogic has been scheduled.
          </p>
          {slot && (() => {
            const fmt = formatSlot(slot)
            if (!fmt) return null
            return (
              <div className="rounded-xl px-4 py-3 text-sm text-left"
                style={{ backgroundColor: C.SUCCESS_BG, border: `1px solid ${C.SUCCESS_BORDER}` }}>
                <p className="font-semibold mb-0.5" style={{ color: C.SUCCESS }}>{fmt.date}</p>
                <p style={{ color: C.SUCCESS }}>{fmt.time}</p>
              </div>
            )
          })()}
          <p className="text-xs mt-4" style={{ color: C.TEXT_SUBTLE }}>
            A confirmation email has been sent to you.
          </p>
        </div>
      </div>
    )
  }

  // ── No slots available ───────────────────────────────────────────────────
  if (!data.slots.length) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.BG }}>
        <div className="text-center max-w-sm px-6">
          <Calendar className="w-10 h-10 mx-auto mb-4" style={{ color: C.TEXT_SUBTLE }} />
          <p className="text-lg font-semibold mb-1" style={{ color: C.TEXT }}>No slots available</p>
          <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
            The recruiter hasn't added interview slots yet. Please check back soon.
          </p>
        </div>
      </div>
    )
  }

  // ── Main slot selection ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen py-12 px-4" style={{ backgroundColor: C.BG }}>
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
            style={{ backgroundColor: C.PRIMARY_LIGHT }}>
            <Calendar className="w-6 h-6" style={{ color: C.LAPIS }} />
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: C.TEXT }}>
            Select an Interview Slot
          </h1>
          {data.candidateName && (
            <p className="text-sm" style={{ color: C.TEXT_MUTED }}>Hi {data.candidateName},</p>
          )}
          <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>
            You've been shortlisted for <strong style={{ color: C.TEXT }}>{data.jobTitle}</strong> at NULogic.
            Pick a time that works best for you.
          </p>
        </div>

        {/* Slot list */}
        <div className="space-y-2.5 mb-6">
          {data.slots.map((slot) => {
            const fmt = formatSlot(slot)
            if (!fmt) return null
            const { date, time } = fmt
            const isSelected = selectedSlotId === slot.id
            return (
              <button
                key={slot.id}
                onClick={() => setSelectedSlotId(slot.id)}
                className="w-full text-left rounded-xl px-4 py-3.5 transition-all duration-150"
                style={{
                  backgroundColor: isSelected ? C.PRIMARY_LIGHT : '#ffffff',
                  border: `2px solid ${isSelected ? C.LAPIS : C.BORDER}`,
                  boxShadow: isSelected ? `0 0 0 3px ${C.PRIMARY_RING}` : undefined,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{ backgroundColor: isSelected ? C.LAPIS : C.BG }}>
                    <Clock className="w-4 h-4" style={{ color: isSelected ? '#fff' : C.TEXT_MUTED }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: C.TEXT }}>{date}</p>
                    <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>{time}</p>
                  </div>
                  {isSelected && (
                    <CheckCircle className="w-4 h-4 ml-auto shrink-0" style={{ color: C.LAPIS }} />
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Confirm button */}
        <button
          disabled={!selectedSlotId || confirm.isPending}
          onClick={() => selectedSlotId && confirm.mutate({ slotId: selectedSlotId })}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-opacity"
          style={{
            backgroundColor: selectedSlotId ? C.LAPIS : C.BORDER,
            color: selectedSlotId ? '#ffffff' : C.TEXT_SUBTLE,
            cursor: selectedSlotId ? 'pointer' : 'not-allowed',
            opacity: confirm.isPending ? 0.7 : 1,
          }}
        >
          {confirm.isPending && selectedSlotId !== 'none' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Confirming…
            </span>
          ) : 'Confirm Interview Slot'}
        </button>

        {/* None of these work */}
        <div className="mt-3 text-center">
          <button
            disabled={confirm.isPending}
            onClick={() => confirm.mutate({ slotId: 'none' })}
            className="text-sm underline-offset-2 hover:underline transition-colors"
            style={{ color: C.TEXT_MUTED, opacity: confirm.isPending ? 0.5 : 1 }}
          >
            {confirm.isPending && selectedSlotId === null ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Submitting…
              </span>
            ) : 'None of these work'}
          </button>
        </div>

        {confirm.isError && (
          <p className="text-center text-xs mt-3" style={{ color: C.RED }}>
            Something went wrong. Please try again or contact the recruiter.
          </p>
        )}

        <p className="text-center text-xs mt-6" style={{ color: C.TEXT_SUBTLE }}>
          Powered by NULogic ATS
        </p>
      </div>
    </div>
  )
}
