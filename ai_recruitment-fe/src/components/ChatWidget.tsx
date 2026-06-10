import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, Send, Sparkles, ChevronRight, Loader2, CheckCircle2, AlertCircle, Bot } from 'lucide-react'
import DOMPurify from 'dompurify'
import { C } from '../tokens'
import { tokenStore } from '../services/authToken'
import { useAuth } from '../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolEvent {
  name: string
  status: 'running' | 'done' | 'error'
  result?: unknown
  error?: string
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: ToolEvent[]
  streaming?: boolean
}

// ── Tool metadata ─────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: string }> = {
  get_stats:               { label: 'Analyzing hiring metrics',    icon: '📊' },
  get_pipeline:            { label: 'Loading hiring pipeline',     icon: '🔄' },
  list_jobs:               { label: 'Fetching job listings',       icon: '📋' },
  create_job:              { label: 'Generating job description',  icon: '✍️'  },
  search_candidates:       { label: 'Searching talent pool',       icon: '🔍' },
  get_candidate_details:   { label: 'Loading candidate profile',   icon: '👤' },
  generate_interview_guide:{ label: 'Creating interview guide',    icon: '📝' },
  draft_email:             { label: 'Drafting email',              icon: '✉️'  },
  list_team:               { label: 'Loading team members',        icon: '👥' },
}

const toolLabel = (name: string) => TOOL_META[name]?.label ?? name
const toolIcon  = (name: string) => TOOL_META[name]?.icon  ?? '⚙️'

// ── Suggested prompts ─────────────────────────────────────────────────────────

const PROMPTS = [
  { label: 'Hiring overview',      text: 'Give me a full hiring pipeline overview' },
  { label: 'Top candidates',       text: 'Show me candidates with score above 75' },
  { label: 'Create JD',           text: 'Create a job description for a Senior Full Stack Engineer with React and Node.js skills' },
  { label: 'Active jobs',          text: 'List all active job openings' },
  { label: 'Team members',         text: 'Who are our team members and what roles do they have?' },
  { label: 'Interview guide',      text: 'Find the best candidate and generate an interview guide for them' },
]

// ── Markdown renderer (lightweight) ──────────────────────────────────────────

// AI output is untrusted: escape any raw HTML first, then apply the markdown
// transforms, then DOMPurify the result as defence in depth.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#eef0fa;padding:1px 4px;border-radius:3px;font-size:0.875em">$1</code>')
    .replace(/^### (.+)$/gm, '<p style="font-weight:700;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.04em;margin:12px 0 4px;color:#5A5F7A">$1</p>')
    .replace(/^## (.+)$/gm, '<p style="font-weight:700;font-size:0.9rem;margin:12px 0 4px">$1</p>')
    .replace(/^- (.+)$/gm, '<li style="margin:2px 0;padding-left:4px">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/g, '<ul style="margin:4px 0;padding-left:16px;list-style:disc">$&</ul>')
    .replace(/\n\n/g, '</p><p style="margin:6px 0">')
    .replace(/\n/g, '<br/>')
}

// ── ToolCard ──────────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ToolEvent }) {
  const [expanded, setExpanded] = useState(false)
  const hasData: boolean = tool.status === 'done' && tool.result != null

  return (
    <div
      className="rounded-xl overflow-hidden text-xs"
      style={{ border: `1px solid ${C.BORDER}`, backgroundColor: C.BG }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ cursor: hasData ? 'pointer' : 'default' }}
        onClick={() => hasData && setExpanded(e => !e)}
      >
        <span className="text-sm">{toolIcon(tool.name)}</span>
        <span className="flex-1 font-medium" style={{ color: C.TEXT_MUTED }}>{toolLabel(tool.name)}</span>

        {tool.status === 'running' && (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: C.LAPIS }} />
        )}
        {tool.status === 'done' && (
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: C.SUCCESS }} />
        )}
        {tool.status === 'error' && (
          <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: C.RED }} />
        )}
        {hasData && (
          <ChevronRight
            className="w-3.5 h-3.5 shrink-0 transition-transform duration-150"
            style={{ color: C.TEXT_SUBTLE, transform: expanded ? 'rotate(90deg)' : 'none' }}
          />
        )}
      </div>

      {expanded && hasData && (
        <div
          className="px-3 pb-2 font-mono text-xs overflow-auto max-h-48"
          style={{ borderTop: `1px solid ${C.BORDER}`, color: C.TEXT_MUTED, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        >
          {JSON.stringify(tool.result, null, 2)}
        </div>
      )}
    </div>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMsg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div
          className="max-w-[82%] px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm"
          style={{ background: C.GRAD_DARK, color: '#fff' }}
        >
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 mb-4 items-start">
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: C.GRAD_BRAND }}
      >
        <Bot className="w-3.5 h-3.5" style={{ color: '#fff' }} />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Tool cards */}
        {msg.tools?.map((tool, i) => (
          <ToolCard key={i} tool={tool} />
        ))}

        {/* Text content */}
        {(msg.content || msg.streaming) && (
          <div
            className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed"
            style={{ border: `1px solid ${C.BORDER}`, color: C.TEXT }}
          >
            {msg.content ? (
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(msg.content)) }} />
            ) : (
              <span className="flex items-center gap-1.5" style={{ color: C.TEXT_MUTED }}>
                <span className="inline-flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{
                        backgroundColor: C.LAPIS,
                        animationDelay: `${i * 150}ms`,
                        animationDuration: '900ms',
                      }}
                    />
                  ))}
                </span>
                Thinking…
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ChatWidget ────────────────────────────────────────────────────────────────

