import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { hashPassword } from "./auth.mjs";
import { createTerminalServer, loadConfig } from "./server.mjs";

const ORIGIN = "https://ide.test";
let app;
let base;
let addr;

beforeAll(async () => {
  const config = loadConfig({
    PORT: "0",
    TERMINAL_SECRET: "k".repeat(48),
    TERMINAL_PASSWORD_HASH: hashPassword("a-very-long-passphrase"),
    ALLOWED_ORIGINS: ORIGIN,
    SHELL: "/bin/bash",
    MAX_SESSIONS: "2",
  });
  app = createTerminalServer(config, { info() {} });
  addr = await app.listen();
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(() => app.close());

const login = (password, headers = {}) =>
  fetch(`${base}/login`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers }, body: JSON.stringify({ password }) });

const openWs = (cookie, origin = ORIGIN) =>
  new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws`, { headers: { origin, ...(cookie ? { cookie } : {}) } });
    ws.on("open", () => resolve({ ws }));
    ws.on("unexpected-response", (_req, res) => resolve({ status: res.statusCode }));
    ws.on("error", () => {});
  });

describe("terminal server", () => {
  it("rejects websocket connections without a session or from another origin", async () => {
    expect((await openWs(undefined)).status).toBe(401);
    const ok = await login("a-very-long-passphrase", { "x-forwarded-for": "9.9.9.9" });
    const cookie = ok.headers.get("set-cookie").split(";")[0];
    expect((await openWs(cookie, "https://evil.example")).status).toBe(403);
    expect((await openWs("webide_term=forged.token.value")).status).toBe(401);
  });

  it("login sets a hardened cookie and /session reflects it", async () => {
    expect((await fetch(`${base}/session`)).status).toBe(401);
    const res = await login("a-very-long-passphrase", { "x-forwarded-for": "8.8.8.8" });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/Path=\/terminal/);
    expect((await fetch(`${base}/session`, { headers: { cookie: setCookie.split(";")[0] } })).status).toBe(200);
  });

  it("runs real commands in a real shell and supports resize", async () => {
    const res = await login("a-very-long-passphrase", { "x-forwarded-for": "7.7.7.7" });
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const { ws } = await openWs(cookie);
    let output = "";
    ws.on("message", (m) => {
      const msg = JSON.parse(m.toString());
      if (msg.t === "o") output += msg.d;
    });
    ws.send(JSON.stringify({ t: "r", c: 100, r: 30 }));
    ws.send(JSON.stringify({ t: "i", d: "echo MARK$((6*7)); stty size; echo SECRET=${TERMINAL_SECRET:-hidden}\n" }));
    await new Promise((r) => setTimeout(r, 1500));
    expect(output).toContain("MARK42");
    expect(output).toContain("30 100");
    expect(output).toContain("SECRET=hidden"); // service secrets are not inherited by the shell
    ws.close();
    await new Promise((r) => setTimeout(r, 300));
    expect(app.sessions.size).toBe(0); // the pty is killed when the socket closes
  });

  it("limits concurrent sessions", async () => {
    const res = await login("a-very-long-passphrase", { "x-forwarded-for": "6.6.6.6" });
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const a = await openWs(cookie);
    const b = await openWs(cookie);
    const c = await openWs(cookie);
    expect(a.ws && b.ws).toBeTruthy();
    expect(c.status).toBe(503);
    a.ws.close();
    b.ws.close();
    await new Promise((r) => setTimeout(r, 300));
  });

  it("rejects wrong passwords, then locks the address out", async () => {
    const ip = { "x-forwarded-for": "5.5.5.5" };
    for (let i = 0; i < 5; i++) expect((await login("wrong-password!!", ip)).status).toBe(401);
    expect((await login("a-very-long-passphrase", ip)).status).toBe(429); // even the right password is refused while locked
    expect((await login("a-very-long-passphrase", { "x-forwarded-for": "4.4.4.4" })).status).toBe(200);
  }, 20000);

  it("refuses cross-origin login and reports a missing password setup", async () => {
    expect((await login("x", { origin: "https://evil.example", "x-forwarded-for": "3.3.3.3" })).status).toBe(403);
    const bare = createTerminalServer(loadConfig({ PORT: "0", TERMINAL_SECRET: "k".repeat(48), ALLOWED_ORIGINS: ORIGIN }), { info() {} });
    const a = await bare.listen();
    const r = await fetch(`http://127.0.0.1:${a.port}/login`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ password: "anything-at-all" }) });
    expect(r.status).toBe(503);
    await bare.close();
  });
});
