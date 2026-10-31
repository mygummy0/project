import type * as Monaco from "monaco-editor";
import { configureMonacoLanguages } from "@webide/language-engine";

export type MonacoApi = typeof Monaco;

let loading: Promise<MonacoApi> | null = null;

/**
 * Loads Monaco lazily in the browser (never during SSR), wires the web
 * workers through the bundler and defines the IDE themes.
 */
export function loadMonaco(): Promise<MonacoApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("Monaco can only be loaded in the browser"));
  loading ??= (async () => {
    installWorkerEnvironment();
    const monaco = await import("monaco-editor");
    configureMonacoLanguages(monaco);
    defineThemes(monaco);
    return monaco;
  })();
  return loading;
}

function installWorkerEnvironment() {
  const g = self as unknown as { MonacoEnvironment?: Monaco.Environment };
  if (g.MonacoEnvironment?.getWorker) return;
  g.MonacoEnvironment = {
    getWorker(_id: string, label: string) {
      switch (label) {
        case "json":
          return new Worker(new URL("../../../node_modules/monaco-editor/esm/vs/language/json/json.worker.js", import.meta.url), { type: "module" });
        case "css":
        case "scss":
        case "less":
          return new Worker(new URL("../../../node_modules/monaco-editor/esm/vs/language/css/css.worker.js", import.meta.url), { type: "module" });
        case "html":
        case "handlebars":
        case "razor":
          return new Worker(new URL("../../../node_modules/monaco-editor/esm/vs/language/html/html.worker.js", import.meta.url), { type: "module" });
        case "typescript":
        case "javascript":
          return new Worker(new URL("../../../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url), { type: "module" });
        default:
          return new Worker(new URL("../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), { type: "module" });
      }
    },
  };
}

export const THEME_IDS = { dark: "webide-dark", light: "webide-light" } as const;

function defineThemes(monaco: MonacoApi) {
  monaco.editor.defineTheme(THEME_IDS.dark, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#1f1f1f",
      "editor.foreground": "#cccccc",
      "editor.lineHighlightBackground": "#ffffff0a",
      "editor.lineHighlightBorder": "#00000000",
      "editorGutter.background": "#1f1f1f",
      "editorLineNumber.foreground": "#6e7681",
      "editorLineNumber.activeForeground": "#cccccc",
      "editor.selectionBackground": "#264f78",
      "editorCursor.foreground": "#aeafad",
      "editorWidget.background": "#202020",
      "editorWidget.border": "#454545",
      "minimap.background": "#1f1f1f",
      "scrollbarSlider.background": "#79797966",
    },
  });
  monaco.editor.defineTheme(THEME_IDS.light, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#ffffff",
      "editor.foreground": "#3b3b3b",
      "editorGutter.background": "#ffffff",
      "editorLineNumber.foreground": "#6e7681",
      "editor.lineHighlightBackground": "#00000008",
      "editor.lineHighlightBorder": "#00000000",
    },
  });
}
