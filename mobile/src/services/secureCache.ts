import { secureSessionStorage } from "./secureSessionStorage";

const CACHE_VERSION = 1;
const registryKey = (userId: string) => `crm-cache-registry:${userId}`;
const itemKey = (userId: string, resource: string) => `crm-cache:${userId}:${resource}`;

interface CacheEnvelope<T> {
  version: number;
  storedAt: string;
  value: T;
}

function parseRegistry(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) && value.every((item) => typeof item === "string")
      ? value
      : [];
  } catch {
    return [];
  }
}

export interface CachedResult<T> {
  data: T;
  source: "network" | "cache";
  cachedAt: string | null;
}

export function isConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /network|failed to fetch|fetch failed|timeout|offline|connection/i.test(message);
}

async function rememberKey(userId: string, key: string): Promise<void> {
  const raw = await secureSessionStorage.getItem(registryKey(userId));
  const keys = parseRegistry(raw);
  if (!keys.includes(key)) {
    keys.push(key);
    await secureSessionStorage.setItem(registryKey(userId), JSON.stringify(keys));
  }
}

async function writeCache<T>(userId: string, resource: string, value: T): Promise<void> {
  const key = itemKey(userId, resource);
  const envelope: CacheEnvelope<T> = {
    version: CACHE_VERSION,
    storedAt: new Date().toISOString(),
    value,
  };
  await secureSessionStorage.setItem(key, JSON.stringify(envelope));
  await rememberKey(userId, key);
}

async function readCache<T>(userId: string, resource: string): Promise<CacheEnvelope<T> | null> {
  const raw = await secureSessionStorage.getItem(itemKey(userId, resource));
  if (!raw) return null;
  try {
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    return envelope.version === CACHE_VERSION ? envelope : null;
  } catch {
    return null;
  }
}

export async function loadCachedResource<T>(
  userId: string,
  resource: string,
  loader: () => Promise<T>,
): Promise<CachedResult<T>> {
  try {
    const data = await loader();
    await writeCache(userId, resource, data).catch(() => undefined);
    return { data, source: "network", cachedAt: null };
  } catch (error) {
    if (!isConnectivityError(error)) throw error;
    const cached = await readCache<T>(userId, resource);
    if (!cached) throw error;
    return { data: cached.value, source: "cache", cachedAt: cached.storedAt };
  }
}

export async function clearUserCache(userId: string | undefined): Promise<void> {
  if (!userId) return;
  const raw = await secureSessionStorage.getItem(registryKey(userId));
  const keys = parseRegistry(raw);
  await Promise.all(keys.map((key) => secureSessionStorage.removeItem(key)));
  await secureSessionStorage.removeItem(registryKey(userId));
}
