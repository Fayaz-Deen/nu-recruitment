import {
  createContext, useContext, useCallback, useEffect, useRef, useState,
} from 'react'
import type { AuthUser } from '../types'
import { authApi } from '../services/api'
import { tokenStore } from '../services/authToken'

interface AuthState {
  user: AuthUser | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshAccessToken: () => Promise<string | null>
  updateUser: (user: AuthUser) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })
  const refreshInFlight = useRef<Promise<string | null> | null>(null)

  // Deduplicated refresh — concurrent calls share the same promise
  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (refreshInFlight.current) return refreshInFlight.current

    const promise = authApi.refresh()
      .then(({ accessToken, user }) => {
        tokenStore.setToken(accessToken)
        setState({ user, loading: false })
        return accessToken
      })
      .catch(() => {
        tokenStore.setToken(null)
        setState({ user: null, loading: false })
        return null
      })
      .finally(() => { refreshInFlight.current = null })

    refreshInFlight.current = promise
    return promise
  }, [])

  // Register refresh function in the token store so the axios interceptor can call it
  useEffect(() => {
    tokenStore.setRefreshFn(refreshAccessToken)
    return () => tokenStore.setRefreshFn(null)
  }, [refreshAccessToken])

  // Restore session on first load (uses the httpOnly refresh-token cookie)
  useEffect(() => {
    refreshAccessToken()
  }, [refreshAccessToken])

  const login = useCallback(async (email: string, password: string) => {
    const { accessToken, user } = await authApi.login(email, password)
    tokenStore.setToken(accessToken)
    setState({ user, loading: false })
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    tokenStore.setToken(null)
    setState({ user: null, loading: false })
  }, [])

  // Sync locally-edited profile fields (e.g. display name) into the session
  const updateUser = useCallback((user: AuthUser) => {
    setState((prev) => ({ ...prev, user }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshAccessToken, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
