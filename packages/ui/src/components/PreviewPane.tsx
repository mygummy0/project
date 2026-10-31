"use client";

import { useEffect, useRef, useState } from "react";
import { PREVIEW_SANDBOX } from "@webide/preview-engine";
import { useIde, useSession } from "../context";
import { IconDesktop, IconPhone, IconRefresh, IconTablet } from "../icons";

const DEVICES = {
  desktop: { label: "Desktop", width: "100%", icon: <IconDesktop /> },
  tablet: { label: "Tablet (768px)", width: "768px", icon: <IconTablet /> },
  mobile: { label: "Mobile (375px)", width: "375px", icon: <IconPhone /> },
} as const;

export function PreviewPane() {
  const session = useSession();
  const status = useIde((s) => s.previewStatus);
  const runtime = useIde((s) => s.runtimeStatus);
  const hasHtml = useIde((s) => s.files.some((f) => f.kind === "file" && /\.html?$/i.test(f.path)));
  const [device, setDevice] = useState<keyof typeof DEVICES>("desktop");
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    session.preview.attach(frame.current);
    return () => session.preview.attach(null);
  }, [session]);

  const dot = status === "ready" ? "bg-ide-ok" : status === "building" ? "bg-ide-warn" : status === "error" ? "bg-ide-danger" : "bg-ide-muted";
  const label = { idle: "Not running", building: "Building…", ready: "Ready", error: "Error" }[status];

  return (
    <div className="flex h-full flex-col bg-ide-panel">
      <div className="flex h-[35px] shrink-0 items-center justify-between gap-2 border-b border-ide-border px-2">
        <span className="flex items-center gap-2 text-xs text-ide-muted">
          <span className={`h-2 w-2 rounded-full ${dot}`} /> Preview · {label}
        </span>
        <span className="flex items-center gap-0.5">
          {(Object.keys(DEVICES) as (keyof typeof DEVICES)[]).map((d) => (
            <button
              key={d}
              title={DEVICES[d].label}
              aria-label={DEVICES[d].label}
              aria-pressed={device === d}
              className={`rounded-[3px] p-1.5 ${device === d ? "bg-ide-active text-ide-text" : "text-ide-muted hover:bg-ide-hover"}`}
              onClick={() => setDevice(d)}
            >
              {DEVICES[d].icon}
            </button>
          ))}
          <button className="ml-1 rounded-[3px] p-1.5 text-ide-muted hover:bg-ide-hover" title="Reload preview" aria-label="Reload preview" onClick={() => session.preview.reload()}>
            <IconRefresh />
          </button>
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-ide-bg p-0">
        <div className="mx-auto h-full bg-white " style={{ width: DEVICES[device].width, maxWidth: "100%" }}>
          <iframe
            ref={frame}
            title="Live preview"
            sandbox={PREVIEW_SANDBOX}
            referrerPolicy="no-referrer"
            className="h-full w-full border-0 bg-white"
          />
        </div>
        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ide-bg p-6 text-center text-sm text-ide-muted">
            {hasHtml ? (
              <>
                <p>{runtime === "error" ? "Nothing to preview for this project." : "Preview is stopped."}</p>
                <button className="text-ide-accent hover:underline" onClick={() => void session.run()}>
                  Run
                </button>
              </>
            ) : (
              <p>No HTML file to preview. Scripts run in the Console (Ctrl+Enter).</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
