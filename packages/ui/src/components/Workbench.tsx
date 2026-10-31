"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useIde, useSession } from "../context";
import { IconClose, IconFiles, IconGear, IconSearch } from "../icons";
import { SettingsPanel } from "./SettingsPanel";
import { BottomPanel } from "./BottomPanel";
import { EditorPane } from "./EditorPane";
import { Explorer } from "./Explorer";
import { PreviewPane } from "./PreviewPane";
import { ResizeHandle } from "./ResizeHandle";
import { SearchPanel } from "./SearchPanel";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";

export interface WorkbenchFeatures {
  showExplorer: boolean;
  showBottomPanel: boolean;
  showPreview: boolean;
}

const MOBILE_QUERY = "(max-width: 767px)";
function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(MOBILE_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function Notice() {
  const session = useSession();
  const notice = useIde((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => session.dismissNotice(), notice.kind === "error" ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [notice, session]);
  if (!notice) return null;
  return (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className={`absolute bottom-7 right-3 z-50 flex max-w-[90%] items-center gap-3 rounded-[3px] border px-3 py-2 text-[13px] ${
        notice.kind === "error" ? "border-ide-danger bg-ide-panel-2 text-ide-text" : "border-[#454545] bg-ide-panel-2 text-ide-text"
      }`}
    >
      <span>{notice.text}</span>
      <button aria-label="Dismiss" onClick={() => session.dismissNotice()}><IconClose /></button>
    </div>
  );
}

function useShortcuts(features: WorkbenchFeatures) {
  const session = useSession();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const L = session.state.layout;
      let handled = true;
      if (mod && !e.shiftKey && !e.altKey && k === "b" && features.showExplorer) session.setLayout({ sidebarOpen: !L.sidebarOpen });
      else if (mod && !e.shiftKey && k === "j" && features.showBottomPanel) session.setLayout({ bottomOpen: !L.bottomOpen });
      else if (mod && e.shiftKey && k === "e" && features.showExplorer) session.setLayout({ sidebarOpen: true, sidebarView: "explorer" });
      else if (mod && e.shiftKey && k === "f" && features.showExplorer) session.setLayout({ sidebarOpen: true, sidebarView: "search" });
      else if (mod && k === ",") session.openSettings();
      else if (mod && !e.shiftKey && k === "s") void session.saveActive();
      else if (mod && k === "enter") void session.run();
      else if (e.altKey && !mod && k === "w") {
        const p = session.state.activePath;
        if (p) void session.closeTab(p);
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, features.showExplorer, features.showBottomPanel]);
}

export function Workbench({ showExplorer, showBottomPanel, showPreview }: WorkbenchFeatures) {
  const session = useSession();
  const layout = useIde((s) => s.layout);
  const mobileView = useIde((s) => s.mobileView);
  const isMobile = useIsMobile();
  useShortcuts({ showExplorer, showBottomPanel, showPreview });

  const sidebarVisible = showExplorer && layout.sidebarOpen;
  const sidebar = layout.sidebarView === "search" ? <SearchPanel /> : <Explorer />;

  if (isMobile) {
    const nav = [
      showExplorer && { id: "files" as const, label: "Files" },
      { id: "editor" as const, label: "Editor" },
      showPreview && { id: "preview" as const, label: "Preview" },
      showBottomPanel && { id: "console" as const, label: "Console" },
    ].filter(Boolean) as { id: "files" | "editor" | "preview" | "console"; label: string }[];
    const pane = (id: string, node: React.ReactNode) => (
      <div className={`min-h-0 flex-1 flex-col ${mobileView === id ? "flex" : "hidden"}`}>{node}</div>
    );
    return (
      <div className="relative flex h-full flex-col">
        <TopBar showExplorer={showExplorer} showPreview={showPreview} showBottom={showBottomPanel} />
        {showExplorer &&
          pane(
            "files",
            <>
              <div className="flex shrink-0 border-b border-ide-border">
                {(["explorer", "search"] as const).map((v) => (
                  <button key={v} className={`flex-1 py-1.5 text-xs uppercase ${layout.sidebarView === v ? "text-ide-text shadow-[inset_0_-1px_0_var(--ide-text)]" : "text-ide-muted"}`} onClick={() => session.setLayout({ sidebarView: v })}>
                    {v}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 bg-ide-panel">{sidebar}</div>
            </>,
          )}
        {pane(
          "editor",
          <>
            <TabBar />
            <div className="min-h-0 flex-1 bg-ide-bg"><EditorPane /></div>
          </>,
        )}
        {showPreview && pane("preview", <PreviewPane />)}
        {showBottomPanel && pane("console", <BottomPanel />)}
        <nav className="flex h-11 shrink-0 border-t border-ide-border bg-ide-panel">
          {nav.map((n) => (
            <button key={n.id} className={`flex-1 text-xs ${mobileView === n.id ? "text-ide-accent" : "text-ide-muted"}`} onClick={() => session.setMobileView(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <StatusBar />
        <Notice />
        <SettingsPanel />
      </div>
    );
  }

  const activity = (view: "explorer" | "search", icon: React.ReactNode, label: string, shortcut: string) => {
    const on = layout.sidebarOpen && layout.sidebarView === view;
    return (
      <button
        aria-label={label}
        title={`${label} (${shortcut})`}
        aria-pressed={on}
        className={`relative flex h-12 w-12 items-center justify-center ${on ? "text-ide-text" : "text-ide-muted hover:text-ide-text"}`}
        onClick={() => session.setLayout(on ? { sidebarOpen: false } : { sidebarOpen: true, sidebarView: view })}
      >
        {on && <span className="absolute inset-y-0 left-0 w-0.5 bg-ide-accent" />}
        <span className="scale-125">{icon}</span>
      </button>
    );
  };

  return (
    <div className="relative flex h-full flex-col">
      <TopBar showExplorer={showExplorer} showPreview={showPreview} showBottom={showBottomPanel} />
      <div className="flex min-h-0 flex-1">
        {showExplorer && (
          <nav className="flex w-12 shrink-0 flex-col border-r border-ide-border bg-ide-panel" aria-label="Activity bar">
            {activity("explorer", <IconFiles />, "Explorer", "Ctrl+Shift+E")}
            {activity("search", <IconSearch />, "Search", "Ctrl+Shift+F")}
            <button aria-label="Settings" title="Settings (Ctrl+,)" className="mt-auto flex h-12 w-12 items-center justify-center text-ide-muted hover:text-ide-text" onClick={() => session.openSettings()}>
              <span className="scale-125"><IconGear /></span>
            </button>
          </nav>
        )}
        {sidebarVisible && (
          <>
            <aside className="shrink-0 overflow-hidden bg-ide-panel" style={{ width: layout.sidebarWidth }}>{sidebar}</aside>
            <ResizeHandle axis="x" onResize={(d) => session.setLayout({ sidebarWidth: clamp(layout.sidebarWidth + d, 160, 520) })} />
          </>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar />
          <div className="min-h-0 flex-1 bg-ide-bg"><EditorPane /></div>
          {showBottomPanel && layout.bottomOpen && (
            <>
              <ResizeHandle axis="y" onResize={(d) => session.setLayout({ bottomHeight: clamp(layout.bottomHeight - d, 80, 640) })} />
              <section className="shrink-0 overflow-hidden" style={{ height: layout.bottomHeight }}><BottomPanel /></section>
            </>
          )}
        </main>
        {showPreview && layout.previewOpen && (
          <>
            <ResizeHandle axis="x" onResize={(d) => session.setLayout({ previewWidth: clamp(layout.previewWidth - d, 240, 1100) })} />
            <aside className="shrink-0 overflow-hidden border-l border-ide-border" style={{ width: layout.previewWidth }}><PreviewPane /></aside>
          </>
        )}
      </div>
      <StatusBar />
      <Notice />
      <SettingsPanel />
    </div>
  );
}
