export const PERMISSIONS = {
  CONSOLE_ACCESS: 'console.access',
  TEAM_MEMBERS_READ: 'team.members.read',
  TEAM_MEMBERS_INVITE: 'team.members.invite',
  TEAM_MEMBERS_ASSIGN_ROLE: 'team.members.assign_role',
  TEAM_MEMBERS_CHANGE_STATUS: 'team.members.change_status',
  TEAMS_READ: 'teams.read',
  TEAMS_MANAGE: 'teams.manage',
  ROLES_READ: 'roles.read',
} as const;

export const BUSINESS_ROLE_CODES = [
  'marketing_executive',
  'sales_executive',
  'sales_manager',
  'delivery_manager',
  'leadership',
] as const;

export type BusinessRoleCode = (typeof BUSINESS_ROLE_CODES)[number];

export function isBusinessRoleCode(value: string): value is BusinessRoleCode {
  return BUSINESS_ROLE_CODES.some((role) => role === value);
}
