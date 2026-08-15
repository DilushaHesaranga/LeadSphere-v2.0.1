import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveCorsOrigins, validateBackendEnvironment } from './app.setup';

describe('Vercel backend configuration', () => {
  it('normalizes and deduplicates configured CORS origins', () => {
    expect(
      resolveCorsOrigins({
        CORS_ORIGINS:
          'https://leadsphere.web.app/, https://preview.example.com, https://leadsphere.web.app',
      }),
    ).toEqual(['https://leadsphere.web.app', 'https://preview.example.com']);
  });

  it('uses the local Vite origin only outside configured deployments', () => {
    expect(resolveCorsOrigins({})).toEqual(['http://localhost:5173']);
  });

  it('rejects an incomplete Vercel production environment', () => {
    expect(() => validateBackendEnvironment({ VERCEL: '1' })).toThrow(
      /SUPABASE_URL.*SUPABASE_PUBLISHABLE_KEY.*SUPABASE_SERVICE_ROLE_KEY.*FRONTEND_URL/,
    );
  });

  it('accepts distinct server credentials and HTTPS production origins', () => {
    const environment = {
      VERCEL: '1',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
      SUPABASE_SERVICE_ROLE_KEY: 'server-secret',
      FRONTEND_URL: 'https://leadsphere.web.app',
    };
    expect(validateBackendEnvironment(environment)).toBe(environment);
  });

  it('uses Vercel native NestJS framework detection', () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { framework?: string; builds?: unknown };
    expect(config.framework).toBe('nestjs');
    expect(config.builds).toBeUndefined();
  });
});
