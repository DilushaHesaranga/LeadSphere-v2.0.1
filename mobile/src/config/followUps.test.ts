import {
  canCreateTicketFollowUp,
  followUpFrequencyLabel,
  groupFollowUps,
  hasFollowUpCreatorRole,
  isUserAssociatedWithTicket,
} from "./followUps";
import type { AuthorizationRole } from "@/types/authorization";
import type { FollowUp } from "@/types/crm";

const role = (slug: string): AuthorizationRole => ({
  id: `role-${slug}`,
  slug,
  name: slug,
});

const activeTicket = {
  status: "active" as const,
  responsibleManagerId: "manager-id",
  assignedUsers: [{ id: "employee-id", name: "Employee" }],
};

const followUp = (
  id: string,
  ticketId: string,
  scheduledAt: string,
): FollowUp => ({
  id,
  ticketId,
  ticketTitle: `Ticket ${ticketId}`,
  ticketNumber: ticketId,
  companyName: "ElDream",
  seriesId: null,
  scheduledAt,
  type: "CALL",
  purpose: null,
  status: "PENDING",
  recurring: false,
  frequency: null,
  seriesActive: false,
  createdById: "employee-id",
  createdByName: "Employee",
  createdAt: scheduledAt,
  updatedAt: scheduledAt,
  completedAt: null,
});

describe("mobile Follow Up policy and presentation", () => {
  it.each([
    "sales_executive",
    "marketing_executive",
    "sales_manager",
    "delivery_manager",
  ])("recognizes %s as a creator role", (slug) => {
    expect(hasFollowUpCreatorRole([role(slug)])).toBe(true);
  });

  it("does not treat unrelated administrative roles as Follow Up creators", () => {
    expect(hasFollowUpCreatorRole([role("system_admin")])).toBe(false);
  });

  it("associates both the responsible manager and active assignees", () => {
    expect(isUserAssociatedWithTicket(activeTicket, "manager-id")).toBe(true);
    expect(isUserAssociatedWithTicket(activeTicket, "employee-id")).toBe(true);
    expect(isUserAssociatedWithTicket(activeTicket, "other-id")).toBe(false);
  });

  it("requires an active ticket, an allowed role, and ticket association", () => {
    expect(
      canCreateTicketFollowUp(
        [role("sales_executive")],
        activeTicket,
        "employee-id",
      ),
    ).toBe(true);
    expect(
      canCreateTicketFollowUp(
        [role("sales_executive")],
        activeTicket,
        "other-id",
      ),
    ).toBe(false);
    expect(
      canCreateTicketFollowUp(
        [role("system_admin")],
        activeTicket,
        "manager-id",
      ),
    ).toBe(false);
    expect(
      canCreateTicketFollowUp(
        [role("sales_manager")],
        { ...activeTicket, status: "closed" },
        "manager-id",
      ),
    ).toBe(false);
  });

  it("formats recurrence labels and groups each ticket chronologically", () => {
    expect(followUpFrequencyLabel("EVERY_3_DAYS")).toBe("3 days");
    expect(followUpFrequencyLabel(null)).toBe("One-time");
    const groups = groupFollowUps([
      followUp("later", "LS-1", "2026-09-05T12:00:00.000Z"),
      followUp("other", "LS-2", "2026-09-05T11:00:00.000Z"),
      followUp("earlier", "LS-1", "2026-09-05T10:00:00.000Z"),
    ]);
    expect(groups.map((group) => group.ticketId)).toEqual(["LS-1", "LS-2"]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "earlier",
      "later",
    ]);
  });
});
