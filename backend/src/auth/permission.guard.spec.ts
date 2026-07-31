import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { PermissionGuard } from './permission.guard';

function permissionContext(
  user = { id: 'user-1', email: 'person@example.com' },
) {
  const request = { authUser: user, authorization: undefined };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext,
  };
}

describe('PermissionGuard', () => {
  const requirement = {
    permission: 'team.members.invite',
    minimumScope: 'own',
  };

  it('denies a non-admin invitation attempt', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requirement),
    } as unknown as Reflector;
    const authorization = {
      can: jest.fn().mockResolvedValue(false),
    } as unknown as AuthorizationService;
    const guard = new PermissionGuard(reflector, authorization);

    await expect(
      guard.canActivate(permissionContext().context),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('loads trusted authorization after a successful permission check', async () => {
    const userAccess = {
      profile: { id: 'user-1' },
      roles: [],
      teams: [],
      permissions: { 'team.members.invite': 'company' },
    };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requirement),
    } as unknown as Reflector;
    const can = jest.fn().mockResolvedValue(true);
    const authorization = {
      can,
      getUserAuthorization: jest.fn().mockResolvedValue(userAccess),
    } as unknown as AuthorizationService;
    const guard = new PermissionGuard(reflector, authorization);
    const { context, request } = permissionContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith('user-1', 'team.members.invite', 'own');
    expect(request.authorization).toBe(userAccess);
  });
});
