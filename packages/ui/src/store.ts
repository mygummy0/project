import { createStore, type StoreApi } from "zustand/vanilla";
import {
  DEFAULT_LAYOUT,
  type FileRecord,
  type LayoutState,
  type ProjectMeta,
  type ThemeName,
} from "@webide/shared";
import type { CursorInfo } from "@webide/editor-core";
import type { OutputEntry, RuntimeStatus } from "@webide/runtime-engine";
import type { PreviewStatus } from "@webide/preview-engine";
import type { EditorGroup } from "./groups";

export interface Problem {
  path: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source?: string;
}

export interface TerminalTab {
  id: number;
  title: string;
  status: "connecting" | "open" | "login" | "ended" | "error";
  message?: string;
}

export type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "conflict";
export type MobileView = "files" | "editor" | "preview" | "console";

export interface Notice {
  id: number;
  kind: "info" | "error";
  text: string;
}

export interface RevealRequest {
  id: number;
  group: number;
  path: string;
  line: number;
  column: number;
}

export interface Settings {
  /** UI zoom factor, 0.8 – 1.5. */
  uiScale: number;
  /** Editor font size in px. */
  fontSize: number;
}

export const DEFAULT_SETTINGS: Settings = { uiScale: 1, fontSize: 14 };

export interface IdeState {
  phase: "loading" | "ready" | "error";
  error: string | null;
  project: ProjectMeta | null;
  readOnly: boolean;
  files: FileRecord[];
  groups: EditorGroup[];
  activeGroup: number;
  /** Active file of the focused group (derived, kept in sync by the session). */
  activePath: string | null;
  dirty: Record<string, true>;
  conflicts: Record<string, true>;
  saveStatus: SaveStatus;
  cursor: CursorInfo | null;
  theme: ThemeName;
  settings: Settings;
  settingsOpen: boolean;
  layout: LayoutState;
  mobileView: MobileView;
  monacoReady: boolean;
  runtimeStatus: RuntimeStatus;
  runnable: boolean;
  previewStatus: PreviewStatus;
  output: OutputEntry[];
  problems: Problem[];
  notice: Notice | null;
  reveal: RevealRequest | null;
  /** Pending inline "new file / folder" row in the explorer. */
  creating: { kind: "file" | "folder"; dir: string } | null;
  /** Base URL of the terminal server (e.g. "/terminal"); null hides all terminal UI. */
  terminalUrl: string | null;
  terminals: TerminalTab[];
  activeTerminal: number | null;
}

export type IdeStore = StoreApi<IdeState>;

export function createIdeStore(init: { theme: ThemeName; readOnly: boolean; layout?: Partial<LayoutState>; terminalUrl?: string }): IdeStore {
  return createStore<IdeState>(() => ({
    phase: "loading",
    error: null,
    project: null,
    readOnly: init.readOnly,
    files: [],
    groups: [{ tabs: [], active: null }],
    activeGroup: 0,
    activePath: null,
    dirty: {},
    conflicts: {},
    saveStatus: "saved",
    cursor: null,
    theme: init.theme,
    settings: DEFAULT_SETTINGS,
    settingsOpen: false,
    layout: { ...DEFAULT_LAYOUT, ...init.layout },
    mobileView: "editor",
    monacoReady: false,
    runtimeStatus: "idle",
    runnable: true,
    previewStatus: "idle",
    output: [],
    problems: [],
    notice: null,
    reveal: null,
    creating: null,
    terminalUrl: init.terminalUrl ?? null,
    terminals: [],
    activeTerminal: null,
  }));
}
