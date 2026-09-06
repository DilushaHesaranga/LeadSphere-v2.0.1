jest.mock("./supabase", () => ({
  supabase: { rpc: jest.fn() },
}));

import { crmService } from "./crm";
import { supabase } from "./supabase";

const rpcMock = supabase.rpc as jest.Mock;

describe("CRM RPC integration", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("loads the server-authorized global Follow Up workspace", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await crmService.listFollowUps(null);
    expect(rpcMock).toHaveBeenCalledWith("list_crm_follow_ups", {
      p_ticket_id: null,
      p_status: null,
      p_limit: 100,
      p_offset: 0,
    });
  });

  it("searches only tickets authorized by the server Follow Up policy", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await crmService.searchFollowUpTickets("  LS-1025  ", 12);
    expect(rpcMock).toHaveBeenCalledWith("search_crm_follow_up_tickets", {
      p_search: "LS-1025",
      p_limit: 12,
    });
  });

  it("sends the server idempotency key when scheduling a Follow Up", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "follow-up", duplicate: false },
      error: null,
    });
    await crmService.createFollowUp({
      ticketId: "ticket-id",
      scheduledAt: "2026-08-18T09:00:00.000Z",
      type: "CALL",
      purpose: "Confirm final price",
      recurring: false,
      clientRequestId: "b349859e-23f7-4b5a-8e78-6fd3b874e01e",
    });
    expect(rpcMock).toHaveBeenCalledWith("create_crm_follow_up", {
      p_ticket_id: "ticket-id",
      p_scheduled_at: "2026-08-18T09:00:00.000Z",
      p_type: "CALL",
      p_purpose: "Confirm final price",
      p_recurring: false,
      p_frequency: null,
      p_client_request_id: "b349859e-23f7-4b5a-8e78-6fd3b874e01e",
    });
  });

  it("updates a pending recurring Follow Up through the shared RPC", async () => {
    rpcMock.mockResolvedValue({ data: { id: "follow-up" }, error: null });
    await crmService.updateFollowUp("follow-up", {
      scheduledAt: "2026-08-19T09:00:00.000Z",
      type: "MEETING",
      purpose: "Review proposal",
      recurring: true,
      frequency: "WEEKLY",
    });
    expect(rpcMock).toHaveBeenCalledWith("update_crm_follow_up", {
      p_follow_up_id: "follow-up",
      p_scheduled_at: "2026-08-19T09:00:00.000Z",
      p_type: "MEETING",
      p_purpose: "Review proposal",
      p_frequency: "WEEKLY",
    });
  });

  it("completes, cancels, and stops a recurring series with trusted IDs", async () => {
    rpcMock.mockResolvedValue({ data: {}, error: null });
    await crmService.completeFollowUp("follow-up");
    await crmService.cancelFollowUp("follow-up");
    await crmService.stopFollowUpSeries("series-id");
    expect(rpcMock).toHaveBeenNthCalledWith(1, "complete_crm_follow_up", {
      p_follow_up_id: "follow-up",
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "cancel_crm_follow_up", {
      p_follow_up_id: "follow-up",
    });
    expect(rpcMock).toHaveBeenNthCalledWith(3, "stop_crm_follow_up_series", {
      p_series_id: "series-id",
    });
  });

  it("passes optimistic version and idempotency data for pipeline moves", async () => {
    rpcMock.mockResolvedValue({ data: { moved: true }, error: null });
    await crmService.moveTicket(
      "ticket",
      "pipeline",
      "negotiation",
      4,
      "request-id",
    );
    expect(rpcMock).toHaveBeenCalledWith("move_crm_ticket_stage", {
      p_ticket_id: "ticket",
      p_pipeline_id: "pipeline",
      p_stage_slug: "negotiation",
      p_expected_version: 4,
      p_source: "MOBILE",
      p_idempotency_key: "request-id",
    });
  });

  it("maps permission errors without leaking database details", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Permission denied" },
    });
    await expect(crmService.addTicketNote("ticket", "note")).rejects.toThrow(
      "Your current role or assignment does not permit this action.",
    );
  });
});
