"use client";

import { useEffect, useRef } from "react";
import { useIde, useSession } from "../context";
import { IconClose, IconError, IconInfo, IconWarn } from "../icons";

const levelClass: Record<string, string> = {
  log: "text-ide-text",
  info: "text-ide-accent",
  debug: "text-ide-muted",
  warn: "text-ide-warn",
  error: "text-ide-danger",
  system: "text-ide-muted italic",
};

export function BottomPanel() {
  const session = useSession();
  const tab = useIde((s) => s.layout.bottomTab);
  const output = useIde((s) => s.output);
  const problems = useIde((s) => s.problems);
  const endRef = useRef<HTMLDivElement>(null);

  const entries = output.filter((o) => (tab === "console" ? o.source !== "runtime" : tab === "output" ? o.source === "runtime" : false));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [entries.length, tab]);

  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;
  const tabBtn = (id: "console" | "problems" | "output", label: string, badge?: string) => (
    <button
      role="tab"
      aria-selected={tab === id}
      className={`h-full px-3 text-xs uppercase tracking-wide ${tab === id ? "text-ide-text shadow-[inset_0_-1px_0_var(--ide-text)]" : "text-ide-muted hover:text-ide-text"}`}
      onClick={() => session.setLayout({ bottomTab: id })}
    >
      {label}
      {badge && <span className="ml-1.5 rounded-full bg-ide-accent px-1.5 text-[10px] text-ide-accent-fg">{badge}</span>}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-ide-panel">
      <div role="tablist" className="flex h-[35px] shrink-0 items-center justify-between border-b border-ide-border pr-2">
        <div className="flex h-full">
          {tabBtn("console", "Console")}
          {tabBtn("problems", "Problems", problems.length ? String(problems.length) : undefined)}
          {tabBtn("output", "Output")}
        </div>
        <div className="flex items-center gap-1 text-ide-muted">
          {tab !== "problems" && (
            <button className="rounded px-2 py-0.5 text-xs hover:bg-ide-hover" onClick={() => session.clearOutput()}>
              Clear
            </button>
          )}
          <button className="rounded p-1 hover:bg-ide-hover" aria-label="Close panel" onClick={() => session.setLayout({ bottomOpen: false })}>
            <IconClose />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs leading-5">
        {tab === "problems" ? (
          problems.length === 0 ? (
            <p className="p-3 text-ide-muted">No problems detected in the workspace.</p>
          ) : (
            <>
              <p className="px-3 py-1 text-ide-muted">{errors} error(s), {warnings} warning(s)</p>
              {problems.map((p, i) => (
                <button key={i} className="flex w-full items-start gap-2 px-3 py-0.5 text-left hover:bg-ide-hover" onClick={() => session.openFile(p.path, { line: p.line, column: p.column })}>
                  <span className={p.severity === "error" ? "text-ide-danger" : p.severity === "warning" ? "text-ide-warn" : "text-ide-accent"}>
                    {p.severity === "error" ? <IconError /> : p.severity === "warning" ? <IconWarn /> : <IconInfo />}
                  </span>
                  <span className="min-w-0 flex-1">
                    {p.message} <span className="text-ide-muted">{p.path}:{p.line}:{p.column}{p.source ? ` (${p.source})` : ""}</span>
                  </span>
                </button>
              ))}
            </>
          )
        ) : entries.length === 0 ? (
          <p className="p-3 text-ide-muted">{tab === "console" ? "Console output from your program appears here." : "Run status and runtime messages appear here."}</p>
        ) : (
          entries.map((o) => (
            <div key={o.id} className={`whitespace-pre-wrap break-words border-b border-ide-border/30 px-3 py-0.5 ${levelClass[o.level] ?? ""}`}>
              {o.text}
              {o.location && <span className="ml-2 text-ide-muted">:{o.location.line}:{o.location.column}</span>}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
