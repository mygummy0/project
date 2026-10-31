"use client";

import { useEffect, useMemo, useState } from "react";
import type { SearchMatch, SearchResult } from "@webide/file-engine";
import { useIde, useSession } from "../context";

export function SearchPanel() {
  const session = useSession();
  const files = useIde((s) => s.files);
  const dirty = useIde((s) => s.dirty);
  const readOnly = useIde((s) => s.readOnly);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCase] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWord] = useState(false);
  const [result, setResult] = useState<SearchResult>({ matches: [], truncated: false });

  useEffect(() => {
    const t = setTimeout(() => setResult(session.search(query, { caseSensitive, regex, wholeWord })), 200);
    return () => clearTimeout(t);
    // Re-run when files change (new/removed) or buffers are edited (dirty set changes).
  }, [query, caseSensitive, regex, wholeWord, session, files, dirty]);

  const groups = useMemo(() => {
    const m = new Map<string, SearchMatch[]>();
    for (const x of result.matches) (m.get(x.path) ?? m.set(x.path, []).get(x.path)!).push(x);
    return [...m];
  }, [result]);

  const opts = { caseSensitive, regex, wholeWord };
  const replace = (path?: string) => {
    session.replaceInFiles(query, replacement, opts, path);
    setResult(session.search(query, opts));
  };
  const toggle = (on: boolean) => `rounded px-1.5 py-0.5 text-xs font-mono ${on ? "bg-ide-accent text-ide-accent-fg" : "text-ide-muted hover:bg-ide-hover"}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[35px] items-center pl-5 text-[11px] uppercase text-ide-muted">Search</div>
      <div className="space-y-1 px-3 pb-2">
        <div className="flex gap-1">
          {!readOnly && (
            <button
              className="w-4 shrink-0 text-ide-muted hover:text-ide-text"
              title="Toggle Replace"
              aria-label="Toggle replace"
              aria-expanded={showReplace}
              onClick={() => setShowReplace((v) => !v)}
            >
              {showReplace ? "▾" : "▸"}
            </button>
          )}
          <div className="min-w-0 flex-1 space-y-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in project"
          aria-label="Search query"
          className="w-full rounded-[3px] border border-ide-border bg-ide-panel-2 px-2 py-0.5 text-[13px] outline-none focus:border-ide-accent"
        />
        {showReplace && (
          <div className="flex gap-1">
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Replace"
              aria-label="Replacement"
              className="min-w-0 flex-1 rounded-[3px] border border-ide-border bg-ide-panel-2 px-2 py-0.5 text-[13px] outline-none focus:border-ide-accent"
              onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && replace()}
            />
            <button
              className="rounded-[3px] px-1.5 text-xs text-ide-muted hover:bg-ide-hover hover:text-ide-text disabled:opacity-40"
              title="Replace All (Ctrl+Enter)"
              disabled={!query || result.matches.length === 0 || !!result.error}
              onClick={() => replace()}
            >
              All
            </button>
          </div>
        )}
          </div>
        </div>
        <div className="flex gap-1">
          <button className={toggle(caseSensitive)} title="Match case" onClick={() => setCase((v) => !v)}>Aa</button>
          <button className={toggle(wholeWord)} title="Whole word" onClick={() => setWord((v) => !v)}>ab</button>
          <button className={toggle(regex)} title="Regular expression" onClick={() => setRegex((v) => !v)}>.*</button>
        </div>
        {result.error && <p className="text-xs text-ide-danger">{result.error}</p>}
        {query && !result.error && (
          <p className="text-xs text-ide-muted">
            {result.matches.length}{result.truncated ? "+" : ""} result(s) in {groups.length} file(s)
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pb-4">
        {groups.map(([path, ms]) => (
          <div key={path}>
            <div className="group flex items-center justify-between px-3 py-1 text-xs font-semibold">
              <span className="truncate">{path}</span>
              {showReplace && !readOnly && (
                <button className="hidden text-ide-muted hover:text-ide-text group-hover:block" title="Replace in this file" onClick={() => replace(path)}>
                  Replace
                </button>
              )}
            </div>
            {ms.map((m, i) => (
              <button
                key={i}
                className="block w-full truncate px-5 py-0.5 text-left font-mono text-xs text-ide-muted hover:bg-ide-hover hover:text-ide-text"
                onClick={() => session.openFile(m.path, { line: m.line, column: m.column })}
              >
                <span className="mr-2 text-ide-accent">{m.line}</span>
                {m.preview.trim()}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
