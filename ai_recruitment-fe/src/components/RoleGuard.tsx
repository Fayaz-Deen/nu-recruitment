import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../types'

interface Props {
  roles: UserRole[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function RoleGuard({ roles, children, fallback = null }: Props) {
  const { user } = useAuth()
  if (!user || !roles.includes(user.role)) return <>{fallback}</>
  return <>{children}</>
}
