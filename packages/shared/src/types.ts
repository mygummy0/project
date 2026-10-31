import type { LanguageId } from "./language";

export type ProjectRole = "owner" | "editor" | "viewer";

export interface ProjectMeta {
  id: string;
  name: string;
  templateId: string;
  createdAt: number;
  updatedAt: number;
}

export type EntryKind = "file" | "dir";

/** One persisted node of a project's virtual file system. */
export interface FileRecord {
  projectId: string;
  /** Absolute normalised path, e.g. "/src/index.ts". */
  path: string;
  kind: EntryKind;
  /** Text content; always "" for directories. */
  content: string;
  /** Monotonic counter used for optimistic concurrency / conflict detection. */
  version: number;
  updatedAt: number;
}

export type ThemeName = "dark" | "light";

export interface LayoutState {
  sidebarOpen: boolean;
  sidebarView: "explorer" | "search";
  previewOpen: boolean;
  bottomOpen: boolean;
  bottomTab: "console" | "problems" | "output" | "terminal";
  sidebarWidth: number;
  /** Width share of the first editor group when split (0.2 – 0.8). */
  splitRatio: number;
  previewWidth: number;
  bottomHeight: number;
}

export const DEFAULT_LAYOUT: LayoutState = {
  sidebarOpen: true,
  sidebarView: "explorer",
  previewOpen: true,
  bottomOpen: true,
  bottomTab: "console",
  sidebarWidth: 240,
  splitRatio: 0.5,
  previewWidth: 420,
  bottomHeight: 200,
};

/** Restorable "last working state" of a project. */
export interface WorkspaceState {
  /** Tabs of the first group (kept for backwards compatibility). */
  openTabs: string[];
  activePath: string | null;
  groups?: { tabs: string[]; active: string | null }[];
  activeGroup?: number;
  layout: Partial<LayoutState>;
  theme?: ThemeName;
}

export type { LanguageId };
