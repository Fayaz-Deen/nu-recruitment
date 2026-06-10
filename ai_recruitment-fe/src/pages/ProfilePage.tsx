import { useState, useRef, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  User, Users, Building2, Lock, Save, CheckCircle,
  AlertTriangle, Globe, MapPin, Briefcase, Phone, Mail,
  Tag, TriangleAlert, ImageIcon, X, Upload,
} from 'lucide-react'
import toast from 'react-hot-toast'
import DOMPurify from 'dompurify'
import { companyApi, emailTemplatesApi, usersApi } from '../services/api'
import { getApiErrorMessage } from '../lib/errors'
import type { CompanyProfile, EmailTemplate } from '../types'
import TagInput from '../components/TagInput'
import { C } from '../tokens'
import { useAuth } from '../contexts/AuthContext'
import UsersPage from './UsersPage'

const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Retail & E-commerce', 'Manufacturing',
  'Education', 'Media & Entertainment', 'Logistics', 'Real Estate', 'Consulting',
  'Energy', 'Government', 'Non-profit', 'Other',
]

const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+']

const SERVICES_SUGGESTIONS = [
  'Software Development', 'IT Consulting', 'Cloud Services', 'Mobile Development',
  'Data Analytics', 'UX/UI Design', 'DevOps', 'AI/ML Solutions', 'Cybersecurity',
  'Digital Marketing', 'E-commerce', 'SaaS', 'API Development', 'QA Testing',
  'System Integration', 'Business Intelligence', 'IoT Solutions', 'Blockchain',
  'ERP Solutions', 'CRM Development', 'Product Design', 'Staff Augmentation',
]

const TECH_STACK_SUGGESTIONS = [
  'React', 'Vue.js', 'Angular', 'Next.js', 'Svelte', 'Node.js', 'Express',
  'Python', 'Django', 'FastAPI', 'Flask', 'Java', 'Spring Boot', 'Kotlin',
  'TypeScript', 'Go', 'Rust', 'Ruby on Rails', 'PHP', 'Laravel', '.NET', 'C#',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'SQLite',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'GraphQL',
  'REST API', 'gRPC', 'GitHub Actions', 'Jenkins', 'CircleCI', 'Kafka',
]

const CULTURE_SUGGESTIONS = [
  'Engineering-first', 'Remote-friendly', 'Work-life balance', 'Innovation-driven',
  'Customer-obsessed', 'Diversity & Inclusion', 'Continuous learning', 'Agile',
  'Ownership mindset', 'Transparency', 'Collaboration', 'Move fast',
  'Quality-first', 'Data-driven', 'Empathy', 'Trust-based', 'Flat hierarchy',
  'Psychological safety', 'Feedback culture', 'Inclusive environment',
]

const BENEFITS_SUGGESTIONS = [
  'Health insurance', 'Dental coverage', 'Vision coverage', 'Learning budget',
  'Flexible hours', 'Remote work', 'Stock options', '401(k)', 'Paid parental leave',
  'Unlimited PTO', 'Gym membership', 'Mental health support', 'Home office stipend',
  'Annual retreats', 'Performance bonuses', 'Commuter benefits', 'Life insurance',
  'Team lunches', 'Sabbatical leave', 'Childcare support',
]

const REQUIRED_AI_FIELDS: { key: keyof CompanyProfile; label: string }[] = [
  { key: 'name',          label: 'Company name'     },
  { key: 'overview',      label: 'Company overview' },
  { key: 'industry',      label: 'Industry'         },
]

const OPTIONAL_AI_FIELDS: { key: keyof CompanyProfile; label: string }[] = [
  { key: 'tagline',       label: 'Tagline'          },
  { key: 'companySize',   label: 'Company size'     },
  { key: 'location',      label: 'Location'         },
  { key: 'recruiterName', label: 'Recruiter name'   },
  { key: 'contactEmail',  label: 'Contact email'    },
  { key: 'techStack',     label: 'Tech stack'       },
  { key: 'services',      label: 'Services'         },
  { key: 'cultureValues', label: 'Culture values'   },
  { key: 'benefits',      label: 'Benefits'         },
]

