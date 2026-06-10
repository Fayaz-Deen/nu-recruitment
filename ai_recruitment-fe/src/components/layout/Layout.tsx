import { useEffect } from 'react'
import { C } from '../../tokens'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users,
  MessageSquare, ClipboardList, Zap, Sparkles, LogOut, Settings,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../contexts/AuthContext'
import ChatWidget from '../ChatWidget'
import { useQuery } from '@tanstack/react-query'
import { companyApi } from '../../services/api'

const NAV_ITEMS = [
  { to: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/jd-generator',    label: 'JD Generator',    icon: FileText        },
  { to: '/resume-screener', label: 'Resume Screener', icon: Users           },
  { to: '/interview',       label: 'Interview Guide', icon: ClipboardList   },
  { to: '/communication',   label: 'Communications',  icon: MessageSquare   },
]

const ROLE_LABELS: Record<string, string> = {
  super_admin:    'Super Admin',
  hr_admin:       'HR Admin',
  recruiter:      'Recruiter',
  hiring_manager: 'Hiring Manager',
  interviewer:    'Interviewer',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: company } = useQuery({
    queryKey: ['company'],
    queryFn: companyApi.get,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = company?.faviconUrl ?? '/favicon.ico'
  }, [company?.faviconUrl])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: C.BG }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="w-64 bg-white flex flex-col fixed h-full shadow-sm"
        style={{ borderRight: `1px solid ${C.BORDER}` }}
      >

        {/* Brand */}
        <div className="p-5" style={{ borderBottom: `1px solid ${C.BORDER}` }}>
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt={company.name || 'Company logo'}
              className="h-9 max-w-full object-contain"
            />
          ) : (
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-md"
                style={{
                  background: C.GRAD_BRAND,
                  boxShadow: '0 4px 12px rgba(123,70,155,0.35)',
                }}
              >
                <Zap style={{ width: 18, height: 18, color: '#fff' }} />
              </div>
              <div>
                <p className="font-bold text-sm leading-none" style={{ color: C.TEXT }}>NULogic</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: C.TEXT_MUTED }}>Recruitment AI</p>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  !isActive && 'hover:bg-[#eef0fa]',
                )
              }
              style={({ isActive }) =>
                isActive
                  ? {
                      background: 'linear-gradient(135deg, #1B1F4E, #7B2D8E)',
                      color: C.WHITE,
                      boxShadow: '0 3px 12px rgba(123,45,142,0.28)',
                    }
                  : {}
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? C.WHITE : C.TEXT_MUTED }} />
                  <span style={{ color: isActive ? C.WHITE : C.TEXT_MUTED }}>{label}</span>
                </>
              )}
            </NavLink>
          ))}

        </nav>

        {/* Footer — user info + logout */}
        <div className="p-3" style={{ borderTop: `1px solid ${C.BORDER}` }}>

          {/* Current user — click to go to profile */}
          {user && (
            <NavLink
              to="/profile"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1 transition-all"
              style={({ isActive }) => ({
                backgroundColor: isActive ? C.PRIMARY_RING : C.PRIMARY_LIGHT,
                cursor: 'pointer',
              })}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-semibold text-xs"
                style={{ background: C.GRAD_JD, color: 'white' }}
              >
                {(user.name || user.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-none mb-0.5" style={{ color: C.TEXT }}>
                  {user.name || user.email}
                </p>
                <p className="text-xs truncate" style={{ color: C.TEXT_MUTED }}>
                  {ROLE_LABELS[user.role] ?? user.role}
                </p>
              </div>
              <Settings className="w-3.5 h-3.5 shrink-0" style={{ color: C.TEXT_SUBTLE }} />
            </NavLink>
          )}

          {/* AI badge + logout */}
          <div className="flex items-center justify-between px-1 py-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: C.LAPIS }} />
              <span className="text-xs font-medium" style={{ color: C.TEXT_MUTED }}>Gemini 2.5 Flash</span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: C.TEXT_MUTED }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = C.ACCENT_BG
                e.currentTarget.style.color = C.RED
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = C.TEXT_MUTED
              }}
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      {/* key={pathname} remounts the wrapper on navigation so the entrance
          animation replays per route. */}
      <main className="flex-1 ml-64 p-8 min-h-screen">
        <div key={pathname} className="page-enter">
          {children}
        </div>
      </main>

      <ChatWidget />
    </div>
  )
}
