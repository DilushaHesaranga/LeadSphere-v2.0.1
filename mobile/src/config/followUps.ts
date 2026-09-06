import { ROLES } from "@/authorization/permissions";
import type { AuthorizationRole } from "@/types/authorization";
import type {
  FollowUp,
  FollowUpStatus,
  FollowUpType,
  RecurrenceFrequency,
  TicketSummary,
} from "@/types/crm";

export const FOLLOW_UP_TYPES: readonly {
  label: string;
  value: FollowUpType;
}[] = Object.freeze([
  { label: "Call", value: "CALL" },
  { label: "Email", value: "EMAIL" },
  { label: "Meeting", value: "MEETING" },
]);

export const FOLLOW_UP_FREQUENCIES: readonly {
  label: string;
  value: RecurrenceFrequency;
}[] = Object.freeze([
  { label: "Daily", value: "DAILY" },
  { label: "3 days", value: "EVERY_3_DAYS" },
  { label: "Weekly", value: "WEEKLY" },
  { label: "Monthly", value: "MONTHLY" },
]);

export const FOLLOW_UP_STATUS_OPTIONS: readonly {
  label: string;
  value: FollowUpStatus | "ALL";
}[] = Object.freeze([
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
]);

export const FOLLOW_UP_CREATOR_ROLES = Object.freeze([
  ROLES.SALES_EXECUTIVE,
  ROLES.MARKETING_EXECUTIVE,
  ROLES.SALES_MANAGER,
  ROLES.DELIVERY_MANAGER,
]);

export function hasFollowUpCreatorRole(roles: AuthorizationRole[]): boolean {
  return roles.some((role) =>
    FOLLOW_UP_CREATOR_ROLES.some((allowedRole) => allowedRole === role.slug),
  );
}

export function isUserAssociatedWithTicket(
  ticket: Pick<TicketSummary, "responsibleManagerId" | "assignedUsers">,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  return (
    ticket.responsibleManagerId === userId ||
    ticket.assignedUsers.some((assignedUser) => assignedUser.id === userId)
  );
}

export function canCreateTicketFollowUp(
  roles: AuthorizationRole[],
  ticket: Pick<
    TicketSummary,
    "responsibleManagerId" | "assignedUsers" | "status"
  >,
  userId: string | undefined,
): boolean {
  return (
    ticket.status === "active" &&
    hasFollowUpCreatorRole(roles) &&
    isUserAssociatedWithTicket(ticket, userId)
  );
}

export function followUpFrequencyLabel(
  frequency: RecurrenceFrequency | null,
): string {
  return (
    FOLLOW_UP_FREQUENCIES.find((item) => item.value === frequency)?.label ??
    "One-time"
  );
}

export interface FollowUpGroup {
  ticketId: string;
  ticketTitle: string;
  ticketNumber: string;
  companyName: string;
  items: FollowUp[];
}

export function groupFollowUps(items: FollowUp[]): FollowUpGroup[] {
  const groups = new Map<string, FollowUpGroup>();
  const sorted = [...items].sort(
    (left, right) =>
      new Date(left.scheduledAt).getTime() -
      new Date(right.scheduledAt).getTime(),
  );
  for (const item of sorted) {
    const group = groups.get(item.ticketId) ?? {
      ticketId: item.ticketId,
      ticketTitle: item.ticketTitle,
      ticketNumber: item.ticketNumber,
      companyName: item.companyName,
      items: [],
    };
    group.items.push(item);
    groups.set(item.ticketId, group);
  }
  return [...groups.values()];
}
