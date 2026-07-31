import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthorizationController } from './auth/authorization.controller';
import { AuthorizationService } from './auth/authorization.service';
import { DataScopeResolver } from './auth/data-scope.resolver';
import { PermissionGuard } from './auth/permission.guard';
import { SupabaseService } from './supabase/supabase.service';
import { TeamController } from './team/team.controller';
import { TeamService } from './team/team.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
  ],
  controllers: [AppController, AuthorizationController, TeamController],
  providers: [
    AppService,
    AuthorizationService,
    DataScopeResolver,
    SupabaseService,
    TeamService,
    AuthGuard,
    PermissionGuard,
  ],
})
export class AppModule {}