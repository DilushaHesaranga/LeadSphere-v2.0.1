import { can } from '../auth/authorization.js'

export function canAccessNavigation(item, permissionScopes) {
  if (item.permission) {
    return can(permissionScopes, item.permission, item.minimumScope)
  }
  if (item.anyPermission) {
    return item.anyPermission.some((permission) => can(permissionScopes, permission))
  }
  return true
}

export function validateInvitation(email, role) {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email address.'
  if (!role) return 'Select a role for this member.'
  return ''
}

export function protectedRouteDestination({ loading, hasSession }) {
  if (loading || hasSession) return null
  return '/login'
}

export function consoleDestination(session) {
  return session ? '/console' : '/login'
}
