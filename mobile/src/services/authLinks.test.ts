import { parseAuthLink } from "./authLinks";

describe("authentication deep links", () => {
  it("parses PKCE recovery links", () => {
    expect(parseAuthLink("leadsphere://reset-password?code=abc")).toEqual({
      code: "abc",
      accessToken: null,
      refreshToken: null,
      isRecovery: true,
    });
  });

  it("parses implicit recovery tokens from the fragment", () => {
    expect(
      parseAuthLink(
        "leadsphere://reset-password#access_token=access&refresh_token=refresh&type=recovery",
      ),
    ).toEqual({
      code: null,
      accessToken: "access",
      refreshToken: "refresh",
      isRecovery: true,
    });
  });
});
