import type { PropsWithChildren, ReactNode } from "react";

import { StateView } from "@/components/StateView";
import { useAuth } from "@/auth/AuthContext";
import type { DataAccessScope } from "@/types/authorization";

interface PermissionGateProps extends PropsWithChildren {
  permission: string;
  minimumScope?: DataAccessScope;
  fallback?: ReactNode;
}

export function PermissionGate({
  permission,
  minimumScope = "own",
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can } = useAuth();
  return can(permission, minimumScope) ? children : fallback;
}

export function ProtectedScreen({
  permission,
  minimumScope = "own",
  children,
}: PermissionGateProps) {
  return (
    <PermissionGate
      permission={permission}
      minimumScope={minimumScope}
      fallback={
        <StateView
          title="Access denied"
          description="Your assigned permissions do not allow access to this area."
        />
      }
    >
      {children}
    </PermissionGate>
  );
}
