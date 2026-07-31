export type DataAccessScope = 'own' | 'assigned' | 'team' | 'company';

export interface AuthorizationRole {
  id: string;
  slug: string;
  name: string;
}

export interface AuthorizationTeam {
  id: string;
  name: string;
  teamRole: 'member' | 'manager';
}

export interface AuthorizationProfile {
  id: string;
  email: string;
  display_name: string | null;
  status: 'active' | 'disabled';
}

export interface UserAuthorization {
  profile: AuthorizationProfile | null;
  roles: AuthorizationRole[];
  teams: AuthorizationTeam[];
  permissions: Record<string, DataAccessScope>;
}

export interface RecordAccessTarget {
  ownerId?: string | null;
  assignedUserId?: string | null;
  teamId?: string | null;
}
