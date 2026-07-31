import { SetMetadata } from '@nestjs/common';
import type { DataAccessScope } from './authorization.types';

export const REQUIRED_PERMISSION = 'requiredPermission';
export interface PermissionRequirement {
  permission: string;
  minimumScope: DataAccessScope;
}

export const RequirePermission = (
  permission: string,
  minimumScope: DataAccessScope = 'own',
) => SetMetadata(REQUIRED_PERMISSION, { permission, minimumScope });
