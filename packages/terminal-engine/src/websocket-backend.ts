import type { TerminalBackend, TerminalBackendFactory, TerminalSize } from "./index";

/** Thrown when the server requires a login first (no valid session cookie). */
export class TerminalAuthError extends Error {
  constructor(message = "Terminal login required") {
    super(message);
    this.name = "TerminalAuthError";
  }
}

export interface TerminalHttpOptions {
  /** Injectable for tests. */
  fetchFn?: typeof fetch;
}

/** GET {base}/session → true when the browser holds a valid login cookie. */
export async function hasTerminalSession(baseUrl: string, opts: TerminalHttpOptions = {}): Promise<boolean> {
  const f = opts.fetchFn ?? fetch;
  const res = await f(`${baseUrl}/session`, { credentials: "same-origin", cache: "no-store" });
  return res.ok;
}

/** POST {base}/login. Throws an Error with the server's message on failure. */
export async function terminalLogin(baseUrl: string, password: string, opts: TerminalHttpOptions = {}): Promise<void> {
  const f = opts.fetchFn ?? fetch;
  const res = await f(`${baseUrl}/login`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return;
  let message = `Login failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    /* keep default */
  }
  throw new Error(message);
}

export async function terminalLogout(baseUrl: string, opts: TerminalHttpOptions = {}): Promise<void> {
  const f = opts.fetchFn ?? fetch;
  await f(`${baseUrl}/logout`, { method: "POST", credentials: "same-origin" }).catch(() => undefined);
}

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
type WsCtor = new (url: string) => WsLike;

/**
 * Terminal backend that talks to services/terminal-server over a WebSocket.
 * Wire format (JSON): client → {t:"i",d} input, {t:"r",c,r} resize;
 * server → {t:"o",d} output, {t:"x",code} shell exited.
 */
export class WebSocketTerminalBackend implements TerminalBackend {
  readonly id: string;
  private dataListeners = new Set<(d: string) => void>();
  private exitListeners = new Set<(code: number) => void>();
  private exited = false;

  constructor(
    id: string,
    private readonly ws: WsLike,
  ) {
    this.id = id;
    ws.onmessage = (ev) => {
      let msg: { t?: string; d?: string; code?: number };
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.t === "o" && typeof msg.d === "string") this.dataListeners.forEach((l) => l(msg.d!));
      else if (msg.t === "x") this.finish(typeof msg.code === "number" ? msg.code : 0);
    };
    ws.onclose = () => this.finish(this.exited ? 0 : -1);
  }

  private finish(code: number) {
    if (this.exited) return;
    this.exited = true;
    this.exitListeners.forEach((l) => l(code));
  }

  get open(): boolean {
    return !this.exited && this.ws.readyState === 1;
  }

  write(data: string): void {
    if (this.open) this.ws.send(JSON.stringify({ t: "i", d: data }));
  }
  resize(size: TerminalSize): void {
    if (this.open) this.ws.send(JSON.stringify({ t: "r", c: size.cols, r: size.rows }));
  }
  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }
  onExit(listener: (code: number) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }
  interrupt(): void {
    this.write("\x03");
  }
  dispose(): void {
    this.dataListeners.clear();
    try {
      this.ws.close(1000, "client closed");
    } catch {
      /* already closed */
    }
  }
}

export interface WebSocketFactoryOptions extends TerminalHttpOptions {
  WebSocketImpl?: WsCtor;
  /** Absolute ws(s):// URL base; defaults to the page origin with the http→ws scheme swap. */
  wsBase?: string;
}

/** Factory used by the IDE. `baseUrl` is e.g. "/terminal" (same origin as the IDE). */
export class WebSocketTerminalFactory implements TerminalBackendFactory {
  readonly unavailableReason: string | null = null;
  private counter = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly opts: WebSocketFactoryOptions = {},
  ) {}

  async create(_projectId: string, size: TerminalSize): Promise<TerminalBackend> {
    if (!(await hasTerminalSession(this.baseUrl, this.opts))) throw new TerminalAuthError();
    const Ctor = (this.opts.WebSocketImpl ?? (globalThis as { WebSocket?: unknown }).WebSocket) as WsCtor | undefined;
    if (!Ctor) throw new Error("WebSocket is not available in this environment");
    const wsBase = this.opts.wsBase ?? this.defaultWsBase();
    const ws = new Ctor(`${wsBase}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Could not connect to the terminal server"));
      ws.onclose = () => reject(new Error("Terminal connection closed"));
    });
    const backend = new WebSocketTerminalBackend(`term-${++this.counter}`, ws);
    backend.resize(size);
    return backend;
  }

  private defaultWsBase(): string {
    const loc = (globalThis as { location?: { protocol: string; host: string } }).location;
    if (!loc) throw new Error("No page location to derive the WebSocket URL from");
    return `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}${this.baseUrl}`;
  }
}
