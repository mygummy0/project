"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIde, useSession } from "../context";
import { IconClose, IconPlus } from "../icons";

const KEYS: { label: string; seq: string; title: string }[] = [
  { label: "Esc", seq: "\x1b", title: "Escape" },
  { label: "Tab", seq: "\t", title: "Tab" },
  { label: "↑", seq: "\x1b[A", title: "Up" },
  { label: "↓", seq: "\x1b[B", title: "Down" },
  { label: "←", seq: "\x1b[D", title: "Left" },
  { label: "→", seq: "\x1b[C", title: "Right" },
  { label: "|", seq: "|", title: "Pipe" },
  { label: "/", seq: "/", title: "Slash" },
  { label: "-", seq: "-", title: "Dash" },
  { label: "~", seq: "~", title: "Tilde" },
];

function LoginForm({ id }: { id: number }) {
  const session = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    const err = await session.terminals?.login(id, password);
    setBusy(false);
    if (err) setError(err);
    else setPassword("");
  };
  return (
    <form
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-ide-panel p-4 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="text-ide-muted" htmlFor="term-pass">Terminal password</label>
      <input
        id="term-pass"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-64 max-w-full rounded-[3px] border border-ide-border bg-ide-panel-2 px-2 py-1 outline-none focus:border-ide-accent"
      />
      <button type="submit" disabled={busy || !password} className="rounded-[3px] bg-ide-accent px-4 py-1 text-ide-accent-fg disabled:opacity-50">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && <p role="alert" className="max-w-xs text-center text-ide-danger">{error}</p>}
    </form>
  );
}

export function TerminalPanel() {
  const session = useSession();
  const tabs = useIde((s) => s.terminals);
  const active = useIde((s) => s.activeTerminal);
  const theme = useIde((s) => s.theme);
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrl = useSyncExternalStore(
    (cb) => session.onCtrlChange(cb),
    () => session.ctrlArmed,
    () => false,
  );
  const activeTab = tabs.find((t) => t.id === active) ?? null;

  // First visit: open a shell automatically.
  useEffect(() => {
    if (tabs.length === 0) void session.showTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mount the active terminal into the host, keep it sized.
  useEffect(() => {
    const host = hostRef.current;
    const mgr = session.terminals;
    if (!host || !mgr || active === null) return;
    mgr.attach(active, host);
    const ro = new ResizeObserver(() => mgr.fit(active));
    ro.observe(host);
    return () => ro.disconnect();
  }, [active, session, tabs.length]);

  useEffect(() => {
    session.terminals?.refreshTheme();
  }, [theme, session]);

  const mgr = session.terminals;
  if (!mgr) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[26px] shrink-0 items-center gap-px border-b border-ide-border bg-ide-panel px-1 text-[12px]">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`flex h-[22px] cursor-pointer items-center gap-1.5 rounded-[3px] px-2 ${t.id === active ? "bg-ide-active text-ide-text" : "text-ide-muted hover:bg-ide-hover"}`}
            onClick={() => mgr.select(t.id)}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${t.status === "open" ? "bg-ide-ok" : t.status === "connecting" ? "bg-ide-warn" : "bg-ide-muted"}`} />
            {t.title}
            <button
              aria-label={`Close ${t.title}`}
              className="rounded hover:bg-ide-border"
              onClick={(e) => {
                e.stopPropagation();
                mgr.close(t.id);
              }}
            >
              <IconClose />
            </button>
          </div>
        ))}
        <button className="rounded-[3px] p-1 text-ide-muted hover:bg-ide-hover hover:text-ide-text" title="New Terminal" aria-label="New terminal" onClick={() => void session.showTerminal(true)}>
          <IconPlus />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-ide-panel pl-2 pt-1" onClick={() => active !== null && mgr.focus(active)}>
        {tabs.length === 0 && <p className="p-3 text-ide-muted">Starting terminal…</p>}
        <div ref={hostRef} className="h-full w-full" data-testid="terminal-host" />
        {activeTab?.status === "login" && <LoginForm id={activeTab.id} />}
        {(activeTab?.status === "ended" || activeTab?.status === "error") && (
          <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center">
            <div className="flex items-center gap-3 rounded-[3px] border border-[#454545] bg-ide-panel-2 px-3 py-1.5 text-[13px]">
              <span>{activeTab.status === "error" ? activeTab.message : (activeTab.message ?? "Session ended")}</span>
              <button className="text-ide-accent hover:underline" onClick={() => mgr.reconnect(activeTab.id)}>
                Reconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Touch keyboards have no Esc/Tab/Ctrl/arrows: offer them on coarse-pointer devices. */}
      {activeTab?.status === "open" && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-ide-border bg-ide-panel px-1 py-1 [@media(pointer:fine)]:hidden" aria-label="Terminal keys">
          <button
            className={`h-8 min-w-10 rounded-[3px] border border-ide-border px-2 text-[13px] ${ctrl ? "bg-ide-accent text-ide-accent-fg" : "bg-ide-panel-2"}`}
            aria-pressed={ctrl}
            onClick={() => {
              mgr.setCtrl(!mgr.ctrl);
              mgr.focus(activeTab.id);
            }}
          >
            Ctrl
          </button>
          {KEYS.map((k) => (
            <button key={k.label} title={k.title} className="h-8 min-w-10 rounded-[3px] border border-ide-border bg-ide-panel-2 px-2 text-[13px]" onClick={() => mgr.sendKey(activeTab.id, k.seq)}>
              {k.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
