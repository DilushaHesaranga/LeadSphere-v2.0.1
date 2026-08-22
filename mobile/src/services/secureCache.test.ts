import { isConnectivityError, loadCachedResource } from "./secureCache";
import { secureSessionStorage } from "./secureSessionStorage";

describe("offline cache policy", () => {
  it.each([
    "Network connection unavailable",
    "Failed to fetch",
    "Request timeout",
    "Device is offline",
  ])("allows cached reads for connectivity failure: %s", (message) => {
    expect(isConnectivityError(new Error(message))).toBe(true);
  });

  it("does not serve cached data for authorization or validation failures", () => {
    expect(isConnectivityError(new Error("Permission denied"))).toBe(false);
    expect(isConnectivityError(new Error("Select a future date"))).toBe(false);
  });

  it("does not hide fresh server data when optional cache storage fails", async () => {
    const storageFailure = jest
      .spyOn(secureSessionStorage, "setItem")
      .mockRejectedValue(new Error("Secure storage full"));
    await expect(
      loadCachedResource("user", "dashboard", async () => ({ ready: true })),
    ).resolves.toEqual({
      data: { ready: true },
      source: "network",
      cachedAt: null,
    });
    storageFailure.mockRestore();
  });
});