function computeCompleteness(p: CompanyProfile) {
  const isListFilled = (v: unknown) => Array.isArray(v) && v.length > 0
  const isStrFilled  = (v: unknown) => typeof v === 'string' && v.trim().length > 0

  const allFields = [...REQUIRED_AI_FIELDS, ...OPTIONAL_AI_FIELDS]
  let filled = 0
  const missing: string[] = []

  for (const { key, label } of allFields) {
    const val = p[key]
    const ok = isListFilled(val) || isStrFilled(val) || (typeof val === 'number' && val > 0)
    if (ok) filled++
    else missing.push(label)
  }

  const score = Math.round((filled / allFields.length) * 100)
  const requiredMissing = REQUIRED_AI_FIELDS.filter(({ key }) => !isStrFilled(p[key])).map(f => f.label)
  return { score, isComplete: requiredMissing.length === 0, missing, requiredMissing }
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'password' | 'company' | 'team' | 'templates'

export default function ProfilePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('profile')

  const isAdmin = user?.role === 'super_admin' || user?.role === 'hr_admin'

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'profile',   label: 'Your Profile',    icon: User      },
    { id: 'password',  label: 'Change Password',  icon: Lock      },
    ...(isAdmin ? [
      { id: 'company'   as Tab, label: 'Company Profile',  icon: Building2 },
      { id: 'team'      as Tab, label: 'Team Members',     icon: Users     },
      { id: 'templates' as Tab, label: 'Email Templates',  icon: Mail      },
    ] : []),
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight" style={{ color: C.TEXT }}>Settings</h1>
        <p className="text-sm mt-1" style={{ color: C.TEXT_MUTED }}>
          Manage your profile and company information used by the AI agents.
        </p>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-2xl"
        style={{ backgroundColor: C.BG, border: `1px solid ${C.BORDER}` }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex-1"
            style={{
              backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? C.LAPIS : C.TEXT_MUTED,
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'company' ? (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <CompanyProfileSection />
          </div>
          <div className="col-span-1">
            <CompletenessCard />
          </div>
        </div>
      ) : activeTab === 'team' ? (
        <UsersPage />
      ) : activeTab === 'templates' ? (
        <EmailTemplatesSection />
      ) : (
        <div className="max-w-2xl">
          {activeTab === 'profile'  && <UserProfileSection />}
          {activeTab === 'password' && <ChangePasswordSection />}
        </div>
      )}
    </div>
  )
}

// ── User profile ──────────────────────────────────────────────────────────────

function UserProfileSection() {
  const { user, updateUser } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <Card icon={User} title="Your Profile">
      <div className="space-y-4">
        <Field label="Display name">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input w-full"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={user?.email ?? ''}
            readOnly
            className="input w-full"
            style={{ backgroundColor: C.BG, color: C.TEXT_MUTED, cursor: 'not-allowed' }}
          />
          <p className="text-xs mt-1" style={{ color: C.TEXT_SUBTLE }}>Email cannot be changed.</p>
        </Field>
        <Field label="Role">
          <input
            type="text"
            value={user?.role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? ''}
            readOnly
            className="input w-full"
            style={{ backgroundColor: C.BG, color: C.TEXT_MUTED, cursor: 'not-allowed' }}
          />
        </Field>
        <div className="flex justify-end">
          <button
            disabled={saving || name === user?.name}
            className="btn-primary px-5 py-2 flex items-center gap-2 text-sm"
            onClick={async () => {
              setSaving(true)
              try {
                const updated = await usersApi.updateMe({ name: name.trim() })
                updateUser(updated)
                toast.success('Profile updated')
              } catch (err) {
                toast.error(getApiErrorMessage(err, 'Failed to update profile'))
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Save className="w-4 h-4" /> Save</>
            }
          </button>
        </div>
      </div>
    </Card>
  )
}

// ── Change password ───────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('New passwords do not match'); return }
    if (next.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true)
    try {
      const result = await usersApi.changePassword(current, next)
      toast.success(result.message ?? 'Password updated')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update password'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card icon={Lock} title="Change Password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Current password">
          <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required className="input w-full" placeholder="••••••••" />
        </Field>
        <Field label="New password">
          <input type="password" value={next} onChange={e => setNext(e.target.value)} required className="input w-full" placeholder="Min. 8 characters" />
        </Field>
        <Field label="Confirm new password">
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required className="input w-full" placeholder="Repeat new password" />
        </Field>
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary px-5 py-2 flex items-center gap-2 text-sm">
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Lock className="w-4 h-4" /> Update password</>
            }
          </button>
        </div>
      </form>
    </Card>
  )
}

