import { Emitter } from "@webide/shared";

export type AutosaveEvent =
  | { type: "scheduled"; path: string }
  | { type: "saved"; path: string }
  | { type: "failed"; path: string; error: unknown; retryInMs: number | null };

export interface AutosaveOptions {
  delayMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
}

/**
 * Debounced per-path save queue with bounded exponential retry.
 * The `save` callback decides what to persist; failures keep the path pending
 * (the caller keeps the dirty content) so data is never silently dropped.
 */
export class AutosaveScheduler {
  readonly events = new Emitter<{ event: AutosaveEvent }>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private attempts = new Map<string, number>();
  private inflight = new Map<string, Promise<void>>();
  private disposed = false;
  private readonly delay: number;
  private readonly maxRetries: number;
  private readonly retryBase: number;

  constructor(
    private readonly save: (path: string) => Promise<void>,
    opts: AutosaveOptions = {},
  ) {
    this.delay = opts.delayMs ?? 600;
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryBase = opts.retryBaseMs ?? 1000;
  }

  schedule(path: string, delay = this.delay): void {
    if (this.disposed) return;
    this.clearTimer(path);
    this.attempts.delete(path);
    this.timers.set(
      path,
      setTimeout(() => void this.run(path), delay),
    );
    this.events.emit("event", { type: "scheduled", path });
  }

  has(path: string): boolean {
    return this.timers.has(path) || this.inflight.has(path);
  }

  /** Saves immediately (used by Ctrl+S, tab close, page unload). */
  async flush(path: string): Promise<void> {
    this.clearTimer(path);
    await this.run(path, false);
  }

  async flushAll(): Promise<void> {
    const paths = [...this.timers.keys()];
    await Promise.all(paths.map((p) => this.flush(p)));
  }

  cancel(path: string): void {
    this.clearTimer(path);
    this.attempts.delete(path);
  }

  private clearTimer(path: string) {
    const t = this.timers.get(path);
    if (t) clearTimeout(t);
    this.timers.delete(path);
  }

  private async run(path: string, allowRetry = true): Promise<void> {
    this.timers.delete(path);
    const prev = this.inflight.get(path);
    if (prev) await prev.catch(() => undefined);
    const job = (async () => {
      try {
        await this.save(path);
        this.attempts.delete(path);
        this.events.emit("event", { type: "saved", path });
      } catch (error) {
        const n = (this.attempts.get(path) ?? 0) + 1;
        this.attempts.set(path, n);
        const canRetry = allowRetry && !this.disposed && n <= this.maxRetries;
        const retryInMs = canRetry ? this.retryBase * 2 ** (n - 1) : null;
        this.events.emit("event", { type: "failed", path, error, retryInMs });
        if (retryInMs !== null && !this.timers.has(path)) {
          this.timers.set(
            path,
            setTimeout(() => void this.run(path), retryInMs),
          );
        }
      }
    })();
    this.inflight.set(path, job);
    try {
      await job;
    } finally {
      if (this.inflight.get(path) === job) this.inflight.delete(path);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.events.clear();
  }
}
