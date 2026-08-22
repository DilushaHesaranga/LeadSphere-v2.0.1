import {
  defaultFollowUpFields,
  isOverdue,
  isToday,
  localDateTimeToIso,
} from "./dateTime";

describe("mobile sales date and time handling", () => {
  it("parses a valid local date and time without assuming UTC input", () => {
    const result = localDateTimeToIso("2026-08-17", "14:30");
    expect(result).toBe(new Date(2026, 7, 17, 14, 30).toISOString());
  });

  it("rejects invalid calendar values and incomplete times", () => {
    expect(localDateTimeToIso("2026-02-30", "14:30")).toBeNull();
    expect(localDateTimeToIso("2026-08-17", "9:30")).toBeNull();
  });

  it("classifies today and overdue values against an explicit clock", () => {
    const now = new Date(2026, 7, 17, 12, 0);
    expect(isToday(new Date(2026, 7, 17, 18, 0).toISOString(), now)).toBe(true);
    expect(isOverdue(new Date(2026, 7, 17, 11, 59).toISOString(), now)).toBe(true);
    expect(isOverdue(new Date(2026, 7, 17, 12, 1).toISOString(), now)).toBe(false);
  });

  it("defaults a new follow-up one hour into the future", () => {
    const fields = defaultFollowUpFields(new Date(2026, 7, 17, 23, 30));
    expect(fields).toEqual({ date: "2026-08-18", time: "00:30" });
  });
});
