import { mobileNavigationItems } from "./navigationModel";

describe("mobile navigation inventory", () => {
  it("contains only implemented, permitted Sales Executive areas", () => {
    const items = mobileNavigationItems({
      "console.access": "company",
      "leads.read": "assigned",
      "accounts.read": "assigned",
      "deals.read": "assigned",
      "tickets.read": "company",
      "followups.read": "assigned",
      "pipeline.read": "assigned",
    });
    expect(items.map((item) => item.key)).toEqual([
      "Home",
      "Work",
      "FollowUps",
      "Pipeline",
      "Profile",
    ]);
  });

  it("does not expose Home without console access", () => {
    expect(mobileNavigationItems({}).map((item) => item.key)).toEqual([
      "Profile",
    ]);
  });

  it("hides individual CRM areas when permission is absent", () => {
    expect(
      mobileNavigationItems({ "console.access": "company" }).map(
        (item) => item.key,
      ),
    ).toEqual(["Home", "Profile"]);
  });
});
