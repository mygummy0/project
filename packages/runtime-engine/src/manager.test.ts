import { describe, expect, it } from "vitest";
import { RuntimeManager } from "./manager";
import type { RuntimeAdapter, RuntimeContext, RuntimeResult } from "./types";

const ctx = (): RuntimeContext => ({ projectId: "p", getFiles: () => new Map([["/a.js", ""]]), activePath: "/a.js", timeoutMs: 1000 });

function adapter(id: string, can: boolean, run?: RuntimeAdapter["run"]): RuntimeAdapter {
  return {
    id,
    label: id,
    canRun: () => (can ? { ok: true } : { ok: false, reason: "nope" }),
    run:
      run ??
      (() => {
        let fin!: (r: RuntimeResult) => void;
        const done = new Promise<RuntimeResult>((r) => (fin = r));
        return { done, stop: () => fin({ status: "stopped" }) };
      }),
  };
}

describe("RuntimeManager", () => {
  it("errors honestly when no adapter can run", async () => {
    const m = new RuntimeManager().register(adapter("a", false));
    await m.run(ctx);
    expect(m.status).toBe("error");
  });
  it("runs, stops and restarts", async () => {
    const m = new RuntimeManager().register(adapter("a", true));
    const statuses: string[] = [];
    m.events.on("status", (s) => statuses.push(s.status));
    await m.run(ctx);
    expect(m.status).toBe("running");
    await m.stop();
    expect(m.status).toBe("stopped");
    await m.restart();
    expect(m.status).toBe("running");
    expect(statuses).toEqual(["starting", "running", "stopping", "stopped", "starting", "running"]);
  });
  it("reports completion, timeout and startup failure and stays reusable", async () => {
    const m = new RuntimeManager();
    m.register(adapter("a", true, () => ({ done: Promise.resolve({ status: "timeout" as const }), stop() {} })));
    await m.run(ctx);
    await Promise.resolve();
    await Promise.resolve();
    expect(m.status).toBe("timeout");
    m.register(adapter("a", true, () => {
      throw new Error("boom");
    }));
    await m.run(ctx);
    expect(m.status).toBe("error");
    m.register(adapter("a", true, () => ({ done: Promise.resolve({ status: "completed" as const }), stop() {} })));
    await m.run(ctx);
    await Promise.resolve();
    await Promise.resolve();
    expect(m.status).toBe("stopped");
  });
  it("collects output", async () => {
    const m = new RuntimeManager().register(
      adapter("a", true, (_c, sink) => {
        sink.write({ level: "log", text: "hi", source: "console" });
        return { done: new Promise(() => {}), stop() {} };
      }),
    );
    const out: string[] = [];
    m.events.on("output", (o) => out.push(o.text));
    await m.run(ctx);
    expect(out).toContain("hi");
  });
});
