import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { env } from "@/config/env";
import type { Mutation, OutboxStore } from "./types";

const connections = new Map<string, Promise<SQLite.SQLiteDatabase>>();
async function database(userId: string): Promise<SQLite.SQLiteDatabase> {
  const scope = `${env.supabaseUrl}:${userId}`;
  let connection = connections.get(scope);
  if (!connection) {
    connection = (async () => {
      const id = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        scope,
      );
      const keyName = `offline-db-${id}`;
      let key = await SecureStore.getItemAsync(keyName);
      if (!key) {
        key = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        await SecureStore.setItemAsync(keyName, key, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
      if (!/^[a-f0-9]{64}$/.test(key))
        throw new Error("Offline storage key is invalid.");
      const db = await SQLite.openDatabaseAsync(`offline-${id}.db`);
      await db.execAsync(`PRAGMA key = '${key}';`);
      const cipher = await db.getFirstAsync<Record<string, string>>(
        "PRAGMA cipher_version",
      );
      if (!cipher || !Object.values(cipher).some(Boolean)) {
        await db.closeAsync();
        throw new Error(
          "Encrypted offline storage requires the latest LeadSphere native build.",
        );
      }
      await db.execAsync(`PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, value TEXT NOT NULL);
        PRAGMA user_version = 1;`);
      return db;
    })();
    connections.set(scope, connection);
    connection.catch(() => connections.delete(scope));
  }
  return connection;
}

export const offlineDatabase = {
  async get<T>(userId: string, key: string): Promise<T | null> {
    const row = await (
      await database(userId)
    ).getFirstAsync<{ value: string }>(
      "SELECT value FROM cache WHERE key = ?",
      key,
    );
    return row ? (JSON.parse(row.value) as T) : null;
  },
  async put(userId: string, key: string, value: unknown): Promise<void> {
    await (
      await database(userId)
    ).runAsync(
      "INSERT INTO cache(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      JSON.stringify(value),
    );
  },
  async remove(userId: string, key: string): Promise<void> {
    await (
      await database(userId)
    ).runAsync("DELETE FROM cache WHERE key = ?", key);
  },
  async clearCache(userId: string): Promise<void> {
    await (await database(userId)).runAsync("DELETE FROM cache");
  },
  async list(userId: string): Promise<Mutation[]> {
    const rows = await (
      await database(userId)
    ).getAllAsync<{ value: string }>(
      "SELECT value FROM outbox ORDER BY created_at, rowid",
    );
    return rows
      .map((row) => JSON.parse(row.value) as Mutation)
      .filter(
        (item) => item.userId === userId && item.project === env.supabaseUrl,
      );
  },
  async save(item: Mutation): Promise<void> {
    await (
      await database(item.userId)
    ).runAsync(
      "INSERT INTO outbox(id,created_at,value) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      item.id,
      item.createdAt,
      JSON.stringify(item),
    );
  },
} satisfies OutboxStore & Record<string, unknown>;
