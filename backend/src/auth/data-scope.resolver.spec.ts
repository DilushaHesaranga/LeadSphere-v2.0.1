import { NotFoundException } from '@nestjs/common';
import type { UserAuthorization } from './authorization.types';
import { DataScopeResolver } from './data-scope.resolver';

function authorization(
  permissions: UserAuthorization['permissions'],
  teams: UserAuthorization['teams'] = [],
): UserAuthorization {
  return {
    profile: {
      id: 'user-1',
      email: 'user@example.com',
      display_name: 'User',
      status: 'active',
    },
    roles: [],
    teams,
    permissions,
  };
}

describe('DataScopeResolver', () => {
  const resolver = new DataScopeResolver();

  it('limits Sales Executive records to owned or assigned work', () => {
    const access = authorization({ 'accounts.read': 'assigned' });
    expect(
      resolver.canAccess(access, 'accounts.read', {
        assignedUserId: 'user-1',
      }),
    ).toBe(true);
    expect(
      resolver.canAccess(access, 'accounts.read', {
        assignedUserId: 'another-user',
      }),
    ).toBe(false);
  });

  it('limits Sales Manager records to active team membership', () => {
    const access = authorization({ 'deals.read': 'team' }, [
      { id: 'team-1', name: 'Sales', teamRole: 'manager' },
    ]);
    expect(resolver.canAccess(access, 'deals.read', { teamId: 'team-1' })).toBe(
      true,
    );
    expect(resolver.canAccess(access, 'deals.read', { teamId: 'team-2' })).toBe(
      false,
    );
  });

  it('allows company scope without granting missing update permissions', () => {
    const access = authorization({ 'pipeline.read': 'company' });
    expect(resolver.canAccess(access, 'pipeline.read', {})).toBe(true);
    expect(resolver.canAccess(access, 'deals.update', {})).toBe(false);
  });

  it('uses 404 semantics for inaccessible records', () => {
    const access = authorization({ 'customer_context.read': 'assigned' });
    expect(() =>
      resolver.assertAccess(access, 'customer_context.read', {
        assignedUserId: 'another-user',
      }),
    ).toThrow(NotFoundException);
  });
});
