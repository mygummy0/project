"use client";

import { useRef } from "react";
import { useIde, useSession } from "../context";
import { IconPanel, IconPlay, IconPreview, IconRestart, IconSidebar, IconStop } from "../icons";
import { Menu, type MenuItem } from "./Menu";

const btn = "flex h-6 w-7 items-center justify-center rounded-[3px] text-ide-muted hover:bg-ide-hover hover:text-ide-text disabled:opacity-40";

export function TopBar({ showPreview, showBottom, showExplorer }: { showPreview: boolean; showBottom: boolean; showExplorer: boolean }) {
  const session = useSession();
  const project = useIde((s) => s.project);
  const theme = useIde((s) => s.theme);
  const readOnly = useIde((s) => s.readOnly);
  const runtimeStatus = useIde((s) => s.runtimeStatus);
  const layout = useIde((s) => s.layout);
  const fileInput = useRef<HTMLInputElement>(null);
  const running = runtimeStatus === "running" || runtimeStatus === "starting";

  const exportZip = async () => {
    const { name, data } = await session.exportZip();
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const renameProject = () => {
    const name = window.prompt("Project name", project?.name ?? "");
    if (name && name.trim()) void session.renameProject(name);
  };

  const fileItems: MenuItem[] = [
    { label: "New File", disabled: readOnly, onSelect: () => session.beginCreate("file", "/") },
    { label: "New Folder", disabled: readOnly, onSelect: () => session.beginCreate("folder", "/") },
    { label: "", separator: true },
    { label: "Save", shortcut: "Ctrl+S", disabled: readOnly, onSelect: () => void session.saveActive() },
    { label: "Save All", disabled: readOnly, onSelect: () => void session.saveAll() },
    { label: "", separator: true },
    { label: "Rename Project…", disabled: readOnly, onSelect: renameProject },
    { label: "Import ZIP…", disabled: readOnly, onSelect: () => fileInput.current?.click() },
    { label: "Export as ZIP", onSelect: () => void exportZip() },
    { label: "", separator: true },
    { label: "Settings", shortcut: "Ctrl+,", onSelect: () => session.openSettings() },
  ];
  const editItems: MenuItem[] = [
    { label: "Find", shortcut: "Ctrl+F", onSelect: () => void session.editorAction("find") },
    { label: "Replace", shortcut: "Ctrl+H", disabled: readOnly, onSelect: () => void session.editorAction("replace") },
    { label: "", separator: true },
    { label: "Format Document", shortcut: "Shift+Alt+F", disabled: readOnly, onSelect: () => void session.editorAction("format") },
    { label: "Go to Line…", shortcut: "Ctrl+G", onSelect: () => void session.editorAction("goToLine") },
    { label: "Command Palette…", shortcut: "F1", onSelect: () => void session.editorAction("commandPalette") },
  ];
  const viewItems: MenuItem[] = [
    ...(showExplorer
      ? [
          { label: "Explorer", shortcut: "Ctrl+Shift+E", onSelect: () => session.setLayout({ sidebarOpen: true, sidebarView: "explorer" }) },
          { label: "Search", shortcut: "Ctrl+Shift+F", onSelect: () => session.setLayout({ sidebarOpen: true, sidebarView: "search" }) },
          { label: "Toggle Sidebar", shortcut: "Ctrl+B", onSelect: () => session.setLayout({ sidebarOpen: !layout.sidebarOpen }) },
        ]
      : []),
    ...(showBottom ? [{ label: "Toggle Panel", shortcut: "Ctrl+J", onSelect: () => session.setLayout({ bottomOpen: !layout.bottomOpen }) }] : []),
    ...(showPreview ? [{ label: "Toggle Preview", onSelect: () => session.setLayout({ previewOpen: !layout.previewOpen }) }] : []),
    { label: "", separator: true },
    { label: theme === "dark" ? "Light Theme" : "Dark Theme", onSelect: () => session.setTheme(theme === "dark" ? "light" : "dark") },
  ];
  const runItems: MenuItem[] = [
    { label: "Run", shortcut: "Ctrl+Enter", onSelect: () => void session.run() },
    { label: "Stop", disabled: !running, onSelect: () => void session.stop() },
    { label: "Restart", onSelect: () => void session.restart() },
  ];

  return (
    <header className="grid h-[30px] shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-ide-border bg-ide-panel px-1 text-[12px]">
      <div className="flex items-center">
        <Menu label="File" items={fileItems} />
        <Menu label="Edit" items={editItems} />
        <Menu label="View" items={viewItems} />
        <Menu label="Run" items={runItems} />
      </div>

      <div className="max-w-[40vw] truncate px-2 text-ide-muted" title={project?.name}>
        {project?.name ?? ""}
      </div>

      <div className="flex items-center justify-end gap-px">
        {running ? (
          <>
            <button className={btn} title="Restart" aria-label="Restart" onClick={() => void session.restart()}><IconRestart /></button>
            <button className={`${btn} !text-ide-danger`} title="Stop" aria-label="Stop" onClick={() => void session.stop()}><IconStop /></button>
          </>
        ) : (
          <button className={`${btn} !text-ide-ok`} title="Run (Ctrl+Enter)" aria-label="Run" onClick={() => void session.run()}><IconPlay /></button>
        )}
        <span className="mx-1 h-4 w-px bg-ide-border" />
        {showExplorer && <button className={`${btn} ${layout.sidebarOpen ? "!text-ide-text" : ""}`} title="Toggle Sidebar (Ctrl+B)" aria-label="Toggle sidebar" onClick={() => session.setLayout({ sidebarOpen: !layout.sidebarOpen })}><IconSidebar /></button>}
        {showBottom && <button className={`${btn} ${layout.bottomOpen ? "!text-ide-text" : ""}`} title="Toggle Panel (Ctrl+J)" aria-label="Toggle panel" onClick={() => session.setLayout({ bottomOpen: !layout.bottomOpen })}><IconPanel /></button>}
        {showPreview && <button className={`${btn} ${layout.previewOpen ? "!text-ide-text" : ""}`} title="Toggle Preview" aria-label="Toggle preview" onClick={() => session.setLayout({ previewOpen: !layout.previewOpen })}><IconPreview /></button>}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) await session.importZip(await f.arrayBuffer());
        }}
      />
    </header>
  );
}
