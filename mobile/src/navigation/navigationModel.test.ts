import { mobileNavigationItems } from "./navigationModel";

describe("mobile navigation inventory", () => {
  it("contains only implemented, permitted Sales Executive areas", () => {
    const items = mobileNavigationItems({
      "console.access": "company",
      "leads.read": "assigned",
      "accounts.read": "assigned",
      "deals.read": "assigned",
    });
    expect(items.map((item) => item.key)).toEqual(["Home", "Profile"]);
  });

  it("does not expose Home without console access", () => {
    expect(mobileNavigationItems({}).map((item) => item.key)).toEqual([
      "Profile",
    ]);
  });
});
