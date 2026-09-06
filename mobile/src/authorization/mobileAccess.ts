import { can } from "./policy";
import { PERMISSIONS } from "./permissions";
import { hasFollowUpCreatorRole } from "@/config/followUps";
import type { UserAuthorization } from "@/types/authorization";

export type MobileAccessDecision =
  "allowed" | "disabled" | "unsupported-role" | "missing-access";

export function decideMobileAccess(
  authorization: UserAuthorization,
): MobileAccessDecision {
  if (!authorization.profile || authorization.profile.status !== "active") {
    return "disabled";
  }
  if (!hasFollowUpCreatorRole(authorization.roles)) {
    return "unsupported-role";
  }
  if (!can(authorization.permissions, PERMISSIONS.CONSOLE_ACCESS)) {
    return "missing-access";
  }
  return "allowed";
}
