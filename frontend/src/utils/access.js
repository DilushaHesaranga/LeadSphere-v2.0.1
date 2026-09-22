import { can } from '../auth/authorization.js'
import { ROLES } from '../auth/permissions.js'

export function canAccessNavigation(item, permissionScopes) {
  if (item.permission) {
    return can(permissionScopes, item.permission, item.minimumScope)
  }
  if (item.anyPermission) {
    return item.anyPermission.some((permission) => can(permissionScopes, permission))
  }
  return true
}

export function isSystemAdministrator(roles = []) {
  return roles.some((role) => role?.slug === ROLES.SYSTEM_ADMIN && (!role.status || role.status === 'active'))
}

export function navigationForRoles(items, roles = []) {
  if (!isSystemAdministrator(roles)) return items
  return items.filter((item) => item.path === '/console/team')
}

export function canAccessConsolePathForRoles(pathname, roles = []) {
  if (!isSystemAdministrator(roles)) return true
  return pathname === '/console' || pathname === '/console/team'
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
