import type { INestApplication } from '@nestjs/common';

const LOCAL_FRONTEND_ORIGIN = 'http://localhost:5173';
const REQUIRED_PRODUCTION_ENVIRONMENT = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'FRONTEND_URL',
] as const;

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function resolveCorsOrigins(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  const configured = environment.CORS_ORIGINS ?? environment.FRONTEND_URL ?? '';
  const origins = configured.split(',').map(normalizeOrigin).filter(Boolean);

  return origins.length > 0 ? [...new Set(origins)] : [LOCAL_FRONTEND_ORIGIN];
}

export function validateBackendEnvironment(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const production =
    environment.NODE_ENV === 'production' || environment.VERCEL === '1';
  if (!production) return environment;

  const missing = REQUIRED_PRODUCTION_ENVIRONMENT.filter(
    (name) => !environment[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required backend environment variables: ${missing.join(', ')}`,
    );
  }

  const supabaseUrl = new URL(environment.SUPABASE_URL!);
  if (supabaseUrl.protocol !== 'https:') {
    throw new Error('SUPABASE_URL must use HTTPS in production.');
  }

  const frontendUrl = new URL(environment.FRONTEND_URL!);
  if (frontendUrl.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must use HTTPS in production.');
  }

  if (
    environment.SUPABASE_PUBLISHABLE_KEY ===
    environment.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY must not be the publishable browser key.',
    );
  }

  return environment;
}

export function configureApplication(app: INestApplication): void {
  app.enableCors({
    origin: resolveCorsOrigins(),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  });
  app.setGlobalPrefix('api');
}
