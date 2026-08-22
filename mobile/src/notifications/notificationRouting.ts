export function ticketIdFromNotificationData(
  data: Record<string, unknown>,
): string | null {
  const ticketId = data.ticketId;
  return typeof ticketId === "string" && ticketId.trim()
    ? ticketId.trim()
    : null;
}
