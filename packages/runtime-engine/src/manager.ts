import { Emitter, errorMessage } from "@webide/shared";
import type {
  OutputEntry,
  RuntimeAdapter,
  RuntimeContext,
  RuntimeHandle,
  RuntimeSink,
  RuntimeStatus,
} from "./types";

export interface RuntimeManagerEvents {
  status: { status: RuntimeStatus; adapterId: string | null; message?: string };
  output: OutputEntry;
  cleared: void;
}

/**
 * State machine around RuntimeAdapters: Run / Stop / Restart, one execution
 * at a time, failures are captured and leave the manager reusable.
 */
export class RuntimeManager {
  readonly events = new Emitter<RuntimeManagerEvents>();
  status: RuntimeStatus = "idle";
  private adapters: RuntimeAdapter[] = [];
  private handle: RuntimeHandle | null = null;
  private activeAdapter: RuntimeAdapter | null = null;
  private lastContext: (() => RuntimeContext) | null = null;
  private generation = 0;
  private nextId = 1;

  register(adapter: RuntimeAdapter): this {
    this.adapters = [...this.adapters.filter((a) => a.id !== adapter.id), adapter];
    return this;
  }

  /** First adapter (in registration order) that can handle the context, plus why others can't. */
  resolve(ctx: RuntimeContext): { adapter?: RuntimeAdapter; reasons: string[] } {
    const reasons: string[] = [];
    for (const a of this.adapters) {
      const r = a.canRun(ctx);
      if (r.ok) return { adapter: a, reasons };
      reasons.push(`${a.label}: ${r.reason}`);
    }
    return { reasons };
  }

  get isActive(): boolean {
    return this.status === "starting" || this.status === "running" || this.status === "stopping";
  }

  private sink: RuntimeSink = {
    write: (entry) => this.events.emit("output", { ...entry, id: this.nextId++, time: Date.now() }),
  };

  private log(level: OutputEntry["level"], text: string) {
    this.sink.write({ level, text, source: "runtime" });
  }

  private setStatus(status: RuntimeStatus, message?: string) {
    this.status = status;
    this.events.emit("status", { status, adapterId: this.activeAdapter?.id ?? null, message });
  }

  clearOutput() {
    this.events.emit("cleared", undefined);
  }

  async run(makeContext: () => RuntimeContext): Promise<void> {
    if (this.isActive) await this.stop();
    this.lastContext = makeContext;
    const gen = ++this.generation;
    const ctx = makeContext();
    const { adapter, reasons } = this.resolve(ctx);
    if (!adapter) {
      this.activeAdapter = null;
      this.log("error", `Nothing to run. ${reasons.join(" · ") || "No runtime registered."}`);
      this.setStatus("error", reasons.join("; "));
      return;
    }
    this.activeAdapter = adapter;
    this.clearOutput();
    this.setStatus("starting");
    this.log("system", `▶ ${adapter.label}`);
    try {
      const handle = await adapter.run(ctx, this.sink);
      if (gen !== this.generation) {
        // A stop/restart raced with startup: discard this execution.
        await handle.stop();
        return;
      }
      this.handle = handle;
      this.setStatus("running");
      void handle.done.then((result) => {
        if (gen !== this.generation) return;
        this.handle = null;
        if (result.status === "completed") {
          this.log("system", "✔ Finished");
          this.setStatus("stopped");
        } else if (result.status === "timeout") {
          this.log("error", result.message ?? `Stopped: exceeded ${ctx.timeoutMs} ms time limit`);
          this.setStatus("timeout", result.message);
        } else if (result.status === "error") {
          this.log("error", result.message ?? "Execution failed");
          this.setStatus("error", result.message);
        } else {
          this.log("system", "■ Stopped");
          this.setStatus("stopped");
        }
      });
    } catch (e) {
      if (gen !== this.generation) return;
      this.handle = null;
      this.log("error", `Failed to start: ${errorMessage(e)}`);
      this.setStatus("error", errorMessage(e));
    }
  }

  async stop(): Promise<void> {
    if (!this.handle && this.status !== "starting") return;
    this.generation++;
    const h = this.handle;
    this.handle = null;
    this.setStatus("stopping");
    try {
      await h?.stop();
    } catch (e) {
      this.log("error", `Error while stopping: ${errorMessage(e)}`);
    }
    this.log("system", "■ Stopped");
    this.setStatus("stopped");
  }

  async restart(): Promise<void> {
    if (!this.lastContext) return;
    await this.run(this.lastContext);
  }

  notifyFilesChanged(): void {
    this.handle?.notifyFilesChanged?.();
  }

  dispose(): void {
    this.generation++;
    void this.handle?.stop();
    this.handle = null;
    this.events.clear();
  }
}
