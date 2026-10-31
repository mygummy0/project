import { describe, expect, it, vi } from "vitest";
import { MemoryStorageAdapter } from "@webide/storage";
import { AutosaveScheduler } from "./autosave";
import { searchFiles } from "./search";
import { VirtualFileSystem } from "./vfs";
import { exportProjectZip, importProjectZip } from "./zip";
import JSZip from "jszip";

async function makeFs() {
  const storage = new MemoryStorageAdapter();
  const fs = new VirtualFileSystem("p1", storage);
  await fs.load();
  return { fs, storage };
}

describe("VirtualFileSystem", () => {
  it("creates files with parent directories and persists", async () => {
    const { fs, storage } = await makeFs();
    await fs.createFile("/src/lib/a.ts", "x");
    expect(fs.exists("/src")).toBe(true);
    expect(fs.get("/src/lib")?.kind).toBe("dir");
    expect((await storage.listFiles("p1")).map((f) => f.path).sort()).toEqual(["/src", "/src/lib", "/src/lib/a.ts"]);
    const fs2 = new VirtualFileSystem("p1", storage);
    await fs2.load();
    expect(fs2.read("/src/lib/a.ts")).toBe("x");
  });

  it("refuses duplicates, root and traversal", async () => {
    const { fs } = await makeFs();
    await fs.createFile("/a.txt");
    await expect(fs.createFile("/a.txt")).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    await expect(fs.createFile("/../x")).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(fs.createDir("/")).rejects.toMatchObject({ code: "INVALID_PATH" });
    await expect(fs.createFile("/a.txt/b")).rejects.toMatchObject({ code: "NOT_A_DIRECTORY" });
  });

  it("writes bump versions and detect conflicts", async () => {
    const { fs, storage } = await makeFs();
    await fs.createFile("/a.txt", "1");
    await fs.write("/a.txt", "2");
    expect(fs.get("/a.txt")?.version).toBe(2);
    // another tab writes behind our back
    const other = new VirtualFileSystem("p1", storage);
    await other.load();
    await other.write("/a.txt", "other");
    await expect(fs.write("/a.txt", "mine")).rejects.toMatchObject({ code: "CONFLICT" });
    await fs.write("/a.txt", "mine", { force: true });
    expect(await storage.getFile("p1", "/a.txt")).toMatchObject({ content: "mine", version: 4 });
  });

  it("renames folders with children and rejects cycles", async () => {
    const { fs } = await makeFs();
    await fs.createFile("/d/a.txt", "a");
    await fs.createFile("/d/sub/b.txt", "b");
    await fs.rename("/d", "/e");
    expect(fs.exists("/d")).toBe(false);
    expect(fs.read("/e/sub/b.txt")).toBe("b");
    await expect(fs.rename("/e", "/e/sub/x")).rejects.toMatchObject({ code: "INVALID_PATH" });
    await fs.createFile("/z.txt");
    await expect(fs.rename("/z.txt", "/e/a.txt")).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
  });

  it("deletes recursively and emits events", async () => {
    const { fs } = await makeFs();
    const seen: string[] = [];
    fs.events.on("change", (c) => seen.push(c.type));
    await fs.createFile("/d/a.txt");
    await fs.delete("/d");
    expect(fs.list()).toHaveLength(0);
    expect(seen).toContain("deleted");
    await expect(fs.delete("/nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("bulkWrite creates parents", async () => {
    const { fs } = await makeFs();
    await fs.bulkWrite([{ path: "/x/y/z.txt", content: "z" }]);
    expect(fs.get("/x/y")?.kind).toBe("dir");
  });

  it("uniquePath avoids collisions", async () => {
    const { fs } = await makeFs();
    await fs.createFile("/untitled.txt");
    expect(fs.uniquePath("/", "untitled.txt")).toBe("/untitled-2.txt");
  });
});

describe("search", () => {
  it("finds plain, case-insensitive, regex and whole word matches", async () => {
    const { fs } = await makeFs();
    await fs.createFile("/a.js", "Hello world\nhello again\nshello");
    const files = fs.list();
    expect(searchFiles(files, "hello").matches).toHaveLength(3);
    expect(searchFiles(files, "hello", { caseSensitive: true }).matches).toHaveLength(2);
    expect(searchFiles(files, "hello", { wholeWord: true }).matches).toHaveLength(2);
    expect(searchFiles(files, "h.llo", { regex: true }).matches).toHaveLength(3);
    expect(searchFiles(files, "(", { regex: true }).error).toBeTruthy();
    expect(searchFiles(files, "hello").matches[0]).toMatchObject({ line: 1, column: 1 });
  });
});

describe("AutosaveScheduler", () => {
  it("debounces and retries failures", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const save = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("disk");
    });
    const a = new AutosaveScheduler(save, { delayMs: 100, retryBaseMs: 50 });
    a.schedule("/a");
    a.schedule("/a");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(50);
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.has("/a")).toBe(false);
    a.dispose();
    vi.useRealTimers();
  });
  it("flush saves immediately", async () => {
    const save = vi.fn(async () => {});
    const a = new AutosaveScheduler(save, { delayMs: 10_000 });
    a.schedule("/a");
    await a.flush("/a");
    expect(save).toHaveBeenCalledTimes(1);
    a.dispose();
  });
});

describe("zip", () => {
  it("round-trips text files", async () => {
    const data = await exportProjectZip([
      { path: "/index.html", content: "<h1>x</h1>" },
      { path: "/css/a.css", content: "a{}" },
    ]);
    const res = await importProjectZip(data);
    expect(res.files.map((f) => f.path).sort()).toEqual(["/css/a.css", "/index.html"]);
  });
  it("strips a single root folder, skips binaries/unsafe paths", async () => {
    const zip = new JSZip();
    zip.file("proj/index.html", "hi");
    zip.file("proj/img.bin", new Uint8Array([0xff, 0xfe, 0xfd, 0x80]));
    zip.file("proj/node_modules/x.js", "no");
    const res = await importProjectZip(await zip.generateAsync({ type: "uint8array" }));
    expect(res.files.map((f) => f.path)).toEqual(["/index.html"]);
    expect(res.skipped.length).toBeGreaterThanOrEqual(2);
    expect(res.skipped.some((s) => /binary/.test(s.reason))).toBe(true);
  });
  it("never yields paths outside the project root", async () => {
    const zip = new JSZip();
    zip.file("../evil.txt", "bad");
    zip.file("a/../../evil2.txt", "bad");
    const res = await importProjectZip(await zip.generateAsync({ type: "uint8array" }));
    for (const f of res.files) expect(f.path.split("/")).not.toContain("..");
  });
  it("rejects garbage", async () => {
    await expect(importProjectZip(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
});
