import type * as Monaco from "monaco-editor";
import {
  IdeError,
  basename,
  dirname,
  errorMessage,
  isInside,
  languageFromPath,
  rebase,
  type FileRecord,
  type LayoutState,
  type ProjectMeta,
  type ThemeName,
} from "@webide/shared";
import { IndexedDBStorageAdapter, type StorageAdapter } from "@webide/storage";
import {
  AutosaveScheduler,
  VirtualFileSystem,
  exportProjectZip,
  importProjectZip,
  searchFiles,
  type SearchOptions,
  type SearchResult,
} from "@webide/file-engine";
import { ProjectService, getTemplate, templateForLanguage } from "@webide/project-engine";
import { ModelManager, loadMonaco, type EditorApi } from "@webide/editor-core";
import { PreviewController } from "@webide/preview-engine";
import { BrowserPreviewAdapter, JsWorkerAdapter, RuntimeManager, type OutputEntry } from "@webide/runtime-engine";
import { DEFAULT_SETTINGS, createIdeStore, type IdeState, type IdeStore, type Problem, type Settings } from "./store";

export interface SessionOptions {
  projectId: string;
  theme?: ThemeName;
  language?: string;
  readOnly: boolean;
  storage?: StorageAdapter;
  autoRun: boolean;
  previewSandboxUrl?: string;
  layout?: Partial<LayoutState>;
}

const MAX_EAGER_MODEL_CHARS = 1_000_000;
const RUN_TIMEOUT_MS = 10_000;
const MAX_OUTPUT = 1000;
const SETTINGS_KEY = "webide:settings";
const clampNum = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const recoveryKey = (projectId: string, path: string) => `webide:recovery:${projectId}:${path}`;

/**
 * Wires the engines together for one open project and exposes the actions
 * the React components call. It owns every long-lived resource (models,
 * workers, timers) and releases them in dispose().
 */
export class IdeSession {
  readonly store: IdeStore;
  readonly preview = new PreviewController();
  readonly runtime = new RuntimeManager();
  monaco: typeof Monaco | null = null;
  models: ModelManager | null = null;
  editor: EditorApi | null = null;

