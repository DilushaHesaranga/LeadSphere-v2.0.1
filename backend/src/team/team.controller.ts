import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth-user.interface';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { TeamService } from './team.service';

@Controller('team')
@UseGuards(AuthGuard, PermissionGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TEAM_MEMBERS_READ)
  listTeam() {
    return this.teamService.listTeam();
  }

  @Get('roles')
  @RequirePermission(PERMISSIONS.TEAM_MEMBERS_INVITE)
  listAssignableRoles() {
    return this.teamService.listAssignableRoles();
  }

  @Get('workgroups')
  @RequirePermission(PERMISSIONS.TEAMS_READ)
  listWorkgroups() {
    return this.teamService.listWorkgroups();
  }

  @Post('workgroups')
  @RequirePermission(PERMISSIONS.TEAMS_MANAGE)
  createWorkgroup(
    @Req() request: Request & { authUser: AuthUser },
    @Body() body: { name?: unknown },
  ) {
    return this.teamService.createWorkgroup(request.authUser, body.name);
  }

  @Patch('workgroups/:teamId/members/:userId')
  @RequirePermission(PERMISSIONS.TEAMS_MANAGE)
  setWorkgroupMember(
    @Req() request: Request & { authUser: AuthUser },
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Body() body: { teamRole?: unknown; status?: unknown },
  ) {
    return this.teamService.setWorkgroupMember(
      request.authUser,
      teamId,
      userId,
      body,
    );
  }

  @Post('invitations')
  @RequirePermission(PERMISSIONS.TEAM_MEMBERS_INVITE)
  inviteMember(
    @Req() request: Request & { authUser: AuthUser },
    @Body() body: { email?: unknown; role?: unknown },
  ) {
    return this.teamService.inviteMember(request.authUser, body);
  }

  @Patch('members/:userId/role')
  @RequirePermission(PERMISSIONS.TEAM_MEMBERS_ASSIGN_ROLE)
  changeRole(
    @Req() request: Request & { authUser: AuthUser },
    @Param('userId') userId: string,
    @Body() body: { role?: unknown },
  ) {
    return this.teamService.changeRole(request.authUser, userId, body.role);
  }

  @Patch('members/:userId/status')
  @RequirePermission(PERMISSIONS.TEAM_MEMBERS_CHANGE_STATUS)
  changeStatus(
    @Req() request: Request & { authUser: AuthUser },
    @Param('userId') userId: string,
    @Body() body: { status?: unknown },
  ) {
    return this.teamService.changeStatus(request.authUser, userId, body.status);
  }
}
