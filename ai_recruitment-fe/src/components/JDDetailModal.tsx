import { C } from '../tokens'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import type { JobDescription } from '../types'

interface Props {
  jd: JobDescription | null
  onClose: () => void
}

function statusStyle(status: JobDescription['status']): string {
  if (status === 'active') return 'badge-green'
  if (status === 'closed') return 'badge-gray'
  return 'badge-yellow'
}

export default function JDDetailModal({ jd, onClose }: Props) {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!jd) { setVisible(false); return }
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [jd])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!jd) return null

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-6
                  transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={jd.title}
        className="relative w-full max-w-2xl bg-white rounded-2xl flex flex-col max-h-[82vh]"
        style={{ border: `1px solid ${C.BORDER}`, boxShadow: '0 20px 40px -15px rgba(0,0,0,0.08)' }}
      >

        {/* Header */}
        <div
          className="flex items-start justify-between p-6 shrink-0"
          style={{ borderBottom: `1px solid ${C.BORDER}` }}
        >
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold leading-snug" style={{ color: C.TEXT }}>{jd.title}</h2>
              <span className={statusStyle(jd.status)}>{jd.status}</span>
            </div>
            <p className="text-xs mt-1.5" style={{ color: C.TEXT_MUTED }}>
              Generated on{' '}
              {new Date(jd.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors shrink-0 ml-4"
            style={{ color: C.TEXT_MUTED }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = C.PRIMARY_LIGHT }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {jd.companyOverview && (
            <Section title="Company Overview">
              <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>{jd.companyOverview}</p>
            </Section>
          )}
          {jd.roleOverview && (
            <Section title="Role Overview">
              <p className="text-sm leading-relaxed" style={{ color: C.TEXT_MUTED }}>{jd.roleOverview}</p>
            </Section>
          )}
          {jd.responsibilities?.length > 0 && (
            <Section title="Responsibilities">
              <BulletList items={jd.responsibilities} bulletColor={C.LAPIS} />
            </Section>
          )}
          {jd.requiredQualifications?.length > 0 && (
            <Section title="Required Qualifications">
              <BulletList items={jd.requiredQualifications} bulletColor={C.LAPIS} />
            </Section>
          )}
          {jd.niceToHaves?.length > 0 && (
            <Section title="Nice to Haves">
              <BulletList items={jd.niceToHaves} bulletColor={C.PURPLE} />
            </Section>
          )}
          {jd.benefits?.length > 0 && (
            <Section title="Benefits">
              <BulletList items={jd.benefits} bulletColor={C.SUCCESS} />
            </Section>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 p-6 shrink-0"
          style={{ borderTop: `1px solid ${C.BORDER}` }}
        >
          <button className="btn-secondary" onClick={() => { navigate(`/resume-screener?jobId=${jd.id}`); onClose() }}>
            Go to Resume Screener
          </button>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="section-label mb-2.5">{title}</h3>
      {children}
    </div>
  )
}

function BulletList({ items, bulletColor }: { items: string[]; bulletColor: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm" style={{ color: C.TEXT_MUTED }}>
          <span style={{ color: bulletColor }} className="mt-0.5 shrink-0 select-none">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
