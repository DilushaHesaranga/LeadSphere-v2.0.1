jest.mock("@/config/env", () => ({
  env: { supabaseUrl: "https://test.supabase.co" },
}));
jest.mock("./database", () => {
  const data = new Map<string, unknown>();
  const rows = new Map<string, unknown>();
  return {
    offlineDatabase: {
      get: jest.fn(
        async (user: string, key: string) => data.get(`${user}:${key}`) ?? null,
      ),
      put: jest.fn(async (user: string, key: string, value: unknown) => {
        data.set(`${user}:${key}`, value);
      }),
      list: jest.fn(async (user: string) =>
        [...rows.values()].filter(
          (value) => (value as { userId: string }).userId === user,
        ),
      ),
      save: jest.fn(async (item: { id: string }) => {
        rows.set(item.id, JSON.parse(JSON.stringify(item)));
      }),
      reset: () => {
        data.clear();
        rows.clear();
      },
    },
  };
});
import type { Session } from "@supabase/supabase-js";
import type { UserAuthorization } from "@/types/authorization";
import { offlineDatabase } from "./database";
import {
  activeOfflineUser,
  canUseCachedSession,
  configureOffline,
  configureTransport,
  enqueueMutation,
  listQueue,
  readOfflineRpc,
  setConnectivity,
  syncEngine,
} from "./runtime";

const auth: UserAuthorization = {
  profile: {
    id: "a",
    email: "a@example.test",
    display_name: "A",
    status: "active",
  },
  roles: [{ id: "role", slug: "sales_executive", name: "Sales Executive" }],
  teams: [],
  permissions: { "console.access": "own", "tickets.notes.create": "assigned" },
};
const session = {
  user: { id: "a" },
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  access_token: "test-token",
} as Session;
const ticket = {
  id: "ticket",
  projectTitle: "ABC",
  companyName: "Company",
  status: "active",
  responsibleManagerId: "manager",
  assignedUsers: [{ id: "a", name: "A" }],
  notes: [],
};
const payload = {
  p_ticket_id: "ticket",
  p_client_request_id: "mutation",
  p_scheduled_at: "2026-12-01T10:00:00Z",
  p_type: "CALL",
  p_recurring: false,
  p_frequency: null,
  p_purpose: "Confirm price",
};
beforeEach(async () => {
  await syncEngine.run();
  configureOffline(null, null, false);
  (offlineDatabase as typeof offlineDatabase & { reset(): void }).reset();
  configureOffline(session, auth, false);
  setConnectivity(false);
  await offlineDatabase.put("a", "ticket:ticket", ticket);
});
test("valid previously authenticated session can view persisted cached data offline", async () => {
  setConnectivity(true);
  await readOfflineRpc(
    "get_crm_ticket",
    { p_ticket_id: "ticket" },
    async () => ticket,
  );
  configureOffline(null, null, false);
  configureOffline(session, auth, false);
  setConnectivity(false);
  const loader = jest.fn().mockRejectedValue(new Error("network unavailable"));
  expect(
    await readOfflineRpc("get_crm_ticket", { p_ticket_id: "ticket" }, loader),
  ).toEqual(ticket);
  expect(loader).not.toHaveBeenCalled();
});
test("expired or another user's cached session cannot authorize offline access", () => {
  expect(canUseCachedSession({ ...session, expires_at: 1 }, auth)).toBe(false);
  expect(
    canUseCachedSession(session, {
      ...auth,
      profile: { ...auth.profile!, id: "b" },
    }),
  ).toBe(false);
  configureOffline({ ...session, expires_at: 1 }, auth, false);
  expect(activeOfflineUser()).toBeNull();
});
test("permitted follow-up appears immediately as pending and survives session restoration", async () => {
  await enqueueMutation("create_crm_follow_up", payload);
  configureOffline(null, null, false);
  configureOffline(session, auth, false);
  await offlineDatabase.put(
    "a",
    'rpc:list_crm_follow_ups:{"p_ticket_id":"ticket","p_status":null}',
    { value: [], storedAt: "today" },
  );
  const result = await readOfflineRpc<
    { syncStatus: string; purpose: string }[]
  >(
    "list_crm_follow_ups",
    { p_ticket_id: "ticket", p_status: null },
    async () => [],
  );
  expect(result).toHaveLength(1);
  expect(result[0]?.syncStatus).toBe("pending");
  expect(result[0]?.purpose).toBe("Confirm price");
});
test("duplicate submissions reuse a durable mutation", async () => {
  await Promise.all([
    enqueueMutation("create_crm_follow_up", payload),
    enqueueMutation("create_crm_follow_up", payload),
  ]);
  expect(await listQueue()).toHaveLength(1);
});
test("unauthorized role and assignment are denied offline", async () => {
  configureOffline(session, { ...auth, roles: [] }, false);
  await expect(
    enqueueMutation("create_crm_follow_up", payload),
  ).rejects.toThrow("role");
  configureOffline(session, auth, false);
  await offlineDatabase.put("a", "ticket:ticket", {
    ...ticket,
    assignedUsers: [],
  });
  await expect(
    enqueueMutation("create_crm_follow_up", payload),
  ).rejects.toThrow("assigned");
  expect(await listQueue()).toHaveLength(0);
});
test("logout stops anonymous synchronization, hides data from other users, and original login resumes", async () => {
  const send = jest.fn().mockResolvedValue({ id: "server-follow-up" });
  configureTransport(send);
  await enqueueMutation("create_crm_follow_up", payload);
  await syncEngine.run();
  configureOffline(null, null, false);
  await syncEngine.run();
  expect(await listQueue()).toEqual([]);
  configureOffline(
    { ...session, user: { ...session.user, id: "b" } },
    { ...auth, profile: { ...auth.profile!, id: "b" } },
    true,
  );
  await syncEngine.run();
  expect(await listQueue()).toEqual([]);
  expect(send).not.toHaveBeenCalled();
  configureOffline(session, auth, true);
  await syncEngine.run();
  await syncEngine.run();
  expect(send).toHaveBeenCalledTimes(1);
  expect((await listQueue())[0]?.status).toBe("synced");
});
