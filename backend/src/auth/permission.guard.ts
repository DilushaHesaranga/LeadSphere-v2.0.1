import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.interface';
import { AuthorizationService } from './authorization.service';
import type { UserAuthorization } from './authorization.types';
import {
  REQUIRED_PERMISSION,
  type PermissionRequirement,
} from './permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      REQUIRED_PERMISSION,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) return true;

    const request = context
      .switchToHttp()
      .getRequest<
        Request & { authUser?: AuthUser; authorization?: UserAuthorization }
      >();
    const user = request.authUser;
    if (
      !user ||
      !(await this.authorization.can(
        user.id,
        requirement.permission,
        requirement.minimumScope,
      ))
    ) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    request.authorization = await this.authorization.getUserAuthorization(
      user.id,
    );

    return true;
  }
}
