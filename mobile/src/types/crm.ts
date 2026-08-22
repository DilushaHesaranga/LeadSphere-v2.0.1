export type BusinessArea = "leads" | "customers";
export type FollowUpStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type FollowUpType = "CALL" | "EMAIL" | "MEETING";
export type RecurrenceFrequency =
  | "DAILY"
  | "EVERY_3_DAYS"
  | "WEEKLY"
  | "MONTHLY";

export interface AssignedUser {
  id: string;
  name: string;
}

export interface TicketSummary {
  id: string;
  caseId: string;
  projectTitle: string;
  currentDepartment: string;
  pipelineId: string;
  pipelineName: string;
  stage: string;
  stageName: string;
  stageProbability: number;
  stageCategory: "open" | "won" | "lost";
  stageEnteredAt: string;
  pipelineVersion: number;
  status: "active" | "closed" | "archived";
  responsibleManagerId: string;
  responsibleManagerName: string;
  assignedUsers: AssignedUser[];
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface TicketContact {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
}

export interface TicketNote {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface TicketActivity {
  id: string;
  action: string;
  actorName: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  companyName: string;
  contacts: TicketContact[];
  notes: TicketNote[];
  activity: TicketActivity[];
  requests: unknown[];
}

export interface CaseSummary {
  id: string;
  companyName: string;
  createdAt: string;
  updatedAt: string;
  ticketCount: number;
  activeTicketCount: number;
  tickets: TicketSummary[];
}

export interface FollowUp {
  id: string;
  ticketId: string;
  ticketTitle: string;
  ticketNumber: string;
  companyName: string;
  seriesId: string | null;
  scheduledAt: string;
  type: FollowUpType;
  purpose: string | null;
  status: FollowUpStatus;
  recurring: boolean;
  frequency: RecurrenceFrequency | null;
  seriesActive: boolean;
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PipelineStage {
  slug: string;
  name: string;
  businessArea: BusinessArea;
  probability: number;
  category: "open" | "won" | "lost";
  sortOrder: number;
  totalCount: number;
  hasMore: boolean;
  cards: PipelineCard[];
}

export interface PipelineCard {
  id: string;
  ticketNumber: string;
  caseId: string;
  companyName: string;
  projectTitle: string;
  pipelineId: string;
  stage: string;
  stageEnteredAt: string;
  stageAgeSeconds: number;
  pipelineVersion: number;
  status: "active" | "closed" | "archived";
  canMove: boolean;
  responsibleManagerId: string;
  responsibleManagerName: string;
  assignedUsers: AssignedUser[];
  nextFollowUpAt: string | null;
  hasOverdueFollowUp: boolean;
  updatedAt: string;
}

export interface PipelineBoard {
  pipeline: { id: string; slug: string; name: string; isDefault: boolean };
  totalCount: number;
  page: number;
  pageSize: number;
  owners: AssignedUser[];
  stages: PipelineStage[];
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  unreadCount: number;
  items: NotificationItem[];
}

export interface DashboardData {
  pipeline: PipelineBoard;
  pendingFollowUps: FollowUp[];
  notifications: NotificationFeed;
}

export interface CreateFollowUpInput {
  ticketId: string;
  scheduledAt: string;
  type: FollowUpType;
  purpose?: string;
  recurring: boolean;
  frequency?: RecurrenceFrequency;
  clientRequestId: string;
}
