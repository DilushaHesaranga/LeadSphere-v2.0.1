export const SCOPE_RANK = Object.freeze({
  own: 1,
  assigned: 2,
  team: 3,
  company: 4,
})

export function getScope(permissionScopes, permission) {
  return permissionScopes?.[permission] ?? null
}

export function can(permissionScopes, permission, minimumScope = 'own') {
  const scope = getScope(permissionScopes, permission)
  return Boolean(scope && SCOPE_RANK[scope] >= SCOPE_RANK[minimumScope])
}

export function hasRole(roles, role) {
  return roles.some((item) => item.slug === role)
}

export function normalizeAuthorization(data) {
  return {
    profile: data?.profile ?? null,
    roles: Array.isArray(data?.roles) ? data.roles : [],
    teams: Array.isArray(data?.teams) ? data.teams : [],
    permissionScopes:
      data?.permissions && typeof data.permissions === 'object'
        ? data.permissions
        : {},
  }
}
