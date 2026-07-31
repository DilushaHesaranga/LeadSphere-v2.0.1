import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthGuard } from './auth.guard';

function contextFor(authorization?: string) {
  const request = { headers: { authorization } };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe('AuthGuard', () => {
  it('rejects requests without a bearer token', async () => {
    const supabase = {
      verifyAccessToken: jest.fn(),
    } as unknown as SupabaseService;
    const guard = new AuthGuard(supabase);
    const { context } = contextFor();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches a verified user to the request', async () => {
    const user = { id: 'user-1', email: 'person@example.com' };
    const supabase = {
      verifyAccessToken: jest.fn().mockResolvedValue(user),
    } as unknown as SupabaseService;
    const guard = new AuthGuard(supabase);
    const { context, request } = contextFor('Bearer valid-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({ authUser: user });
  });
});
