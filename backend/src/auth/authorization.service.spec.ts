import { SupabaseService } from '../supabase/supabase.service';
import { AuthorizationService } from './authorization.service';

describe('AuthorizationService', () => {
  it('honors the permission scope hierarchy', async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue('team'),
    } as unknown as SupabaseService;
    const service = new AuthorizationService(supabase);

    await expect(service.can('user-1', 'deals.read', 'assigned')).resolves.toBe(
      true,
    );
    await expect(service.can('user-1', 'deals.read', 'company')).resolves.toBe(
      false,
    );
  });

  it('denies a missing permission', async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue(null),
    } as unknown as SupabaseService;
    const service = new AuthorizationService(supabase);

    await expect(service.can('user-1', 'team.members.invite')).resolves.toBe(
      false,
    );
  });
});
