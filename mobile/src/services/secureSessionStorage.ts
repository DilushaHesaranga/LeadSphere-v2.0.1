import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;

function safeKey(key: string): string {
  return `leadsphere_${key.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

function metaKey(key: string): string {
  return `${safeKey(key)}.meta`;
}

function chunkKey(key: string, index: number): string {
  return `${safeKey(key)}.${index}`;
}

async function storedChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(metaKey(key));
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function removeSecureItem(key: string): Promise<void> {
  const count = await storedChunkCount(key);
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index)),
    ),
  );
  await SecureStore.deleteItemAsync(metaKey(key));
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await storedChunkCount(key);
    if (!count) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index)),
      ),
    );
    if (chunks.some((chunk) => chunk === null)) {
      await removeSecureItem(key);
      return null;
    }
    return chunks.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await removeSecureItem(key);
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, "gs")) ?? [""];
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(chunkKey(key, index), chunk),
      ),
    );
    await SecureStore.setItemAsync(metaKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await removeSecureItem(key);
  },
};
