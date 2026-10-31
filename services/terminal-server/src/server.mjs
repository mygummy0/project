import { createServer } from "node:http";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import * as pty from "node-pty";
import { LoginLimiter, createToken, isAllowedOrigin, parseCookies, verifyPassword, verifyToken } from "./auth.mjs";

const COOKIE = "webide_term";

export function loadConfig(env = process.env) {
  const origins = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 3001),
    secret: env.TERMINAL_SECRET ?? "",
    passwordHash: env.TERMINAL_PASSWORD_HASH ?? "",
    allowedOrigins: origins,
    basePath: env.BASE_PATH ?? "/terminal",
    secureCookie: env.COOKIE_SECURE ? env.COOKIE_SECURE === "1" : origins.every((o) => o.startsWith("https://")),
    shell: env.TERMINAL_SHELL || env.SHELL || "/bin/bash",
    cwd: env.TERMINAL_CWD || homedir(),
    maxSessions: Number(env.MAX_SESSIONS ?? 4),
    sessionTtlMs: Number(env.SESSION_TTL_HOURS ?? 12) * 3_600_000,
    idleMs: Number(env.IDLE_MINUTES ?? 30) * 60_000,
  };
}

function readJson(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export function createTerminalServer(config, log = console) {
  if (config.secret.length < 32) throw new Error("TERMINAL_SECRET must be at least 32 characters");
  const limiter = new LoginLimiter();
  const sessions = new Set();
  const clientIp = (req) => String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0].trim();
  const authed = (req) => verifyToken(config.secret, parseCookies(req.headers.cookie)[COOKIE]);
  const cookie = (value, maxAgeSec) =>
    `${COOKIE}=${value}; Path=${config.basePath}; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${config.secureCookie ? "; Secure" : ""}`;
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  // State-changing requests must come from our own site (CSRF defence on top of SameSite=Strict).
  const originOk = (req) => !req.headers.origin || isAllowedOrigin(req.headers.origin, config.allowedOrigins);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
      if (req.method === "GET" && url.pathname === "/session") {
        return authed(req) ? send(res, 200, { authenticated: true }) : send(res, 401, { authenticated: false });
      }
      if (req.method === "POST" && url.pathname === "/logout") {
        if (!originOk(req)) return send(res, 403, { error: "forbidden origin" });
        return send(res, 200, { ok: true }, { "Set-Cookie": cookie("", 0) });
      }
      if (req.method === "POST" && url.pathname === "/login") {
        if (!originOk(req)) return send(res, 403, { error: "forbidden origin" });
        if (!config.passwordHash) return send(res, 503, { error: "No terminal password is set on the server yet." });
        const ip = clientIp(req);
        const gate = limiter.check(ip);
        if (!gate.allowed) {
          return send(res, 429, { error: "Too many attempts. Try again later." }, { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) });
        }
        const body = await readJson(req);
        if (!verifyPassword(String(body.password ?? ""), config.passwordHash)) {
          limiter.fail(ip);
          await new Promise((r) => setTimeout(r, 400)); // slow down guessing
          return send(res, 401, { error: "Wrong password" });
        }
        limiter.success(ip);
        const token = createToken(config.secret, config.sessionTtlMs);
        return send(res, 200, { ok: true }, { "Set-Cookie": cookie(token, Math.floor(config.sessionTtlMs / 1000)) });
      }
      send(res, 404, { error: "not found" });
    } catch {
      send(res, 400, { error: "bad request" });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const reject = (code, text) => {
      socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (url.pathname !== "/ws") return reject(404, "Not Found");
    if (!isAllowedOrigin(req.headers.origin, config.allowedOrigins)) return reject(403, "Forbidden");
    if (!authed(req)) return reject(401, "Unauthorized");
    if (sessions.size >= config.maxSessions) return reject(503, "Too Many Sessions");
    wss.handleUpgrade(req, socket, head, (ws) => attach(ws));
  });

  function attach(ws) {
    const cols = 80;
    const rows = 24;
    // Never leak the service's own secrets into the user's shell.
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^TERMINAL_|^ALLOWED_ORIGINS$|^COOKIE_SECURE$/.test(k)));
    const term = pty.spawn(config.shell, ["-l"], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: config.cwd,
      env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    });
    sessions.add(term);
    let lastInput = Date.now();
    const idle = setInterval(() => {
      if (Date.now() - lastInput > config.idleMs) ws.close(4000, "idle timeout");
    }, 30_000);
    const out = (obj) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(obj));

    term.onData((d) => out({ t: "o", d }));
    term.onExit(({ exitCode }) => {
      out({ t: "x", code: exitCode });
      ws.close(1000, "exited");
    });
    ws.on("message", (raw) => {
      let m;
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.t === "i" && typeof m.d === "string") {
        lastInput = Date.now();
        term.write(m.d);
      } else if (m.t === "r") {
        const c = Math.max(20, Math.min(500, Number(m.c) || cols));
        const r = Math.max(5, Math.min(200, Number(m.r) || rows));
        term.resize(c, r);
      }
    });
    const cleanup = () => {
      clearInterval(idle);
      if (sessions.delete(term)) {
        try {
          term.kill();
        } catch {
          /* already gone */
        }
      }
    };
    ws.on("close", cleanup);
    ws.on("error", cleanup);
    log.info?.(`terminal session opened (${sessions.size} active)`);
  }

  return {
    server,
    sessions,
    listen: () => new Promise((resolve) => server.listen(config.port, config.host, () => resolve(server.address()))),
    close: () =>
      new Promise((resolve) => {
        for (const t of sessions) {
          try {
            t.kill();
          } catch {
            /* ignore */
          }
        }
        wss.close();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  if (!config.passwordHash) console.warn("WARNING: TERMINAL_PASSWORD_HASH is not set; nobody can log in until you run set-password.mjs");
  const app = createTerminalServer(config);
  app.listen().then((addr) => console.log(`terminal server listening on ${addr.address}:${addr.port} (path ${config.basePath})`));
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => app.close().then(() => process.exit(0)));
}
