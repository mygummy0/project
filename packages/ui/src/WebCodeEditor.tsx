"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { StorageAdapter } from "@webide/storage";
import type { ThemeName } from "@webide/shared";
import { SessionContext } from "./context";
import { IdeSession } from "./session";
import { useIde } from "./context";
import { Workbench } from "./components/Workbench";

export interface WebCodeEditorProps {
  /** Project to open; created from a template on first use. Must match [A-Za-z0-9_-]{1,64}. */
  projectId: string;
  /** Controlled theme. When omitted the last used theme of the project is restored. */
  theme?: ThemeName;
  /** Picks the starter template when the project does not exist yet (html | javascript | typescript | markdown). */
  language?: string;
  readOnly?: boolean;
  showExplorer?: boolean;
  /** Shows the bottom panel (Console / Problems / Output). A real xterm terminal arrives with the Terminal Engine. */
  showTerminal?: boolean;
  showPreview?: boolean;
  /** Start the preview/runtime automatically once the project is loaded. Default true. */
  autoRun?: boolean;
  /**
   * Route that serves the preview sandbox document (see `SANDBOX_FRAME_HTML` in preview-engine).
   * Recommended: it keeps the host page's CSP strict. Without it the preview uses `srcdoc`.
   */
  previewSandboxUrl?: string;
  /**
   * Base URL of a running services/terminal-server, e.g. "/terminal" (same origin, behind your reverse proxy).
   * Without it the Terminal tab is not shown at all.
   */
  terminalUrl?: string;
  /** Custom persistence; defaults to IndexedDB in the browser. */
  storage?: StorageAdapter;
  className?: string;
  style?: CSSProperties;
}

function Shell(props: Required<Pick<WebCodeEditorProps, "showExplorer" | "showTerminal" | "showPreview">>) {
  const phase = useIde((s) => s.phase);
  const error = useIde((s) => s.error);
  if (phase === "loading") return <div className="flex h-full items-center justify-center text-sm text-ide-muted">Loading project…</div>;
  if (phase === "error") {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
        <p className="text-ide-danger">Could not open this project.</p>
        <p className="max-w-md text-ide-muted">{error}</p>
      </div>
    );
  }
  return <Workbench showExplorer={props.showExplorer} showBottomPanel={props.showTerminal} showPreview={props.showPreview} />;
}

/** Embeddable IDE. Give its container an explicit height (e.g. `h-screen`). */
export function WebCodeEditor({
  projectId,
  theme,
  language,
  readOnly = false,
  showExplorer = true,
  showTerminal = true,
  showPreview = true,
  autoRun = true,
  previewSandboxUrl,
  terminalUrl,
  storage,
  className = "",
  style,
}: WebCodeEditorProps) {
  const [session, setSession] = useState<IdeSession | null>(null);

  useEffect(() => {
    const s = new IdeSession({ projectId, theme, language, readOnly, storage, autoRun, previewSandboxUrl, terminalUrl });
    setSession(s);
    void s.init();
    return () => {
      s.dispose();
      setSession(null);
    };
    // Re-create only when the identity of the project/session inputs changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, language, readOnly, storage, previewSandboxUrl, terminalUrl]);

  useEffect(() => {
    if (session && theme) session.setTheme(theme);
  }, [session, theme]);

  return (
    <div
      data-ide-theme={theme ?? "dark"}
      className={`ide-root relative h-full w-full overflow-hidden bg-ide-bg text-ide-text ${className}`}
      style={style}
    >
      {session ? (
        <SessionContext.Provider value={session}>
          <ThemedRoot>
            <Shell showExplorer={showExplorer} showTerminal={showTerminal} showPreview={showPreview} />
          </ThemedRoot>
        </SessionContext.Provider>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-ide-muted">Loading…</div>
      )}
    </div>
  );
}

/** Applies the live (possibly user-toggled) theme to the subtree. */
function ThemedRoot({ children }: { children: React.ReactNode }) {
  const theme = useIde((s) => s.theme);
  const scale = useIde((s) => s.settings.uiScale);
  // CSS zoom implements the UI scale; size is compensated so the IDE still fills its container.
  return (
    <div
      data-ide-theme={theme}
      className="bg-ide-bg text-ide-text"
      style={{ zoom: scale, width: `${100 / scale}%`, height: `${100 / scale}%`, fontSize: 13 }}
    >
      {children}
    </div>
  );
}
