import { describe, expect, it } from "vitest";
import { MemoryStorageAdapter } from "@webide/storage";
import { ProjectService } from "./service";
import { readOnlyPermissions } from "./permissions";
import { templateForLanguage } from "./templates";

describe("ProjectService", () => {
  it("creates from template, renames, lists and deletes", async () => {
    const svc = new ProjectService(new MemoryStorageAdapter());
    const p = await svc.createProject({ name: " My App ", templateId: "web" });
    expect(p.name).toBe("My App");
    const { fs } = await svc.openProject(p.id);
    expect(fs.exists("/index.html")).toBe(true);
    await svc.renameProject(p.id, "Renamed");
    expect((await svc.listProjects())[0]?.name).toBe("Renamed");
    await svc.deleteProject(p.id);
    expect(await svc.listProjects()).toHaveLength(0);
  });
  it("validates ids and templates", async () => {
    const svc = new ProjectService(new MemoryStorageAdapter());
    await expect(svc.createProject({ name: "x", id: "../bad" })).rejects.toMatchObject({ code: "INVALID_ID" });
    await expect(svc.createProject({ name: "x", templateId: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.openProject("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("ensureProject is idempotent", async () => {
    const svc = new ProjectService(new MemoryStorageAdapter());
    const a = await svc.ensureProject("demo-project");
    const b = await svc.ensureProject("demo-project");
    expect(a.id).toBe(b.id);
  });
  it("enforces permissions", async () => {
    const storage = new MemoryStorageAdapter();
    const owner = new ProjectService(storage);
    await owner.createProject({ name: "p", id: "p1" });
    const viewer = new ProjectService(storage, readOnlyPermissions());
    await expect(viewer.deleteProject("p1")).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect((await viewer.openProject("p1")).canWrite).toBe(false);
  });
  it("maps language to template", () => {
    expect(templateForLanguage("typescript")).toBe("typescript");
    expect(templateForLanguage(undefined)).toBe("web");
  });
});
