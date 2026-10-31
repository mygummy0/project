import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDBStorageAdapter } from "@webide/storage";
import { VirtualFileSystem } from "@webide/file-engine";
import { ProjectService } from "@webide/project-engine";

describe("IndexedDB adapter", () => {
  it("persists across adapter instances (simulated reload) and enforces preconditions", async () => {
    const a = new IndexedDBStorageAdapter("t1");
    await a.init();
    const svc = new ProjectService(a);
    const meta = await svc.createProject({ name: "Demo", templateId: "web", id: "demo" });
    const { fs } = await svc.openProject(meta.id);
    await fs.write("/script.js", "console.log('persisted')");

    const b = new IndexedDBStorageAdapter("t1"); // "reload"
    await b.init();
    const svc2 = new ProjectService(b);
    const { fs: fs2 } = await svc2.openProject("demo");
    expect(fs2.read("/script.js")).toBe("console.log('persisted')");
    expect(fs2.listFiles().map((f) => f.path).sort()).toEqual(["/index.html", "/script.js", "/style.css"]);

    const stale = new VirtualFileSystem("demo", b);
    await stale.load();
    await fs.write("/script.js", "newer");
    await expect(stale.write("/script.js", "stale")).rejects.toMatchObject({ code: "CONFLICT" });

    await svc2.deleteProject("demo");
    expect(await b.listFiles("demo")).toEqual([]);
    expect(await b.getProject("demo")).toBeUndefined();
  });

  it("workspace state round-trips", async () => {
    const a = new IndexedDBStorageAdapter("t2");
    await a.init();
    const svc = new ProjectService(a);
    await svc.saveWorkspace("x", { openTabs: ["/a"], activePath: "/a", layout: {} });
    expect((await svc.loadWorkspace("x"))?.activePath).toBe("/a");
  });
});
