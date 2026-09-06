import { supabase } from "./supabase";
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

function safeMessage(error: { message?: string } | null, fallback: string): string {
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
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw new Error(safeMessage(error, fallback));
  return data as T;
}

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
    return rpc("get_crm_ticket", { p_ticket_id: ticketId }, "Ticket could not be loaded.");
  },

  addTicketNote(ticketId: string, content: string): Promise<{ id: string }> {
    return rpc("add_crm_ticket_note", {
      p_ticket_id: ticketId,
      p_content: content.trim(),
    });
  },

  listFollowUps(status: string | null = null, ticketId: string | null = null): Promise<FollowUp[]> {
    return rpc("list_crm_follow_ups", {
      p_ticket_id: ticketId,
      p_status: status,
      p_limit: 100,
      p_offset: 0,
    });
  },

  searchFollowUpTickets(search = "", limit = 30): Promise<FollowUpTicketOption[]> {
    return rpc("search_crm_follow_up_tickets", {
      p_search: search.trim(),
      p_limit: limit,
    });
  },

  createFollowUp(input: CreateFollowUpInput): Promise<{ id: string; duplicate: boolean }> {
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

  updateFollowUp(followUpId: string, input: UpdateFollowUpInput): Promise<{ id: string }> {
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
