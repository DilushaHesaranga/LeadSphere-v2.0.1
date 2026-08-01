import { decideMobileAccess } from "./mobileAccess";
import type { UserAuthorization } from "@/types/authorization";

function access(overrides: Partial<UserAuthorization> = {}): UserAuthorization {
  return {
    profile: {
      id: "user-1",
      email: "sales@example.com",
      display_name: "Sales User",
      status: "active",
    },
    roles: [{ id: "role-1", slug: "sales_executive", name: "Sales Executive" }],
    teams: [],
    permissions: { "console.access": "company" },
    ...overrides,
  };
}

describe("Sales Executive mobile restriction", () => {
  it("allows an active Sales Executive with console access", () => {
    expect(decideMobileAccess(access())).toBe("allowed");
  });

  it("denies inactive users", () => {
    expect(
      decideMobileAccess(
        access({ profile: { ...access().profile!, status: "disabled" } }),
      ),
    ).toBe("disabled");
  });

  it("shows the unsupported experience for other roles", () => {
    expect(
      decideMobileAccess(
        access({
          roles: [
            { id: "role-2", slug: "sales_manager", name: "Sales Manager" },
          ],
        }),
      ),
    ).toBe("unsupported-role");
  });

  it("requires the trusted console permission", () => {
    expect(decideMobileAccess(access({ permissions: {} }))).toBe(
      "missing-access",
    );
  });
});
