import type * as Monaco from "monaco-editor";
import type { LanguageId, ThemeName } from "@webide/shared";
import type { ModelManager } from "./model-manager";

export interface EditorFileInput {
  path: string;
  content: string;
  language: LanguageId;
}

export interface CursorInfo {
  line: number;
  column: number;
  selectedChars: number;
}

export interface EditorViewProps {
  monaco: typeof Monaco;
  models: ModelManager;
  /** Which model to display; null shows an empty state. */
  activePath: string | null;
  theme: ThemeName;
  readOnly: boolean;
  fontSize?: number;
  /** Distinguishes several editors showing the same files (split view) for cursor/scroll state. */
  viewScope?: string;
  onFocus?(): void;
  onReady(api: EditorApi): void;
  onCursorChange(cursor: CursorInfo): void;
  onSaveRequested(): void;
  onRunRequested(): void;
}

/** Imperative handle the host uses for menu commands. */
export interface EditorApi {
  focus(): void;
  runAction(actionId: string): Promise<void>;
  revealPosition(line: number, column: number): void;
  /** Stable ids of useful built-in actions. */
  actions: { format: string; find: string; replace: string; commandPalette: string; goToLine: string };
}
