import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.interface';

interface SupabaseErrorBody {
  code?: string;
  error_code?: string;
  message?: string;
  msg?: string;
}

@Injectable()
export class SupabaseService {
  private requireEnvironment(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${name} is not configured.`);
    }
    return value;
  }

  private get url(): string {
    return this.requireEnvironment('SUPABASE_URL').replace(/\/$/, '');
  }

  private get publishableKey(): string {
    return this.requireEnvironment('SUPABASE_PUBLISHABLE_KEY');
  }

  private get serviceRoleKey(): string {
    return this.requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  }

  async verifyAccessToken(accessToken: string): Promise<AuthUser> {
    const response = await fetch(`${this.url}/auth/v1/user`, {
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new UnauthorizedException(
        'The access token is invalid or expired.',
      );
    }

    const user = (await response.json()) as { id?: string; email?: string };
    if (!user.id || !user.email) {
      throw new UnauthorizedException(
        'The authenticated account is incomplete.',
      );
    }

    return { id: user.id, email: user.email };
  }

  async userHasPermission(
    userId: string,
    permission: string,
  ): Promise<boolean> {
    const result = await this.rpc<boolean>('user_has_permission', {
      p_user_id: userId,
      p_permission: permission,
    });
    return result === true;
  }

  async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.serviceRoleKey);
    headers.set('Authorization', `Bearer ${this.serviceRoleKey}`);
    if (init.body) headers.set('Content-Type', 'application/json');

    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) await this.throwSafeUpstreamError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    return this.rest<T>(`rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async inviteUser(
    email: string,
    redirectTo: string,
    data: Record<string, unknown>,
  ): Promise<{ id: string; email: string }> {
    const inviteUrl = new URL(`${this.url}/auth/v1/invite`);
    inviteUrl.searchParams.set('redirect_to', redirectTo);
    const response = await fetch(inviteUrl, {
      method: 'POST',
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, data }),
    });

    if (!response.ok) await this.throwSafeUpstreamError(response);
    return (await response.json()) as { id: string; email: string };
  }

  private async throwSafeUpstreamError(response: Response): Promise<never> {
    let details: SupabaseErrorBody = {};
    try {
      details = (await response.json()) as SupabaseErrorBody;
    } catch {
      // Avoid returning raw provider bodies to clients.
    }

    const providerCode = details.code ?? details.error_code;
    const providerMessage = details.message ?? details.msg ?? '';
    const error = new BadGatewayException({
      message: 'The identity service could not complete the request.',
      providerCode,
      providerMessage:
        process.env.NODE_ENV === 'development' ? providerMessage : undefined,
    });
    throw error;
  }
}
