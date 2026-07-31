import { BadRequestException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { TeamService } from './team.service';

describe('TeamService', () => {
  const requester = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@example.com',
  };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:5173';
  });

  it('rejects an invalid email before contacting Supabase', async () => {
    const supabase = {
      rest: jest.fn(),
      inviteUser: jest.fn(),
    } as unknown as SupabaseService;
    const service = new TeamService(supabase);
    await expect(
      service.inviteMember(requester, {
        email: 'bad',
        role: 'marketing_executive',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never permits System Admin through the normal invitation flow', async () => {
    const rest = jest.fn();
    const supabase = {
      rest,
      inviteUser: jest.fn(),
    } as unknown as SupabaseService;
    const service = new TeamService(supabase);

    await expect(
      service.inviteMember(requester, {
        email: 'person@example.com',
        role: 'system_admin',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rest).not.toHaveBeenCalled();
  });

  it('filters assignable roles through the approved business-role list', async () => {
    const supabase = {
      rest: jest.fn().mockResolvedValue([
        {
          id: 'role-1',
          slug: 'sales_executive',
          name: 'Sales Executive',
          is_assignable: true,
        },
        {
          id: 'role-2',
          slug: 'system_admin',
          name: 'System Admin',
          is_assignable: true,
        },
      ]),
    } as unknown as SupabaseService;
    const service = new TeamService(supabase);

    await expect(service.listAssignableRoles()).resolves.toEqual([
      { slug: 'sales_executive', name: 'Sales Executive' },
    ]);
  });

  it('rejects duplicate pending invitations', async () => {
    const rest = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'role-1',
          slug: 'marketing_executive',
          name: 'Marketing Executive',
          is_assignable: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'invite-1' }]);
    const supabase = {
      rest,
      inviteUser: jest.fn(),
    } as unknown as SupabaseService;
    const service = new TeamService(supabase);
    await expect(
      service.inviteMember(requester, {
        email: 'Person@Example.com',
        role: 'marketing_executive',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores the authoritative role before sending the provider invitation', async () => {
    const rest = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'role-1',
          slug: 'marketing_executive',
          name: 'Marketing Executive',
          is_assignable: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'invite-1', email: 'person@example.com' }])
      .mockResolvedValueOnce(undefined);
    const inviteUser = jest
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'person@example.com' });
    const supabase = { rest, inviteUser } as unknown as SupabaseService;
    const service = new TeamService(supabase);

    await expect(
      service.inviteMember(requester, {
        email: ' Person@Example.com ',
        role: 'marketing_executive',
      }),
    ).resolves.toMatchObject({
      invitation: { email: 'person@example.com', role: 'marketing_executive' },
    });
    expect(inviteUser).toHaveBeenCalledWith(
      'person@example.com',
      expect.stringContaining('/accept-invite'),
      expect.objectContaining({ invited_role_label: 'Marketing Executive' }),
    );
  });

  it.each([
    ['sales_executive', 'Sales Executive'],
    ['sales_manager', 'Sales Manager'],
    ['delivery_manager', 'Delivery Manager'],
    ['leadership', 'Leadership'],
  ])('invites the permitted %s role', async (roleSlug, roleName) => {
    const rest = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'role-1',
          slug: roleSlug,
          name: roleName,
          is_assignable: true,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'invite-1', email: 'person@example.com' }])
      .mockResolvedValueOnce(undefined);
    const supabase = {
      rest,
      inviteUser: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', email: 'person@example.com' }),
    } as unknown as SupabaseService;
    const service = new TeamService(supabase);

    await expect(
      service.inviteMember(requester, {
        email: 'person@example.com',
        role: roleSlug,
      }),
    ).resolves.toMatchObject({ invitation: { role: roleSlug } });
  });

  it('rejects a manipulated role identifier', async () => {
    const rest = jest.fn();
    const supabase = { rest } as unknown as SupabaseService;
    const service = new TeamService(supabase);

    await expect(
      service.inviteMember(requester, {
        email: 'person@example.com',
        role: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rest).not.toHaveBeenCalled();
  });

  it('prevents a user from changing their own role', async () => {
    const rpc = jest.fn();
    const supabase = { rpc } as unknown as SupabaseService;
    const service = new TeamService(supabase);

    await expect(
      service.changeRole(requester, requester.id, 'sales_manager'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects an invalid scoped-team role before writing membership', async () => {
    const rest = jest.fn();
    const supabase = { rest } as unknown as SupabaseService;
    const service = new TeamService(supabase);

    await expect(
      service.setWorkgroupMember(
        requester,
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        { teamRole: 'owner', status: 'active' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rest).not.toHaveBeenCalled();
  });
});
