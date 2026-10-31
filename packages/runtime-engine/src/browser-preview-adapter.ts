import type { PreviewController } from "@webide/preview-engine";
import type { CanRun, RuntimeAdapter, RuntimeContext, RuntimeHandle, RuntimeSink } from "./types";

/** Runs HTML/CSS/JS projects inside the sandboxed preview iframe. */
export class BrowserPreviewAdapter implements RuntimeAdapter {
  readonly id = "browser-preview";
  readonly label = "Browser preview (HTML/CSS/JS)";

  constructor(private readonly preview: PreviewController) {}

  canRun(ctx: RuntimeContext): CanRun {
    for (const p of ctx.getFiles().keys()) if (/\.html?$/i.test(p)) return { ok: true };
    return { ok: false, reason: "project has no HTML file" };
  }

  run(ctx: RuntimeContext, sink: RuntimeSink): RuntimeHandle {
    let finish!: (r: { status: "stopped" }) => void;
    const done = new Promise<{ status: "stopped" }>((resolve) => (finish = resolve));

    const off = this.preview.events.on("log", (log) => {
      if (log.kind === "console") sink.write({ level: log.level, text: log.text, source: "console" });
      else if (log.kind === "error") {
        sink.write({
          level: "error",
          text: log.text,
          source: "error",
          location: log.line ? { line: log.line, column: log.column } : undefined,
        });
      } else sink.write({ level: log.level, text: log.text, source: "runtime" });
    });
    this.preview.start(ctx.getFiles);

    return {
      done,
      stop: () => {
        off();
        this.preview.stop();
        finish({ status: "stopped" });
      },
      notifyFilesChanged: () => this.preview.update(),
    };
  }
}
