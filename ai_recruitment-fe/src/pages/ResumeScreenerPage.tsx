import { C } from '../tokens'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { resumeApi, jdApi } from '../services/api'
import { CandidateEvaluation, JobDescription, PiiReport, DuplicateMatch, InterestStatus } from '../types'
import toast from 'react-hot-toast'
import {
  Upload, CheckCircle, ChevronDown, ChevronUp,
  Sparkles, ClipboardList, Mail, Trophy, AlertTriangle, Shield, Bell,
} from 'lucide-react'
import clsx from 'clsx'
import JobSelect from '../components/JobSelect'
import ScoreBreakdown from '../components/ScoreBreakdown'
import { getApiErrorMessage } from '../lib/errors'

// ── Helpers ────────────────────────────────────────────────────────────────

function truncateFilename(name: string): string {
  const dot  = name.lastIndexOf('.')
  const ext  = dot > 0 ? name.slice(dot) : ''
  const base = dot > 0 ? name.slice(0, dot) : name
  if (base.length <= 22) return name
  return base.slice(0, 22) + '…' + ext
}

function toDisplayName(fileName: string): string {
  const noise = /\b(resume|cv|curriculum|vitae|test|final|draft|copy|new|updated|latest|version|sample|upload|doc|file|candidate|application|apply|job|hire)\b/gi
  const clean = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_\-]/g, ' ')
    .replace(noise, '')
    .replace(/\b\d+\b/g, '')
    .replace(/[^a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return clean
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ') || 'Candidate'
}

function scoreStyle(pct: number): React.CSSProperties {
  if (pct >= 80) return { color: C.SUCCESS, backgroundColor: C.SUCCESS_BG, outlineColor: C.SUCCESS_BORDER }
  if (pct >= 60) return { color: C.WARNING, backgroundColor: C.WARNING_BG, outlineColor: C.WARNING_BORDER }
  return              { color: C.RED, backgroundColor: C.ACCENT_BG, outlineColor: C.ACCENT_BORDER }
}

function recommendationBadge(rec: string) {
  if (rec === 'Strong Match') return 'badge-green'
  if (rec === 'Good Match')   return 'badge-yellow'
  if (rec === 'Weak Match')   return 'badge-red'
  return 'badge-gray'
}

function confidenceLabel(score: number): string {
  if (score >= 70) return 'High confidence'
  if (score >= 40) return 'Med confidence'
  return 'Low confidence'
}

function confidenceStyle(score: number): React.CSSProperties {
  if (score >= 70) return { color: C.SUCCESS, backgroundColor: C.SUCCESS_BG }
  if (score >= 40) return { color: C.WARNING, backgroundColor: C.WARNING_BG }
  return { color: C.RED, backgroundColor: C.ACCENT_BG }
}

function uploadAgeBadge(dateStr: string): { label: string; style: React.CSSProperties } {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days < 1)  return { label: 'Today',             style: { color: C.TEXT_MUTED } }
  if (days < 14) return { label: `${days}d ago`,       style: { color: C.TEXT_MUTED } }
  if (days < 60) return { label: `${Math.ceil(days / 7)}wk ago`, style: { color: C.WARNING } }
  return               { label: `${Math.floor(days / 30)}mo ago`, style: { color: C.RED } }
}

function interestBadge(status: InterestStatus): { label: string; style: React.CSSProperties } | null {
  if (status === 'interested')  return { label: '✓ Interested',     style: { color: C.SUCCESS, backgroundColor: C.SUCCESS_BG } }
  if (status === 'not_looking') return { label: 'Not looking',      style: { color: C.RED,     backgroundColor: C.ACCENT_BG  } }
  if (status === 'checked')     return { label: 'Awaiting reply',   style: { color: C.WARNING, backgroundColor: C.WARNING_BG } }
  return null
}

