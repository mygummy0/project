"use client";

import { LANGUAGE_LABELS, languageFromPath } from "@webide/shared";
import { useIde, useSession } from "../context";

const SAVE_LABEL = {
  saved: ["Saved", ""],
  saving: ["Saving…", ""],
  unsaved: ["Unsaved", "text-ide-warn"],
  error: ["Save failed, retrying", "text-ide-danger"],
  conflict: ["Save conflict", "text-ide-danger"],
} as const;

const RUN_LABEL: Record<string, string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  stopped: "Stopped",
  error: "Error",
  timeout: "Timed out",
};

const item = "flex h-full items-center px-2 hover:bg-ide-hover";

export function StatusBar() {
  const session = useSession();
  const activePath = useIde((s) => s.activePath);
  const cursor = useIde((s) => s.cursor);
  const save = useIde((s) => s.saveStatus);
  const runtime = useIde((s) => s.runtimeStatus);
  const problems = useIde((s) => s.problems);
  const readOnly = useIde((s) => s.readOnly);
  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.filter((p) => p.severity === "warning").length;
  const [saveText, saveCls] = SAVE_LABEL[save];

  return (
    <footer className="flex h-[22px] shrink-0 select-none items-center justify-between overflow-hidden whitespace-nowrap border-t border-ide-border bg-ide-panel text-[12px] text-ide-muted">
      <div className="flex h-full items-center">
        <button className={item} title="Problems" onClick={() => session.setLayout({ bottomOpen: true, bottomTab: "problems" })}>
          ⊗ {errors}&nbsp;&nbsp;⚠ {warnings}
        </button>
        <span className={`${item} ${saveCls} hover:bg-transparent`}>{saveText}</span>
        <button className={item} title="Run status" onClick={() => session.setLayout({ bottomOpen: true, bottomTab: "output" })}>
          {RUN_LABEL[runtime]}
        </button>
        {readOnly && <span className={`${item} text-ide-warn hover:bg-transparent`}>Read-only</span>}
      </div>
      <div className="flex h-full items-center">
        {cursor && activePath && (
          <button className={item} title="Go to Line" onClick={() => void session.editorAction("goToLine")}>
            Ln {cursor.line}, Col {cursor.column}
            {cursor.selectedChars ? ` (${cursor.selectedChars} selected)` : ""}
          </button>
        )}
        <span className={`${item} hover:bg-transparent`}>UTF-8</span>
        <span className={`${item} hover:bg-transparent`}>{LANGUAGE_LABELS[languageFromPath(activePath ?? "")]}</span>
      </div>
    </footer>
  );
}
