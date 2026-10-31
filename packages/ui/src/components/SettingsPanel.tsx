"use client";

import { useEffect } from "react";
import { useIde, useSession } from "../context";
import { IconClose } from "../icons";

/** Minimal settings dialog (UI scale, editor font size, theme). */
export function SettingsPanel() {
  const session = useSession();
  const open = useIde((s) => s.settingsOpen);
  const settings = useIde((s) => s.settings);
  const theme = useIde((s) => s.theme);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && session.openSettings(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, session]);

  if (!open) return null;
  const row = "flex items-center justify-between gap-4 py-2";
  const input = "w-20 rounded-[3px] border border-ide-border bg-ide-panel-2 px-2 py-0.5 text-right outline-none focus:border-ide-accent";
  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/40 pt-16" onPointerDown={() => session.openSettings(false)}>
      <div role="dialog" aria-label="Settings" className="w-80 rounded-[5px] border border-[#454545] bg-ide-panel-2 text-[13px]" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex h-9 items-center justify-between border-b border-ide-border px-3">
          <span className="font-medium">Settings</span>
          <button aria-label="Close settings" className="text-ide-muted hover:text-ide-text" onClick={() => session.openSettings(false)}>
            <IconClose />
          </button>
        </div>
        <div className="divide-y divide-ide-border px-3">
          <label className={row}>
            <span>UI scale</span>
            <input type="number" step={0.1} min={0.8} max={1.5} className={input} value={settings.uiScale} onChange={(e) => session.setSettings({ uiScale: Number(e.target.value) })} />
          </label>
          <label className={row}>
            <span>Editor font size</span>
            <input type="number" step={1} min={10} max={28} className={input} value={settings.fontSize} onChange={(e) => session.setSettings({ fontSize: Number(e.target.value) })} />
          </label>
          <label className={row}>
            <span>Color theme</span>
            <select className={input + " w-28 text-left"} value={theme} onChange={(e) => session.setTheme(e.target.value as "dark" | "light")}>
              <option value="dark">Dark Modern</option>
              <option value="light">Light Modern</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
