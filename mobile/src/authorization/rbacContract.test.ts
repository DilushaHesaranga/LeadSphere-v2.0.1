import fs from "node:fs";
import path from "node:path";

import { PERMISSIONS } from "./permissions";

describe("shared LeadSphere RBAC contract", () => {
  it("keeps every mobile Sales Executive permission in the authoritative migrations", () => {
    const migrationDirectory = path.resolve(
      __dirname,
      "../../../supabase/migrations",
    );
    const migrations = fs
      .readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .map((file) => fs.readFileSync(path.join(migrationDirectory, file), "utf8"))
      .join("\n");
    expect(migrations).toContain(
      "('sales_executive', 'console.access', 'company')",
    );
    for (const permission of Object.values(PERMISSIONS)) {
      expect(migrations).toContain(`'${permission}'`);
    }
    expect(migrations).toContain("('sales_executive', 'tickets.notes.create', 'assigned')");
    expect(migrations).toContain("array['cases.read', 'tickets.read']");
  });
});
