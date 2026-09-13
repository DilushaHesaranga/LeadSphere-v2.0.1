import {
  Body,
  Controller,
  Get,
  Param,
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
import { AssistantService } from './assistant.service';

@Controller('assistant')
@UseGuards(AuthGuard, PermissionGuard)
@RequirePermission(PERMISSIONS.TICKETS_READ)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status() {
    return this.assistant.status();
  }

  @Post('tickets/:ticketId')
  respond(
    @Req() request: Request & { authUser: AuthUser },
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
  ) {
    return this.assistant.respond(
      request.authUser.id,
      request.headers.authorization!.slice(7).trim(),
      ticketId,
      body,
    );
  }
}
