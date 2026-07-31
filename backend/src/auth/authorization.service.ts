import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { DataAccessScope, UserAuthorization } from './authorization.types';

interface RoleRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_assignable: boolean;
}

interface PermissionRecord {
  id: string;
  slug: string;
  description: string;
}

interface RolePermissionRecord {
  role_id: string;
  permission_id: string;
  access_scope: DataAccessScope;
}

const SCOPE_RANK: Record<DataAccessScope, number> = {
  own: 1,
  assigned: 2,
  team: 3,
  company: 4,
};

@Injectable()
export class AuthorizationService {
  constructor(private readonly supabase: SupabaseService) {}

  getUserAuthorization(userId: string): Promise<UserAuthorization> {
    return this.supabase.rpc<UserAuthorization>('get_user_authorization', {
      p_user_id: userId,
    });
  }

  async getScope(
    userId: string,
    permission: string,
  ): Promise<DataAccessScope | null> {
    const result = await this.supabase.rpc<DataAccessScope | null>(
      'user_permission_scope',
      { p_user_id: userId, p_permission: permission },
    );
    return result ?? null;
  }

  async can(
    userId: string,
    permission: string,
    minimumScope: DataAccessScope = 'own',
  ): Promise<boolean> {
    const scope = await this.getScope(userId, permission);
    return scope !== null && SCOPE_RANK[scope] >= SCOPE_RANK[minimumScope];
  }

  async listRoleDefinitions() {
    const [roles, permissions, links] = await Promise.all([
      this.supabase.rest<RoleRecord[]>(
        'roles?select=id,slug,name,description,is_assignable&order=name.asc',
      ),
      this.supabase.rest<PermissionRecord[]>(
        'permissions?select=id,slug,description&order=slug.asc',
      ),
      this.supabase.rest<RolePermissionRecord[]>(
        'role_permissions?select=role_id,permission_id,access_scope',
      ),
    ]);
    const permissionMap = new Map(
      permissions.map((permission) => [permission.id, permission]),
    );

    return roles.map((role) => ({
      ...role,
      permissions: links
        .filter((link) => link.role_id === role.id)
        .flatMap((link) => {
          const permission = permissionMap.get(link.permission_id);
          return permission
            ? [{ ...permission, scope: link.access_scope }]
            : [];
        })
        .sort((left, right) => left.slug.localeCompare(right.slug)),
    }));
  }
}
