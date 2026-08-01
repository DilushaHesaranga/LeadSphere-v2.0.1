import fs from "node:fs";
import path from "node:path";

import { PERMISSIONS } from "./permissions";

describe("shared LeadSphere RBAC contract", () => {
  it("keeps every mobile Sales Executive permission in the authoritative migration", () => {
    const migration = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../supabase/migrations/20260731000200_granular_rbac_scopes.sql",
      ),
      "utf8",
    );
    expect(migration).toContain(
      "('sales_executive', 'console.access', 'company')",
    );
    for (const permission of Object.values(PERMISSIONS)) {
      expect(migration).toContain(`'${permission}'`);
    }
  });
});
