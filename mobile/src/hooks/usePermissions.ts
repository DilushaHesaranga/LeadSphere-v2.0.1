import { useAuth } from "@/auth/AuthContext";

export function usePermissions() {
  const { can, getScope, hasRole, authorization } = useAuth();
  return {
    can,
    getScope,
    hasRole,
    permissions: authorization.permissions,
    roles: authorization.roles,
  };
}
