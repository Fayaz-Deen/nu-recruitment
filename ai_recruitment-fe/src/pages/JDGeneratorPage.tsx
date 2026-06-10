import { C } from '../tokens'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { jdApi } from '../services/api'
import { JDInput, JobDescription } from '../types'
import toast from 'react-hot-toast'
import {
  Wand2, Plus, X, Briefcase, CheckCircle2,
  Star, Gift, Target, MapPin, Users, ArrowRight,
} from 'lucide-react'
import ProfileBanner from '../components/ProfileBanner'

const EMPTY_FORM: JDInput = {
  roleTitle:         '',
  yearsExperience:   3,
  teamSize:          5,
  keySkills:         [],
  location:          '',
  additionalContext: '',
}

export default function JDGeneratorPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<JDInput>(EMPTY_FORM)
  const [skillInput,  setSkillInput]  = useState('')
  const [generatedJD, setGeneratedJD] = useState<JobDescription | null>(null)

  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: jdApi.generate,
    onSuccess: (data) => {
      setGeneratedJD(data)
      queryClient.invalidateQueries({ queryKey: ['stats']   })
      queryClient.invalidateQueries({ queryKey: ['jd-list'] })
      toast.success('Job description generated!')
    },
    onError: (error: unknown) => {
      const msg =
        (error as any)?.response?.data?.error ??
        'Failed to generate. Check your API key in backend .env';
      toast.error(msg);
    },
  })

  const addSkill = () => {
    if (skillInput.trim() && !form.keySkills.includes(skillInput.trim())) {
      setForm((f) => ({ ...f, keySkills: [...f.keySkills, skillInput.trim()] }))
      setSkillInput('')
    }
  }

  return (
    <div className="max-w-5xl animate-fade-in-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>JD Generator</h1>
        <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>Generate a compelling job description with AI</p>
      </div>

      <ProfileBanner />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children">

        {/* ── Left — Form ──────────────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="font-bold" style={{ color: C.TEXT }}>Role Details</h2>

          <div>
            <label className="label">Role Title *</label>
            <input
              className="input"
              placeholder="e.g. Senior Salesforce Commerce Cloud Engineer"
              value={form.roleTitle}
              onChange={(e) => setForm((f) => ({ ...f, roleTitle: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Years Experience</label>
              <input
                type="number" className="input" min={0} max={20}
                value={form.yearsExperience}
                onChange={(e) => setForm((f) => ({ ...f, yearsExperience: +e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Team Size</label>
              <input
                type="number" className="input" min={1}
                value={form.teamSize}
                onChange={(e) => setForm((f) => ({ ...f, teamSize: +e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="label">Key Skills *</label>
            <div className="flex gap-2 mb-2">
              <input
                className="input"
                placeholder="Type a skill and press Enter"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
              />
              <button className="btn-secondary px-3" onClick={addSkill}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {form.keySkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.keySkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold animate-scale-in"
                    style={{ backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS, border: `1px solid ${C.PRIMARY_RING}` }}
                  >
                    {skill}
                    <button
                      className="ml-0.5 transition-colors"
                    style={{ color: 'rgba(5,7,102,0.4)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.LAPIS }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(5,7,102,0.4)' }}
                      onClick={() => setForm((f) => ({ ...f, keySkills: f.keySkills.filter((s) => s !== skill) }))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="label">
              <MapPin className="w-3.5 h-3.5 inline mr-1" style={{ color: C.TEXT_MUTED }} />
              Location <span className="font-normal" style={{ color: C.TEXT_MUTED }}>(optional)</span>
            </label>
            <input
              className="input"
              placeholder="e.g. Remote, Chennai, Hybrid"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">
              Additional Context <span className="font-normal" style={{ color: C.TEXT_MUTED }}>(optional)</span>
            </label>
            <textarea
              className="input resize-none" rows={3}
              placeholder="Any specific requirements, culture notes, or context…"
              value={form.additionalContext}
              onChange={(e) => setForm((f) => ({ ...f, additionalContext: e.target.value }))}
            />
          </div>

          <button
            className="btn-primary w-full justify-center py-3"
            disabled={!form.roleTitle || !form.keySkills.length || mutation.isPending}
            onClick={() => mutation.mutate(form)}
          >
            <Wand2 className="w-4 h-4" />
            {mutation.isPending ? 'Generating…' : 'Generate Job Description'}
          </button>
        </div>

        {/* ── Right — Preview ───────────────────────────────────────── */}
        <div className="card overflow-auto max-h-[760px]">

          {/* Generating state — skeleton mirrors the generated JD layout */}
          {mutation.isPending && (
            <div className="space-y-5" aria-busy="true">
              <p className="text-xs" style={{ color: C.TEXT_MUTED }}>Writing your job description with AI</p>
              <div className="pb-4 space-y-2.5" style={{ borderBottom: `1px solid ${C.DIVIDER}` }}>
                <div className="h-5 w-2/3 rounded animate-pulse" style={{ backgroundColor: C.SKELETON }} />
                <div className="h-3 w-full rounded animate-pulse" style={{ backgroundColor: C.SKELETON }} />
                <div className="h-3 w-5/6 rounded animate-pulse" style={{ backgroundColor: C.SKELETON }} />
              </div>
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="space-y-2">
                  <div className="h-3 w-36 rounded animate-pulse" style={{ backgroundColor: C.SKELETON }} />
                  <div className="h-3 w-full rounded animate-pulse" style={{ backgroundColor: C.SKELETON }} />
                  <div className="h-3 w-11/12 rounded animate-pulse" style={{ backgroundColor: C.SKELETON }} />
                  <div className="h-3 w-4/5 rounded animate-pulse" style={{ backgroundColor: C.SKELETON }} />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!mutation.isPending && !generatedJD && (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: C.PRIMARY_LIGHT }}
              >
                <Briefcase className="w-6 h-6" style={{ color: C.TEXT_SUBTLE }} />
              </div>
              <p className="text-sm font-medium" style={{ color: C.TEXT_MUTED }}>Your generated JD will appear here</p>
              <p className="text-xs mt-1" style={{ color: C.TEXT_MUTED, opacity: 0.6 }}>Fill in the role details and click generate</p>
            </div>
          )}

          {/* Generated JD */}
          {!mutation.isPending && generatedJD && (
            <div className="space-y-5 animate-fade-in-up">

              {/* Title + status */}
              <div className="pb-4" style={{ borderBottom: `1px solid ${C.BORDER}` }}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold leading-snug" style={{ color: C.TEXT }}>{generatedJD.title}</h2>
                  <span className="badge-yellow shrink-0 mt-0.5">{generatedJD.status}</span>
                </div>
                {generatedJD.companyOverview && (
                  <p className="text-sm mt-2 leading-relaxed" style={{ color: C.TEXT_MUTED }}>{generatedJD.companyOverview}</p>
                )}
              </div>

              <JDSection icon={Target} title="Role Overview">
                <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>{generatedJD.roleOverview}</p>
              </JDSection>

              <JDSection icon={Users} title="Responsibilities">
                <BulletList items={generatedJD.responsibilities} bullet="▸" />
              </JDSection>

              <JDSection icon={CheckCircle2} title="Required Qualifications">
                <BulletList items={generatedJD.requiredQualifications} bullet="✓" />
              </JDSection>

              <JDSection icon={Star} title="Nice to Haves">
                <BulletList items={generatedJD.niceToHaves} bullet="◦" />
              </JDSection>

              <JDSection icon={Gift} title="Benefits">
                <BulletList items={generatedJD.benefits} bullet="◦" />
              </JDSection>
            </div>
          )}
        </div>
      </div>
      {generatedJD && !mutation.isPending && (
        <div className="flex justify-end gap-3 mt-6 animate-fade-in-up">
          <button
            className="btn-secondary py-2.5 px-5"
            onClick={() => {
              setGeneratedJD(null)
              mutation.reset()
              setForm(EMPTY_FORM)
              setSkillInput('')
            }}
          >
            <Wand2 className="w-4 h-4" />
            Generate more JDs
          </button>
          <button
            className="btn-primary py-2.5 px-5"
            onClick={() => navigate('/resume-screener')}
          >
            Next: Resume Screener
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function JDSection({
  icon: Icon, title, children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="w-4 h-4 shrink-0" style={{ color: C.LAPIS }} />
        <h3 className="section-label">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function BulletList({ items, bullet }: { items: string[]; bullet: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm" style={{ color: C.TEXT_MUTED }}>
          <span className="shrink-0 mt-0.5 select-none" style={{ color: C.TEXT_SUBTLE }}>{bullet}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
