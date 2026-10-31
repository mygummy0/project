import type * as Monaco from "monaco-editor";
import { Emitter, languageFromPath } from "@webide/shared";

type MonacoApi = typeof Monaco;

export interface ModelManagerEvents {
  /** Fired for user edits and programmatic edits alike. */
  content: { path: string; value: string };
}

/**
 * Owns one Monaco ITextModel per project file, keyed by a URI that includes
 * the project id. Reusing models (instead of creating one per tab switch)
 * keeps undo history, avoids duplicate-URI errors and lets the TypeScript
 * worker resolve imports between project files.
 */
export class ModelManager {
  readonly events = new Emitter<ModelManagerEvents>();
  private models = new Map<string, { model: Monaco.editor.ITextModel; sub: Monaco.IDisposable }>();
  private viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
  private disposed = false;

  constructor(
    private readonly monaco: MonacoApi,
    readonly scope: string,
  ) {}

  uriFor(path: string): Monaco.Uri {
    return this.monaco.Uri.from({ scheme: "file", path: `/${this.scope}${path}` });
  }

  /** Inverse of uriFor, or null when the model belongs to another project. */
  pathFromUri(uri: Monaco.Uri): string | null {
    const prefix = `/${this.scope}/`;
    return uri.scheme === "file" && uri.path.startsWith(prefix) ? uri.path.slice(prefix.length - 1) : null;
  }

  has(path: string): boolean {
    return this.models.has(path);
  }

  get(path: string): Monaco.editor.ITextModel | undefined {
    return this.models.get(path)?.model;
  }

  value(path: string): string | undefined {
    return this.models.get(path)?.model.getValue();
  }

  /** Returns the existing model for `path` or creates it with `content`. */
  ensure(path: string, content: string): Monaco.editor.ITextModel {
    const existing = this.models.get(path);
    if (existing && !existing.model.isDisposed()) return existing.model;
    const uri = this.uriFor(path);
    // Survives React StrictMode / multiple instances: reuse a model that already owns this URI.
    const model =
      this.monaco.editor.getModel(uri) ?? this.monaco.editor.createModel(content, languageFromPath(path), uri);
    const sub = model.onDidChangeContent(() => {
      if (!this.disposed) this.events.emit("content", { path, value: model.getValue() });
    });
    this.models.set(path, { model, sub });
    return model;
  }

  /** Replace content from outside (e.g. "reload from disk") while keeping the undo stack. */
  setExternalValue(path: string, content: string): void {
    const model = this.models.get(path)?.model;
    if (!model || model.getValue() === content) return;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null);
  }

  /** Re-key a model after a rename; the undo history of the old model is discarded. */
  rename(oldPath: string, newPath: string, content?: string): Monaco.editor.ITextModel {
    const value = content ?? this.value(oldPath) ?? "";
    this.dispose(oldPath);
    return this.ensure(newPath, value);
  }

  dispose(path: string): void {
    const entry = this.models.get(path);
    if (entry) {
      entry.sub.dispose();
      if (!entry.model.isDisposed()) entry.model.dispose();
      this.models.delete(path);
    }
    this.viewStates.delete(path);
  }

  saveViewState(path: string, editor: Monaco.editor.IStandaloneCodeEditor): void {
    this.viewStates.set(path, editor.saveViewState());
  }

  restoreViewState(path: string, editor: Monaco.editor.IStandaloneCodeEditor): void {
    const vs = this.viewStates.get(path);
    if (vs) editor.restoreViewState(vs);
  }

  paths(): string[] {
    return [...this.models.keys()];
  }

  disposeAll(): void {
    for (const p of [...this.models.keys()]) this.dispose(p);
    this.viewStates.clear();
  }

  destroy(): void {
    this.disposeAll();
    this.disposed = true;
    this.events.clear();
  }
}
