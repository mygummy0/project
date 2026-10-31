export type RuntimeStatus = "idle" | "starting" | "running" | "stopping" | "stopped" | "error" | "timeout";

export type OutputLevel = "log" | "info" | "warn" | "error" | "debug" | "system";

export interface OutputEntry {
  id: number;
  level: OutputLevel;
  text: string;
  source: "console" | "runtime" | "error";
  time: number;
  /** Optional source location for errors. */
  location?: { path?: string; line: number; column: number };
}

export interface RuntimeContext {
  projectId: string;
  /** Always returns the current project snapshot (editor buffers overlay saved files). */
  getFiles(): ReadonlyMap<string, string>;
  activePath: string | null;
  /** Wall-clock limit for finite programs. */
  timeoutMs: number;
}

export type CanRun = { ok: true } | { ok: false; reason: string };

export interface RuntimeSink {
  write(entry: Omit<OutputEntry, "id" | "time">): void;
}

export type RuntimeResult = { status: "completed" | "stopped" | "error" | "timeout"; message?: string };

export interface RuntimeHandle {
  /** Resolves when the execution ends (naturally, by stop(), error or timeout). */
  readonly done: Promise<RuntimeResult>;
  stop(): void | Promise<void>;
  /** Long-running adapters (live preview) receive file changes here. */
  notifyFilesChanged?(): void;
}

/** A language/environment specific way of running a project. */
export interface RuntimeAdapter {
  readonly id: string;
  readonly label: string;
  canRun(ctx: RuntimeContext): CanRun;
  run(ctx: RuntimeContext, sink: RuntimeSink): Promise<RuntimeHandle> | RuntimeHandle;
}
