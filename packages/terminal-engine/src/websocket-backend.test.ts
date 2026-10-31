import { describe, expect, it } from "vitest";
import { TerminalAuthError, WebSocketTerminalFactory, hasTerminalSession, terminalLogin } from "./websocket-backend";

class FakeWs {
  static last: FakeWs;
  readyState = 0;
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeWs.last = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.({});
    });
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const okFetch = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("terminal websocket backend", () => {
  it("requires a session before connecting", async () => {
    const f = new WebSocketTerminalFactory("/terminal", { fetchFn: okFetch(401), WebSocketImpl: FakeWs as never, wsBase: "wss://x/terminal" });
    await expect(f.create("p", { cols: 80, rows: 24 })).rejects.toBeInstanceOf(TerminalAuthError);
  });

  it("connects, sends input/resize, streams output and reports exit", async () => {
    const f = new WebSocketTerminalFactory("/terminal", { fetchFn: okFetch(200), WebSocketImpl: FakeWs as never, wsBase: "wss://x/terminal" });
    const b = await f.create("p", { cols: 100, rows: 30 });
    expect(FakeWs.last.url).toBe("wss://x/terminal/ws");
    expect(JSON.parse(FakeWs.last.sent[0]!)).toEqual({ t: "r", c: 100, r: 30 });
    let out = "";
    let code: number | null = null;
    b.onData((d) => (out += d));
    b.onExit((c) => (code = c));
    b.write("ls\r");
    b.interrupt();
    expect(FakeWs.last.sent.slice(1).map((s) => JSON.parse(s).d)).toEqual(["ls\r", "\x03"]);
    FakeWs.last.onmessage?.({ data: JSON.stringify({ t: "o", d: "hello" }) });
    FakeWs.last.onmessage?.({ data: "not json" });
    expect(out).toBe("hello");
    FakeWs.last.onmessage?.({ data: JSON.stringify({ t: "x", code: 3 }) });
    expect(code).toBe(3);
    b.write("ignored after exit");
    expect(FakeWs.last.sent).toHaveLength(3);
  });

  it("reports an unexpected disconnect as exit code -1", async () => {
    const f = new WebSocketTerminalFactory("/terminal", { fetchFn: okFetch(200), WebSocketImpl: FakeWs as never, wsBase: "wss://x/terminal" });
    const b = await f.create("p", { cols: 80, rows: 24 });
    let code: number | null = null;
    b.onExit((c) => (code = c));
    FakeWs.last.close();
    expect(code).toBe(-1);
  });
});

describe("http helpers", () => {
  it("login surfaces the server message", async () => {
    await expect(terminalLogin("/terminal", "x", { fetchFn: okFetch(429, { error: "Too many attempts. Try again later." }) })).rejects.toThrow("Too many attempts");
    await expect(terminalLogin("/terminal", "x", { fetchFn: okFetch(200) })).resolves.toBeUndefined();
    expect(await hasTerminalSession("/terminal", { fetchFn: okFetch(401) })).toBe(false);
  });
});
