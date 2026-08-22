jest.mock("./supabase", () => ({
  supabase: {
    rpc: jest.fn(),
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { crmService } from "./crm";
import { supabase } from "./supabase";

const rpcMock = supabase.rpc as jest.Mock;
const getUserMock = supabase.auth.getUser as jest.Mock;
const fromMock = supabase.from as jest.Mock;

describe("CRM RPC integration", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    fromMock.mockReset();
  });

  it("sends the server idempotency key when scheduling a follow-up", async () => {
    rpcMock.mockResolvedValue({ data: { id: "follow-up", duplicate: false }, error: null });
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

  it("passes optimistic version and idempotency data for pipeline moves", async () => {
    rpcMock.mockResolvedValue({ data: { moved: true }, error: null });
    await crmService.moveTicket("ticket", "pipeline", "negotiation", 4, "request-id");
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
    rpcMock.mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    await expect(crmService.addTicketNote("ticket", "note")).rejects.toThrow(
      "Your current role or assignment does not permit this action.",
    );
  });

  it("keeps the global Follow Up workspace relevant to assigned Tickets", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [
          { id: "assigned-follow-up", ticketId: "assigned-ticket" },
          { id: "unrelated-follow-up", ticketId: "other-ticket" },
        ],
        error: null,
      })
    getUserMock.mockResolvedValue({
      data: { user: { id: "sales-user" } },
      error: null,
    });
    const isMock = jest.fn().mockResolvedValue({
      data: [{ ticket_id: "assigned-ticket" }],
      error: null,
    });
    const eqMock = jest.fn(() => ({ is: isMock }));
    const selectMock = jest.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue({ select: selectMock });

    const items = await crmService.listAssignedFollowUps("PENDING");
    expect(items.map((item) => item.id)).toEqual(["assigned-follow-up"]);
    expect(fromMock).toHaveBeenCalledWith("crm_ticket_assignments");
    expect(eqMock).toHaveBeenCalledWith("user_id", "sales-user");
    expect(isMock).toHaveBeenCalledWith("removed_at", null);
  });
});
