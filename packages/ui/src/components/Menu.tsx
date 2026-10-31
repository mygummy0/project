"use client";

import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className={`rounded-[3px] px-2 py-0.5 text-[12px] hover:bg-ide-hover ${open ? "bg-ide-hover" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 min-w-52 rounded-[5px] border border-[#454545] bg-ide-panel-2 py-1">
          {items.map((it, i) =>
            it.separator ? (
              <div key={i} className="my-1 h-px bg-ide-border" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                className="flex w-full items-center justify-between gap-6 px-3 py-[3px] text-left text-[13px] hover:bg-ide-accent hover:text-ide-accent-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-inherit"
                onClick={() => {
                  setOpen(false);
                  it.onSelect?.();
                }}
              >
                <span>{it.label}</span>
                {it.shortcut && <span className="text-xs opacity-60">{it.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
