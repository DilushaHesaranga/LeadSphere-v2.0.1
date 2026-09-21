import type { Mutation, OutboxStore } from "./types";

export class SyncError extends Error {
  constructor(
    message: string,
    public readonly kind: "retry" | "rejected" | "conflict" | "auth",
  ) {
    super(message);
  }
}
export function retryDelay(attempt: number, random = Math.random): number {
  return (
    Math.min(300000, 2000 * 2 ** Math.max(0, attempt - 1)) *
    (0.75 + random() * 0.5)
  );
}
export class SyncEngine {
  private running: Promise<void> | null = null;
  constructor(
    private store: OutboxStore,
    private currentUser: () => string | null,
    private send: (item: Mutation) => Promise<Record<string, unknown>>,
    private changed: () => void,
    private now = Date.now,
  ) {}
  run(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.process().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async process(): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    const blocked = new Set<string>();
    for (const item of await this.store.list(user)) {
      if (this.currentUser() !== user) return;
      if (item.status === "synced" || item.status === "dismissed") continue;
      // Preserve ticket operation order, including across failed dependencies.
      if (blocked.has(item.ticketId)) continue;
      if (
        item.status === "conflict" ||
        item.status === "failed" ||
        item.nextAttemptAt > this.now()
      ) {
        blocked.add(item.ticketId);
        continue;
      }
      if (item.attempts >= 5) {
        await this.store.save({
          ...item,
          status: "failed",
          retryable: true,
          error:
            "Automatic retry limit reached. Check the connection and retry manually.",
        });
        this.changed();
        blocked.add(item.ticketId);
        continue;
      }
      item.status = "syncing";
      item.attempts += 1;
      item.updatedAt = new Date(this.now()).toISOString();
      await this.store.save(item);
      this.changed();
      if (this.currentUser() !== user) return;
      try {
        const result = await this.send(item);
        item.result = result;
        item.status = "synced";
        item.error = null;
        item.retryable = false;
      } catch (error) {
        const failure =
          error instanceof SyncError
            ? error
            : new SyncError(
                "Synchronization failed. Retry when connected.",
                "retry",
              );
        item.error = failure.message;
        item.retryable = failure.kind === "retry" || failure.kind === "auth";
        item.status =
          failure.kind === "conflict"
            ? "conflict"
            : item.retryable && item.attempts < 5
              ? "pending"
              : "failed";
        item.nextAttemptAt = this.now() + retryDelay(item.attempts);
        blocked.add(item.ticketId);
      }
      item.updatedAt = new Date(this.now()).toISOString();
      await this.store.save(item);
      this.changed();
    }
  }
  async retry(): Promise<void> {
    const user = this.currentUser();
    if (!user) return;
    for (const item of await this.store.list(user)) {
      if (
        item.retryable &&
        (item.status === "failed" || item.status === "pending")
      ) {
        await this.store.save({
          ...item,
          status: "pending",
          attempts: 0,
          nextAttemptAt: 0,
        });
      }
    }
    return this.run();
  }
}
