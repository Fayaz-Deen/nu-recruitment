import { C } from '../tokens'
import { useEffect, useState } from 'react'

const CATEGORIES = [
  { key: 'experience',  label: 'Experience',  max: 25, color: C.LAPIS },
  { key: 'skills',      label: 'Skills',       max: 25, color: C.NAVY },
  { key: 'education',   label: 'Education',    max: 15, color: C.SUCCESS },
  { key: 'progression', label: 'Progression',  max: 15, color: C.WARNING },
  { key: 'cultureFit',  label: 'Culture Fit',  max: 10, color: C.VIOLET },
] as const

interface Scores {
  experience:  number
  skills:      number
  education:   number
  progression: number
  cultureFit:  number
  redFlags:    number
}

export default function ScoreBreakdown({ scores }: { scores: Scores }) {
  const [ready, setReady] = useState(false)

  // Tiny delay so the bars animate in after the card expands
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 80)
    return () => clearTimeout(id)
  }, [])

  const deduction = Math.abs(scores.redFlags)

  return (
    <div className="space-y-2.5">
      {CATEGORIES.map(({ key, label, max, color }) => {
        const score = scores[key]
        const pct   = Math.round((score / max) * 100)
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-xs font-semibold text-gray-700">
                {score}
                <span className="font-normal text-gray-400">/{max}</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.SKELETON }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: ready ? `${pct}%` : '0%', backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}

      {deduction > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-red-500 font-medium">Deductions</span>
            <span className="text-xs font-semibold text-red-600">−{deduction} pts</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.SKELETON }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: ready ? `${Math.round((deduction / 20) * 100)}%` : '0%', backgroundColor: C.RED }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
