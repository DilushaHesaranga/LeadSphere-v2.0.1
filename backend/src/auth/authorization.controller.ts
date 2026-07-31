import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.interface';
import { AuthGuard } from './auth.guard';
import { AuthorizationService } from './authorization.service';
import { PermissionGuard } from './permission.guard';
import { RequirePermission } from './permissions.decorator';
import { PERMISSIONS } from './permissions';

@Controller('authorization')
@UseGuards(AuthGuard, PermissionGuard)
export class AuthorizationController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get('me')
  currentUser(@Req() request: Request & { authUser: AuthUser }) {
    return this.authorization.getUserAuthorization(request.authUser.id);
  }

  @Get('roles')
  @RequirePermission(PERMISSIONS.ROLES_READ)
  roleDefinitions() {
    return this.authorization.listRoleDefinitions();
  }
}
