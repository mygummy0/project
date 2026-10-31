"use client";

import { useRef } from "react";

/** Draggable splitter. Uses pointer capture so dragging over an iframe still works. */
export function ResizeHandle({ axis, onResize }: { axis: "x" | "y"; onResize: (deltaPx: number) => void }) {
  const last = useRef<number | null>(null);
  const horizontal = axis === "x";
  return (
    <div
      role="separator"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      className={`group relative z-10 shrink-0 ${horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"} bg-ide-border/60 hover:bg-ide-accent/70 active:bg-ide-accent`}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = horizontal ? e.clientX : e.clientY;
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const cur = horizontal ? e.clientX : e.clientY;
        const delta = cur - last.current;
        if (delta !== 0) {
          last.current = cur;
          onResize(delta);
        }
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    />
  );
}
