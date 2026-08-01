import type { DataAccessScope, UserAuthorization } from "@/types/authorization";

const SCOPE_RANK: Record<DataAccessScope, number> = Object.freeze({
  own: 1,
  assigned: 2,
  team: 3,
  company: 4,
});

export function getScope(
  permissionScopes: Record<string, DataAccessScope>,
  permission: string,
): DataAccessScope | null {
  return permissionScopes[permission] ?? null;
}

export function can(
  permissionScopes: Record<string, DataAccessScope>,
  permission: string,
  minimumScope: DataAccessScope = "own",
): boolean {
  const scope = getScope(permissionScopes, permission);
  return Boolean(scope && SCOPE_RANK[scope] >= SCOPE_RANK[minimumScope]);
}

export function hasRole(
  roles: UserAuthorization["roles"],
  role: string,
): boolean {
  return roles.some((item) => item.slug === role);
}

export interface RecordAccessTarget {
  ownerId?: string | null;
  assignedUserId?: string | null;
  teamId?: string | null;
}

export function canAccessRecord(
  authorization: UserAuthorization,
  permission: string,
  target: RecordAccessTarget,
): boolean {
  const userId = authorization.profile?.id;
  const scope = authorization.permissions[permission];
  if (!userId || !scope) return false;
  if (scope === "company") return true;
  if (scope === "team") {
    return Boolean(
      target.teamId &&
      authorization.teams.some((team) => team.id === target.teamId),
    );
  }
  if (scope === "assigned") {
    return target.assignedUserId === userId || target.ownerId === userId;
  }
  return target.ownerId === userId;
}
