import type { Session } from "@supabase/supabase-js";
import { env } from "@/config/env";
import { can } from "@/authorization/policy";
import {
  canCreateTicketFollowUp,
  isUserAssociatedWithTicket,
} from "@/config/followUps";
import { offlineDatabase as db } from "./database";
import { SyncEngine, SyncError } from "./engine";
import type { Mutation, Operation } from "./types";
import type { UserAuthorization } from "@/types/authorization";
import type { FollowUp, PipelineBoard, TicketDetail } from "@/types/crm";
import { createRequestId } from "@/utils/requestId";

export const MUTATIONS = new Set<string>([
  "create_crm_follow_up",
  "add_crm_ticket_note",
  "update_crm_follow_up",
  "complete_crm_follow_up",
  "cancel_crm_follow_up",
  "stop_crm_follow_up_series",
  "move_crm_ticket_stage",
]);
type Transport = (
  name: string,
  params: Record<string, unknown>,
  token: string,
) => Promise<unknown>;
let session: Session | null = null;
let access: UserAuthorization | null = null;
let transport: Transport | null = null;
let serverVerified = false;
let online = true;
let epoch = 0;
let enqueueLock: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export function subscribeOffline(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function changed() {
  listeners.forEach((fn) => fn());
}
export function activeOfflineUser(): string | null {
  return session?.expires_at &&
    session.expires_at * 1000 > Date.now() &&
    access?.profile?.id === session.user.id &&
    access.profile.status === "active"
    ? session.user.id
    : null;
}
export function configureOffline(
  nextSession: Session | null,
  authorization: UserAuthorization | null,
  verified: boolean,
) {
  if (session?.user.id !== nextSession?.user.id) epoch++;
  session = nextSession;
  access = authorization;
  serverVerified = verified;
  changed();
}
export function canUseCachedSession(
  candidate: Pick<Session, "expires_at" | "user">,
  authorization: UserAuthorization | null,
  now = Date.now(),
): boolean {
  return Boolean(
    candidate.expires_at &&
    candidate.expires_at * 1000 > now &&
    authorization?.profile?.id === candidate.user.id &&
    authorization.profile.status === "active",
  );
}
export function configureTransport(send: Transport) {
  transport = send;
}
export function setConnectivity(value: boolean) {
  if (online === value) return;
  online = value;
  changed();
}
export function isOffline() {
  return !online;
}
export function hasOfflineIdentity() {
  return Boolean(activeOfflineUser());
}
export async function listQueue(): Promise<Mutation[]> {
  const user = activeOfflineUser();
  return user ? db.list(user) : [];
}
export async function readAuthorization(
  user: string,
): Promise<UserAuthorization | null> {
  return db.get(user, "authorization");
}
export async function saveAuthorization(
  user: string,
  value: UserAuthorization,
): Promise<void> {
  return db.put(user, "authorization", value);
}
export async function dismissMutation(id: string): Promise<void> {
  const item = (await listQueue()).find((entry) => entry.id === id);
  if (
    item &&
    (item.status === "failed" || item.status === "conflict") &&
    !item.retryable
  ) {
    await db.save({
      ...item,
      status: "dismissed",
      updatedAt: new Date().toISOString(),
    });
    changed();
  }
}

export function classifyFailure(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  const message =
    error instanceof Error ? error.message : "The request failed.";
  if (/conflict/i.test(message)) return new SyncError(message, "conflict");
  if (/jwt|expired|authentication|401/i.test(message))
    return new SyncError(
      "Sign in online again to synchronize your saved work.",
      "auth",
    );
  if (/network|fetch|timeout|connection|abort|502|503|504|429/i.test(message))
    return new SyncError(
      "Connection unavailable. Your change is saved on this device.",
      "retry",
    );
  return new SyncError(message, "rejected");
}

export const syncEngine = new SyncEngine(
  db,
  () => (serverVerified ? activeOfflineUser() : null),
  async (item) => {
    if (
      !transport ||
      !session ||
      activeOfflineUser() !== item.userId ||
      item.project !== env.supabaseUrl
    )
      throw new SyncError(
        "Sign in as the original user to synchronize.",
        "auth",
      );
    try {
      const result = await transport(
        "sync_crm_mobile_mutation",
        {
          p_mutation_id: item.id,
          p_operation: item.operation,
          p_payload: item.payload,
          p_expected_updated_at: item.expectedUpdatedAt,
          p_expected_series_updated_at: item.expectedSeriesUpdatedAt,
        },
        session.access_token,
      );
      setConnectivity(true);
      return result as Record<string, unknown>;
    } catch (error) {
      const failure = classifyFailure(error);
      if (failure.kind === "retry") setConnectivity(false);
      throw failure;
    }
  },
  changed,
);

async function capture(user: string, name: string, value: unknown) {
  if (name === "get_crm_ticket") {
    const ticket = value as TicketDetail;
    await db.put(user, `ticket:${ticket.id}`, ticket);
  }
  if (name === "list_crm_follow_ups") {
    for (const item of value as FollowUp[])
      await db.put(user, `followup:${item.id}`, item);
    // Existing RPC exposes frequency but not the series version. RLS filters this read.
    const ids = [
      ...new Set(
        (value as FollowUp[])
          .map((item) => item.seriesId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length && session && transport) {
      const versions = (await transport(
        "__series_versions",
        { ids },
        session.access_token,
      )) as { id: string; ticket_id: string; updated_at: string }[];
      for (const series of versions)
        await db.put(user, `series:${series.id}`, series);
    }
  }
  if (name === "get_crm_pipeline_board") {
    const board = value as PipelineBoard;
    for (const stage of board.stages)
      for (const card of stage.cards)
        await db.put(user, `pipeline:${card.id}`, card);
  }
}

export async function readOfflineRpc<T>(
  name: string,
  params: Record<string, unknown>,
  loader: () => Promise<T>,
): Promise<T> {
  const user = activeOfflineUser();
  if (!user)
    throw new Error(
      "Connect to the internet and sign in to access your saved data.",
    );
  const generation = epoch;
  const key = `rpc:${name}:${JSON.stringify(params)}`;
  let value: T;
  let cached = await db.get<{ value: T; storedAt: string }>(user, key);
  if (!cached && name === "list_crm_follow_ups" && params.p_status) {
    cached = await db.get(
      user,
      `rpc:${name}:${JSON.stringify({ ...params, p_status: null })}`,
    );
  }
  try {
    if (!online && cached) throw new SyncError("Offline", "retry");
    value = await loader();
    if (generation !== epoch || activeOfflineUser() !== user)
      throw new SyncError("Session changed.", "auth");
    await capture(user, name, value);
    await db.put(user, key, { value, storedAt: new Date().toISOString() });
    setConnectivity(true);
  } catch (error) {
    if (
      classifyFailure(error).kind !== "retry" ||
      !cached ||
      generation !== epoch ||
      activeOfflineUser() !== user
    )
      throw error;
    setConnectivity(false);
    value = cached.value;
  }
  return projectChanges(name, params, value, await db.list(user)) as T;
}

export function projectChanges(
  name: string,
  params: Record<string, unknown>,
  value: unknown,
  queue: Mutation[],
): unknown {
  const pending = queue.filter(
    (item) => item.status !== "synced" && item.status !== "dismissed",
  );
  if (name === "list_crm_follow_ups") {
    let items = [...(value as FollowUp[])];
    for (const m of pending) {
      if (
        m.operation === "create_crm_follow_up" &&
        (!params.p_ticket_id || params.p_ticket_id === m.ticketId)
      ) {
        if (!items.some((item) => item.id === m.id))
          items.push({
            id: m.id,
            ticketId: m.ticketId,
            ticketTitle: String(m.payload.localTitle ?? "Saved follow-up"),
            ticketNumber: m.ticketId.slice(0, 8),
            companyName: String(m.payload.localCompany ?? ""),
            scheduledAt: String(m.payload.p_scheduled_at),
            type: m.payload.p_type as FollowUp["type"],
            purpose: m.payload.p_purpose as string | null,
            recurring: Boolean(m.payload.p_recurring),
            frequency: m.payload.p_frequency as FollowUp["frequency"],
            seriesId: null,
            seriesActive: Boolean(m.payload.p_recurring),
            status: "PENDING",
            createdById: m.userId,
            createdByName: "You",
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
            completedAt: null,
            syncStatus: m.status,
            syncError: m.error,
          });
      } else
        items = items.map((item) => {
          if (
            item.id !== m.entityId &&
            !(
              m.operation === "stop_crm_follow_up_series" &&
              item.seriesId === m.entityId
            )
          )
            return item;
          const proposed = m.status === "pending" || m.status === "syncing";
          return {
            ...item,
            syncStatus: m.status,
            syncError: m.error,
            ...(proposed && m.operation === "update_crm_follow_up"
              ? {
                  scheduledAt: String(m.payload.p_scheduled_at),
                  type: m.payload.p_type as FollowUp["type"],
                  purpose: m.payload.p_purpose as string | null,
                  frequency: m.payload.p_frequency as FollowUp["frequency"],
                }
              : {}),
            ...(proposed && m.operation === "complete_crm_follow_up"
              ? { status: "COMPLETED" as const }
              : {}),
            ...(proposed && m.operation === "cancel_crm_follow_up"
              ? { status: "CANCELLED" as const }
              : {}),
            ...(proposed && m.operation === "stop_crm_follow_up_series"
              ? { seriesActive: false }
              : {}),
          };
        });
    }
    return items.filter(
      (item) => !params.p_status || item.status === params.p_status,
    );
  }
  if (name === "get_crm_pipeline_board") {
    const board = value as PipelineBoard;
    const stages = board.stages.map((stage) => ({
      ...stage,
      cards: [...stage.cards],
    }));
    for (const item of pending.filter(
      (m) => m.operation === "move_crm_ticket_stage",
    )) {
      const source = stages.find((stage) =>
        stage.cards.some((card) => card.id === item.ticketId),
      );
      const card = source?.cards.find((card) => card.id === item.ticketId);
      const target = stages.find(
        (stage) => stage.slug === item.payload.p_stage_slug,
      );
      if (!source || !card || !target) continue;
      card.syncStatus = item.status;
      card.canMove = false;
      if (
        source !== target &&
        (item.status === "pending" || item.status === "syncing")
      ) {
        source.cards = source.cards.filter((entry) => entry.id !== card.id);
        source.totalCount--;
        target.cards.push({ ...card, stage: target.slug });
        target.totalCount++;
      }
    }
    return { ...board, stages };
  }
  if (name === "get_crm_ticket") {
    const ticket = value as TicketDetail;
    return {
      ...ticket,
      notes: [
        ...ticket.notes,
        ...pending
          .filter(
            (m) =>
              m.operation === "add_crm_ticket_note" && m.ticketId === ticket.id,
          )
          .map((m) => ({
            id: m.id,
            content: String(m.payload.p_content),
            authorId: m.userId,
            authorName: `You · ${m.status === "pending" ? "Pending sync" : m.status}`,
            createdAt: m.createdAt,
          })),
      ],
    };
  }
  return value;
}

export async function enqueueMutation(
  operation: Operation,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const action = enqueueLock.then(() => enqueue(operation, payload));
  enqueueLock = action.catch(() => undefined);
  return action;
}
async function enqueue(
  operation: Operation,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const user = activeOfflineUser();
  const authorization = access;
  const generation = epoch;
  if (!user || !authorization)
    throw new Error(
      "Your saved session has expired. Connect and sign in again.",
    );
  const existing = await db.list(user);
  const id = String(
    payload.p_client_request_id ||
      payload.p_idempotency_key ||
      createRequestId(),
  );
  const duplicate = existing.find((item) => item.id === id);
  if (duplicate)
    return { id, duplicate: true, pending: duplicate.status !== "synced" };
  let ticketId = String(payload.p_ticket_id ?? "");
  let entityId = String(
    payload.p_follow_up_id ?? payload.p_series_id ?? ticketId,
  );
  let expectedUpdatedAt: string | null = null;
  let expectedSeriesUpdatedAt: string | null = null;
  if (payload.p_follow_up_id) {
    const followUp = await db.get<FollowUp>(user, `followup:${entityId}`);
    if (!followUp)
      throw new Error("Open this follow-up online before changing it offline.");
    ticketId = followUp.ticketId;
    expectedUpdatedAt = followUp.updatedAt;
    if (followUp.seriesId) {
      const series = await db.get<{ updated_at: string }>(
        user,
        `series:${followUp.seriesId}`,
      );
      if (!series)
        throw new Error(
          "Load this recurring follow-up online before editing it.",
        );
      expectedSeriesUpdatedAt = series.updated_at;
    }
  }
  if (payload.p_series_id) {
    const series = await db.get<{ ticket_id: string; updated_at: string }>(
      user,
      `series:${entityId}`,
    );
    if (!series)
      throw new Error(
        "Load this recurring follow-up online before changing it.",
      );
    ticketId = series.ticket_id;
    expectedSeriesUpdatedAt = series.updated_at;
  }
  let ticket = await db.get<TicketDetail>(user, `ticket:${ticketId}`);
  if (!ticket && operation === "move_crm_ticket_stage") {
    const card = await db.get<import("@/types/crm").PipelineCard>(
      user,
      `pipeline:${ticketId}`,
    );
    if (card)
      ticket = {
        ...card,
        contacts: [],
        notes: [],
        activity: [],
        requests: [],
        currentDepartment: "",
        pipelineName: "",
        stageName: card.stage,
        stageProbability: 0,
        stageCategory: "open",
        createdAt: card.updatedAt,
        closedAt: null,
      };
  }
  if (!ticket && online && session && transport) {
    ticket = (await transport(
      "get_crm_ticket",
      { p_ticket_id: ticketId },
      session.access_token,
    )) as TicketDetail;
    await db.put(user, `ticket:${ticketId}`, ticket);
  }
  if (!ticket)
    throw new Error(
      "Open this ticket online once before adding offline changes.",
    );
  if (!isUserAssociatedWithTicket(ticket, user) || ticket.status !== "active")
    throw new Error("You are not assigned to an active ticket.");
  if (operation === "create_crm_follow_up") {
    if (!canCreateTicketFollowUp(authorization.roles, ticket, user))
      throw new Error("Your role does not support this action.");
    payload = {
      ...payload,
      localTitle: ticket.projectTitle,
      localCompany: ticket.companyName,
    };
    entityId = id;
  } else if (operation === "move_crm_ticket_stage") {
    if (
      !can(authorization.permissions, "deals.move_stage") &&
      !can(authorization.permissions, "leads.change_status")
    )
      throw new Error("Your role does not support this action.");
  } else if (!can(authorization.permissions, "tickets.notes.create"))
    throw new Error("Your role does not support this action.");
  if (
    operation !== "create_crm_follow_up" &&
    operation !== "add_crm_ticket_note" &&
    existing.some(
      (item) =>
        item.entityId === entityId &&
        item.status !== "synced" &&
        item.status !== "dismissed",
    )
  )
    throw new Error(
      "This record already has an unsynchronized change. Review it in Profile before making another change.",
    );
  if (generation !== epoch || activeOfflineUser() !== user)
    throw new Error("Session changed. Sign in again.");
  const now = new Date().toISOString();
  await db.save({
    id,
    userId: user,
    project: env.supabaseUrl,
    ticketId,
    entityId,
    operation,
    payload,
    expectedUpdatedAt,
    expectedSeriesUpdatedAt,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    error: null,
    retryable: true,
  });
  changed();
  void syncEngine.run().catch(() => undefined);
  return {
    id,
    duplicate: false,
    pending: true,
    completed: false,
    nextFollowUpId: null,
  };
}
