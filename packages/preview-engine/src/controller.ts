import { Emitter } from "@webide/shared";
import type { BridgeMessage } from "./bridge";
import { buildPreviewDocument } from "./build";
import { SANDBOX_FLAGS } from "./sandbox";

export type PreviewStatus = "idle" | "building" | "ready" | "error";

export type PreviewLog =
  | { kind: "console"; level: "log" | "info" | "warn" | "error" | "debug"; text: string }
  | { kind: "error"; text: string; source: string; line: number; column: number }
  | { kind: "system"; level: "info" | "warn" | "error"; text: string };

/**
 * Sandbox policy for the preview iframe. `allow-same-origin` is deliberately
 * absent: the document gets an opaque origin, so user code can neither read
 * the IDE's DOM/cookies/storage nor call its APIs with credentials.
 */
export const PREVIEW_SANDBOX = SANDBOX_FLAGS;

export interface PreviewControllerOptions {
  debounceMs?: number;
  /** How long to wait for the document `load` event before reporting an error. */
  loadTimeoutMs?: number;
  entry?: string;
  /**
   * URL of the dedicated sandbox route (see sandbox.ts), e.g. "/sandbox".
   * When omitted the preview falls back to `srcdoc`, which inherits the host page's CSP.
   */
  sandboxUrl?: string;
}

/** Framework-free controller that owns the preview iframe lifecycle. */
export class PreviewController {
  readonly events = new Emitter<{ status: PreviewStatus; log: PreviewLog; clear: void }>();
  status: PreviewStatus = "idle";
  private iframe: HTMLIFrameElement | null = null;
  private getFiles: (() => ReadonlyMap<string, string>) | null = null;
  private token = "";
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private listening = false;
  private readonly debounceMs: number;
  private readonly loadTimeoutMs: number;
  entry: string | undefined;
  private sandboxUrl: string | undefined;
  private pendingHtml: string | null = null;

  constructor(opts: PreviewControllerOptions = {}) {
    this.sandboxUrl = opts.sandboxUrl;
    this.debounceMs = opts.debounceMs ?? 350;
    this.loadTimeoutMs = opts.loadTimeoutMs ?? 10_000;
    this.entry = opts.entry;
  }

  get running(): boolean {
    return this.getFiles !== null;
  }

  setSandboxUrl(url: string | undefined): void {
    this.sandboxUrl = url;
  }

  attach(iframe: HTMLIFrameElement | null): void {
    this.iframe = iframe;
    if (iframe && this.running) this.render();
  }

  /** Begin (or restart) previewing; `getFiles` is read on every rebuild. */
  start(getFiles: () => ReadonlyMap<string, string>): void {
    this.getFiles = getFiles;
    this.ensureListener();
    this.events.emit("clear", undefined);
    this.render();
  }

  /** Schedule a rebuild after edits (no-op when not running). */
  update(): void {
    if (!this.running) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.render(), this.debounceMs);
  }

  reload(): void {
    if (!this.running) return;
    this.events.emit("clear", undefined);
    this.render();
  }

  stop(): void {
    this.getFiles = null;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.token = "";
    this.pendingHtml = null;
    if (this.iframe) this.navigate(null);
    this.setStatus("idle");
  }

  dispose(): void {
    this.stop();
    if (this.listening && typeof window !== "undefined") window.removeEventListener("message", this.onMessage);
    this.listening = false;
    this.iframe = null;
    this.events.clear();
  }

  private render(): void {
    if (!this.getFiles) return;
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const build = buildPreviewDocument(this.getFiles(), { token: this.token, entry: this.entry });
    for (const w of build.warnings) this.events.emit("log", { kind: "system", level: "warn", text: w });
    if (build.error) {
      this.events.emit("log", { kind: "system", level: "error", text: build.error });
      this.setStatus("error");
    } else {
      this.setStatus("building");
    }
    if (!this.iframe) return;
    this.navigate(build.html);
    if (!build.error) {
      this.loadTimer = setTimeout(() => {
        if (this.status === "building") {
          this.events.emit("log", { kind: "system", level: "error", text: "Preview did not finish loading (timeout)." });
          this.setStatus("error");
        }
      }, this.loadTimeoutMs);
    }
  }

  /** Loads `html` into the iframe, or blanks it when null. */
  private navigate(html: string | null): void {
    const frame = this.iframe!;
    if (!this.sandboxUrl) {
      frame.srcdoc = html ?? "";
      return;
    }
    frame.removeAttribute("srcdoc");
    if (html === null) {
      this.pendingHtml = null;
      frame.src = "about:blank";
      return;
    }
    // A fresh navigation per build guarantees a clean document (no leaked timers/listeners).
    this.pendingHtml = html;
    const sep = this.sandboxUrl.includes("?") ? "&" : "?";
    frame.src = `${this.sandboxUrl}${sep}t=${encodeURIComponent(this.token)}`;
  }

  private ensureListener() {
    if (this.listening || typeof window === "undefined") return;
    window.addEventListener("message", this.onMessage);
    this.listening = true;
  }

  private onMessage = (e: MessageEvent) => {
    // Only trust messages from our own iframe and the current build.
    if (!this.iframe || e.source !== this.iframe.contentWindow) return;
    const raw = e.data as (Partial<BridgeMessage> & { __webide_frame?: string }) | null;
    if (!raw || typeof raw !== "object" || !this.token) return;
    if (raw.__webide_frame === this.token) {
      if (this.pendingHtml !== null) {
        const html = this.pendingHtml;
        this.pendingHtml = null;
        this.iframe.contentWindow?.postMessage({ __webide_render: this.token, html }, "*");
      }
      return;
    }
    const d = raw;
    if (d.__webide !== this.token) return;
    switch (d.type) {
      case "console":
        this.events.emit("log", { kind: "console", level: d.level ?? "log", text: String(d.text ?? "") });
        break;
      case "error":
        this.events.emit("log", {
          kind: "error",
          text: String(d.message ?? "Error"),
          source: String(d.source ?? ""),
          line: Number(d.line ?? 0),
          column: Number(d.column ?? 0),
        });
        break;
      case "ready":
        if (this.loadTimer) clearTimeout(this.loadTimer);
        this.setStatus("ready");
        break;
    }
  };

  private setStatus(s: PreviewStatus) {
    if (this.status === s) return;
    this.status = s;
    this.events.emit("status", s);
  }
}
