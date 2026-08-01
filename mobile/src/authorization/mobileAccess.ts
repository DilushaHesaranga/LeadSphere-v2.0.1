import { can, hasRole } from "./policy";
import { PERMISSIONS, ROLES } from "./permissions";
import type { UserAuthorization } from "@/types/authorization";

export type MobileAccessDecision =
  "allowed" | "disabled" | "unsupported-role" | "missing-access";

export function decideMobileAccess(
  authorization: UserAuthorization,
): MobileAccessDecision {
  if (!authorization.profile || authorization.profile.status !== "active") {
    return "disabled";
  }
  if (!hasRole(authorization.roles, ROLES.SALES_EXECUTIVE)) {
    return "unsupported-role";
  }
  if (!can(authorization.permissions, PERMISSIONS.CONSOLE_ACCESS)) {
    return "missing-access";
  }
  return "allowed";
}
