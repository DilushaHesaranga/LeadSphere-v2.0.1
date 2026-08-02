/* oxlint-disable react/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  can as canPermission,
  getScope as getPermissionScope,
  hasRole as userHasRole,
  normalizeAuthorization,
} from './authorization.js'
import { supabase } from '../utils/supabase.js'

const AuthContext = createContext(null)

async function loadUserAccess() {
  const { data, error } = await supabase.rpc('current_user_authorization')
  if (error) throw error
  return normalizeAuthorization(data)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [access, setAccess] = useState(() => normalizeAuthorization(null))
  const [loading, setLoading] = useState(true)
  const [accessError, setAccessError] = useState('')

  const refreshAccess = useCallback(async (nextSession) => {
    if (!nextSession?.user) {
      setAccess(normalizeAuthorization(null))
      setAccessError('')
      return
    }

    try {
      const nextAccess = await loadUserAccess()
      setAccess(nextAccess)
      setAccessError('')
    } catch {
      setAccess(normalizeAuthorization(null))
      setAccessError('Your account access could not be loaded. Please try again.')
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await refreshAccess(data.session)
      if (active) setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setTimeout(() => {
        refreshAccess(nextSession).finally(() => setLoading(false))
      }, 0)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [refreshAccess])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile: access.profile,
    roles: access.roles,
    teams: access.teams,
    permissionScopes: access.permissionScopes,
    permissions: Object.keys(access.permissionScopes),
    loading,
    accessError,
    can: (permission, minimumScope = 'own') =>
      canPermission(access.permissionScopes, permission, minimumScope),
    hasPermission: (permission) =>
      canPermission(access.permissionScopes, permission),
    hasRole: (role) => userHasRole(access.roles, role),
    getScope: (permission) =>
      getPermissionScope(access.permissionScopes, permission),
    refreshAccess: () => refreshAccess(session),
    signOut: () => supabase.auth.signOut(),
  }), [access, accessError, loading, refreshAccess, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
