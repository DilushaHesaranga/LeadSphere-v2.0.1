import { PERMISSIONS } from "@/authorization/permissions";
import { can } from "@/authorization/policy";
import type { DataAccessScope } from "@/types/authorization";

export interface MobileNavigationItem {
  key: "Home" | "Profile";
  label: string;
  permission?: string;
}

const IMPLEMENTED_ITEMS: readonly MobileNavigationItem[] = Object.freeze([
  { key: "Home", label: "Home", permission: PERMISSIONS.CONSOLE_ACCESS },
  { key: "Profile", label: "Profile" },
]);

export function mobileNavigationItems(
  permissionScopes: Record<string, DataAccessScope>,
): MobileNavigationItem[] {
  return IMPLEMENTED_ITEMS.filter(
    (item) => !item.permission || can(permissionScopes, item.permission),
  );
}
