const mockItems = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockItems.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockItems.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockItems.delete(key);
  }),
}));

import { secureSessionStorage } from "./secureSessionStorage";

describe("encrypted session persistence adapter", () => {
  beforeEach(() => mockItems.clear());

  it("round-trips sessions larger than a native secure-store item", async () => {
    const session = JSON.stringify({ access_token: "a".repeat(4200) });
    await secureSessionStorage.setItem("session", session);
    await expect(secureSessionStorage.getItem("session")).resolves.toBe(session);
    expect(mockItems.size).toBeGreaterThan(2);
  });

  it("removes every encrypted session chunk on sign-out", async () => {
    await secureSessionStorage.setItem("session", "secret".repeat(900));
    await secureSessionStorage.removeItem("session");
    await expect(secureSessionStorage.getItem("session")).resolves.toBeNull();
    expect(mockItems.size).toBe(0);
  });
});
