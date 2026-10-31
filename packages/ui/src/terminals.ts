import type { Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import {
  TerminalAuthError,
  WebSocketTerminalFactory,
  terminalLogin,
  type TerminalBackend,
} from "@webide/terminal-engine";
import { errorMessage } from "@webide/shared";
import type { TerminalTab } from "./store";

interface Entry {
  tab: TerminalTab;
  term: XTerm;
  fit: FitAddon;
  /** Persistent element xterm renders into; re-parented when the panel is re-opened. */
  container: HTMLDivElement;
  opened: boolean;
  backend: TerminalBackend | null;
  offs: Array<() => void>;
}

const MAX_TERMINALS = 4;

/**
 * Owns the xterm instances and their server connections. The DOM containers
 * outlive the React panel, so closing/reopening the bottom panel keeps the
 * running shells and their scrollback.
 */
export class TerminalManager {
  private entries = new Map<number, Entry>();
  private nextId = 1;
  private factory: WebSocketTerminalFactory;
  private ctrlArmed = false;
  private disposed = false;
  private themeSource: HTMLElement | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly projectId: string,
    private readonly publish: (tabs: TerminalTab[], active: number | null) => void,
    private readonly onCtrlChange: (armed: boolean) => void = () => {},
  ) {
    this.factory = new WebSocketTerminalFactory(baseUrl);
  }

  private snapshot(active: number | null) {
    this.publish([...this.entries.values()].map((e) => ({ ...e.tab })), active);
  }
  private update(entry: Entry, patch: Partial<TerminalTab>, active?: number | null) {
    entry.tab = { ...entry.tab, ...patch };
    this.snapshot(active === undefined ? this.lastActive : active);
  }
  private lastActive: number | null = null;

  private pending = 0;

  /** Terminals that exist or are being created (guards against double-creation on first open). */
  get count() {
    return this.entries.size + this.pending;
  }

  async create(): Promise<number | null> {
    if (this.disposed || this.count >= MAX_TERMINALS) return null;
    this.pending++;
    try {
      return await this.createEntry();
    } finally {
      this.pending--;
    }
  }

  private async createEntry(): Promise<number | null> {
    const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
    const id = this.nextId++;
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono','Fira Code',ui-monospace,Menlo,Consolas,monospace",
      scrollback: 5000,
      allowProposedApi: false,
      theme: this.readTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const container = document.createElement("div");
    container.style.cssText = "width:100%;height:100%";
    const entry: Entry = { tab: { id, title: `bash ${id}`, status: "connecting" }, term, fit, container, opened: false, backend: null, offs: [] };
    this.entries.set(id, entry);
    // Keystrokes → server. "Ctrl" from the on-screen key bar turns the next letter into a control code.
    const sub = term.onData((data) => {
      if (this.ctrlArmed && data.length === 1) {
        const c = data.toUpperCase().charCodeAt(0);
        if (c >= 64 && c <= 95) data = String.fromCharCode(c & 0x1f);
        this.setCtrl(false);
      }
      entry.backend?.write(data);
    });
    entry.offs.push(() => sub.dispose());
    this.lastActive = id;
    this.snapshot(id);
    void this.connect(entry);
    return id;
  }

  private async connect(entry: Entry) {
    entry.backend?.dispose();
    entry.backend = null;
    this.update(entry, { status: "connecting", message: undefined });
    try {
      const backend = await this.factory.create(this.projectId, { cols: entry.term.cols || 80, rows: entry.term.rows || 24 });
      if (this.disposed || !this.entries.has(entry.tab.id)) return backend.dispose();
      entry.backend = backend;
      backend.onData((d) => entry.term.write(d));
      backend.onExit((code) => {
        if (entry.backend !== backend) return;
        entry.term.write(`\r\n\x1b[90m[session ended${code >= 0 ? `, exit code ${code}` : ", connection lost"}]\x1b[0m\r\n`);
        this.update(entry, { status: "ended", message: code >= 0 ? `Exit code ${code}` : "Connection lost" });
      });
      this.update(entry, { status: "open" });
      this.resizeNow(entry);
    } catch (e) {
      if (e instanceof TerminalAuthError) this.update(entry, { status: "login" });
      else this.update(entry, { status: "error", message: errorMessage(e) });
    }
  }

  async login(id: number, password: string): Promise<string | null> {
    const entry = this.entries.get(id);
    if (!entry) return "Terminal closed";
    try {
      await terminalLogin(this.baseUrl, password);
    } catch (e) {
      return errorMessage(e);
    }
    // One login serves every pending terminal.
    for (const other of this.entries.values()) if (other.tab.status === "login") void this.connect(other);
    return null;
  }

  reconnect(id: number) {
    const entry = this.entries.get(id);
    if (entry) {
      entry.term.reset();
      void this.connect(entry);
    }
  }

  close(id: number): number | null {
    const entry = this.entries.get(id);
    if (!entry) return this.lastActive;
    entry.offs.forEach((f) => f());
    entry.backend?.dispose();
    entry.term.dispose();
    entry.container.remove();
    this.entries.delete(id);
    const ids = [...this.entries.keys()];
    this.lastActive = this.lastActive === id ? (ids[ids.length - 1] ?? null) : this.lastActive;
    this.snapshot(this.lastActive);
    return this.lastActive;
  }

  select(id: number) {
    if (this.entries.has(id)) {
      this.lastActive = id;
      this.snapshot(id);
    }
  }

  /** Mounts the terminal into `host` and sizes it. Safe to call repeatedly. */
  attach(id: number, host: HTMLElement) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.themeSource = host;
    host.replaceChildren(entry.container);
    if (!entry.opened) {
      entry.term.open(entry.container);
      entry.opened = true;
    }
    entry.term.options.theme = this.readTheme();
    this.fit(id);
  }

  fit(id: number) {
    const entry = this.entries.get(id);
    if (!entry?.opened || entry.container.clientWidth === 0) return;
    try {
      entry.fit.fit();
    } catch {
      return;
    }
    this.resizeNow(entry);
  }

  private resizeNow(entry: Entry) {
    entry.backend?.resize({ cols: entry.term.cols, rows: entry.term.rows });
  }

  focus(id: number) {
    this.entries.get(id)?.term.focus();
  }

  /** Raw bytes from the on-screen key bar (Esc, Tab, arrows…). */
  sendKey(id: number, seq: string) {
    this.entries.get(id)?.backend?.write(seq);
    this.focus(id);
  }

  setCtrl(armed: boolean) {
    this.ctrlArmed = armed;
    this.onCtrlChange(armed);
  }
  get ctrl() {
    return this.ctrlArmed;
  }

  /** Re-reads colours from the IDE theme tokens (call after a theme switch). */
  refreshTheme() {
    const theme = this.readTheme();
    for (const e of this.entries.values()) e.term.options.theme = theme;
  }

  private readTheme() {
    const el = this.themeSource ?? document.querySelector("[data-ide-theme]") ?? document.documentElement;
    const css = getComputedStyle(el as Element);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    return {
      background: v("--ide-panel", "#181818"),
      foreground: v("--ide-text", "#cccccc"),
      cursor: v("--ide-text", "#cccccc"),
      selectionBackground: "#264f7888",
    };
  }

  dispose() {
    this.disposed = true;
    for (const id of [...this.entries.keys()]) this.close(id);
  }
}
