import { useState, KeyboardEvent, useRef } from 'react'
import { X } from 'lucide-react'
import { C } from '../tokens'

interface Props {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
  suggestions?: string[]
}

export default function TagInput({
  value,
  onChange,
  placeholder = 'Type and press Enter',
  disabled = false,
  suggestions = [],
}: Props) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = suggestions
    .filter(s => !value.includes(s) && (input === '' || s.toLowerCase().includes(input.toLowerCase())))
    .slice(0, 8)

  function add(tag?: string) {
    const t = (tag ?? input).trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setInput('')
  }

  function remove(tag: string) {
    onChange(value.filter(t => t !== tag))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (input.trim()) { add(); setOpen(false) }
    } else if (e.key === 'Backspace' && !input && value.length) {
      onChange(value.slice(0, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <div
        className="min-h-[42px] flex flex-wrap gap-1.5 items-center px-3 py-2 rounded-xl transition-all cursor-text"
        style={{ border: `1.5px solid ${C.BORDER}`, backgroundColor: disabled ? C.BG : 'white' }}
        onClick={() => { if (!disabled) inputRef.current?.focus() }}
      >
        {value.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg"
            style={{ backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS }}
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); remove(tag) }}
                className="ml-0.5 hover:opacity-70 transition-opacity"
                aria-label={`Remove ${tag}`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              if (suggestions.length > 0) setOpen(true)
            }}
            onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (input.trim()) add()
              setOpen(false)
            }}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] text-sm outline-none bg-transparent"
            style={{ color: C.TEXT }}
          />
        )}
      </div>

      {open && filtered.length > 0 && !disabled && (
        <div
          className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl z-50 py-1 max-h-48 overflow-y-auto"
          style={{ border: `1px solid ${C.BORDER}`, boxShadow: '0 4px 8px rgba(15,22,64,0.08)' }}
        >
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={e => { e.preventDefault(); add(s) }}
              className="w-full text-left px-3.5 py-2 text-sm transition-colors"
              style={{ color: C.TEXT }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.PRIMARY_LIGHT)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
