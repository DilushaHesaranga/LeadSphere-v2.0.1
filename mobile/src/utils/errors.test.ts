import { friendlyAuthError, friendlyRequestError } from "./errors";

describe("safe mobile errors", () => {
  it("maps invalid credentials without exposing provider details", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe(
      "The email address or password is incorrect.",
    );
  });

  it("provides an offline-safe network message", () => {
    expect(
      friendlyRequestError(new TypeError("Network request failed")),
    ).toContain("Check your network");
  });
});
