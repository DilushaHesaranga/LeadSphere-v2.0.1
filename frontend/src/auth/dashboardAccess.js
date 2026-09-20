import { can } from './authorization.js'
import { PERMISSIONS } from './permissions.js'

export const DASHBOARD_ROLES = Object.freeze([
  'marketing_manager', 'sales_manager', 'delivery_manager', 'leadership',
])

export function canAccessManagementReports(roles = [], permissionScopes = {}) {
  return can(permissionScopes, PERMISSIONS.DASHBOARDS_READ)
    && roles.some((role) => DASHBOARD_ROLES.includes(role?.slug) && (!role.status || role.status === 'active'))
}

export function canAccessDashboard(roles = [], permissionScopes = {}) {
  return can(permissionScopes, PERMISSIONS.DASHBOARDS_READ)
    && can(permissionScopes, PERMISSIONS.TICKETS_READ)
    && roles.some((role) => [...DASHBOARD_ROLES, 'marketing_executive', 'sales_executive'].includes(role?.slug) && (!role.status || role.status === 'active'))
}