  private storage: StorageAdapter;
  private projects!: ProjectService;
  private fs: VirtualFileSystem | null = null;
  private autosave: AutosaveScheduler;
  private disposers: Array<() => void> = [];
  private disposed = false;
  private suppressContent = false;
  private failed = new Set<string>();
  private saving = 0;
  private noticeId = 0;
  private revealId = 0;
  private outputBuffer: OutputEntry[] = [];
  private outputTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: SessionOptions) {
    this.store = createIdeStore({ theme: opts.theme ?? "dark", readOnly: opts.readOnly, layout: opts.layout });
    this.storage = opts.storage ?? new IndexedDBStorageAdapter();
    this.preview.setSandboxUrl(opts.previewSandboxUrl);
    this.autosave = new AutosaveScheduler((p) => this.saveNow(p));
    this.runtime.register(new BrowserPreviewAdapter(this.preview)).register(new JsWorkerAdapter());
  }

  get state(): IdeState {
    return this.store.getState();
  }
  private set(partial: Partial<IdeState> | ((s: IdeState) => Partial<IdeState>)) {
    this.store.setState(partial);
  }

  // ───────────────────────── lifecycle ─────────────────────────

  async init(): Promise<void> {
    try {
      await this.storage.init();
      this.projects = new ProjectService(this.storage);
      const template = templateForLanguage(this.opts.language);
      await this.projects.ensureProject(this.opts.projectId, {
        name: this.opts.projectId === "demo-project" ? "Demo Project" : this.opts.projectId,
        templateId: template,
      });
      const { meta, fs, canWrite } = await this.projects.openProject(this.opts.projectId);
      if (this.disposed) return;
      this.fs = fs;

      const ws = await this.projects.loadWorkspace(meta.id);
      const files = fs.listFiles().map((f) => f.path);
      const tpl = getTemplate(meta.templateId);
      let openTabs = (ws?.openTabs ?? []).filter((p) => files.includes(p));
      let activePath = ws?.activePath && openTabs.includes(ws.activePath) ? ws.activePath : (openTabs[0] ?? null);
      if (openTabs.length === 0) {
        const first = tpl?.entry && fs.exists(tpl.entry) ? tpl.entry : files[0];
        if (first) {
          openTabs = [first];
          activePath = first;
        }
      }

      this.loadSettings();
      this.disposers.push(fs.events.on("change", (c) => this.onFsChange(c)));
      this.wireRuntime();
      this.set((s) => ({
        phase: "ready",
        project: meta,
        readOnly: s.readOnly || !canWrite,
        files: fs.list(),
        openTabs,
        activePath,
        theme: this.opts.theme ?? ws?.theme ?? s.theme,
        layout: { ...s.layout, ...(ws?.layout ?? {}), ...(this.opts.layout ?? {}) },
        runnable: tpl?.runnable ?? true,
      }));
      this.disposers.push(this.store.subscribe((s, p) => this.maybePersistWorkspace(s, p)));
      this.installLifecycleHooks();

      if (this.opts.autoRun && (tpl?.runnable ?? true)) void this.run();
    } catch (e) {
      this.set({ phase: "error", error: errorMessage(e) });
    }
  }

  /** Called by the editor view once Monaco has loaded in the browser. */
  async attachMonaco(): Promise<void> {
    if (this.monaco || !this.fs) return;
    const monaco = await loadMonaco();
    if (this.disposed || !this.fs) return;
    this.monaco = monaco;
    const models = new ModelManager(monaco, this.fs.projectId);
    this.models = models;
    for (const f of this.fs.listFiles()) {
      if (f.content.length <= MAX_EAGER_MODEL_CHARS || this.state.openTabs.includes(f.path)) {
        models.ensure(f.path, f.content);
      }
    }
    this.disposers.push(models.events.on("content", ({ path, value }) => this.onModelContent(path, value)));
    const markerSub = monaco.editor.onDidChangeMarkers(() => this.refreshProblems());
    this.disposers.push(() => markerSub.dispose());
    this.recoverUnsaved();
    this.set({ monacoReady: true });
    this.refreshProblems();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.autosave.flushAll().catch(() => undefined);
    this.autosave.dispose();
    this.preview.dispose();
    this.runtime.dispose();
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.models?.destroy();
    this.models = null;
    if (this.outputTimer) clearTimeout(this.outputTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
  }

  private installLifecycleHooks() {
    if (typeof window === "undefined") return;
    const flush = () => void this.autosave.flushAll().catch(() => undefined);
    const onHide = () => document.visibilityState === "hidden" && flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      flush();
      if (Object.keys(this.state.dirty).length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", onBeforeUnload);
    this.disposers.push(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", onBeforeUnload);
    });
  }

  // ───────────────────────── notices ─────────────────────────

  notify(kind: "info" | "error", text: string) {
    this.set({ notice: { id: ++this.noticeId, kind, text } });
  }
  dismissNotice() {
    this.set({ notice: null });
  }
  private fail(e: unknown) {
    this.notify("error", e instanceof IdeError || e instanceof Error ? e.message : String(e));
  }

  // ───────────────────────── workspace state ─────────────────────────

  private maybePersistWorkspace(s: IdeState, prev: IdeState) {
    if (s.openTabs === prev.openTabs && s.activePath === prev.activePath && s.layout === prev.layout && s.theme === prev.theme) return;
    if (s.phase !== "ready" || !s.project) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      const st = this.state;
      void this.projects
        .saveWorkspace(st.project!.id, { openTabs: st.openTabs, activePath: st.activePath, layout: st.layout, theme: st.theme })
        .catch(() => undefined);
    }, 400);
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.setSettings(JSON.parse(raw) as Partial<Settings>, false);
    } catch {
      /* corrupt or unavailable storage: keep defaults */
    }
  }
  setSettings(partial: Partial<Settings>, persist = true) {
    const cur = this.state.settings;
    const next: Settings = {
      uiScale: clampNum(partial.uiScale ?? cur.uiScale, 0.8, 1.5, DEFAULT_SETTINGS.uiScale),
      fontSize: Math.round(clampNum(partial.fontSize ?? cur.fontSize, 10, 28, DEFAULT_SETTINGS.fontSize)),
    };
    this.set({ settings: next });
    if (persist) {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  }
  openSettings(open = true) {
    this.set({ settingsOpen: open });
  }

  async closeOthers(keep: string) {
    for (const p of this.state.openTabs.filter((t) => t !== keep)) await this.closeTab(p);
    this.setActive(keep);
  }
  async closeAll() {
    for (const p of [...this.state.openTabs]) await this.closeTab(p);
  }

  setLayout(partial: Partial<LayoutState>) {
    this.set((s) => ({ layout: { ...s.layout, ...partial } }));
  }
  setTheme(theme: ThemeName) {
    this.set({ theme });
  }
  setMobileView(mobileView: IdeState["mobileView"]) {
    this.set({ mobileView });
  }
  setCursor(cursor: IdeState["cursor"]) {
    this.set({ cursor });
  }
  setEditorApi(api: EditorApi) {
    this.editor = api;
  }

  // ───────────────────────── snapshot ─────────────────────────

  /** Current project contents: live editor buffers overlay the saved files. */
  snapshot = (): ReadonlyMap<string, string> => {
    const map = new Map<string, string>();
    if (!this.fs) return map;
    for (const f of this.fs.listFiles()) map.set(f.path, this.models?.value(f.path) ?? f.content);
    return map;
  };

  // ───────────────────────── files & tabs ─────────────────────────

  private requireWrite() {
    if (this.state.readOnly) throw new IdeError("PERMISSION_DENIED", "This project is read-only");
  }
  private refreshFiles() {
    if (this.fs) this.set({ files: this.fs.list() });
  }

  openFile(path: string, at?: { line: number; column: number }) {
    const rec = this.fs?.get(path);
    if (!rec || rec.kind !== "file") return;
    this.models?.ensure(path, rec.content);
    this.set((s) => ({
      openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path],
      activePath: path,
      mobileView: "editor",
      reveal: at ? { id: ++this.revealId, path, line: at.line, column: at.column } : s.reveal,
    }));
  }

  setActive(path: string) {
    if (this.state.openTabs.includes(path)) this.set({ activePath: path });
  }

  async closeTab(path: string) {
    if (this.state.dirty[path]) await this.autosave.flush(path);
    this.set((s) => {
      const idx = s.openTabs.indexOf(path);
      if (idx < 0) return {};
      const openTabs = s.openTabs.filter((p) => p !== path);
      const activePath = s.activePath === path ? (openTabs[Math.min(idx, openTabs.length - 1)] ?? null) : s.activePath;
      return { openTabs, activePath };
    });
  }

  beginCreate(kind: "file" | "folder", dir = "/") {
    if (this.state.readOnly) return this.notify("error", "This project is read-only");
    this.set((s) => ({ creating: { kind, dir }, mobileView: "files", layout: { ...s.layout, sidebarOpen: true, sidebarView: "explorer" } }));
  }
  endCreate() {
    this.set({ creating: null });
  }

  async renameProject(name: string) {
    try {
      this.requireWrite();
      const meta = await this.projects.renameProject(this.opts.projectId, name);
      this.set({ project: meta });
    } catch (e) {
      this.fail(e);
    }
  }

  async createFile(path: string, content = "") {
    try {
      this.requireWrite();
      await this.fs!.createFile(path, content);
      this.openFile(path);
    } catch (e) {
      this.fail(e);
    }
  }

  async createFolder(path: string) {
    try {
      this.requireWrite();
      await this.fs!.createDir(path);
    } catch (e) {
      this.fail(e);
    }
  }

  async rename(from: string, to: string) {
    try {
      this.requireWrite();
      await this.flushInside(from);
      await this.fs!.rename(from, to);
    } catch (e) {
      this.fail(e);
    }
  }

  async remove(path: string) {
    try {
      this.requireWrite();
      await this.fs!.delete(path);
    } catch (e) {
      this.fail(e);
    }
  }

  private async flushInside(dir: string) {
    const targets = Object.keys(this.state.dirty).filter((p) => isInside(dir, p));
    await Promise.all(targets.map((p) => this.autosave.flush(p)));
  }

  private onFsChange(c: import("@webide/file-engine").FsChange) {
    const fs = this.fs!;
    switch (c.type) {
      case "created":
        if (c.kind === "file") this.models?.ensure(c.path, fs.get(c.path)?.content ?? "");
        break;
      case "updated": {
        const rec = fs.get(c.path);
        const m = this.models;
        if (rec && m?.has(c.path) && !this.state.dirty[c.path] && m.value(c.path) !== rec.content) {
          this.suppressContent = true;
          try {
            m.setExternalValue(c.path, rec.content);
          } finally {
            this.suppressContent = false;
          }
        }
        break;
      }
      case "deleted": {
        const inside = (p: string) => isInside(c.path, p);
        for (const p of this.models?.paths().filter(inside) ?? []) this.models!.dispose(p);
        for (const p of Object.keys(this.state.dirty).filter(inside)) this.autosave.cancel(p);
        this.set((s) => {
          const openTabs = s.openTabs.filter((p) => !inside(p));
          return {
            openTabs,
            activePath: s.activePath && inside(s.activePath) ? (openTabs[0] ?? null) : s.activePath,
            dirty: omit(s.dirty, inside),
            conflicts: omit(s.conflicts, inside),
          };
        });
        break;
      }
      case "renamed": {
        const map = (p: string) => (isInside(c.oldPath, p) ? rebase(p, c.oldPath, c.path) : p);
        for (const p of this.models?.paths().filter((q) => isInside(c.oldPath, q)) ?? []) {
          this.models!.rename(p, map(p), this.models!.value(p));
        }
        this.set((s) => ({
          openTabs: s.openTabs.map(map),
          activePath: s.activePath ? map(s.activePath) : null,
        }));
        break;
      }
      case "reloaded":
        break;
    }
    this.refreshFiles();
    this.refreshSaveStatus();
    this.runtime.notifyFilesChanged();
  }

  // ───────────────────────── saving ─────────────────────────

  private onModelContent(path: string, _value: string) {
    if (this.suppressContent) return;
    if (this.state.readOnly) return;
    this.set((s) => (s.dirty[path] ? {} : { dirty: { ...s.dirty, [path]: true } }));
    this.refreshSaveStatus();
    this.autosave.schedule(path);
    this.runtime.notifyFilesChanged();
  }

  private async saveNow(path: string): Promise<void> {
    const fs = this.fs;
    const content = this.models?.value(path);
    if (!fs || content === undefined || !fs.exists(path)) {
      this.markClean(path);
      return;
    }
    this.saving++;
    this.refreshSaveStatus();
    try {
      await fs.write(path, content);
      this.failed.delete(path);
      this.clearRecovery(path);
      // Typing may have continued while the write was in flight.
      if (this.models?.value(path) === content) this.markClean(path);
      else this.autosave.schedule(path);
      void this.projects.touch(fs.projectId).catch(() => undefined);
    } catch (e) {
      if (e instanceof IdeError && e.code === "CONFLICT") {
        // Do not retry blindly: the user decides which copy wins.
        this.set((s) => ({ conflicts: { ...s.conflicts, [path]: true } }));
      } else {
        this.failed.add(path);
        this.stashRecovery(path, content);
        throw e;
      }
    } finally {
      this.saving--;
      this.refreshSaveStatus();
    }
  }

  private markClean(path: string) {
    this.set((s) => (s.dirty[path] ? { dirty: omit(s.dirty, (p) => p === path) } : {}));
  }

  private refreshSaveStatus() {
    const s = this.state;
    const status: IdeState["saveStatus"] =
      Object.keys(s.conflicts).length > 0
        ? "conflict"
        : this.failed.size > 0
          ? "error"
          : this.saving > 0
            ? "saving"
            : Object.keys(s.dirty).length > 0
              ? "unsaved"
              : "saved";
    if (status !== s.saveStatus) this.set({ saveStatus: status });
  }

  async saveActive() {
    const p = this.state.activePath;
    if (p) await this.autosave.flush(p);
  }

  async saveAll() {
    await this.autosave.flushAll();
    if (this.state.saveStatus === "saved") this.notify("info", "All changes saved");
  }

  async resolveConflict(path: string, choice: "overwrite" | "reload") {
    const fs = this.fs;
    if (!fs) return;
    try {
      if (choice === "overwrite") {
        await fs.write(path, this.models?.value(path) ?? "", { force: true });
      } else {
        const rec = await fs.refresh(path);
        this.suppressContent = true;
        try {
          if (rec) this.models?.setExternalValue(path, rec.content);
        } finally {
          this.suppressContent = false;
        }
      }
      this.markClean(path);
      this.set((s) => ({ conflicts: omit(s.conflicts, (p) => p === path) }));
      this.refreshSaveStatus();
    } catch (e) {
      this.fail(e);
    }
  }

  // Last-resort local copy when persistent storage keeps failing (quota, private mode…).
  private stashRecovery(path: string, content: string) {
    try {
      localStorage.setItem(recoveryKey(this.fs!.projectId, path), content);
    } catch {
      /* nothing else we can do */
    }
  }
  private clearRecovery(path: string) {
    try {
      localStorage.removeItem(recoveryKey(this.fs!.projectId, path));
    } catch {
      /* ignore */
    }
  }
  private recoverUnsaved() {
    if (typeof localStorage === "undefined" || !this.fs || !this.models) return;
    const prefix = recoveryKey(this.fs.projectId, "");
    let restored = 0;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith(prefix)) continue;
        const path = key.slice(prefix.length);
        const value = localStorage.getItem(key);
        if (value !== null && this.fs.exists(path) && this.models.has(path) && this.models.value(path) !== value) {
          this.models.setExternalValue(path, value); // marks dirty → autosave retries
          restored++;
        } else localStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
    if (restored) this.notify("info", `Recovered unsaved changes in ${restored} file(s) from the last session.`);
  }

  // ───────────────────────── import / export ─────────────────────────

  async exportZip(): Promise<{ name: string; data: Uint8Array }> {
    const files = [...this.snapshot()].map(([path, content]) => ({ path, content }));
    const name = (this.state.project?.name ?? "project").replace(/[^\w.-]+/g, "_");
    return { name: `${name}.zip`, data: await exportProjectZip(files) };
  }

  async importZip(data: ArrayBuffer) {
    try {
      this.requireWrite();
      const { files, skipped } = await importProjectZip(data);
      if (files.length === 0) throw new IdeError("UNSUPPORTED", "The archive contains no importable text files");
      await this.autosave.flushAll();
      await this.fs!.bulkWrite(files);
      const first = files.find((f) => /index\.html?$/i.test(f.path)) ?? files[0]!;
      this.openFile(first.path);
      this.notify("info", `Imported ${files.length} file(s)${skipped.length ? `, skipped ${skipped.length}` : ""}.`);
      this.runtime.notifyFilesChanged();
    } catch (e) {
      this.fail(e);
    }
  }

  // ───────────────────────── search ─────────────────────────

  search(query: string, opts: SearchOptions): SearchResult {
    const files: FileRecord[] = (this.fs?.listFiles() ?? []).map((f) => ({ ...f, content: this.models?.value(f.path) ?? f.content }));
    return searchFiles(files, query, opts);
  }

  // ───────────────────────── problems ─────────────────────────

  private refreshProblems() {
    const monaco = this.monaco;
    const models = this.models;
    if (!monaco || !models) return;
    const sev = (s: number): Problem["severity"] => (s >= 8 ? "error" : s >= 4 ? "warning" : s >= 2 ? "info" : "hint");
    const problems: Problem[] = [];
    for (const m of monaco.editor.getModelMarkers({})) {
      const path = models.pathFromUri(m.resource);
      if (!path) continue;
      problems.push({
        path,
        line: m.startLineNumber,
        column: m.startColumn,
        severity: sev(m.severity),
        message: m.message,
        source: typeof m.source === "string" ? m.source : undefined,
      });
    }
    problems.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
    this.set({ problems });
  }

  // ───────────────────────── run / preview ─────────────────────────

  private wireRuntime() {
    this.disposers.push(
      this.runtime.events.on("status", ({ status }) => this.set({ runtimeStatus: status })),
      this.runtime.events.on("output", (entry) => this.queueOutput(entry)),
      this.runtime.events.on("cleared", () => {
        this.outputBuffer = [];
        this.set({ output: [] });
      }),
      this.preview.events.on("status", (previewStatus) => this.set({ previewStatus })),
    );
  }

  private queueOutput(entry: OutputEntry) {
    this.outputBuffer.push(entry);
    if (this.outputTimer) return;
    this.outputTimer = setTimeout(() => {
      this.outputTimer = null;
      const batch = this.outputBuffer;
      this.outputBuffer = [];
      this.set((s) => ({ output: [...s.output, ...batch].slice(-MAX_OUTPUT) }));
    }, 50);
  }

  async run() {
    await this.runtime.run(() => ({
      projectId: this.opts.projectId,
      getFiles: this.snapshot,
      activePath: this.state.activePath,
      timeoutMs: RUN_TIMEOUT_MS,
    }));
    if (this.state.runtimeStatus === "error") this.setLayout({ bottomOpen: true, bottomTab: "output" });
  }
  stop() {
    return this.runtime.stop();
  }
  restart() {
    return this.runtime.restart();
  }
  clearOutput() {
    this.runtime.clearOutput();
  }

  // ───────────────────────── editor commands ─────────────────────────

  async editorAction(kind: "format" | "find" | "replace" | "commandPalette" | "goToLine") {
    const api = this.editor;
    if (!api) return;
    await api.runAction(api.actions[kind]);
  }

  languageOf(path: string | null) {
    return path ? languageFromPath(path) : "plaintext";
  }
  nameOf(path: string) {
    return basename(path);
  }
  parentOf(path: string) {
    return dirname(path);
  }
  uniquePath(dir: string, name: string) {
    return this.fs?.uniquePath(dir, name) ?? `${dir}/${name}`;
  }
  get project(): ProjectMeta | null {
    return this.state.project;
  }
}

function omit(rec: Record<string, true>, pred: (key: string) => boolean): Record<string, true> {
  const out: Record<string, true> = {};
  for (const k of Object.keys(rec)) if (!pred(k)) out[k] = true;
  return out;
}
