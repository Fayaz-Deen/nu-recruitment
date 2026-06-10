import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { JobDescription } from '../types'
import clsx from 'clsx'
import { C } from '../tokens'

interface Props {
  jobs: JobDescription[]
  value: string | null
  onChange: (jobId: string | null) => void
  placeholder?: string
}

function jobLabel(j: JobDescription) {
  return j.jobNumber
    ? `#${String(j.jobNumber).padStart(3, '0')} · ${j.title}`
    : j.title
}

export default function JobSelect({
  jobs,
  value,
  onChange,
  placeholder = '— choose a job description —',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = jobs.find((j) => j.id === value) ?? null

  const filtered = query.trim()
    ? jobs.filter((j) => {
        const q = query.toLowerCase()
        const num = j.jobNumber ? String(j.jobNumber).padStart(3, '0') : ''
        return j.title.toLowerCase().includes(q) || num.includes(q)
      })
    : jobs

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  function openDropdown() {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function select(job: JobDescription) {
    onChange(job.id)
    setOpen(false)
    setQuery('')
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <div
        className="input flex items-center gap-2 cursor-pointer select-none"
        style={open ? { borderColor: C.LAPIS, boxShadow: `0 0 0 3px ${C.PRIMARY_LIGHT}` } : undefined}
        onClick={open ? undefined : openDropdown}
      >
        <Search className="w-4 h-4 text-gray-400 shrink-0" />

        {open ? (
          <input
            ref={inputRef}
            className="flex-1 outline-none bg-transparent text-sm placeholder-gray-400"
            placeholder="Search by title or #number..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        ) : (
          <span className={clsx('flex-1 text-sm truncate', selected ? 'text-gray-900' : 'text-gray-400')}>
            {selected ? jobLabel(selected) : placeholder}
          </span>
        )}

        {selected && !open ? (
          <X
            role="button"
            aria-label="Clear selected job"
            className="w-4 h-4 text-gray-400 hover:text-gray-600 shrink-0"
            onClick={clear}
          />
        ) : (
          <ChevronDown
            className={clsx(
              'w-4 h-4 text-gray-400 shrink-0 transition-transform duration-150',
              open && 'rotate-180'
            )}
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute z-20 mt-1 w-full bg-white rounded-lg max-h-64 overflow-y-auto"
          style={{ border: `1px solid ${C.BORDER}`, boxShadow: '0 4px 8px rgba(15,22,64,0.08)' }}
        >
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 px-4 py-3">No jobs match &ldquo;{query}&rdquo;</p>
          ) : (
            filtered.map((j) => {
              const isSelected = j.id === value
              return (
                <button
                  key={j.id}
                  type="button"
                  className={clsx(
                    'w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3',
                    isSelected && 'font-medium'
                  )}
                  style={{
                    backgroundColor: isSelected ? C.PRIMARY_LIGHT : 'transparent',
                    color: isSelected ? C.LAPIS : C.TEXT,
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = C.ROW_HOVER }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
                  onClick={() => select(j)}
                >
                  {j.jobNumber != null && (
                    <span className="text-xs font-mono text-gray-400 shrink-0 w-10">
                      #{String(j.jobNumber).padStart(3, '0')}
                    </span>
                  )}
                  <span className="truncate">{j.title}</span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
