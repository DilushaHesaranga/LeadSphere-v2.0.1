import { supabase } from "./supabase";
import { env } from "@/config/env";
import {
  configureTransport,
  enqueueMutation,
  hasOfflineIdentity,
  MUTATIONS,
  readOfflineRpc,
  SyncError,
} from "@/offline/transport";
import type { Operation } from "@/offline/types";
import type {
  BusinessArea,
  CaseSummary,
  CompleteFollowUpResult,
  CreateFollowUpInput,
  DashboardData,
  FollowUp,
  FollowUpTicketOption,
  PipelineBoard,
  TicketDetail,
  UpdateFollowUpInput,
} from "@/types/crm";

function safeMessage(
  error: { message?: string } | null,
  fallback: string,
): string {
  const message = error?.message ?? fallback;
  const known = message.match(/[A-Z_]+:\s*(.+)$/);
  if (known?.[1]) return known[1];
  if (/permission|forbidden|access denied/i.test(message)) {
    return "Your current role or assignment does not permit this action.";
  }
  if (/failed to fetch|fetch failed|network|timeout/i.test(message)) {
    return "Network connection unavailable. Check your connection and try again.";
  }
  return message;
}

async function rpc<T>(
  name: string,
  parameters: Record<string, unknown> = {},
  fallback = "The request could not be completed.",
): Promise<T> {
  if (hasOfflineIdentity()) {
    if (MUTATIONS.has(name))
      return (await enqueueMutation(name as Operation, parameters)) as T;
    return readOfflineRpc(name, parameters, () =>
      networkRpc<T>(name, parameters, fallback),
    );
  }
  return networkRpc(name, parameters, fallback);
}

async function networkRpc<T>(
  name: string,
  parameters: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const request = supabase.rpc(name, parameters);
    const { data, error } = await (hasOfflineIdentity()
      ? request.abortSignal(controller.signal)
      : request);
    if (error) throw new Error(safeMessage(error, fallback));
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

configureTransport(async (name, params, token) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const series = name === "__series_versions";
    const url = series
      ? `${env.supabaseUrl}/rest/v1/crm_follow_up_series?select=id,ticket_id,updated_at&id=in.(${(params.ids as string[]).map(encodeURIComponent).join(",")})`
      : `${env.supabaseUrl}/rest/v1/rpc/${name}`;
    const response = await fetch(url, {
      method: series ? "GET" : "POST",
      signal: controller.signal,
      headers: {
        apikey: env.supabasePublishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(series ? {} : { body: JSON.stringify(params) }),
    });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      if (response.status === 401)
        throw new SyncError("Sign in online again to synchronize.", "auth");
      if (response.status === 429 || response.status >= 500)
        throw new SyncError(
          "Service temporarily unavailable. Your change is saved.",
          "retry",
        );
      throw new SyncError(
        result.message || "The server rejected this change.",
        /conflict/i.test(result.message || "") ? "conflict" : "rejected",
      );
    }
    return result;
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError("Network timeout. Your change is saved.", "retry");
  } finally {
    clearTimeout(timeout);
  }
});

export const crmService = Object.freeze({
  async dashboard(): Promise<DashboardData> {
    const [pipeline, pendingFollowUps, notifications] = await Promise.all([
      rpc<PipelineBoard>("get_crm_pipeline_board", {
        p_pipeline_id: null,
        p_search: "",
        p_owner_id: null,
        p_category: null,
        p_stage_age_days: null,
        p_sort: "recent",
        p_page: 1,
        p_page_size: 50,
      }),
      rpc<FollowUp[]>("list_crm_follow_ups", {
        p_ticket_id: null,
        p_status: "PENDING",
        p_limit: 50,
        p_offset: 0,
      }),
      rpc<DashboardData["notifications"]>("get_user_notifications", {
        p_limit: 10,
      }),
    ]);
    return { pipeline, pendingFollowUps, notifications };
  },

  listCases(area: BusinessArea, search = ""): Promise<CaseSummary[]> {
    return rpc("list_crm_cases", {
      p_area: area,
      p_search: search.trim(),
      p_stage: null,
      p_department: null,
      p_sort: "recent",
    });
  },

  getTicket(ticketId: string): Promise<TicketDetail> {
    return rpc(
      "get_crm_ticket",
      { p_ticket_id: ticketId },
      "Ticket could not be loaded.",
    );
  },

  addTicketNote(ticketId: string, content: string): Promise<{ id: string }> {
    return rpc("add_crm_ticket_note", {
      p_ticket_id: ticketId,
      p_content: content.trim(),
    });
  },

  listFollowUps(
    status: string | null = null,
    ticketId: string | null = null,
  ): Promise<FollowUp[]> {
    return rpc("list_crm_follow_ups", {
      p_ticket_id: ticketId,
      p_status: status,
      p_limit: 100,
      p_offset: 0,
    });
  },

  searchFollowUpTickets(
    search = "",
    limit = 30,
  ): Promise<FollowUpTicketOption[]> {
    return rpc("search_crm_follow_up_tickets", {
      p_search: search.trim(),
      p_limit: limit,
    });
  },

  createFollowUp(
    input: CreateFollowUpInput,
  ): Promise<{ id: string; duplicate: boolean }> {
    return rpc("create_crm_follow_up", {
      p_ticket_id: input.ticketId,
      p_scheduled_at: input.scheduledAt,
      p_type: input.type,
      p_purpose: input.purpose?.trim() || null,
      p_recurring: input.recurring,
      p_frequency: input.recurring ? input.frequency : null,
      p_client_request_id: input.clientRequestId,
    });
  },

  updateFollowUp(
    followUpId: string,
    input: UpdateFollowUpInput,
  ): Promise<{ id: string }> {
    return rpc("update_crm_follow_up", {
      p_follow_up_id: followUpId,
      p_scheduled_at: input.scheduledAt,
      p_type: input.type,
      p_purpose: input.purpose?.trim() || null,
      p_frequency: input.recurring ? input.frequency : null,
    });
  },

  completeFollowUp(followUpId: string): Promise<CompleteFollowUpResult> {
    return rpc("complete_crm_follow_up", { p_follow_up_id: followUpId });
  },

  cancelFollowUp(followUpId: string): Promise<unknown> {
    return rpc("cancel_crm_follow_up", { p_follow_up_id: followUpId });
  },

  stopFollowUpSeries(seriesId: string): Promise<unknown> {
    return rpc("stop_crm_follow_up_series", { p_series_id: seriesId });
  },

  loadPipeline(search = ""): Promise<PipelineBoard> {
    return rpc("get_crm_pipeline_board", {
      p_pipeline_id: null,
      p_search: search.trim(),
      p_owner_id: null,
      p_category: null,
      p_stage_age_days: null,
      p_sort: "recent",
      p_page: 1,
      p_page_size: 50,
    });
  },

  moveTicket(
    ticketId: string,
    pipelineId: string,
    stage: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<unknown> {
    return rpc("move_crm_ticket_stage", {
      p_ticket_id: ticketId,
      p_pipeline_id: pipelineId,
      p_stage_slug: stage,
      p_expected_version: expectedVersion,
      p_source: "MOBILE",
      p_idempotency_key: idempotencyKey,
    });
  },
});
