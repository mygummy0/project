import { extname } from "./path";

/** Monaco language ids understood by the Phase 1 editor. */
export type LanguageId =
  | "html"
  | "css"
  | "javascript"
  | "typescript"
  | "json"
  | "markdown"
  | "plaintext";

const BY_EXT: Record<string, LanguageId> = {
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".json": "json",
  ".md": "markdown",
  ".markdown": "markdown",
};

export function languageFromPath(path: string): LanguageId {
  return BY_EXT[extname(path)] ?? "plaintext";
}

export const LANGUAGE_LABELS: Record<LanguageId, string> = {
  html: "HTML",
  css: "CSS",
  javascript: "JavaScript",
  typescript: "TypeScript",
  json: "JSON",
  markdown: "Markdown",
  plaintext: "Plain Text",
};
