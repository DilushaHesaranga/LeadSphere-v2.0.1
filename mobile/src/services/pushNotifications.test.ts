import { ticketIdFromNotificationData } from "@/notifications/notificationRouting";

describe("push notification routing", () => {
  it("returns a trusted ticket identifier from notification data", () => {
    expect(ticketIdFromNotificationData({ ticketId: " ticket-123 " })).toBe(
      "ticket-123",
    );
  });

  it("rejects missing and non-string ticket identifiers", () => {
    expect(ticketIdFromNotificationData({})).toBeNull();
    expect(ticketIdFromNotificationData({ ticketId: 123 })).toBeNull();
    expect(ticketIdFromNotificationData({ ticketId: " " })).toBeNull();
  });
});
