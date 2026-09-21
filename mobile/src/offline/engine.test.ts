import { SyncEngine, SyncError, retryDelay } from "./engine";
import type { Mutation, OutboxStore } from "./types";

function mutation(id = "one", ticketId = "ticket"): Mutation {
  return {
    id,
    ticketId,
    userId: "user-a",
    project: "test",
    entityId: id,
    operation: "add_crm_ticket_note",
    payload: { p_content: "Customer called" },
    expectedUpdatedAt: null,
    expectedSeriesUpdatedAt: null,
    createdAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    error: null,
    retryable: true,
  };
}
function store(items = [mutation()]) {
  const rows = new Map(items.map((item) => [item.id, structuredClone(item)]));
  const db: OutboxStore = {
    list: async (user) =>
      [...rows.values()]
        .filter((row) => row.userId === user)
        .map((row) => structuredClone(row)),
    save: async (item) => {
      rows.set(item.id, structuredClone(item));
    },
  };
  return { rows, db };
}
describe("durable outbox processing", () => {
  it("survives a worker restart and submits exactly once", async () => {
    const { db, rows } = store();
    const send = jest.fn().mockResolvedValue({ id: "server-note" });
    await new SyncEngine(
      db,
      () => "user-a",
      send,
      () => {},
    ).run();
    await new SyncEngine(
      db,
      () => "user-a",
      send,
      () => {},
    ).run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(rows.get("one")?.status).toBe("synced");
  });
  it("coalesces overlapping sync triggers", async () => {
    const { db } = store();
    const send = jest.fn().mockResolvedValue({});
    const engine = new SyncEngine(
      db,
      () => "user-a",
      send,
      () => {},
    );
    await Promise.all([engine.run(), engine.run(), engine.run()]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains transient failures and retries with the same mutation ID", async () => {
    const { db, rows } = store();
    const send = jest
      .fn()
      .mockRejectedValueOnce(new SyncError("Timeout", "retry"))
      .mockResolvedValue({ id: "result" });
    const engine = new SyncEngine(
      db,
      () => "user-a",
      send,
      () => {},
    );
    await engine.run();
    expect(rows.get("one")?.status).toBe("pending");
    expect(rows.get("one")?.error).toBe("Timeout");
    await engine.retry();
    expect(send.mock.calls.map((call) => call[0].id)).toEqual(["one", "one"]);
    expect(rows.get("one")?.status).toBe("synced");
  });
  it.each(["rejected", "conflict"] as const)(
    "retains %s without repeated submission",
    async (kind) => {
      const { db, rows } = store();
      const send = jest
        .fn()
        .mockRejectedValue(
          new SyncError("Permission or version changed", kind),
        );
      const engine = new SyncEngine(
        db,
        () => "user-a",
        send,
        () => {},
      );
      await engine.run();
      await engine.retry();
      expect(send).toHaveBeenCalledTimes(1);
      expect(rows.get("one")?.payload.p_content).toBe("Customer called");
      expect(rows.get("one")?.status).toBe(
        kind === "conflict" ? "conflict" : "failed",
      );
    },
  );
  it("blocks dependent ticket operations while allowing other tickets", async () => {
    const { db, rows } = store([
      mutation(),
      mutation("two"),
      mutation("three", "other"),
    ]);
    const send = jest.fn(async (item: Mutation) => {
      if (item.id === "one") throw new SyncError("rejected", "rejected");
      return {};
    });
    await new SyncEngine(
      db,
      () => "user-a",
      send,
      () => {},
    ).run();
    expect(send.mock.calls.map((call) => call[0].id)).toEqual(["one", "three"]);
    expect(rows.get("two")?.status).toBe("pending");
  });
  it("never syncs anonymously or under another account, then resumes for original account", async () => {
    const { db } = store();
    let user: string | null = null;
    const send = jest.fn().mockResolvedValue({});
    const engine = new SyncEngine(
      db,
      () => user,
      send,
      () => {},
    );
    await engine.run();
    user = "user-b";
    await engine.run();
    expect(send).not.toHaveBeenCalled();
    user = "user-a";
    await engine.run();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("stops subsequent requests when logout happens during a request", async () => {
    const { db } = store([mutation(), mutation("two", "other")]);
    let user: string | null = "user-a";
    const send = jest.fn(async () => {
      user = null;
      return {};
    });
    await new SyncEngine(
      db,
      () => user,
      send,
      () => {},
    ).run();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("bounds retries and applies exponential backoff with jitter", async () => {
    const { db, rows } = store([{ ...mutation(), attempts: 4 }]);
    const send = jest.fn().mockRejectedValue(new SyncError("offline", "retry"));
    const engine = new SyncEngine(
      db,
      () => "user-a",
      send,
      () => {},
    );
    await engine.run();
    await engine.run();
    expect(rows.get("one")?.status).toBe("failed");
    expect(send).toHaveBeenCalledTimes(1);
    expect(retryDelay(1, () => 0)).toBe(1500);
    expect(retryDelay(2, () => 0)).toBe(3000);
  });
  it("replays a crash-interrupted request using its original idempotency ID", async () => {
    const { db } = store([{ ...mutation(), status: "syncing", attempts: 1 }]);
    const send = jest.fn().mockResolvedValue({ id: "already-created" });
    await new SyncEngine(
      db,
      () => "user-a",
      send,
      () => {},
    ).run();
    expect(send.mock.calls[0][0].id).toBe("one");
  });
});
