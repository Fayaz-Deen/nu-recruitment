import { C } from '../tokens'
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronDown, ChevronUp, AlertTriangle, Copy, Printer, Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { jdApi, resumeApi, interviewApi } from '../services/api'
import type { InterviewGuide, InterviewGuideSummary, CandidateResult } from '../types'
import JobSelect from '../components/JobSelect'

// ── Helpers ────────────────────────────────────────────────────────────────

function scoreStyle(pct: number): React.CSSProperties {
  if (pct >= 80) return { color: C.SUCCESS, backgroundColor: C.SUCCESS_BG, border: `1px solid ${C.SUCCESS_BORDER}` }
  if (pct >= 65) return { color: C.WARNING, backgroundColor: C.WARNING_BG, border: `1px solid ${C.WARNING_BORDER}` }
  return              { color: C.TEXT_MUTED, backgroundColor: C.NEUTRAL, border: `1px solid ${C.BORDER}` }
}

function guideKey(g: InterviewGuide) {
  return g.guideId ?? g.id
}

// ── Component ──────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const queryClient    = useQueryClient()
  const [searchParams] = useSearchParams()

  const [selectedJobId,       setSelectedJobId]       = useState<string | null>(null)
  const [loadedGuides,        setLoadedGuides]        = useState<InterviewGuide[]>([])
  const [expandedGuideId,     setExpandedGuideId]     = useState<string | null>(null)
  const [generatingIds,       setGeneratingIds]       = useState<Set<string>>(new Set())
  const [generateAllProgress, setGenerateAllProgress] = useState<{ current: number; total: number } | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: jdList = [] } = useQuery({
    queryKey: ['jd-list'],
    queryFn:  jdApi.list,
  })

  const { data: candidates = [], isFetching: candidatesFetching } = useQuery<CandidateResult[]>({
    queryKey: ['resume-results', selectedJobId],
    queryFn:  () => resumeApi.results(selectedJobId!),
    enabled:  !!selectedJobId,
  })

  const { data: existingGuides = [] } = useQuery<InterviewGuideSummary[]>({
    queryKey: ['interview-guides', selectedJobId],
    queryFn:  () => interviewApi.listGuides(selectedJobId!),
    enabled:  !!selectedJobId,
  })

  // Pre-select job from URL param (?jobId=)
  useEffect(() => {
    if (selectedJobId || jdList.length === 0) return
    const param = searchParams.get('jobId')
    if (param && jdList.some((j) => j.id === param)) {
      setSelectedJobId(param)
    }
  }, [jdList]) // eslint-disable-line react-hooks/exhaustive-deps

  const eligibleCandidates = candidates.filter((c) => c.matchPercentage >= 65)
  const guidedIds          = new Set(existingGuides.map((g) => g.candidateId))
  const loadedGuideIds     = new Set(loadedGuides.map(guideKey))
  const isAnyGenerating    = generatingIds.size > 0 || generateAllProgress !== null

  // ── Actions ───────────────────────────────────────────────────────────────

  const addGuide = (guide: InterviewGuide) => {
    const key = guideKey(guide)
    setLoadedGuides((prev) => prev.some((g) => guideKey(g) === key) ? prev : [guide, ...prev])
    setExpandedGuideId(key)
    queryClient.invalidateQueries({ queryKey: ['interview-guides', selectedJobId] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }

  const generateOne = async (candidateId: string): Promise<boolean> => {
    if (!selectedJobId) return false
    setGeneratingIds((prev) => new Set(prev).add(candidateId))
    try {
      const guide = await interviewApi.generateGuide(selectedJobId, candidateId)
      addGuide(guide)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate guide'
      if (msg.includes('Screen') || msg.includes('evaluation')) {
        toast.error('Screen this candidate first before generating an interview guide')
      } else {
        toast.error(msg)
      }
      return false
    } finally {
      setGeneratingIds((prev) => { const s = new Set(prev); s.delete(candidateId); return s })
    }
  }

  const generateAll = async () => {
    const toGenerate = eligibleCandidates.filter(
      (c) => !guidedIds.has(c.candidateId) && !generatingIds.has(c.candidateId)
    )
    if (!toGenerate.length) return
    setGenerateAllProgress({ current: 0, total: toGenerate.length })
    for (let i = 0; i < toGenerate.length; i++) {
      setGenerateAllProgress({ current: i + 1, total: toGenerate.length })
      await generateOne(toGenerate[i].candidateId)
      if (i < toGenerate.length - 1) await new Promise<void>((r) => setTimeout(r, 1000))
    }
    setGenerateAllProgress(null)
    toast.success('All interview guides generated')
  }

  const viewGuide = async (summary: InterviewGuideSummary) => {
    if (loadedGuideIds.has(summary.guideId)) { setExpandedGuideId(summary.guideId); return }
    try {
      const guide = await interviewApi.getGuide(summary.guideId)
      addGuide(guide)
    } catch {
      toast.error('Failed to load guide')
    }
  }

  const copyQuestions = (guide: InterviewGuide) => {
    const lines = [
      'BEHAVIOURAL QUESTIONS',
      ...guide.behavioralQuestions.map((q, i) => `${i + 1}. ${q.text}`),
      '',
      'TECHNICAL QUESTIONS',
      ...guide.technicalQuestions.map((q, i) => `${i + 1}. ${q.text}`),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Questions copied to clipboard')
  }

  const printGuide = (key: string) => {
    const el = document.getElementById(`guide-${key}`)
    if (el) el.classList.add('print-target')
    const cleanup = () => {
      if (el) el.classList.remove('print-target')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl space-y-6 animate-fade-in-up">

      <div>
        <h1 className="text-2xl font-bold" style={{ color: C.TEXT }}>Interview Guide</h1>
        <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>Generate role-specific interview questions and rubrics</p>
      </div>

      {/* ── Step 1 — JD selector ─────────────────────────────────────── */}
      <div className="card">
        <h2 className="font-bold mb-3" style={{ color: C.TEXT }}>
          <span className="mr-1.5" style={{ color: C.LAPIS }}>01</span> Select Job Description
        </h2>
        {jdList.length === 0 ? (
          <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
            No job descriptions yet.{' '}
            <a href="/jd-generator" style={{ color: C.LAPIS }} className="hover:underline">Go to JD Generator</a>{' '}
            to create one first.
          </p>
        ) : (
          <JobSelect
            jobs={jdList}
            value={selectedJobId}
            onChange={(id) => {
              setSelectedJobId(id)
              setLoadedGuides([])
              setExpandedGuideId(null)
            }}
          />
        )}
      </div>

      {/* ── Step 2 — Eligible candidates ─────────────────────────────── */}
      {selectedJobId && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold" style={{ color: C.TEXT }}>
                <span className="mr-1.5" style={{ color: C.LAPIS }}>02</span> Eligible Candidates
              </h2>
              {!candidatesFetching && eligibleCandidates.length > 0 && (
                <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
                  {eligibleCandidates.length} candidate{eligibleCandidates.length > 1 ? 's' : ''} at ≥65% match
                </p>
              )}
            </div>
            {!candidatesFetching && eligibleCandidates.length > 0 && (
              <button
                className="btn-primary text-xs py-1.5"
                disabled={isAnyGenerating || eligibleCandidates.every(
                  (c) => guidedIds.has(c.candidateId) || loadedGuides.some((g) => g.candidateId === c.candidateId)
                )}
                onClick={generateAll}
              >
                {generateAllProgress
                  ? `Generating ${generateAllProgress.current} of ${generateAllProgress.total}…`
                  : 'Generate All Guides'}
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
                  <div className="h-7 rounded w-24 shrink-0 shimmer" />
                </div>
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No candidates screened for this role yet.{' '}
              <a href="/resume-screener" style={{ color: C.LAPIS }} className="hover:underline">Go to Resume Screener</a>{' '}
              to screen resumes first.
            </p>
          ) : eligibleCandidates.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No candidates scored 65% or above for this role.
            </p>
          ) : (
            <div className="space-y-1.5">
              {eligibleCandidates.map((c, i) => {
                const displayName      = c.fileName.replace(/\.[^/.]+$/, '')
                const hasExistingGuide = guidedIds.has(c.candidateId)
                const hasLocalGuide    = loadedGuides.some((g) => g.candidateId === c.candidateId)
                const isGenerating     = generatingIds.has(c.candidateId)
                const existingSummary  = existingGuides.find((g) => g.candidateId === c.candidateId)

                return (
                  <div
                    key={c.candidateId}
                    className="flex items-center gap-3 py-2.5 px-3 -mx-3 rounded-xl
                               last:border-0 transition-colors duration-150 animate-fade-in-up"
                    style={{ borderBottom: `1px solid ${C.DIVIDER}`, animationDelay: `${i * 50}ms` }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = C.PRIMARY_LIGHT }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: C.TEXT }}>{displayName}</p>
                      <p className="text-xs" style={{ color: C.TEXT_MUTED }}>{c.recommendation}</p>
                    </div>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 tabular-nums"
                      style={scoreStyle(c.matchPercentage)}
                    >
                      {c.matchPercentage}%
                    </span>
                    {hasExistingGuide || hasLocalGuide ? (
                      <button
                        className="btn-secondary text-xs py-1.5 shrink-0"
                        onClick={() => {
                          if (hasLocalGuide) {
                            const g = loadedGuides.find((g) => g.candidateId === c.candidateId)
                            if (g) setExpandedGuideId(guideKey(g))
                          } else if (existingSummary) {
                            viewGuide(existingSummary)
                          }
                        }}
                      >
                        View Guide
                      </button>
                    ) : (
                      <button
                        className="btn-primary text-xs py-1.5 shrink-0"
                        disabled={isGenerating || !!generateAllProgress}
                        onClick={() => generateOne(c.candidateId)}
                      >
                        {isGenerating ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            Generating…
                          </span>
                        ) : 'Generate Guide'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Section 3 — Guide cards ───────────────────────────────────── */}
      {loadedGuides.length > 0 && (
        <div id="print-area" className="space-y-4">

          {/* Branded header — screen: hidden, print: visible */}
          <div className="print-header">
            <div className="print-header-brand">
              <div className="print-logo-mark">NL</div>
              <div>
                <div className="print-logo-name">NULogic</div>
                <div className="print-logo-tag">Recruitment Intelligence</div>
              </div>
            </div>
            <div className="print-header-meta">
              <div className="print-doc-title">Interview Guide</div>
              <div className="print-doc-date">
                Printed on {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Section heading — hidden on print via .print-section-heading */}
          <div className="print-section-heading flex items-center gap-2">
            <h2 className="font-bold" style={{ color: C.TEXT }}>Generated Guides</h2>
            <span className="badge-blue">{loadedGuides.length}</span>
          </div>

          {loadedGuides.map((guide) => {
            const key        = guideKey(guide)
            const isExpanded = expandedGuideId === key

            return (
              <div key={key} id={`guide-${key}`} className="guide-card card p-0 overflow-hidden animate-fade-in-up">

                {/* Guide header */}
                <button
                  className="guide-toggle-btn w-full flex items-center justify-between p-5 text-left transition-colors duration-150"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = C.ROW_HOVER }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                  onClick={() => setExpandedGuideId(isExpanded ? null : key)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: C.PRIMARY_LIGHT, border: `1px solid ${C.PRIMARY_RING}` }}
                    >
                      <Sparkles className="w-4 h-4" style={{ color: C.LAPIS }} />
                    </div>
                    <div>
                      <p className="font-bold" style={{ color: C.TEXT }}>
                        {guide.candidateName ?? guide.candidateId}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
                        {guide.jobTitle} &middot;{' '}
                        {new Date(guide.createdAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  {isExpanded
                    ? <ChevronUp   className="guide-chevron w-4 h-4 shrink-0" style={{ color: C.TEXT_SUBTLE }} />
                    : <ChevronDown className="guide-chevron w-4 h-4 shrink-0" style={{ color: C.TEXT_SUBTLE }} />}
                </button>

                {isExpanded && (
                  <div className="guide-body p-5 space-y-7 animate-fade-in" style={{ borderTop: `1px solid ${C.BORDER}` }}>

                    {/* Behavioural questions */}
                    {guide.behavioralQuestions.length > 0 && (
                      <section>
                        <p className="section-label mb-4">Behavioural Questions</p>
                        <ol className="space-y-4">
                          {guide.behavioralQuestions.map((q, i) => (
                            <li
                              key={q.id}
                              className="flex gap-3 animate-fade-in-up"
                              style={{ animationDelay: `${i * 70}ms` }}
                            >
                              <span className="shrink-0 font-mono text-sm mt-0.5 w-5 text-right" style={{ color: 'rgba(5,7,102,0.45)' }}>
                                {i + 1}.
                              </span>
                              <div>
                                <p className="text-sm font-medium leading-snug" style={{ color: C.TEXT }}>{q.text}</p>
                                {q.whatToLookFor && (
                                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: C.TEXT_MUTED }}>
                                    <span className="font-semibold" style={{ color: C.TEXT_MUTED }}>Look for:</span>{' '}
                                    {q.whatToLookFor}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}

                    {/* Technical questions */}
                    {guide.technicalQuestions.length > 0 && (
                      <section>
                        <p className="section-label mb-4">Technical Questions</p>
                        <ol className="space-y-4">
                          {guide.technicalQuestions.map((q, i) => (
                            <li
                              key={q.id}
                              className="flex gap-3 animate-fade-in-up"
                              style={{ animationDelay: `${i * 70}ms` }}
                            >
                              <span className="shrink-0 font-mono text-sm mt-0.5 w-5 text-right" style={{ color: 'rgba(37,37,92,0.5)' }}>
                                {i + 1}.
                              </span>
                              <div>
                                <p className="text-sm font-medium leading-snug" style={{ color: C.TEXT }}>{q.text}</p>
                                {q.whatToLookFor && (
                                  <p className="text-xs mt-1.5 leading-relaxed" style={{ color: C.TEXT_MUTED }}>
                                    <span className="font-semibold" style={{ color: C.TEXT_MUTED }}>Look for:</span>{' '}
                                    {q.whatToLookFor}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}

                    {/* Scoring rubric */}
                    {guide.scoringRubric?.criteria?.length > 0 && (
                      <section>
                        <p className="section-label mb-4">Scoring Rubric</p>
                        <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${C.BORDER}` }}>
                          <table className="w-full text-sm border-collapse">
                            <thead>
                              <tr style={{ backgroundColor: C.BG, borderBottom: `1px solid ${C.BORDER}` }}>
                                <th className="text-left py-2.5 px-4 text-xs font-bold w-1/3" style={{ color: C.TEXT_MUTED }}>Criterion</th>
                                <th className="text-left py-2.5 px-3 text-xs font-bold w-16"    style={{ color: C.TEXT_MUTED }}>Weight</th>
                                <th className="text-left py-2.5 px-3 text-xs font-bold"         style={{ color: C.TEXT_MUTED }}>Scoring Guide</th>
                              </tr>
                            </thead>
                            <tbody>
                              {guide.scoringRubric.criteria.map((c) => (
                                <tr key={c.name} className="last:border-0" style={{ borderBottom: `1px solid ${C.DIVIDER}` }}>
                                  <td className="py-3 px-4 font-semibold align-top text-sm" style={{ color: C.TEXT }}>{c.name}</td>
                                  <td className="py-3 px-3 align-top">
                                    <span className="badge-primary tabular-nums">{c.weight}%</span>
                                  </td>
                                  <td className="py-3 px-3 align-top space-y-0.5" style={{ color: C.TEXT_MUTED }}>
                                    {c.scores.map((s) => (
                                      <p key={s.score} className="text-xs">
                                        <span className="font-semibold" style={{ color: C.TEXT }}>{s.score}</span>
                                        {' — '}{s.description}
                                      </p>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}

                    {/* Red flags */}
                    {guide.redFlagsToWatch?.length > 0 && (
                      <section>
                        <p className="section-label mb-3">Red Flags to Watch</p>
                        <ul className="space-y-2">
                          {guide.redFlagsToWatch.map((flag, i) => (
                            <li key={i} className="flex gap-2.5 text-sm print-red-flag">
                              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: C.RED }} />
                              <span style={{ color: C.RED }}>{flag}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {/* Footer actions */}
                    <div className="guide-actions flex items-center gap-3 pt-3" style={{ borderTop: `1px solid ${C.BORDER}` }}>
                      <button className="btn-secondary text-xs py-1.5" onClick={() => copyQuestions(guide)}>
                        <Copy className="w-3.5 h-3.5" />
                        Copy All Questions
                      </button>
                      <button className="btn-secondary text-xs py-1.5" onClick={() => printGuide(key)}>
                        <Printer className="w-3.5 h-3.5" />
                        Print / Export
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
