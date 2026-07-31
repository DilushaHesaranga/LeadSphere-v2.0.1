import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.interface';
import { BUSINESS_ROLE_CODES, isBusinessRoleCode } from '../auth/permissions';
import { SupabaseService } from '../supabase/supabase.service';

interface RoleRecord {
  id: string;
  slug: string;
  name: string;
  is_assignable: boolean;
}

interface ProfileRecord {
  id: string;
  email: string;
  display_name: string | null;
  status: string;
}

interface MembershipRecord {
  user_id: string;
  role_id: string;
  status: string;
  assigned_at: string;
}

interface InvitationRecord {
  id: string;
  email: string;
  role_id: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

export interface TeamMemberRecord {
  team_id: string;
  user_id: string;
  team_role: string;
  status: string;
  assigned_at: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TeamService {
  constructor(private readonly supabase: SupabaseService) {}

  async listTeam() {
    const [memberships, profiles, roles, invitations] = await Promise.all([
      this.supabase.rest<MembershipRecord[]>(
        'user_roles?select=user_id,role_id,status,assigned_at&order=assigned_at.desc',
      ),
      this.supabase.rest<ProfileRecord[]>(
        'profiles?select=id,email,display_name,status',
      ),
      this.supabase.rest<RoleRecord[]>(
        'roles?select=id,slug,name,is_assignable&order=name.asc',
      ),
      this.supabase.rest<InvitationRecord[]>(
        'invitations?select=id,email,role_id,status,expires_at,created_at&status=eq.pending&order=created_at.desc',
      ),
    ]);

    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );
    const roleMap = new Map(roles.map((role) => [role.id, role]));
    const currentMemberships = [...memberships]
      .sort((left, right) => {
        if (left.status !== right.status)
          return left.status === 'active' ? -1 : 1;
        return right.assigned_at.localeCompare(left.assigned_at);
      })
      .filter(
        (membership, index, values) =>
          values.findIndex(
            (candidate) => candidate.user_id === membership.user_id,
          ) === index,
      );

    return {
      members: currentMemberships.flatMap((membership) => {
        const profile = profileMap.get(membership.user_id);
        const role = roleMap.get(membership.role_id);
        return profile && role
          ? [
              {
                id: profile.id,
                email: profile.email,
                displayName: profile.display_name,
                role: role.slug,
                roleName: role.name,
                membershipStatus: membership.status,
                profileStatus: profile.status,
                assignedAt: membership.assigned_at,
              },
            ]
          : [];
      }),
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: roleMap.get(invitation.role_id)?.slug ?? 'unknown',
        roleName: roleMap.get(invitation.role_id)?.name ?? 'Unknown role',
        expiresAt: invitation.expires_at,
        createdAt: invitation.created_at,
      })),
    };
  }

  async listAssignableRoles() {
    const roleFilter = BUSINESS_ROLE_CODES.join(',');
    const roles = await this.supabase.rest<RoleRecord[]>(
      `roles?select=id,slug,name,is_assignable&is_assignable=eq.true&slug=in.(${roleFilter})&order=name.asc`,
    );
    return roles
      .filter((role) => isBusinessRoleCode(role.slug))
      .map(({ slug, name }) => ({ slug, name }));
  }

  async listWorkgroups() {
    const [teams, members, profiles] = await Promise.all([
      this.supabase.rest<TeamRecord[]>(
        'teams?select=id,name,status,created_at&order=name.asc',
      ),
      this.supabase.rest<TeamMemberRecord[]>(
        'team_members?select=team_id,user_id,team_role,status,assigned_at&order=assigned_at.desc',
      ),
      this.supabase.rest<ProfileRecord[]>(
        'profiles?select=id,email,display_name,status',
      ),
    ]);
    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );

    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      status: team.status,
      createdAt: team.created_at,
      members: members
        .filter((member) => member.team_id === team.id)
        .map((member) => ({
          userId: member.user_id,
          email: profileMap.get(member.user_id)?.email ?? null,
          displayName: profileMap.get(member.user_id)?.display_name ?? null,
          teamRole: member.team_role,
          status: member.status,
          assignedAt: member.assigned_at,
        })),
    }));
  }

  async createWorkgroup(requester: AuthUser, nameValue: unknown) {
    if (typeof nameValue !== 'string') {
      throw new BadRequestException('Team name is required.');
    }
    const name = nameValue.trim();
    if (name.length < 2 || name.length > 80) {
      throw new BadRequestException(
        'Team name must be between 2 and 80 characters.',
      );
    }
    const [team] = await this.supabase.rest<TeamRecord[]>('teams', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name, created_by: requester.id }),
    });
    if (!team) {
      throw new InternalServerErrorException('The team could not be created.');
    }
    return { message: `${team.name} was created.`, team };
  }

  async setWorkgroupMember(
    requester: AuthUser,
    teamId: string,
    userId: string,
    input: { teamRole?: unknown; status?: unknown },
  ) {
    this.validateUserId(teamId);
    this.validateUserId(userId);
    if (input.teamRole !== 'member' && input.teamRole !== 'manager') {
      throw new BadRequestException('Select a valid team role.');
    }
    if (input.status !== 'active' && input.status !== 'disabled') {
      throw new BadRequestException('Select a valid team membership status.');
    }

    const [teams, profiles] = await Promise.all([
      this.supabase.rest<TeamRecord[]>(
        `teams?select=id,name,status,created_at&id=eq.${teamId}&limit=1`,
      ),
      this.supabase.rest<ProfileRecord[]>(
        `profiles?select=id,email,display_name,status&id=eq.${userId}&limit=1`,
      ),
    ]);
    if (!teams[0] || !profiles[0]) {
      throw new BadRequestException('The selected team or member is invalid.');
    }

    await this.supabase.rest<TeamMemberRecord[]>(
      'team_members?on_conflict=team_id,user_id',
      {
        method: 'POST',
        headers: {
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({
          team_id: teamId,
          user_id: userId,
          team_role: input.teamRole,
          status: input.status,
          assigned_by: requester.id,
          assigned_at: new Date().toISOString(),
        }),
      },
    );
    return { message: 'The team membership was updated.' };
  }

  async inviteMember(
    requester: AuthUser,
    input: { email?: unknown; role?: unknown },
  ) {
    const email = this.normalizeEmail(input.email);
    const roleSlug = this.validateRoleSlug(input.role);

    const roles = await this.supabase.rest<RoleRecord[]>(
      `roles?select=id,slug,name,is_assignable&slug=eq.${encodeURIComponent(roleSlug)}&is_assignable=eq.true&limit=1`,
    );
    const role = roles[0];
    if (!role)
      throw new BadRequestException('The selected role is not assignable.');

    const existingProfiles = await this.supabase.rest<ProfileRecord[]>(
      `profiles?select=id,email,display_name,status&email=eq.${encodeURIComponent(email)}&limit=1`,
    );
    if (existingProfiles.length > 0) {
      throw new ConflictException(
        'A registered user already uses this email address.',
      );
    }

    const pending = await this.supabase.rest<InvitationRecord[]>(
      `invitations?select=id,email,role_id,status,expires_at,created_at&email=eq.${encodeURIComponent(email)}&status=eq.pending&limit=1`,
    );
    if (pending.length > 0) {
      throw new ConflictException(
        'A pending invitation already exists for this email address.',
      );
    }

    const expiryHours = Number(process.env.INVITATION_EXPIRY_HOURS ?? 24);
    const expiresAt = new Date(
      Date.now() +
        (Number.isFinite(expiryHours) ? expiryHours : 24) * 60 * 60 * 1000,
    ).toISOString();
    const [invitation] = await this.supabase.rest<InvitationRecord[]>(
      'invitations',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          email,
          role_id: role.id,
          invited_by: requester.id,
          expires_at: expiresAt,
        }),
      },
    );

    if (!invitation)
      throw new InternalServerErrorException(
        'The invitation could not be recorded.',
      );

    try {
      const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '');
      if (!frontendUrl) {
        throw new InternalServerErrorException(
          'FRONTEND_URL is not configured.',
        );
      }
      const invitedUser = await this.supabase.inviteUser(
        email,
        `${frontendUrl}/accept-invite`,
        { invitation_id: invitation.id, invited_role_label: role.name },
      );
      await this.supabase.rest(`invitations?id=eq.${invitation.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ provider_user_id: invitedUser.id }),
      });
    } catch (error) {
      await this.supabase.rest(`invitations?id=eq.${invitation.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed' }),
      });
      throw error;
    }

    return {
      message: `Invitation sent to ${email}.`,
      invitation: {
        id: invitation.id,
        email,
        role: role.slug,
        roleName: role.name,
        expiresAt,
      },
    };
  }

  async changeRole(requester: AuthUser, userId: string, roleValue: unknown) {
    this.validateUserId(userId);
    if (requester.id === userId) {
      throw new BadRequestException('Users cannot change their own role.');
    }
    const role = this.validateRoleSlug(roleValue);
    await this.supabase.rpc<void>('assign_business_role', {
      p_actor_id: requester.id,
      p_user_id: userId,
      p_role_slug: role,
    });
    return { message: 'The member role was updated.' };
  }

  async changeStatus(
    requester: AuthUser,
    userId: string,
    statusValue: unknown,
  ) {
    this.validateUserId(userId);
    if (requester.id === userId) {
      throw new BadRequestException(
        'Users cannot change their own membership status.',
      );
    }
    if (statusValue !== 'active' && statusValue !== 'disabled') {
      throw new BadRequestException('Select a valid membership status.');
    }
    await this.supabase.rpc<void>('set_business_membership_status', {
      p_actor_id: requester.id,
      p_user_id: userId,
      p_status: statusValue,
    });
    return {
      message: `The member was ${statusValue === 'active' ? 'activated' : 'deactivated'}.`,
    };
  }

  private normalizeEmail(value: unknown): string {
    if (typeof value !== 'string')
      throw new BadRequestException('Email is required.');
    const email = value.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new BadRequestException('Enter a valid email address.');
    }
    return email;
  }

  private validateRoleSlug(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{2,50}$/.test(value)) {
      throw new BadRequestException('Select a valid role.');
    }
    if (!isBusinessRoleCode(value)) {
      throw new BadRequestException('The selected role is not assignable.');
    }
    return value;
  }

  private validateUserId(userId: string): void {
    if (!UUID_PATTERN.test(userId)) {
      throw new BadRequestException('The selected member is invalid.');
    }
  }
}
