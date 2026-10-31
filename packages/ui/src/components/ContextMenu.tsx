"use client";

import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { useIde } from "../context";
import type { MenuItem } from "./Menu";

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** Right-click menu positioned at the pointer and kept inside the viewport. */
export function ContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = useIde((s) => s.settings.uiScale);
  const [pos, setPos] = useState({ left: menu.x / scale, top: menu.y / scale });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(0, Math.min(menu.x, window.innerWidth - r.width - 4));
    const top = Math.max(0, Math.min(menu.y, window.innerHeight - r.height - 4));
    setPos({ left: left / scale, top: top / scale });
  }, [menu, scale]);

  useEffect(() => {
    const down = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-48 rounded-[5px] border border-[#454545] bg-ide-panel-2 py-1 text-[13px]"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-ide-border" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            className="flex w-full items-center justify-between gap-8 px-3 py-[3px] text-left hover:bg-ide-accent hover:text-ide-accent-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit"
            onClick={() => {
              onClose();
              it.onSelect?.();
            }}
          >
            <span>{it.label}</span>
            {it.shortcut && <span className="opacity-60">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}