function piiSummary(report: PiiReport): string | null {
  const parts: string[] = []
  if (report.emails.length)    parts.push(`${report.emails.length} email${report.emails.length > 1 ? 's' : ''}`)
  if (report.phones.length)    parts.push(`${report.phones.length} phone${report.phones.length > 1 ? 's' : ''}`)
  if (report.linkedins.length) parts.push('LinkedIn')
  if (report.githubs.length)   parts.push('GitHub')
  return parts.length ? parts.join(' · ') : null
}

// ── Typewriter — AI assessment text reveal ────────────────────────────────

function TypewriterText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    setDisplayed('')
    const id = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
      } else {
        clearInterval(id)
      }
    }, 10)
    return () => clearInterval(id)
  }, [text])

  return <>{displayed}</>
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ResumeScreenerPage() {
  const navigate       = useNavigate()
  const queryClient    = useQueryClient()
  const [searchParams] = useSearchParams()

  const [files,        setFiles]        = useState<File[]>([])
  const [jd,           setJD]           = useState<JobDescription | null>(null)
  const [evaluations,  setEvaluations]  = useState<CandidateEvaluation[]>([])
  const [expanded,     setExpanded]     = useState<string | null>(null)
  const [uploadedIds,  setUploadedIds]  = useState<string[]>([])
  const [fileNameMap,  setFileNameMap]  = useState<Record<string, string>>({})
  const [piiReportMap,     setPiiReportMap]     = useState<Record<string, PiiReport>>({})
  const [duplicates,       setDuplicates]       = useState<DuplicateMatch[]>([])
  const [uploadDateMap,    setUploadDateMap]    = useState<Record<string, string>>({})
  const [interestStatusMap, setInterestStatusMap] = useState<Record<string, InterestStatus>>({})

  const { data: existingJDs = [] } = useQuery({
    queryKey: ['jd-list'],
    queryFn:  jdApi.list,
  })

  useEffect(() => {
    if (jd || existingJDs.length === 0) return
    const param = searchParams.get('jobId')
    if (param) {
      const found = existingJDs.find((j) => j.id === param)
      if (found) setJD(found)
    }
  }, [existingJDs]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = useCallback((f: File[]) => setFiles((prev) => [...prev, ...f]), [])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 100,
  })

  const uploadMutation = useMutation({
    mutationFn: () => resumeApi.upload(files, jd?.id),
    onSuccess: (data) => {
      const candidates = data.candidates
      setUploadedIds(candidates.map((c) => c.id))

      const nameMap:     Record<string, string>       = {}
      const piiMap:      Record<string, PiiReport>    = {}
      const uploadMap:   Record<string, string>       = {}
      const interestMap: Record<string, InterestStatus> = {}
      candidates.forEach((c) => {
        nameMap[c.id]     = c.fileName
        if (c.piiReport)  piiMap[c.id]     = c.piiReport
        if (c.uploadedAt) uploadMap[c.id]  = c.uploadedAt
        interestMap[c.id] = 'unknown'
      })
      setFileNameMap(nameMap)
      setPiiReportMap(piiMap)
      setUploadDateMap(uploadMap)
      setInterestStatusMap(interestMap)
      setDuplicates(data.duplicates ?? [])

      toast.success(`${candidates.length} resume${candidates.length > 1 ? 's' : ''} uploaded and parsed`)
    },
    onError: () => toast.error('Upload failed'),
  })

  const screenMutation = useMutation({
    mutationFn: () => resumeApi.screen(jd!, uploadedIds),
    onSuccess: (data) => {
      setEvaluations(data.evaluations)
      queryClient.invalidateQueries({ queryKey: ['stats']   })
      queryClient.invalidateQueries({ queryKey: ['jd-list'] })
      const biasCount = data.evaluations.filter((e) => (e.biasFlags?.length ?? 0) > 0).length
      if (biasCount > 0) {
        toast(`${biasCount} bias flag${biasCount > 1 ? 's' : ''} detected - review carefully`)
      }
      toast.success(`Screened ${data.total} candidate${data.total > 1 ? 's' : ''}`)
    },
    onError: () => toast.error('Screening failed'),
  })

  const checkInterestMutation = useMutation({
    mutationFn: (candidateId: string) => resumeApi.checkInterest(candidateId),
    onSuccess: (_, candidateId) => {
      setInterestStatusMap((prev) => ({ ...prev, [candidateId]: 'checked' }))
      toast.success('Interest check email sent to candidate')
    },
    onError: (err: unknown) => {
      toast.error(getApiErrorMessage(err, 'Failed to send - candidate may have no email on file'))
    },
  })

  // ── Render ──────────────────────────────────────────────────────────────

  const biasedCount = evaluations.filter((e) => (e.biasFlags?.length ?? 0) > 0).length

  return (
    <div className="max-w-4xl animate-fade-in-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>Resume Screener</h1>
        <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>Upload resumes and screen them against a job description</p>
      </div>

      <div className="space-y-4">

        {/* ── Step 1 — Job Description ─────────────────────────────── */}
        <div className="card">
          <h2 className="font-bold mb-3" style={{ color: C.TEXT }}>
            <span className="mr-1.5" style={{ color: C.LAPIS }}>01</span> Job Description
          </h2>

          {jd ? (
            <div
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ backgroundColor: C.SUCCESS_BG, border: `1px solid ${C.SUCCESS_BORDER}` }}
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0" style={{ color: C.SUCCESS }} />
                <span className="text-sm font-semibold truncate" style={{ color: C.SUCCESS_TEXT }}>
                  #{String(jd.jobNumber).padStart(3, '0')}-{jd.title}
                </span>
              </div>
              <button
                className="text-xs ml-3 shrink-0 transition-colors"
                style={{ color: C.TEXT_MUTED }}
                onClick={() => setJD(null)}
              >
                Change
              </button>
            </div>
          ) : existingJDs.length > 0 ? (
            <div>
              <label className="label">Select a job description</label>
              <JobSelect
                jobs={existingJDs}
                value={null}
                onChange={(id) => {
                  const selected = existingJDs.find((j) => j.id === id) ?? null
                  setJD(selected)
                }}
              />
            </div>
          ) : (
            <p className="text-sm py-1" style={{ color: C.TEXT_MUTED }}>
              No job descriptions yet.{' '}
              <a href="/jd-generator" style={{ color: C.LAPIS }} className="hover:underline">
                Go to JD Generator
              </a>{' '}
              to create one first.
            </p>
          )}
        </div>

        {/* ── Step 2 — Upload ──────────────────────────────────────── */}
        <div className="card">
          <h2 className="font-bold mb-3" style={{ color: C.TEXT }}>
            <span className="mr-1.5" style={{ color: C.LAPIS }}>02</span> Upload Resumes
          </h2>
          <div
            {...getRootProps()}
            className={clsx(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer',
              'transition-all duration-200',
              isDragActive ? 'scale-[1.01]' : ''
            )}
            style={isDragActive
              ? { borderColor: C.LAPIS, backgroundColor: C.PRIMARY_LIGHT }
              : { borderColor: C.BORDER, backgroundColor: 'transparent' }
            }
            onMouseEnter={(e) => {
              if (!isDragActive) (e.currentTarget as HTMLElement).style.borderColor = C.LAPIS
            }}
            onMouseLeave={(e) => {
              if (!isDragActive) (e.currentTarget as HTMLElement).style.borderColor = C.BORDER
            }}
          >
            <input {...getInputProps()} />
            <Upload
              className="w-8 h-8 mx-auto mb-2 transition-colors"
              style={{ color: isDragActive ? C.LAPIS : C.TEXT_SUBTLE }}
            />
            <p className="text-sm font-medium" style={{ color: C.TEXT_MUTED }}>
              {isDragActive ? 'Drop files here…' : 'Drag & drop PDF / DOCX resumes, or click to browse'}
            </p>
            <p className="text-xs mt-1" style={{ color: C.TEXT_MUTED, opacity: 0.7 }}>Up to 100 files · 5 MB each</p>
          </div>

          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs leading-relaxed break-words" style={{ color: C.TEXT_MUTED }}>
                {files.map((f) => truncateFilename(f.name)).join(', ')}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: C.TEXT_MUTED }}>
                  {files.length} file{files.length > 1 ? 's' : ''} selected
                </span>
                <button
                  className="text-xs transition-colors hover:underline"
                  style={{ color: C.RED }}
                  onClick={() => { setFiles([]); setUploadedIds([]) }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Step 3 — Upload action ───────────────────────────────── */}
        <button
          className="btn-primary w-full justify-center py-3"
          disabled={!files.length || !jd || uploadMutation.isPending || uploadedIds.length > 0}
          onClick={() => uploadMutation.mutate()}
        >
          {uploadMutation.isPending
            ? 'Uploading & Parsing…'
            : uploadedIds.length > 0
              ? `✓  ${uploadedIds.length} Resume${uploadedIds.length > 1 ? 's' : ''} Uploaded`
              : `Upload ${files.length} Resume${files.length !== 1 ? 's' : ''}`}
        </button>

        {/* ── Duplicate detection warning ──────────────────────────── */}
        {duplicates.length > 0 && (
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: C.WARNING_BG, border: `1px solid ${C.WARNING_BORDER}` }}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.WARNING }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: C.TEXT }}>
                  {duplicates.length} possible duplicate{duplicates.length > 1 ? 's' : ''} detected
                </p>
                <ul className="mt-1.5 space-y-1">
                  {duplicates.map((d, i) => (
                    <li key={i} className="text-xs" style={{ color: C.TEXT_MUTED }}>
                      <span className="font-medium">{toDisplayName(fileNameMap[d.newCandidateId] ?? d.newCandidateId)}</span>
                      {' - '}
                      {d.matchType === 'email' ? 'exact email match with' : 'possible name match with'}{' '}
                      an existing candidate
                      {d.existingJobTitle ? ` (${d.existingJobTitle})` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4 — Screen action ───────────────────────────────── */}
        {uploadedIds.length > 0 && evaluations.length === 0 && (
          <button
            className="btn-primary w-full justify-center py-3"
            disabled={screenMutation.isPending}
            onClick={() => screenMutation.mutate()}
          >
            {screenMutation.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Screening {uploadedIds.length} resume{uploadedIds.length > 1 ? 's' : ''} with AI…
              </span>
            ) : (
              `Screen ${uploadedIds.length} Resume${uploadedIds.length > 1 ? 's' : ''} with AI`
            )}
          </button>
        )}

        {/* ── Results ──────────────────────────────────────────────── */}
        {evaluations.length > 0 && (
          <div className="card">

            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-bold" style={{ color: C.TEXT }}>
                  {evaluations.length} Candidate{evaluations.length > 1 ? 's' : ''} Ranked
                </h2>
                <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
                  {evaluations.filter(e => e.matchPercentage >= 70).length} strong match
                  {evaluations.filter(e => e.matchPercentage >= 70).length !== 1 ? 'es' : ''} (≥70%)
                </p>

                {/* Bias banner */}
                {biasedCount > 0 && (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg mt-2 w-fit"
                    style={{ backgroundColor: C.WARNING_BG, border: `1px solid ${C.WARNING_BORDER}` }}
                  >
                    <AlertTriangle className="w-3 h-3 shrink-0" style={{ color: C.WARNING }} />
                    <span className="text-xs font-medium" style={{ color: C.TEXT }}>
                      {biasedCount} bias flag{biasedCount > 1 ? 's' : ''} - review manually
                    </span>
                  </div>
                )}
              </div>

              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl shrink-0"
                style={{ backgroundColor: C.PRIMARY_LIGHT, border: `1px solid ${C.PRIMARY_RING}` }}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: C.LAPIS }} />
                <span className="text-xs font-semibold" style={{ color: C.LAPIS }}>AI Screened</span>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
              {evaluations.map((ev, i) => {
                const rawName      = fileNameMap[ev.candidateId] ?? ''
                const name         = rawName ? toDisplayName(rawName) : truncateFilename(ev.candidateId.slice(0, 8))
                const isExpanded   = expanded === ev.candidateId
                const pii          = piiReportMap[ev.candidateId]
                const hasBias      = (ev.biasFlags?.length ?? 0) > 0
                const hasGap       = (ev.skillsGap?.length ?? 0) > 0
                const uploadedAt   = uploadDateMap[ev.candidateId]
                const interest     = interestStatusMap[ev.candidateId] ?? 'unknown'
                const ageBadge     = uploadedAt ? uploadAgeBadge(uploadedAt) : null
                const intBadge     = interestBadge(interest)

                return (
                  <div
                    key={ev.candidateId}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${i * 60}ms`, borderBottom: `1px solid ${C.DIVIDER}` }}
                  >
                    {/* Row */}
                    <button
                      className="w-full flex items-center gap-3 p-4 text-left transition-colors duration-150"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = C.ROW_HOVER }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                      onClick={() => setExpanded(isExpanded ? null : ev.candidateId)}
                    >
                      <span className="text-sm w-5 font-mono shrink-0 tabular-nums" style={{ color: C.TEXT_SUBTLE }}>
                        #{i + 1}
                      </span>

                      {i === 0 && (
                        <Trophy className="w-4 h-4 shrink-0" style={{ color: C.WARNING }} />
                      )}

                      <span className="flex-1 text-sm font-semibold truncate" style={{ color: C.TEXT }}>
                        {name}
                      </span>

                      {/* Upload age */}
                      {ageBadge && (
                        <span className="hidden md:inline text-xs shrink-0" style={ageBadge.style}>
                          {ageBadge.label}
                        </span>
                      )}

                      {/* Interest status */}
                      {intBadge && (
                        <span
                          className="hidden md:inline text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
                          style={intBadge.style}
                        >
                          {intBadge.label}
                        </span>
                      )}

                      {/* Confidence badge */}
                      {ev.confidenceScore != null && (
                        <span
                          className="hidden sm:inline text-xs px-2 py-0.5 rounded-md font-medium shrink-0"
                          style={confidenceStyle(ev.confidenceScore)}
                          title={ev.confidenceReason ?? ''}
                        >
                          {confidenceLabel(ev.confidenceScore)}
                        </span>
                      )}

                      {/* Bias indicator */}
                      {hasBias && (
                        <span title="Bias flags detected">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: C.WARNING }} />
                        </span>
                      )}

                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-lg tabular-nums shrink-0"
                        style={scoreStyle(ev.matchPercentage)}
                      >
                        {ev.matchPercentage}%
                      </span>

                      <span className={clsx('hidden sm:inline-flex text-xs shrink-0', recommendationBadge(ev.recommendation))}>
                        {ev.recommendation}
                      </span>

                      {isExpanded
                        ? <ChevronUp   className="w-4 h-4 shrink-0" style={{ color: C.TEXT_SUBTLE }} />
                        : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: C.TEXT_SUBTLE }} />}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-5 pt-1 space-y-5 animate-fade-in" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>

                        {/* Score breakdown */}
                        <div>
                          <p className="section-label mb-3">Score Breakdown</p>
                          <ScoreBreakdown scores={ev.categoryScores} />
                        </div>

                        {/* AI Assessment + confidence */}
                        {ev.reasoning && (
                          <div
                            className="p-4 rounded-xl"
                            style={{ backgroundColor: C.PRIMARY_LIGHT }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: C.LAPIS }} />
                                <p className="text-xs font-bold" style={{ color: C.LAPIS }}>AI Assessment</p>
                              </div>
                              {ev.confidenceScore != null && (
                                <span
                                  className="text-xs px-2 py-0.5 rounded-md font-medium tabular-nums"
                                  style={confidenceStyle(ev.confidenceScore)}
                                  title={ev.confidenceReason ?? ''}
                                >
                                  {ev.confidenceScore}% {confidenceLabel(ev.confidenceScore)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: C.TEXT }}>
                              <TypewriterText text={ev.reasoning} />
                            </p>
                            {ev.confidenceReason && (
                              <p className="text-xs mt-2 italic" style={{ color: C.TEXT_MUTED }}>
                                {ev.confidenceReason}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Strengths & Concerns */}
                        <div className="grid grid-cols-2 gap-4">
                          {ev.strengths.length > 0 && (
                            <div>
                              <p className="section-label mb-2" style={{ color: C.SUCCESS }}>Strengths</p>
                              <ul className="space-y-1.5">
                                {ev.strengths.map((s, j) => (
                                  <li key={j} className="flex gap-2 text-xs text-gray-600">
                                    <span className="shrink-0 mt-0.5" style={{ color: C.SUCCESS }}>✓</span>
                                    {s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {ev.concerns.length > 0 && (
                            <div>
                              <p className="section-label mb-2" style={{ color: C.RED }}>Concerns</p>
                              <ul className="space-y-1.5">
                                {ev.concerns.map((c, j) => (
                                  <li key={j} className="flex gap-2 text-xs text-gray-600">
                                    <span className="shrink-0 mt-0.5" style={{ color: C.RED }}>⚠</span>
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Skills gap */}
                        {hasGap && (
                          <div>
                            <p className="section-label mb-2">Skills Gap</p>
                            <div className="flex flex-wrap gap-1.5">
                              {ev.skillsGap!.map((g, j) => (
                                <span
                                  key={j}
                                  className="text-xs px-2.5 py-1 rounded-lg font-medium"
                                  style={
                                    g.severity === 'critical'
                                      ? { backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }
                                      : { backgroundColor: C.WARNING_BG, color: C.WARNING, border: `1px solid ${C.WARNING_BORDER}` }
                                  }
                                >
                                  {g.severity === 'critical' ? '● ' : '○ '}{g.skill}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs mt-1.5" style={{ color: C.TEXT_SUBTLE }}>
                              ● critical &nbsp;○ nice-to-have
                            </p>
                          </div>
                        )}

                        {/* Bias flags */}
                        {hasBias && (
                          <div
                            className="p-3 rounded-xl"
                            style={{ backgroundColor: C.WARNING_BG }}
                          >
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: C.WARNING }} />
                              <p className="text-xs font-semibold" style={{ color: C.TEXT }}>Bias Review Flags</p>
                            </div>
                            <ul className="space-y-1">
                              {ev.biasFlags!.map((f, j) => (
                                <li key={j} className="text-xs" style={{ color: C.TEXT_MUTED }}>{f.description}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* PII audit */}
                        {pii && piiSummary(pii) && (
                          <div className="flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: C.SUCCESS }} />
                            <span className="text-xs" style={{ color: C.TEXT_MUTED }}>
                              PII redacted: {piiSummary(pii)}
                            </span>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
                          {ev.jobId && (
                            <>
                              <button
                                className="btn-secondary text-xs py-1.5"
                                onClick={() => navigate(`/interview?jobId=${ev.jobId}`)}
                              >
                                <ClipboardList className="w-3.5 h-3.5" />
                                Interview Guide
                              </button>
                              <button
                                className="btn-secondary text-xs py-1.5"
                                onClick={() => navigate(`/communication?jobId=${ev.jobId}`)}
                              >
                                <Mail className="w-3.5 h-3.5" />
                                Draft Email
                              </button>
                            </>
                          )}

                          {/* Check interest — disabled if already responded */}
                          {interest !== 'interested' && interest !== 'not_looking' && (
                            <button
                              className="btn-secondary text-xs py-1.5"
                              disabled={checkInterestMutation.isPending || interest === 'checked'}
                              onClick={() => checkInterestMutation.mutate(ev.candidateId)}
                              title={interest === 'checked' ? 'Already sent, awaiting reply' : 'Send a "still looking?" email'}
                            >
                              <Bell className="w-3.5 h-3.5" />
                              {interest === 'checked' ? 'Check sent' : 'Check Interest'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
