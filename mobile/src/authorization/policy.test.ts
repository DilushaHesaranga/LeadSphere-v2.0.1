import { can, canAccessRecord, getScope, hasRole } from "./policy";
import type { UserAuthorization } from "@/types/authorization";

const authorization: UserAuthorization = {
  profile: {
    id: "user-1",
    email: "sales@example.com",
    display_name: "Sales User",
    status: "active",
  },
  roles: [{ id: "role-1", slug: "sales_executive", name: "Sales Executive" }],
  teams: [{ id: "team-1", name: "Sales", teamRole: "member" }],
  permissions: {
    "accounts.read": "assigned",
    "activities.create": "assigned",
  },
};

describe("mobile authorization policy", () => {
  it("uses the same scope hierarchy as web and backend", () => {
    expect(getScope(authorization.permissions, "accounts.read")).toBe(
      "assigned",
    );
    expect(can(authorization.permissions, "accounts.read", "own")).toBe(true);
    expect(can(authorization.permissions, "accounts.read", "assigned")).toBe(
      true,
    );
    expect(can(authorization.permissions, "accounts.read", "team")).toBe(false);
    expect(can(authorization.permissions, "reports.read")).toBe(false);
  });

  it("recognizes trusted role records", () => {
    expect(hasRole(authorization.roles, "sales_executive")).toBe(true);
    expect(hasRole(authorization.roles, "system_admin")).toBe(false);
  });

  it("allows assigned records and denies a manually substituted record id", () => {
    expect(
      canAccessRecord(authorization, "accounts.read", {
        assignedUserId: "user-1",
      }),
    ).toBe(true);
    expect(
      canAccessRecord(authorization, "accounts.read", {
        assignedUserId: "another-user",
      }),
    ).toBe(false);
  });

  it("does not infer access from missing client data", () => {
    expect(
      canAccessRecord(authorization, "deals.read", {
        ownerId: "user-1",
      }),
    ).toBe(false);
  });
});