// ── Company profile ───────────────────────────────────────────────────────────

function CompanyProfileSection() {
  const qc = useQueryClient()

  const { data: company, isLoading } = useQuery({
    queryKey: ['company'],
    queryFn: companyApi.get,
  })

  const mutation = useMutation({
    mutationFn: companyApi.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company'] })
      qc.invalidateQueries({ queryKey: ['company-completeness'] })
      toast.success('Company profile saved')
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, 'Save failed')
      toast.error(msg)
    },
  })

  if (isLoading || !company) {
    return (
      <Card icon={Building2} title="Company Profile">
        <div className="py-8 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: C.LAPIS, borderTopColor: 'transparent' }} />
        </div>
      </Card>
    )
  }

  return <CompanyForm company={company} saving={mutation.isPending} onSave={data => mutation.mutate(data)} />
}

function CompanyForm({
  company, saving, onSave,
}: {
  company: CompanyProfile
  saving: boolean
  onSave: (data: Partial<CompanyProfile>) => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<CompanyProfile>({ ...company })
  const set = (key: keyof CompanyProfile, val: unknown) =>
    setForm(f => ({ ...f, [key]: val }))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSave(form)
  }

  return (
    <Card icon={Building2} title="Company Profile">
      <p className="text-xs mb-5 px-3 py-2.5 rounded-xl" style={{ backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS }}>
        This information is injected into every AI prompt. JD generation, resume screening, interview guides, and candidate emails all use it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company name *">
            <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Acme Inc." className="input w-full" />
          </Field>
          <Field label="Tagline">
            <input value={form.tagline} onChange={e => set('tagline', e.target.value)} placeholder="What you do in one line" className="input w-full" />
          </Field>
        </div>

        <Field label="Company overview *">
          <textarea
            value={form.overview}
            onChange={e => set('overview', e.target.value)}
            required
            rows={4}
            placeholder="2–3 paragraphs describing the company, products, culture, and what makes it unique. This is the primary context the AI uses."
            className="input w-full resize-none"
          />
          <p className="text-xs mt-1 tabular-nums" style={{ color: C.TEXT_MUTED }}>
            {form.overview.length} / 3000 chars. More detail improves AI output.
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Industry *">
            <select value={form.industry} onChange={e => set('industry', e.target.value)} required className="input w-full">
              <option value="">Select industry</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Company size">
            <select value={form.companySize} onChange={e => set('companySize', e.target.value)} className="input w-full">
              <option value="">Select size</option>
              {COMPANY_SIZES.map(s => <option key={s} value={s}>{s} employees</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={<><MapPin className="w-3.5 h-3.5 inline mr-1" />Location</>}>
            <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="City, Country" className="input w-full" />
          </Field>
          <Field label={<><Globe className="w-3.5 h-3.5 inline mr-1" />Website</>}>
            <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://company.com" className="input w-full" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Work mode">
            <div className="flex gap-2">
              {(['remote', 'hybrid', 'onsite'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set('workMode', mode)}
                  className="flex-1 py-2 text-xs font-medium rounded-xl capitalize transition-all"
                  style={{
                    backgroundColor: form.workMode === mode ? C.LAPIS : C.PRIMARY_LIGHT,
                    color: form.workMode === mode ? 'white' : C.LAPIS,
                    border: `1.5px solid ${form.workMode === mode ? C.LAPIS : C.BORDER}`,
                  }}
                >
                  {mode}
                </button>
              ))}
            </div>
          </Field>
          <Field label={<><Briefcase className="w-3.5 h-3.5 inline mr-1" />Founded year</>}>
            <input
              type="number"
              value={form.foundedYear ?? ''}
              onChange={e => set('foundedYear', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="2005"
              min={1800}
              max={new Date().getFullYear()}
              className="input w-full"
            />
          </Field>
        </div>

        <Divider label="AI Context, used in every prompt" />

        <Field label="Services / Products">
          <TagInput
            value={form.services}
            onChange={v => set('services', v)}
            placeholder="Search or add a service…"
            suggestions={SERVICES_SUGGESTIONS}
          />
        </Field>

        <Field label="Tech stack">
          <TagInput
            value={form.techStack}
            onChange={v => set('techStack', v)}
            placeholder="Search or add a technology…"
            suggestions={TECH_STACK_SUGGESTIONS}
          />
        </Field>

        <Field label="Culture values">
          <TagInput
            value={form.cultureValues}
            onChange={v => set('cultureValues', v)}
            placeholder="Search or add a value…"
            suggestions={CULTURE_SUGGESTIONS}
          />
        </Field>

        <Field label="Benefits">
          <TagInput
            value={form.benefits}
            onChange={v => set('benefits', v)}
            placeholder="Search or add a benefit…"
            suggestions={BENEFITS_SUGGESTIONS}
          />
        </Field>

        <Divider label="Branding" />

        <div className="grid grid-cols-2 gap-4">
          <ImageUploadBox
            label="Company Logo"
            hint="Recommended: 400×120 px, transparent background. PNG, SVG or WebP preferred. Max 2 MB."
            value={form.logoUrl}
            aspect="wide"
            onUpload={async (file) => {
              const result = await companyApi.uploadLogo(file)
              setForm(f => ({ ...f, logoUrl: result.logoUrl }))
              qc.invalidateQueries({ queryKey: ['company'] })
            }}
            onRemove={async () => {
              await companyApi.removeLogo()
              setForm(f => ({ ...f, logoUrl: null }))
              qc.invalidateQueries({ queryKey: ['company'] })
            }}
          />
          <ImageUploadBox
            label="Favicon"
            hint="Recommended: 64×64 px square (equal width & height). ICO or PNG preferred. Max 2 MB."
            value={form.faviconUrl}
            aspect="square"
            onUpload={async (file) => {
              const result = await companyApi.uploadFavicon(file)
              setForm(f => ({ ...f, faviconUrl: result.faviconUrl }))
              qc.invalidateQueries({ queryKey: ['company'] })
            }}
            onRemove={async () => {
              await companyApi.removeFavicon()
              setForm(f => ({ ...f, faviconUrl: null }))
              qc.invalidateQueries({ queryKey: ['company'] })
            }}
          />
        </div>

        <Divider label="Contact details" />

        <div className="grid grid-cols-2 gap-4">
          <Field label={<><Mail className="w-3.5 h-3.5 inline mr-1" />Recruitment email</>}>
            <input type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="talent@company.com" className="input w-full" />
          </Field>
          <Field label={<><Phone className="w-3.5 h-3.5 inline mr-1" />Phone</>}>
            <input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="+1 (555) 000-0000" className="input w-full" />
          </Field>
        </div>

        <Field label="Default recruiter name">
          <input value={form.recruiterName} onChange={e => set('recruiterName', e.target.value)} placeholder="Used in AI-generated emails e.g. Alex Morgan" className="input w-full" />
          <p className="text-xs mt-1" style={{ color: C.TEXT_MUTED }}>This name signs off all AI-drafted candidate emails.</p>
        </Field>

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={saving} className="btn-primary px-6 py-2.5 flex items-center gap-2">
            {saving
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Save className="w-4 h-4" /> Save company profile</>
            }
          </button>
        </div>
      </form>
    </Card>
  )
}

// ── Completeness card ─────────────────────────────────────────────────────────

function CompletenessCard() {
  const { data: company } = useQuery({ queryKey: ['company'], queryFn: companyApi.get })

  if (!company) return null

  const { score, isComplete, missing, requiredMissing } = computeCompleteness(company)
  const barColor = score >= 80 ? C.SUCCESS : score >= 50 ? C.WARNING : C.RED

  return (
    <div
      className="bg-white rounded-2xl p-5 sticky top-6"
      style={{ border: `1px solid ${C.BORDER}` }}
    >
      <h3 className="text-sm font-semibold mb-1" style={{ color: C.TEXT }}>AI Context Completeness</h3>
      <p className="text-xs mb-4" style={{ color: C.TEXT_MUTED }}>
        More complete = better AI output across all features.
      </p>

      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="font-display text-2xl font-semibold tabular-nums" style={{ color: C.TEXT }}>{score}%</span>
          <p className="text-xs font-semibold" style={{ color: isComplete ? C.SUCCESS : C.WARNING }}>
            {isComplete ? 'Ready for AI' : 'Needs attention'}
          </p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.DIVIDER }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${score}%`, backgroundColor: barColor }}
          />
        </div>
        <p className="text-xs mt-2 tabular-nums" style={{ color: C.TEXT_MUTED }}>
          {REQUIRED_AI_FIELDS.length + OPTIONAL_AI_FIELDS.length - missing.length} / {REQUIRED_AI_FIELDS.length + OPTIONAL_AI_FIELDS.length} fields filled
        </p>
      </div>

      {requiredMissing.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold mb-2 flex items-center gap-1" style={{ color: C.RED }}>
            <AlertTriangle className="w-3.5 h-3.5" /> Required for AI
          </p>
          {requiredMissing.map(f => (
            <div key={f} className="flex items-center gap-1.5 text-xs mb-1" style={{ color: C.RED }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: C.RED }} />
              {f}
            </div>
          ))}
        </div>
      )}

      {missing.filter(f => !requiredMissing.includes(f)).length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: C.TEXT_MUTED }}>
            Improves AI quality
          </p>
          {missing.filter(f => !requiredMissing.includes(f)).map(f => (
            <div key={f} className="flex items-center gap-1.5 text-xs mb-1" style={{ color: C.TEXT_MUTED }}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: C.TEXT_SUBTLE }} />
              {f}
            </div>
          ))}
        </div>
      )}

      {isComplete && (
        <div className="flex items-center gap-2 mt-3 text-xs font-medium" style={{ color: C.SUCCESS }}>
          <CheckCircle className="w-4 h-4" />
          All AI fields complete
        </div>
      )}

      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
        <p className="text-xs" style={{ color: C.TEXT_SUBTLE }}>
          Company overview, industry and name are used in every AI prompt. Tech stack and culture values improve screening accuracy.
        </p>
      </div>
    </div>
  )
}

// ── Email Templates ───────────────────────────────────────────────────────────

function EmailTemplatesSection() {
  const qc = useQueryClient()
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: emailTemplatesApi.list,
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const selected = templates.find(t => t.key === selectedKey) ?? templates[0] ?? null

  if (isLoading) {
    return (
      <Card icon={Mail} title="Email Templates">
        <div className="py-10 flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: C.LAPIS, borderTopColor: 'transparent' }} />
        </div>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Template list */}
      <div className="col-span-1 space-y-2">
        {templates.map(t => (
          <button
            key={t.key}
            onClick={() => setSelectedKey(t.key)}
            className="w-full text-left px-4 py-3 rounded-xl transition-all"
            style={{
              backgroundColor: (selected?.key === t.key) ? C.PRIMARY_LIGHT : 'white',
              border: `1.5px solid ${(selected?.key === t.key) ? C.LAPIS : C.BORDER}`,
              color: C.TEXT,
            }}
          >
            <p className="text-sm font-medium">{t.name}</p>
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: C.TEXT_MUTED }}>{t.description}</p>
            {t.updated_by_name && (
              <p className="text-xs mt-1.5" style={{ color: C.TEXT_SUBTLE }}>
                {t.updated_by_name}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="col-span-2">
        {selected
          ? <EmailTemplateEditor
              key={selected.key}
              template={selected}
              onSaved={() => qc.invalidateQueries({ queryKey: ['email-templates'] })}
            />
          : <div className="bg-white rounded-2xl p-8 text-center" style={{ border: `1px solid ${C.BORDER}`, color: C.TEXT_MUTED }}>
              Select a template to edit
            </div>
        }
      </div>
    </div>
  )
}

function EmailTemplateEditor({
  template, onSaved,
}: {
  template: EmailTemplate
  onSaved: () => void
}) {
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody]       = useState(template.body)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = subject !== template.subject || body !== template.body

  const mutation = useMutation({
    mutationFn: () => emailTemplatesApi.update(template.key, { subject, body }),
    onSuccess: () => {
      toast.success('Template saved')
      onSaved()
      setConfirmOpen(false)
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, 'Save failed')
      toast.error(msg)
      setConfirmOpen(false)
    },
  })

  function insertVariable(varKey: string) {
    const tag = `{{${varKey}}}`
    const el = bodyRef.current
    if (!el) {
      setBody(b => b + tag)
      return
    }
    const start = el.selectionStart ?? body.length
    const end   = el.selectionEnd   ?? body.length
    const next  = body.slice(0, start) + tag + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + tag.length, start + tag.length)
    })
  }

  return (
    <div className="space-y-4">
      <Card icon={Mail} title={template.name}>
        <p className="text-xs mb-4 px-3 py-2.5 rounded-xl" style={{ backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS }}>
          {template.description}
        </p>

        {/* Subject */}
        <Field label="Subject">
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="input-field w-full"
            placeholder="Email subject line"
          />
        </Field>

        {/* Variables chip bar */}
        <div className="mt-4 mb-2">
          <p className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: C.TEXT_MUTED }}>
            <Tag className="w-3.5 h-3.5" />
            Available variables. Click to insert at cursor.
          </p>
          <div className="flex flex-wrap gap-2">
            {template.variables.map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                title={`${v.description}\nExample: ${v.example}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono transition-all"
                style={{
                  backgroundColor: C.PRIMARY_LIGHT,
                  color: C.LAPIS,
                  border: `1px solid ${C.BORDER}`,
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#dce0f8')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.PRIMARY_LIGHT)}
              >
                {`{{${v.key}}}`}
                <span className="text-xs font-sans ml-1" style={{ color: C.TEXT_MUTED }}>{v.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <Field label="Body (HTML supported)">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={12}
            className="input-field w-full resize-y font-mono text-xs"
            placeholder="<p>Hi {{user_name}},</p>..."
          />
        </Field>

        {/* Preview of rendered output */}
        <div className="mt-3">
          <p className="text-xs font-medium mb-1.5" style={{ color: C.TEXT_MUTED }}>Preview</p>
          <div
            className="text-sm rounded-xl p-4 overflow-auto"
            style={{
              border: `1px solid ${C.BORDER}`,
              backgroundColor: C.BG,
              color: C.TEXT,
              maxHeight: 200,
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }}
          />
        </div>

        {/* Save */}
        <div className="flex items-center justify-between mt-5 pt-4" style={{ borderTop: `1px solid ${C.DIVIDER}` }}>
          <div>
            {template.updated_by_name && (
              <p className="text-xs tabular-nums" style={{ color: C.TEXT_SUBTLE }}>
                Last edited by {template.updated_by_name} ({template.updated_by_email}) on{' '}
                {new Date(template.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            )}
          </div>
          <button
            disabled={!isDirty || mutation.isPending}
            onClick={() => setConfirmOpen(true)}
            className="btn-primary px-5 py-2 flex items-center gap-2 text-sm"
          >
            {mutation.isPending
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <><Save className="w-4 h-4" /> Save template</>
            }
          </button>
        </div>
      </Card>

      {/* Confirm save warning modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6"
            style={{ border: `1px solid ${C.BORDER}`, boxShadow: '0 4px 8px rgba(15, 22, 64, 0.10)' }}
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: '#FEF3C7' }}
              >
                <TriangleAlert className="w-4 h-4" style={{ color: '#D97706' }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: C.TEXT }}>Update email template?</h3>
                <p className="text-sm" style={{ color: C.TEXT_MUTED }}>
                  This will immediately affect all future <strong>{template.name}</strong> emails sent by the system.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="flex-1 btn-secondary py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex-1 btn-primary py-2.5 text-sm flex items-center justify-center gap-2"
              >
                {mutation.isPending
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : 'Yes, update'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Image upload box ──────────────────────────────────────────────────────────

function ImageUploadBox({
  label, hint, value, aspect, onUpload, onRemove,
}: {
  label: string
  hint: string
  value: string | null
  aspect: 'wide' | 'square'
  onUpload: (file: File) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File) {
    setLoading(true)
    try {
      await onUpload(file)
      toast.success(`${label} uploaded`)
    } catch {
      toast.error(`Failed to upload ${label.toLowerCase()}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(e: React.MouseEvent) {
    e.stopPropagation()
    setLoading(true)
    try {
      await onRemove()
      toast.success(`${label} removed`)
    } catch {
      toast.error(`Failed to remove ${label.toLowerCase()}`)
    } finally {
      setLoading(false)
    }
  }

  const previewClass = aspect === 'wide'
    ? 'w-full h-20 object-contain'
    : 'w-16 h-16 object-contain mx-auto'

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.TEXT }}>{label}</label>
      <div
        className="relative rounded-xl transition-all cursor-pointer overflow-hidden"
        style={{
          border: `1.5px dashed ${dragging ? C.LAPIS : C.BORDER}`,
          backgroundColor: dragging ? C.PRIMARY_LIGHT : 'white',
          minHeight: aspect === 'wide' ? 88 : 96,
        }}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.LAPIS, borderTopColor: 'transparent' }} />
          </div>
        ) : value ? (
          <div className="p-3 flex items-center justify-center">
            <img src={value} alt={label} className={previewClass} />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: C.ACCENT_BG, color: C.RED }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.RED) && (e.currentTarget.style.color = 'white') as unknown as boolean}
              onMouseLeave={e => { (e.currentTarget.style.backgroundColor = C.ACCENT_BG); (e.currentTarget.style.color = C.RED) }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1.5 py-5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: C.PRIMARY_LIGHT }}>
              {dragging
                ? <Upload className="w-4 h-4" style={{ color: C.LAPIS }} />
                : <ImageIcon className="w-4 h-4" style={{ color: C.TEXT_SUBTLE }} />
              }
            </div>
            <p className="text-xs font-medium" style={{ color: C.TEXT_MUTED }}>
              {dragging ? 'Drop to upload' : 'Click or drag to upload'}
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp,image/x-icon"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = '' } }}
        />
      </div>
      <p className="text-xs mt-1" style={{ color: C.TEXT_SUBTLE }}>{hint}</p>
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Card({
  icon: Icon, title, children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ border: `1px solid ${C.BORDER}` }}>
      <div className="flex items-center gap-2.5 mb-5" style={{ borderBottom: `1px solid ${C.DIVIDER}`, paddingBottom: 16 }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: C.PRIMARY_LIGHT }}>
          <Icon className="w-4 h-4" style={{ color: C.LAPIS }} />
        </div>
        <h2 className="font-display text-base font-semibold tracking-tight" style={{ color: C.TEXT }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Field({
  label, children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.TEXT }}>{label}</label>
      {children}
    </div>
  )
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px" style={{ backgroundColor: C.DIVIDER }} />
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: C.TEXT_SUBTLE }}>{label}</span>
      <div className="flex-1 h-px" style={{ backgroundColor: C.DIVIDER }} />
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="text-sm px-4 py-3 rounded-xl" style={{ backgroundColor: C.ACCENT_BG, color: C.RED, border: `1px solid ${C.ACCENT_BORDER}` }}>
      {message}
    </div>
  )
}
