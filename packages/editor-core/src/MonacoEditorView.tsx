"use client";

import { useEffect, useRef } from "react";
import type * as Monaco from "monaco-editor";
import { THEME_IDS } from "./monaco-env";
import type { EditorApi, EditorViewProps } from "./types";

/**
 * Hosts a single Monaco editor instance and switches its model when the
 * active file changes. Models are owned by the ModelManager, so unmounting
 * the view never disposes user content - only the editor widget.
 */
export function MonacoEditorView(props: EditorViewProps) {
  const { monaco, models, activePath, theme, readOnly, fontSize = 14, viewScope = "" } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const currentPath = useRef<string | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // Create / destroy the editor widget.
  useEffect(() => {
    if (!hostRef.current) return;
    const editor = monaco.editor.create(hostRef.current, {
      model: null,
      theme: THEME_IDS[cb.current.theme],
      automaticLayout: true,
      fontSize,
      fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,Menlo,Consolas,monospace",
      minimap: { enabled: true },
      folding: true,
      lineNumbers: "on",
      autoClosingBrackets: "always",
      autoClosingQuotes: "always",
      autoIndent: "full",
      formatOnPaste: true,
      tabSize: 2,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      fixedOverflowWidgets: true,
      readOnly: cb.current.readOnly,
    });
    editorRef.current = editor;

    const subs: Monaco.IDisposable[] = [
      editor.onDidChangeCursorPosition((e) => {
        const sel = editor.getSelection();
        const model = editor.getModel();
        const selectedChars = sel && model ? model.getValueInRange(sel).length : 0;
        cb.current.onCursorChange({ line: e.position.lineNumber, column: e.position.column, selectedChars });
      }),
      editor.onDidFocusEditorText(() => cb.current.onFocus?.()),
      editor.addAction({
        id: "webide.save",
        label: "Save File",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => cb.current.onSaveRequested(),
      }),
      editor.addAction({
        id: "webide.run",
        label: "Run Project",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => cb.current.onRunRequested(),
      }),
    ];

    const api: EditorApi = {
      focus: () => editor.focus(),
      runAction: async (id) => {
        editor.focus();
        await editor.getAction(id)?.run();
      },
      revealPosition: (line, column) => {
        editor.setPosition({ lineNumber: line, column });
        editor.revealPositionInCenter({ lineNumber: line, column });
        editor.focus();
      },
      actions: {
        format: "editor.action.formatDocument",
        find: "actions.find",
        replace: "editor.action.startFindReplace",
        commandPalette: "editor.action.quickCommand",
        goToLine: "editor.action.gotoLine",
      },
    };
    cb.current.onReady(api);

    return () => {
      const p = currentPath.current;
      if (p) models.saveViewState(p, editor, viewScope);
      subs.forEach((s) => s.dispose());
      editor.setModel(null); // detach before disposing so the model survives
      editor.dispose();
      editorRef.current = null;
      currentPath.current = null;
    };
    // The widget is created once per (monaco, models) pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, models]);

  // Switch model when the active file changes.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const prev = currentPath.current;
    if (prev && prev !== activePath) models.saveViewState(prev, editor, viewScope);
    currentPath.current = activePath;
    const model = activePath ? models.get(activePath) : undefined;
    editor.setModel(model ?? null);
    if (activePath && model) {
      models.restoreViewState(activePath, editor, viewScope);
    }
  }, [activePath, models, monaco, viewScope]);

  useEffect(() => {
    monaco.editor.setTheme(THEME_IDS[theme]);
  }, [theme, monaco]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly, fontSize });
  }, [readOnly, fontSize]);

  return <div ref={hostRef} className="h-full w-full" />;
}
