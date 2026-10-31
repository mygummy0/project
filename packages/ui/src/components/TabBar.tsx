"use client";

import { useEffect, useRef, useState } from "react";
import { basename, dirname } from "@webide/shared";
import { useIde, useSession } from "../context";
import { IconClose } from "../icons";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";

export function TabBar() {
  const session = useSession();
  const tabs = useIde((s) => s.openTabs);
  const active = useIde((s) => s.activePath);
  const dirty = useIde((s) => s.dirty);
  const activeRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<ContextMenuState | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const names = tabs.map(basename);
  return (
    <div role="tablist" className="flex h-[35px] shrink-0 overflow-x-auto bg-ide-panel [scrollbar-width:thin]">
      {tabs.map((path, i) => {
        const isActive = path === active;
        const dup = names.filter((n) => n === names[i]).length > 1;
        return (
          <div
            key={path}
            ref={isActive ? activeRef : undefined}
            role="tab"
            aria-selected={isActive}
            title={path}
            className={`group flex shrink-0 cursor-pointer items-center gap-2 border-r border-ide-border px-3 text-[13px] ${
              isActive ? "bg-ide-bg text-ide-text shadow-[inset_0_1px_0_var(--ide-accent)]" : "border-b border-b-ide-border text-ide-muted hover:text-ide-text"
            }`}
            onClick={() => session.setActive(path)}
            onAuxClick={(e) => e.button === 1 && void session.closeTab(path)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtx({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: "Close", shortcut: "Alt+W", onSelect: () => void session.closeTab(path) },
                  { label: "Close Others", disabled: tabs.length < 2, onSelect: () => void session.closeOthers(path) },
                  { label: "Close All", onSelect: () => void session.closeAll() },
                  { label: "", separator: true },
                  { label: "Copy Path", onSelect: () => void navigator.clipboard?.writeText(path) },
                ],
              });
            }}
          >
            <span className="whitespace-nowrap">
              {names[i]}
              {dup && <span className="ml-1 text-xs opacity-60">{dirname(path)}</span>}
            </span>
            <button
              aria-label={`Close ${names[i]}`}
              className="flex h-4 w-4 items-center justify-center rounded hover:bg-ide-border"
              onClick={(e) => {
                e.stopPropagation();
                void session.closeTab(path);
              }}
            >
              {dirty[path] ? <span className="h-2 w-2 rounded-full bg-ide-warn group-hover:hidden" /> : null}
              <span className={dirty[path] ? "hidden group-hover:block" : isActive ? "" : "opacity-0 group-hover:opacity-100"}>
                <IconClose />
              </span>
            </button>
          </div>
        );
      })}
      <div className="min-w-0 flex-1 border-b border-ide-border" />
      {ctx && <ContextMenu menu={ctx} onClose={() => setCtx(null)} />}
    </div>
  );
}
