import { C } from '../tokens'
import React, { useState, useEffect } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import {
  Users, FileText, Mail, BookOpen,
  Trash2, Loader2, ChevronRight, CheckCircle2, Circle,
  ClipboardList, MessageSquare, Plus,
  ArrowUpRight, TrendingUp, Trophy, Zap, BarChart2,
  Bell, UserCheck, Clock, UserX,
  Calendar, AlertCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { jdApi, resumeApi, communicationApi, interviewApi, scheduleApi } from '../services/api'
import type { JobDescription, PriorityAction } from '../types'
import JDDetailModal from '../components/JDDetailModal'
import AnimatedNumber from '../components/AnimatedNumber'
import ProfileBanner from '../components/ProfileBanner'

// ── Stat card data ──────────────────────────────────────────────────────────

const STAT_META = [
  {
    key:      'jds',
    label:    'JDs Generated',
    icon:     FileText,
    link:     '/jd-generator',
    gradient: C.GRAD_JD,   // lapis → indigo
    glow:     '0 4px 14px rgba(97,98,157,0.42)',
  },
  {
    key:      'resumes',
    label:    'Resumes Screened',
    icon:     Users,
    link:     '/resume-screener',
    gradient: C.GRAD_SCREEN,   // purple → light-purple
    glow:     '0 4px 14px rgba(137,57,161,0.40)',
  },
  {
    key:      'guides',
    label:    'Interview Guides',
    icon:     BookOpen,
    link:     '/interview',
    gradient: C.GRAD_GUIDE,   // teal → navy
    glow:     '0 4px 14px rgba(19,62,73,0.40)',
  },
  {
    key:      'emails',
    label:    'Emails Drafted',
    icon:     Mail,
    link:     '/communication',
    gradient: C.GRAD_COMMS,   // pink → coral (unchanged)
    glow:     '0 4px 14px rgba(212,47,123,0.38)',
  },
]

// ── Pipeline data ───────────────────────────────────────────────────────────

const PIPELINE = [
  {
    step: 1, label: 'JD Generator',           desc: 'Define the role with AI', link: '/jd-generator',
    icon: FileText,      accent: 'linear-gradient(135deg, #050766, #61629D)',
    topBar: C.GRAD_JD_H,
    iconColor: C.INDIGO,
  },
  {
    step: 2, label: 'Resume Screener',         desc: 'AI candidate evaluation', link: '/resume-screener',
    icon: Users,         accent: 'linear-gradient(135deg, #8939A1, #B17DC1)',
    topBar: C.GRAD_SCREEN_H,
    iconColor: C.PURPLE,
  },
  {
    step: 3, label: 'Interview Guide Generator', desc: 'Tailored Q&A + rubric', link: '/interview',
    icon: ClipboardList, accent: 'linear-gradient(135deg, #133E49, #050766)',
    topBar: C.GRAD_GUIDE_H,
    iconColor: C.TEAL,
  },
  {
    step: 4, label: 'Communications',           desc: 'Personalised emails',    link: '/communication',
    icon: MessageSquare, accent: C.GRAD_PRIMARY,
    topBar: C.GRAD_COMMS_H,
    iconColor: C.PINK,
  },
]

// ── Status helpers ──────────────────────────────────────────────────────────

function statusPill(status: JobDescription['status']): React.CSSProperties {
  if (status === 'active') return { backgroundColor: '#0D6E4A', color: '#fff', fontWeight: 700 }
  if (status === 'closed') return { backgroundColor: '#3D3F52', color: '#fff', fontWeight: 700 }
  return { background: 'transparent', color: C.TEXT_MUTED, fontWeight: 600 }
}

function statusAccent(status: JobDescription['status']): string {
  if (status === 'active') return C.SUCCESS
  if (status === 'closed') return C.TEXT_MUTED
  return '#61629D'  // draft — secondary lapis, matches dashboard gradient
}

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins  <  1)  return 'just now'
  if (mins  < 60)  return `${mins} min${mins  !== 1 ? 's' : ''} ago`
  const hrs  = Math.floor(mins  / 60)
  if (hrs   < 24)  return `${hrs} hour${hrs   !== 1 ? 's' : ''} ago`
  const days = Math.floor(hrs   / 24)
  if (days  <  7)  return `${days} day${days  !== 1 ? 's' : ''} ago`
  const wks  = Math.floor(days  /  7)
  if (wks   <  4)  return `${wks} week${wks   !== 1 ? 's' : ''} ago`
  const mos  = Math.floor(days  / 30)
  if (mos   < 12)  return `${mos} month${mos  !== 1 ? 's' : ''} ago`
  const yrs  = Math.floor(mos   / 12)
  return `${yrs} year${yrs !== 1 ? 's' : ''} ago`
}

function cleanFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').trim()
}

function scoreColor(pct: number): string {
  return pct >= 80 ? C.SUCCESS : pct >= 65 ? C.WARNING : C.RED
}

