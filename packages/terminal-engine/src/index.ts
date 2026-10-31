/**
 * Terminal Engine contracts (Phase 3). The xterm.js UI talks only to a
 * TerminalBackend; it never gets a raw shell. Backends are either an
 * in-browser runtime or a sandboxed server PTY behind services/execution-worker.
 */
export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalBackend {
  readonly id: string;
  /** Writes user keystrokes / pasted text. */
  write(data: string): void;
  resize(size: TerminalSize): void;
  /** Subscribes to output chunks; returns unsubscribe. */
  onData(listener: (data: string) => void): () => void;
  onExit(listener: (code: number) => void): () => void;
  /** Interrupt the foreground process (Ctrl+C semantics). */
  interrupt(): void;
  dispose(): void;
}

export interface TerminalBackendFactory {
  /** Human readable reason when unavailable (e.g. "no execution server configured"). */
  readonly unavailableReason: string | null;
  create(projectId: string, size: TerminalSize): Promise<TerminalBackend>;
}
