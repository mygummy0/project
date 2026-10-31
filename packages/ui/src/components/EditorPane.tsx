"use client";

import { useEffect, useState } from "react";
import { MonacoEditorView } from "@webide/editor-core";
import { errorMessage } from "@webide/shared";
import { useIde, useSession } from "../context";

export function EditorPane({ group = 0 }: { group?: number }) {
  const session = useSession();
  const ready = useIde((s) => s.monacoReady);
  const activePath = useIde((s) => s.groups[group]?.active ?? null);
  const theme = useIde((s) => s.theme);
  const readOnly = useIde((s) => s.readOnly);
  const fontSize = useIde((s) => s.settings.fontSize);
  const conflict = useIde((s) => (activePath ? s.conflicts[activePath] : false));
  const reveal = useIde((s) => s.reveal);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoadError(null);
    session.attachMonaco().catch((e) => setLoadError(errorMessage(e)));
  }, [session, attempt]);

  // Child effects (model switch) run before this one, so the model is already set.
  useEffect(() => {
    const api = session.editors[group];
    if (reveal && reveal.group === group && reveal.path === activePath && api) {
      api.revealPosition(reveal.line, reveal.column);
    }
  }, [reveal, activePath, session, group]);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-ide-muted">
        <p>The code editor failed to load: {loadError}</p>
        <button className="rounded-[3px] bg-ide-accent px-3 py-1 text-ide-accent-fg" onClick={() => setAttempt((a) => a + 1)}>
          Retry
        </button>
      </div>
    );
  }
  if (!ready || !session.monaco || !session.models) {
    return <div className="flex h-full items-center justify-center text-sm text-ide-muted">Loading editor…</div>;
  }

  return (
    <div className="relative flex h-full flex-col">
      {conflict && activePath && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-ide-warn/40 bg-ide-warn/10 px-3 py-1.5 text-[13px]">
          <span>This file was changed elsewhere (another tab?) since it was loaded.</span>
          <button className="rounded-[3px] border border-ide-border px-2 py-0.5 hover:bg-ide-hover" onClick={() => void session.resolveConflict(activePath, "overwrite")}>
            Keep my version
          </button>
          <button className="rounded-[3px] border border-ide-border px-2 py-0.5 hover:bg-ide-hover" onClick={() => void session.resolveConflict(activePath, "reload")}>
            Load saved version
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <MonacoEditorView
          monaco={session.monaco}
          models={session.models}
          activePath={activePath}
          theme={theme}
          readOnly={readOnly}
          fontSize={fontSize}
          viewScope={String(group)}
          onFocus={() => session.focusGroup(group)}
          onReady={(api) => session.setEditorApi(api, group)}
          onCursorChange={(c) => session.setCursor(c)}
          onSaveRequested={() => void session.saveActive()}
          onRunRequested={() => void session.run()}
        />
        {!activePath && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ide-bg text-sm text-ide-muted">
            Open a file from the explorer to start editing.
          </div>
        )}
      </div>
    </div>
  );
}