// ── Component ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const location    = useLocation()

  // ── Invalidate on every visit ──
  useEffect(() => {
    if (location.pathname === '/dashboard') {
      queryClient.invalidateQueries({ queryKey: ['stats']   })
      queryClient.invalidateQueries({ queryKey: ['jd-list'] })
    }
  }, [location.pathname, queryClient])

  // ── Queries (unchanged) ────────────────────────────────────────────────
  const { data: jobs = [], isSuccess: jobsLoaded } = useQuery({
    queryKey: ['jd-list'],
    queryFn:  jdApi.list,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn:  jdApi.stats,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  // ── State ──────────────────────────────────────────────────────────────
  const [selectedJD,         setSelectedJD]        = useState<JobDescription | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [compactFilter,      setCompactFilter]     = useState<'all' | 'active' | 'draft' | 'closed'>('all')

  const compactJobs   = compactFilter === 'all' ? jobs : jobs.filter(j => j.status === compactFilter)

  const statusCounts = {
    all:    jobs.length,
    active: jobs.filter(j => j.status === 'active').length,
    draft:  jobs.filter(j => j.status === 'draft').length,
    closed: jobs.filter(j => j.status === 'closed').length,
  }

  // ── Mutations (unchanged) ──────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: jdApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jd-list'] })
      queryClient.invalidateQueries({ queryKey: ['stats']   })
      setConfirmingDeleteId(null)
      toast.success('Job description deleted')
    },
    onError: () => {
      toast.error('Failed to delete — please try again')
      setConfirmingDeleteId(null)
    },
  })

  // ── Stat values wired to live data ─────────────────────────────────────
  const statValues: Record<string, number> = {
    jds:     stats?.totalJobs            ?? jobs.length,
    resumes: stats?.totalEvaluations     ?? 0,
    guides:  stats?.totalInterviewGuides ?? 0,
    emails:  stats?.totalEmails          ?? 0,
  }

  // ── Insight cards: top 4 roles, 1 best candidate each ────────────────
  const topRoles = jobs.slice(0, 4)

  const evalQueries = useQueries({
    queries: topRoles.map(job => ({
      queryKey: ['dash-results', job.id],
      queryFn:  () => resumeApi.results(job.id),
      staleTime: 30_000,
    })),
  })

  // 1 top candidate per role, sorted by score so highest match appears first
  const topCandidates = topRoles
    .map((job, i) => {
      const best = evalQueries[i]?.data?.[0]
      if (!best) return null
      return { ...best, jobTitle: job.title }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.matchPercentage - a.matchPercentage)

  // Flat list of all evaluations across top 4 roles — used for AI Insights
  const evaluations = evalQueries.flatMap(q => q.data ?? [])

  // ── Interest tracker stats ─────────────────────────────────────────────
  const { data: interestData } = useQuery({
    queryKey: ['interest-stats'],
    queryFn:  resumeApi.interestStats,
    staleTime: 60_000,
    refetchOnMount: true,
  })

  // Emails for the latest job only — used for confirmedCount
  const latestJobId = jobs[0]?.id
  const { data: draftedEmails = [] } = useQuery({
    queryKey: ['dash-emails', latestJobId],
    queryFn:  () => communicationApi.getDraftedEmails(latestJobId!),
    enabled:  !!latestJobId,
    staleTime: 30_000,
  })

  // Priority actions query
  const { data: priorityActions = [] } = useQuery({
    queryKey: ['priority-actions'],
    queryFn:  scheduleApi.priorityActions,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  // Per-job eval lookup — reuses already-fetched evalQueries (no extra API calls)
  const evalByJobId: Record<string, typeof evaluations> = {}
  topRoles.forEach((job, i) => {
    const data = evalQueries[i]?.data
    if (data) evalByJobId[job.id] = data
  })

  // Stage 3 — interview guides per job (existing endpoint, new jobs)
  const guideQueries = useQueries({
    queries: topRoles.map(job => ({
      queryKey: ['dash-guides', job.id],
      queryFn:  () => interviewApi.listGuides(job.id),
      staleTime: 30_000,
    })),
  })

  // Stage 4+5 — emails + scheduling per job
  // Same queryKey pattern as draftedEmails → cache hit for latestJobId, no duplicate call
  const stageEmailQueries = useQueries({
    queries: topRoles.map(job => ({
      queryKey: ['dash-emails', job.id],
      queryFn:  () => communicationApi.getDraftedEmails(job.id),
      staleTime: 30_000,
    })),
  })

  const guideByJobId: Record<string, boolean> = {}
  const stageEmailByJobId: Record<string, { hasEmail: boolean; hasSchedule: boolean }> = {}
  topRoles.forEach((job, i) => {
    guideByJobId[job.id] = (guideQueries[i]?.data?.length ?? 0) > 0
    const emails = stageEmailQueries[i]?.data ?? []
    stageEmailByJobId[job.id] = {
      hasEmail:    emails.some(e => !!e.sentAt),
      hasSchedule: emails.some(e => e.scheduleStatus != null),
    }
  })

  const avgScore       = evaluations.length
    ? Math.round(evaluations.reduce((s, e) => s + e.matchPercentage, 0) / evaluations.length)
    : 0
  const strongCount    = evaluations.filter(e => e.matchPercentage >= 80).length
  const shortlistCount = evaluations.filter(e => e.matchPercentage >= 65).length
  const confirmedCount = draftedEmails.filter(e => e.scheduleStatus === 'confirmed').length

  const funnel = [
    { label: 'Uploaded',        value: stats?.totalCandidates      ?? 0, color: C.INDIGO  },
    { label: 'AI Evaluated',    value: stats?.totalEvaluations     ?? 0, color: C.PURPLE  },
    { label: 'Interview Guides',value: stats?.totalInterviewGuides ?? 0, color: C.TEAL    },
    { label: 'Emails Drafted',  value: stats?.totalEmails          ?? 0, color: C.PINK    },
  ]
  const funnelMax = Math.max(funnel[0].value, 1)

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in-up space-y-6">

      <ProfileBanner />

      {/* ════════════════════════════════════════════════════════════════
          HEADER — nu-grad-dark, blur orbs, CTA
      ════════════════════════════════════════════════════════════════ */}
      <div
        className="relative rounded-2xl overflow-hidden px-8 py-7"
        style={{
          background: C.GRAD_DARK,
          boxShadow: '0 8px 40px -8px rgba(27,31,78,0.55)',
        }}
      >
        {/* Blur orb — top right (purple) */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '-40px', right: '-40px',
            width: '220px', height: '220px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(137,57,161,0.55) 0%, transparent 65%)',
            filter: 'blur(50px)',
          }}
        />
        {/* Blur orb — bottom left (coral) */}
        <div
          className="absolute pointer-events-none"
          style={{
            bottom: '-30px', left: '20%',
            width: '160px', height: '160px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(238,119,124,0.35) 0%, transparent 65%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white leading-tight">NULogic Recruiter AI</h1>
            <p className="text-sm font-medium mt-1" style={{ color: 'rgba(255,255,255,0.58)' }}>
              End-to-End Hiring Intelligence
            </p>
          </div>

          <a href="/jd-generator" className="btn-gradient shrink-0">
            <Plus className="w-4 h-4" />
            Create New Role
          </a>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          STAT CARDS — gradient icons, animated numbers, hover link
      ════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_META.map((s, i) => (
          <div
            key={s.key}
            className="card group animate-fade-in-up"
            style={{ animationDelay: `${i * 55}ms` }}
          >
            {/* Icon + hover link row */}
            <div className="flex items-start justify-between mb-5">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: s.gradient, boxShadow: s.glow }}
              >
                <s.icon className="w-5 h-5 text-white" />
              </div>
              <a
                href={s.link}
                className="opacity-0 group-hover:opacity-100 transition-all duration-150 p-1.5 rounded-lg"
                style={{ color: C.TEXT_MUTED }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = C.DIVIDER }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                <ArrowUpRight className="w-4 h-4" />
              </a>
            </div>

            {/* Value */}
            <p className="text-4xl font-black tabular-nums leading-none" style={{ color: C.TEXT }}>
              <AnimatedNumber target={statValues[s.key]} />
            </p>

            {/* Label */}
            <p className="text-sm font-medium mt-1.5" style={{ color: C.TEXT_MUTED }}>{s.label}</p>

          </div>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PIPELINE — connected flow, gradient accents, step badges
      ════════════════════════════════════════════════════════════════ */}
      <div className="card animate-fade-in-up" style={{ animationDelay: '80ms' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-base" style={{ color: C.TEXT }}>Recruitment Workflow</h2>
            <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
              Track hiring progress across all active roles
            </p>
          </div>
          <span className="badge-primary">4 stages</span>
        </div>

        {/* Flow */}
        <div className="flex items-stretch">
          {PIPELINE.flatMap((item, i) => {
            const card = (
              <a
                key={`step-${item.step}`}
                href={item.link}
                className="flex-1 block group transition-all duration-200 hover:-translate-y-1"
                style={{ textDecoration: 'none' }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.filter = 'drop-shadow(0 6px 16px rgba(5,7,102,0.14))'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.filter = 'none'
                }}
              >
                <div
                  className="h-full rounded-xl p-4 flex flex-col"
                  style={{ background: '#fff', border: `1px solid ${C.BORDER}` }}
                >
                  {/* Gradient top bar */}
                  <div
                    className="h-[3px] rounded-full mb-4 w-full"
                    style={{ background: item.topBar }}
                  />

                  {/* Step badge */}
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white mb-3 shrink-0"
                    style={{ background: item.accent }}
                  >
                    {item.step}
                  </div>

                  {/* Icon */}
                  <item.icon className="w-5 h-5 mb-3" style={{ color: item.iconColor }} />

                  {/* Text */}
                  <p className="text-sm font-bold mb-1 leading-snug" style={{ color: C.TEXT }}>
                    {item.label}
                  </p>
                  <p className="text-xs leading-snug" style={{ color: C.TEXT_MUTED }}>
                    {item.desc}
                  </p>
                </div>
              </a>
            )

            const arrow = i < PIPELINE.length - 1 ? (
              <div
                key={`arrow-${i}`}
                className="flex items-center justify-center px-1 shrink-0"
                style={{ width: 24 }}
              >
                <ChevronRight className="w-4 h-4" style={{ color: C.TEXT_SUBTLE }} />
              </div>
            ) : null

            return arrow ? [card, arrow] : [card]
          })}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          HIRING INTELLIGENCE — 4 compact insight cards
      ════════════════════════════════════════════════════════════════ */}
      <div className="card animate-fade-in-up" style={{ animationDelay: '100ms' }}>

          {/* Section header — matches Recruitment Workflow style */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-base" style={{ color: C.TEXT }}>Hiring Intelligence</h2>
              <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
                Live recruitment insights and candidate analytics
              </p>
            </div>
            <span className="badge-primary">AI-powered</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

            {/* ── Card 1: Candidate Journey Pipeline ── */}
            <div
              className="animate-fade-in-up flex flex-col p-4 rounded-xl"
              style={{
                minHeight: 264, border: `1px solid ${C.BORDER}`,
                animationDelay: '60ms',
                transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = 'translateY(-3px)'
                el.style.boxShadow = '0 6px 20px rgba(5,7,102,0.10)'
                el.style.borderColor = C.LAPIS
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = ''
                el.style.boxShadow = ''
                el.style.borderColor = C.BORDER
              }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: C.GRAD_JD }}>
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: C.TEXT }}>Candidate Pipeline</p>
                  <p className="text-xs" style={{ color: C.TEXT_MUTED }}>Funnel conversion</p>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                {funnel.map((stage) => (
                  <div key={stage.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: C.TEXT_MUTED }}>{stage.label}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: C.TEXT }}>
                        <AnimatedNumber target={stage.value} />
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.DIVIDER }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.round((stage.value / funnelMax) * 100)}%`,
                          backgroundColor: stage.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
                <p className="text-xs" style={{ color: C.TEXT_MUTED }}>
                  <span className="font-semibold" style={{ color: C.LAPIS }}>
                    <AnimatedNumber target={funnelMax > 0 ? Math.round(((stats?.totalEmails ?? 0) / funnelMax) * 100) : 0} />%
                  </span>{' '}overall email conversion
                </p>
              </div>
            </div>

            {/* ── Card 2: Top Candidates ── */}
            <div
              className="animate-fade-in-up flex flex-col p-4 rounded-xl"
              style={{
                minHeight: 264, border: `1px solid ${C.BORDER}`,
                animationDelay: '120ms',
                transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = 'translateY(-3px)'
                el.style.boxShadow = '0 6px 20px rgba(137,57,161,0.10)'
                el.style.borderColor = C.PURPLE
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = ''
                el.style.boxShadow = ''
                el.style.borderColor = C.BORDER
              }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: C.GRAD_SCREEN }}>
                  <Trophy className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: C.TEXT }}>Top Candidates</p>
                  <p className="text-xs truncate" style={{ color: C.TEXT_MUTED }}>Best match per role</p>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                {topCandidates.length === 0 ? (
                  <p className="text-xs" style={{ color: C.TEXT_MUTED }}>No evaluations yet.</p>
                ) : topCandidates.map((c) => (
                  <div key={`${c.jobTitle}-${c.candidateId}`}>
                    <p className="text-xs font-semibold mb-0.5 truncate" style={{ color: C.TEXT }}>{c.jobTitle}</p>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs truncate" style={{ color: C.TEXT_SUBTLE }}>
                        {cleanFileName(c.fileName)}
                      </span>
                      <span className="text-xs font-bold tabular-nums shrink-0 ml-2"
                            style={{ color: scoreColor(c.matchPercentage) }}>
                        <AnimatedNumber target={c.matchPercentage} />%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.DIVIDER }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${c.matchPercentage}%`, backgroundColor: scoreColor(c.matchPercentage) }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
                <p className="text-xs" style={{ color: C.TEXT_MUTED }}>
                  <span className="font-semibold" style={{ color: C.LAPIS }}>
                    <AnimatedNumber target={shortlistCount} />
                  </span>{' '}shortlisted across all roles
                </p>
              </div>
            </div>

            {/* ── Card 3: AI Hiring Insights ── */}
            <div
              className="animate-fade-in-up flex flex-col p-4 rounded-xl"
              style={{
                minHeight: 264, border: `1px solid ${C.BORDER}`,
                animationDelay: '180ms',
                transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = 'translateY(-3px)'
                el.style.boxShadow = '0 6px 20px rgba(19,62,73,0.10)'
                el.style.borderColor = C.TEAL
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = ''
                el.style.boxShadow = ''
                el.style.borderColor = C.BORDER
              }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: C.GRAD_GUIDE }}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: C.TEXT }}>AI Insights</p>
                  <p className="text-xs" style={{ color: C.TEXT_MUTED }}>Smart hiring signals</p>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                {[
                  { label: 'Avg Match Score',      num: avgScore,       suffix: '%', show: evaluations.length > 0, accent: C.LAPIS   },
                  { label: 'Strong Matches',        num: strongCount,    suffix: '',  show: evaluations.length > 0, accent: C.SUCCESS },
                  { label: 'Shortlisted',           num: shortlistCount, suffix: '',  show: evaluations.length > 0, accent: C.WARNING },
                  { label: 'Interviews Confirmed',  num: confirmedCount, suffix: '',  show: draftedEmails.length > 0, accent: C.PINK  },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: C.TEXT_MUTED }}>{row.label}</span>
                    <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
                          style={{ color: row.accent, backgroundColor: C.PRIMARY_LIGHT }}>
                      {row.show ? <><AnimatedNumber target={row.num} />{row.suffix}</> : '—'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs" style={{ color: C.TEXT_MUTED }}>Avg match vs. ideal</span>
                  <span className="text-xs font-bold" style={{ color: avgScore >= 65 ? C.SUCCESS : C.WARNING }}>
                    {avgScore > 0 ? <><AnimatedNumber target={avgScore} />%</> : '—'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.DIVIDER }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${avgScore}%`, background: avgScore >= 65 ? C.GRAD_JD : C.GRAD_COMMS }}
                  />
                </div>
              </div>
            </div>

            {/* ── Card 4: Recruitment Metrics ── */}
            <div
              className="animate-fade-in-up flex flex-col p-4 rounded-xl"
              style={{
                minHeight: 264, border: `1px solid ${C.BORDER}`,
                animationDelay: '240ms',
                transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = 'translateY(-3px)'
                el.style.boxShadow = '0 6px 20px rgba(212,47,123,0.10)'
                el.style.borderColor = C.PINK
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.transform = ''
                el.style.boxShadow = ''
                el.style.borderColor = C.BORDER
              }}
            >
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: C.GRAD_COMMS }}>
                  <BarChart2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: C.TEXT }}>Recruitment Metrics</p>
                  <p className="text-xs" style={{ color: C.TEXT_MUTED }}>Platform-wide KPIs</p>
                </div>
              </div>

              <div className="flex-1 space-y-2.5">
                {[
                  { label: 'Open Roles',        value: stats?.totalJobs            ?? 0, max: Math.max(stats?.totalJobs            ?? 1, 1), color: C.INDIGO  },
                  { label: 'Candidates',         value: stats?.totalCandidates      ?? 0, max: Math.max(stats?.totalCandidates      ?? 1, 1), color: C.PURPLE  },
                  { label: 'AI Evaluations',     value: stats?.totalEvaluations     ?? 0, max: Math.max(stats?.totalCandidates      ?? 1, 1), color: C.TEAL    },
                  { label: 'Interview Guides',   value: stats?.totalInterviewGuides ?? 0, max: Math.max(stats?.totalEvaluations     ?? 1, 1), color: C.WARNING },
                  { label: 'Emails Generated',   value: stats?.totalEmails          ?? 0, max: Math.max(stats?.totalCandidates      ?? 1, 1), color: C.PINK    },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: C.TEXT_MUTED }}>{m.label}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: C.TEXT }}>
                        <AnimatedNumber target={m.value} />
                      </span>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: C.DIVIDER }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(Math.round((m.value / m.max) * 100), 100)}%`,
                          backgroundColor: m.color,
                          opacity: 0.8,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
                <p className="text-xs" style={{ color: C.TEXT_MUTED }}>
                  <span className="font-semibold" style={{ color: C.LAPIS }}>
                    <AnimatedNumber target={stats?.totalJobs ?? 0} />
                  </span>{' '}active {(stats?.totalJobs ?? 0) === 1 ? 'role' : 'roles'} in pipeline
                </p>
              </div>
            </div>

          </div>
      </div>


      {/* ════════════════════════════════════════════════════════════════
          COMPACT JD LIST + PRIORITY ACTIONS — two-column layout
      ════════════════════════════════════════════════════════════════ */}
      <div
          className="animate-fade-in-up"
          style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: 500, animationDelay: '160ms' }}
        >
          {/* ── Left: Compact Recent Roles ── */}
          <div
            style={{
              flex: '1 1 50%', background: '#fff',
              border: `1px solid ${C.BORDER}`, borderRadius: 12, padding: 16,
              display: 'flex', flexDirection: 'column', minWidth: 0,
            }}
          >
            {/* Panel heading */}
            <div className="mb-3">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: C.TEXT, margin: 0 }}>Recent Job Descriptions</h2>
              <p style={{ fontSize: 11, color: C.TEXT_MUTED, marginTop: 2 }}>Click any role to preview the full job description</p>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {(['all', 'active', 'draft', 'closed'] as const).map(s => {
                const isActive = compactFilter === s
                return (
                  <button
                    key={s}
                    onClick={() => setCompactFilter(s)}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold transition-all duration-150"
                    style={isActive
                      ? { backgroundColor: C.LAPIS, color: '#fff' }
                      : { backgroundColor: C.DIVIDER, color: C.TEXT_MUTED }
                    }
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = C.PRIMARY_RING }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = C.DIVIDER }}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                    <span style={{
                      fontSize: 10, lineHeight: '14px', padding: '0 4px', borderRadius: 20,
                      backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : C.BORDER,
                      color: isActive ? '#fff' : C.TEXT_MUTED,
                    }}>
                      {statusCounts[s]}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Scrollable list */}
            <div
              style={{
                flex: 1, minHeight: 0, overflowY: 'auto',
                paddingBottom: 10,
                scrollbarWidth: 'thin',
                scrollbarColor: `${C.PRIMARY_RING} ${C.DIVIDER}`,
              }}
              className="compact-jd-scroll"
            >
              <style>{`
                .compact-jd-scroll::-webkit-scrollbar { width: 6px; }
                .compact-jd-scroll::-webkit-scrollbar-track { background: ${C.DIVIDER}; border-radius: 99px; }
                .compact-jd-scroll::-webkit-scrollbar-thumb { background: ${C.PRIMARY_RING}; border-radius: 99px; }
                .compact-jd-scroll::-webkit-scrollbar-thumb:hover { background: ${C.LAPIS}; }
              `}</style>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {compactJobs.map((job) => {
                  const isConfirmingC = confirmingDeleteId === job.id
                  const isDeletingC   = deleteMutation.isPending && deleteMutation.variables === job.id
                  const jobEvals      = evalByJobId[job.id]
                  const evalCount     = jobEvals?.length ?? 0
                  const shortlisted   = jobEvals?.filter(e => e.matchPercentage >= 65).length ?? 0
                  const avgMatch      = evalCount > 0 ? Math.round(jobEvals!.reduce((s, e) => s + e.matchPercentage, 0) / evalCount) : 0
                  const hasGuide      = guideByJobId[job.id] ?? false
                  const accent        = statusAccent(job.status)
                  const isSelected    = selectedJD?.id === job.id
                  const matchColor    = avgMatch >= 65 ? C.SUCCESS_TEXT : avgMatch > 0 ? C.RED : C.TEXT_SUBTLE

                  return (
                    <div
                      key={job.id}
                      onClick={isConfirmingC ? undefined : () => setSelectedJD(job)}
                      className="group"
                      style={{
                        display: 'flex', alignItems: 'stretch', borderRadius: 8, overflow: 'hidden',
                        border: `1px solid ${isConfirmingC ? C.ACCENT_BORDER : isSelected ? C.LAPIS : C.BORDER}`,
                        backgroundColor: isConfirmingC ? C.ACCENT_BG : isSelected ? C.PRIMARY_LIGHT : '#fff',
                        cursor: isConfirmingC ? 'default' : 'pointer',
                        transition: 'background-color 0.12s, border-color 0.12s',
                        minHeight: 52,
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected && !isConfirmingC) {
                          const el = e.currentTarget as HTMLElement
                          el.style.backgroundColor = C.PRIMARY_LIGHT
                          el.style.borderColor = C.PRIMARY_RING
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isConfirmingC) {
                          const el = e.currentTarget as HTMLElement
                          el.style.backgroundColor = isSelected ? C.PRIMARY_LIGHT : '#fff'
                          el.style.borderColor = isSelected ? C.LAPIS : C.BORDER
                        }
                      }}
                    >
                      {/* 4px accent strip */}
                      <div style={{ width: 4, flexShrink: 0, backgroundColor: accent }} />

                      {/* Content */}
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', gap: 4, minWidth: 0 }}>

                        {isConfirmingC ? (
                          /* Delete confirm inline */
                          <div className="flex items-center gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                            {isDeletingC ? <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: C.RED }} /> : (
                              <>
                                <span style={{ fontSize: 11, color: C.TEXT_MUTED }}>Delete this role?</span>
                                <button style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600, color: '#fff', background: C.GRAD_DELETE, border: 'none', cursor: 'pointer' }} onClick={() => deleteMutation.mutate(job.id)}>Confirm</button>
                                <button style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 600, color: C.TEXT_MUTED, background: 'transparent', border: `1px solid ${C.BORDER}`, cursor: 'pointer' }} onClick={() => setConfirmingDeleteId(null)}>Cancel</button>
                              </>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* Left: job info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                {job.jobNumber != null && (
                                  <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 4, background: C.PRIMARY_RING, color: C.LAPIS }}>
                                    #{String(job.jobNumber).padStart(3, '0')}
                                  </span>
                                )}
                                <span style={{ ...statusPill(job.status), fontSize: 10, padding: '1px 5px', borderRadius: 20 }}>
                                  {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, fontWeight: 700, color: C.TEXT, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {job.title}
                              </p>
                              <p style={{ fontSize: 10, color: C.TEXT_MUTED, marginTop: 1 }}>{timeAgo(job.createdAt)}</p>
                            </div>

                            {/* Right: stats + delete */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              {[
                                { val: evalCount > 0 ? String(evalCount) : '—', col: evalCount > 0 ? '#8939A1' : C.TEXT_MUTED, lbl: 'Screened' },
                                { val: evalCount > 0 ? String(shortlisted) : '—', col: evalCount > 0 ? C.LAPIS : C.TEXT_MUTED, lbl: 'Shortlisted' },
                                { val: avgMatch > 0 ? `${avgMatch}%` : '—', col: avgMatch > 0 ? matchColor : C.TEXT_MUTED, lbl: 'Match' },
                              ].map((s, i) => (
                                <React.Fragment key={s.lbl}>
                                  {i > 0 && <div style={{ width: 1, height: 22, backgroundColor: C.BORDER, flexShrink: 0 }} />}
                                  <div style={{ textAlign: 'center', minWidth: 28 }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: s.col, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{s.val}</p>
                                    <p style={{ fontSize: 9, color: C.TEXT_MUTED, marginTop: 1 }}>{s.lbl}</p>
                                  </div>
                                </React.Fragment>
                              ))}
                              <div style={{ width: 1, height: 22, backgroundColor: C.BORDER, flexShrink: 0 }} />
                              <div style={{ textAlign: 'center', minWidth: 22 }}>
                                {hasGuide ? <CheckCircle2 size={13} strokeWidth={2.8} style={{ color: '#16a34a' }} /> : <Circle size={13} style={{ color: C.TEXT_MUTED }} />}
                                <p style={{ fontSize: 9, color: C.TEXT_MUTED, marginTop: 1 }}>Guide</p>
                              </div>
                              {/* Delete */}
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ padding: '2px 4px', borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', color: C.TEXT_SUBTLE, flexShrink: 0 }}
                                onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(job.id) }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.RED; (e.currentTarget as HTMLElement).style.backgroundColor = C.ACCENT_BG }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = C.TEXT_SUBTLE; (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Right: Priority Actions ── */}
          <div
            style={{
              flex: '1 1 50%', background: '#fff',
              border: `1px solid ${C.BORDER}`, borderRadius: 12, padding: 16,
              display: 'flex', flexDirection: 'column', minWidth: 0,
            }}
          >
            {/* Panel heading */}
            <div className="mb-3">
              <h2 style={{ fontSize: 14, fontWeight: 700, color: C.TEXT, margin: 0 }}>Priority Actions</h2>
              <p style={{ fontSize: 11, color: C.TEXT_MUTED, marginTop: 2 }}>Tasks and interviews that need your attention</p>
            </div>

            {/* Action cards or empty state */}
            {priorityActions.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '24px 0' }}>
                <CheckCircle2 size={28} style={{ color: C.SUCCESS }} />
                <p style={{ fontSize: 14, fontWeight: 700, color: C.TEXT }}>All caught up!</p>
                <p style={{ fontSize: 12, color: C.TEXT_MUTED }}>No urgent actions right now.</p>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', gap: 10,
                  flex: 1, minHeight: 0, overflowY: 'auto',
                  paddingRight: 2, paddingBottom: 10,
                  scrollbarWidth: 'thin',
                  scrollbarColor: `${C.PRIMARY_RING} ${C.DIVIDER}`,
                }}
                className="priority-actions-scroll"
              >
                <style>{`
                  .priority-actions-scroll::-webkit-scrollbar { width: 6px; }
                  .priority-actions-scroll::-webkit-scrollbar-track { background: ${C.DIVIDER}; border-radius: 99px; }
                  .priority-actions-scroll::-webkit-scrollbar-thumb { background: ${C.PRIMARY_RING}; border-radius: 99px; }
                  .priority-actions-scroll::-webkit-scrollbar-thumb:hover { background: ${C.LAPIS}; }
                `}</style>
                {(priorityActions as PriorityAction[]).map((action, idx) => {
                  const borderColor = action.priority === 'high' ? C.RED : action.priority === 'medium' ? C.LAPIS : C.WARNING
                  const badgeStyle: React.CSSProperties = action.priority === 'high'
                    ? { backgroundColor: '#fce8e9', color: C.RED }
                    : action.priority === 'medium'
                    ? { backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS }
                    : { backgroundColor: C.WARNING_BG, color: C.WARNING }
                  const badgeLabel = action.priority === 'high' ? 'HIGH PRIORITY' : action.priority === 'medium' ? 'DRAFT' : 'FOLLOW UP'
                  const ActionIcon = action.type === 'upcoming_interview' ? Calendar : action.type === 'draft_jd' ? FileText : AlertCircle
                  const iconColor = action.priority === 'high' ? C.RED : action.priority === 'medium' ? C.LAPIS : C.WARNING
                  const actionLink = action.type === 'draft_jd'
                    ? '/jd-generator'
                    : action.type === 'upcoming_interview'
                    ? `/interview${action.meta.jobId ? `?jobId=${action.meta.jobId}` : ''}`
                    : `/communication${action.meta.jobId ? `?jobId=${action.meta.jobId}` : ''}`

                  const actionLabel = action.type === 'draft_jd' ? 'Go to JD Generator'
                    : action.type === 'upcoming_interview' ? 'View interview guide'
                    : 'Go to Communications'

                  // Countdown for imminent interviews (< 2 hours away)
                  let countdown: string | null = null
                  if (action.type === 'upcoming_interview' && action.meta.startTime) {
                    const msLeft = new Date(action.meta.startTime).getTime() - Date.now()
                    if (msLeft > 0 && msLeft < 2 * 60 * 60 * 1000) {
                      const hLeft = Math.floor(msLeft / 3_600_000)
                      const mLeft = Math.floor((msLeft % 3_600_000) / 60_000)
                      countdown = hLeft > 0 ? `${hLeft}h ${mLeft}m left` : `${mLeft}m left`
                    }
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        borderLeft: `4px solid ${borderColor}`,
                        borderRadius: 8,
                        border: `1px solid ${C.BORDER}`,
                        borderLeftWidth: 4,
                        borderLeftColor: borderColor,
                        padding: '10px 12px',
                        backgroundColor: '#fff',
                      }}
                    >
                      {/* Badge row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span
                          style={{
                            ...badgeStyle,
                            fontSize: 10, fontWeight: 700, padding: '2px 7px',
                            borderRadius: 20, letterSpacing: '0.04em', textTransform: 'uppercase',
                          }}
                        >
                          {badgeLabel}
                        </span>
                        <ActionIcon size={16} style={{ color: iconColor }} />
                      </div>

                      {/* Title + description */}
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.TEXT, marginBottom: 3, lineHeight: 1.3 }}>
                        {action.title}
                      </p>
                      <p style={{ fontSize: 12, color: C.TEXT_MUTED, lineHeight: 1.4 }}>
                        {action.description}
                      </p>

                      {/* Interview time chip */}
                      {action.type === 'upcoming_interview' && action.meta.startTime && (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20,
                            backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS,
                          }}>
                            {new Date(action.meta.startTime).toLocaleString('en-IN', {
                              weekday: 'short', day: 'numeric', month: 'short',
                              hour: '2-digit', minute: '2-digit',
                              timeZone: 'Asia/Kolkata', hour12: true,
                            })} IST
                          </span>
                          {countdown && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.RED }}>
                              ({countdown})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Action link */}
                      <div style={{ marginTop: 8 }}>
                        <a
                          href={actionLink}
                          style={{ fontSize: 12, fontWeight: 600, color: C.LAPIS, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
                        >
                          {actionLabel}
                          {' →'}
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          CANDIDATE INTEREST TRACKER
      ════════════════════════════════════════════════════════════════ */}
      {interestData && (
        <div className="card animate-fade-in-up" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-base" style={{ color: C.TEXT }}>Candidate Interest Tracker</h2>
              <p className="text-xs mt-0.5" style={{ color: C.TEXT_MUTED }}>
                Track whether older candidates are still looking
              </p>
            </div>
            <a
              href="/resume-screener"
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: C.LAPIS, backgroundColor: C.PRIMARY_LIGHT }}
            >
              Manage
            </a>
          </div>

          {/* ── Summary badges ── */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {([
              {
                label: 'Interested',
                value: interestData.stats.interested,
                icon:  UserCheck,
                color: C.SUCCESS,
                bg:    C.SUCCESS_BG,
              },
              {
                label: 'Awaiting Reply',
                value: interestData.stats.checked,
                icon:  Clock,
                color: C.WARNING,
                bg:    C.WARNING_BG,
              },
              {
                label: 'Not Looking',
                value: interestData.stats.not_looking,
                icon:  UserX,
                color: C.TEXT_MUTED,
                bg:    C.DIVIDER,
              },
            ] as const).map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-3 flex flex-col items-center gap-1.5"
                style={{ backgroundColor: s.bg }}
              >
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
                <p className="text-2xl font-black tabular-nums leading-none" style={{ color: s.color }}>
                  <AnimatedNumber target={s.value} />
                </p>
                <p className="text-xs font-medium text-center" style={{ color: s.color }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* ── Recent "interested" candidates ── */}
          {interestData.recentInterested.length > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.TEXT_SUBTLE }}>
                Recently Responded — Interested
              </p>
              <div className="space-y-2">
                {interestData.recentInterested.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-xl"
                    style={{ backgroundColor: C.SUCCESS_BG }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: C.GRAD_JD }}
                    >
                      <UserCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: C.TEXT }}>
                        {c.displayName}
                      </p>
                      <p className="text-xs truncate" style={{ color: C.TEXT_MUTED }}>
                        {c.jobTitle}
                      </p>
                    </div>
                    {c.respondedAt && (
                      <span className="text-xs shrink-0" style={{ color: C.TEXT_SUBTLE }}>
                        {timeAgo(c.respondedAt)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6">
              <Bell className="w-8 h-8" style={{ color: C.TEXT_SUBTLE }} />
              <p className="text-sm" style={{ color: C.TEXT_MUTED }}>No interest responses yet.</p>
              <p className="text-xs text-center max-w-xs" style={{ color: C.TEXT_SUBTLE }}>
                Go to Resume Screener → expand a candidate → click "Check Interest" to send a one-click email.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          EMPTY STATE
      ════════════════════════════════════════════════════════════════ */}
      {jobsLoaded && jobs.length === 0 && (
        <div className="card text-center py-16 animate-fade-in">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #1B1F4E, #7B2D8E)', boxShadow: '0 6px 20px rgba(123,45,142,0.35)' }}
          >
            <FileText className="w-7 h-7 text-white" />
          </div>
          <p className="font-bold text-base mb-1.5" style={{ color: C.TEXT }}>
            No job descriptions yet
          </p>
          <p className="text-sm mb-6" style={{ color: C.TEXT_MUTED }}>
            Generate your first AI-powered JD to get started
          </p>
          <a href="/jd-generator" className="btn-gradient">
            <Plus className="w-4 h-4" />
            Generate your first JD
          </a>
        </div>
      )}

      <JDDetailModal jd={selectedJD} onClose={() => setSelectedJD(null)} />
    </div>
  )
}
