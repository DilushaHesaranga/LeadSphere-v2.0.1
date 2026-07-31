import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { Icon } from './Icons.jsx'
import { navigate } from '../utils/router.js'

export function AccessDenied() {
  return (
    <div className="console-content">
      <div className="empty-state module-empty">
        <Icon name="shield" size={30} />
        <h1>Access denied</h1>
        <p>Your assigned role does not permit access to this area.</p>
        <button className="button button-primary" onClick={() => navigate('/console')}>
          Return to overview
        </button>
      </div>
    </div>
  )
}

export function PermissionGuard({
  permission,
  minimumScope = 'own',
  fallback = <AccessDenied />,
  children,
}) {
  const { can } = useAuth()
  return can(permission, minimumScope) ? children : fallback
}

export function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()

  useEffect(() => {
    if (!loading && !session) navigate('/login', { replace: true })
  }, [loading, session])

  if (loading) {
    return (
      <main className="centered-page">
        <div className="loading-state">Loading your secure workspace...</div>
      </main>
    )
  }
  if (!session) return null
  return children
}
