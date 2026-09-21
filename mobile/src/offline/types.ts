export type SyncStatus =
  "pending" | "syncing" | "synced" | "failed" | "conflict" | "dismissed";
export type Operation =
  | "create_crm_follow_up"
  | "add_crm_ticket_note"
  | "update_crm_follow_up"
  | "complete_crm_follow_up"
  | "cancel_crm_follow_up"
  | "stop_crm_follow_up_series"
  | "move_crm_ticket_stage";
export interface Mutation {
  id: string;
  userId: string;
  project: string;
  ticketId: string;
  entityId: string;
  operation: Operation;
  payload: Record<string, unknown>;
  expectedUpdatedAt: string | null;
  expectedSeriesUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: SyncStatus;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  retryable: boolean;
  result?: Record<string, unknown>;
}
export interface OutboxStore {
  list(userId: string): Promise<Mutation[]>;
  save(item: Mutation): Promise<void>;
}
