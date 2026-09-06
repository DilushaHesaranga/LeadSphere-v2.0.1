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

describe("operational Follow Up role mobile access", () => {
  it.each([
    ["sales_executive", "Sales Executive"],
    ["marketing_executive", "Marketing Executive"],
    ["sales_manager", "Sales Manager"],
    ["delivery_manager", "Delivery Manager"],
  ])("allows an active %s with console access", (slug, name) => {
    expect(
      decideMobileAccess(
        access({ roles: [{ id: `role-${slug}`, slug, name }] }),
      ),
    ).toBe("allowed");
  });

  it("denies inactive users", () => {
    expect(
      decideMobileAccess(
        access({ profile: { ...access().profile!, status: "disabled" } }),
      ),
    ).toBe("disabled");
  });

  it("shows the unsupported experience for roles outside the mobile scope", () => {
    expect(
      decideMobileAccess(
        access({
          roles: [
            { id: "role-2", slug: "system_admin", name: "System Admin" },
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
