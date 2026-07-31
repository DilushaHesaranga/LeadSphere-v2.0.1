import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  DataAccessScope,
  RecordAccessTarget,
  UserAuthorization,
} from './authorization.types';

@Injectable()
export class DataScopeResolver {
  canAccess(
    authorization: UserAuthorization,
    permission: string,
    target: RecordAccessTarget,
  ): boolean {
    const scope = authorization.permissions[permission];
    if (!scope) return false;
    return this.matchesScope(scope, authorization, target);
  }

  assertAccess(
    authorization: UserAuthorization,
    permission: string,
    target: RecordAccessTarget,
  ): void {
    if (!this.canAccess(authorization, permission, target)) {
      throw new NotFoundException('The requested record was not found.');
    }
  }

  private matchesScope(
    scope: DataAccessScope,
    authorization: UserAuthorization,
    target: RecordAccessTarget,
  ): boolean {
    const userId = authorization.profile?.id;
    if (!userId) return false;
    if (scope === 'company') return true;
    if (scope === 'team') {
      return Boolean(
        target.teamId &&
        authorization.teams.some((team) => team.id === target.teamId),
      );
    }
    if (scope === 'assigned') {
      return target.assignedUserId === userId || target.ownerId === userId;
    }
    return target.ownerId === userId;
  }
}