export default function ChatWidget() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ────────────────────────────────────────────────────────────

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    const userMsgId = crypto.randomUUID()
    const asstMsgId = crypto.randomUUID()

    const userMsg: ChatMsg = { id: userMsgId, role: 'user', content: trimmed }
    const asstMsg: ChatMsg = { id: asstMsgId, role: 'assistant', content: '', tools: [], streaming: true }

    setMessages(prev => [...prev, userMsg, asstMsg])
    setInput('')
    setBusy(true)

    const history = messages.map(m => ({ role: m.role, content: m.content }))
    history.push({ role: 'user', content: trimmed })

    abortRef.current = new AbortController()

    try {
      const token = tokenStore.getToken()
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const updateAssistant = (updater: (msg: ChatMsg) => ChatMsg) => {
        setMessages(prev => prev.map(m => m.id === asstMsgId ? updater(m) : m))
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string; name?: string; input?: unknown; result?: unknown;
              error?: string; content?: string; message?: string
            }

            switch (evt.type) {

              case 'tool_start':
                updateAssistant(m => ({
                  ...m,
                  tools: [...(m.tools ?? []), { name: evt.name!, status: 'running' }],
                }))
                break

              case 'tool_done':
                updateAssistant(m => ({
                  ...m,
                  tools: (m.tools ?? []).map(t =>
                    t.name === evt.name && t.status === 'running'
                      ? { ...t, status: 'done', result: evt.result }
                      : t,
                  ),
                }))
                break

              case 'tool_error':
                updateAssistant(m => ({
                  ...m,
                  tools: (m.tools ?? []).map(t =>
                    t.name === evt.name && t.status === 'running'
                      ? { ...t, status: 'error', error: evt.error }
                      : t,
                  ),
                }))
                break

              case 'text':
                updateAssistant(m => ({ ...m, content: evt.content ?? '', streaming: false }))
                break

              case 'error':
                updateAssistant(m => ({
                  ...m,
                  content: `Sorry, something went wrong: ${evt.message}`,
                  streaming: false,
                }))
                break

              case 'done':
                updateAssistant(m => ({ ...m, streaming: false }))
                break
            }
          } catch { /* skip malformed event */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === asstMsgId
            ? { ...m, content: 'Connection failed. Please try again.', streaming: false }
            : m,
        ))
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }, [busy, messages])

  // ── Keyboard handler ────────────────────────────────────────────────────────

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isEmpty = messages.length === 0

  const widget = (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 pl-4 pr-5 py-3 rounded-2xl shadow-xl transition-all duration-200 hover:scale-105 active:scale-95"
          style={{ background: C.GRAD_DARK, boxShadow: '0 8px 32px rgba(5,7,102,0.35)' }}
          title="Open Recruit AI"
        >
          <Sparkles className="w-4 h-4" style={{ color: '#fff' }} />
          <span className="text-sm font-semibold" style={{ color: '#fff' }}>Recruit AI</span>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div
          className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl"
          style={{
            width: 420,
            borderLeft: `1px solid ${C.BORDER}`,
            animation: 'slideInRight 0.22s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3.5 shrink-0"
            style={{ background: C.GRAD_DARK, borderBottom: `1px solid rgba(255,255,255,0.1)` }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/10">
              <Sparkles className="w-4 h-4" style={{ color: '#fff' }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: '#fff' }}>Recruit AI</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {user?.name ? `Hi ${user.name.split(' ')[0]}` : 'Hiring assistant'}
              </p>
            </div>
            {busy && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10">
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#fff' }} />
                <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>Working…</span>
              </div>
            )}
            <button
              onClick={() => { setOpen(false); if (busy) abortRef.current?.abort() }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4" style={{ color: '#fff' }} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4" style={{ backgroundColor: C.BG }}>

            {isEmpty && (
              <div className="space-y-4">
                {/* Welcome */}
                <div className="flex gap-2 items-start">
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: C.GRAD_BRAND }}
                  >
                    <Bot className="w-3.5 h-3.5" style={{ color: '#fff' }} />
                  </div>
                  <div
                    className="flex-1 bg-white rounded-2xl rounded-tl-sm px-4 py-3 text-sm"
                    style={{ border: `1px solid ${C.BORDER}`, color: C.TEXT }}
                  >
                    <p className="font-semibold mb-1">Hey{user?.name ? ` ${user.name.split(' ')[0]}` : ''}! 👋</p>
                    <p style={{ color: C.TEXT_MUTED }}>
                      I can manage your entire hiring pipeline — create JDs, search candidates,
                      generate interview guides, draft emails, and more. What do you need?
                    </p>
                  </div>
                </div>

                {/* Suggested prompts */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: C.TEXT_SUBTLE }}>
                    Try asking
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {PROMPTS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => send(p.text)}
                        className="text-left px-3 py-2.5 rounded-xl text-xs font-medium transition-all hover:scale-[1.02]"
                        style={{
                          backgroundColor: 'white',
                          border: `1px solid ${C.BORDER}`,
                          color: C.TEXT_MUTED,
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = C.LAPIS
                          e.currentTarget.style.color = C.LAPIS
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = C.BORDER
                          e.currentTarget.style.color = C.TEXT_MUTED
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

            {/* Quick links after response */}
            {!isEmpty && !busy && (
              <div className="flex gap-2 flex-wrap mt-2 mb-1">
                {[
                  { label: 'JD Generator',   path: '/jd-generator'    },
                  { label: 'Resume Screener', path: '/resume-screener' },
                  { label: 'Candidates',      path: '/resume-screener' },
                ].map(l => (
                  <button
                    key={l.path + l.label}
                    onClick={() => { navigate(l.path); setOpen(false) }}
                    className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                    style={{ backgroundColor: C.PRIMARY_LIGHT, color: C.LAPIS, border: `1px solid ${C.PRIMARY_RING}` }}
                  >
                    {l.label} →
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            className="p-3 shrink-0"
            style={{ borderTop: `1px solid ${C.BORDER}`, backgroundColor: 'white' }}
          >
            <div
              className="flex items-end gap-2 rounded-2xl px-3 py-2"
              style={{ border: `1.5px solid ${busy ? C.LAPIS : C.BORDER}`, transition: 'border-color 0.15s' }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything about your hiring pipeline…"
                rows={1}
                disabled={busy}
                className="flex-1 resize-none text-sm outline-none bg-transparent leading-relaxed max-h-32"
                style={{ color: C.TEXT }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || busy}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all"
                style={{
                  background: input.trim() && !busy ? C.GRAD_DARK : C.BORDER,
                  opacity: input.trim() && !busy ? 1 : 0.5,
                }}
              >
                <Send className="w-3.5 h-3.5" style={{ color: input.trim() && !busy ? '#fff' : C.TEXT_MUTED }} />
              </button>
            </div>
            <p className="text-center text-xs mt-1.5" style={{ color: C.TEXT_SUBTLE }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  )

  return createPortal(widget, document.body)
}
