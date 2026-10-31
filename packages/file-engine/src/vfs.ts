import {
  Emitter,
  IdeError,
  basename,
  dirname,
  isInside,
  normalizeEntryPath,
  rebase,
  type FileRecord,
} from "@webide/shared";
import type { StorageAdapter } from "@webide/storage";

export type FsChange =
  | { type: "created"; path: string; kind: "file" | "dir" }
  | { type: "updated"; path: string }
  | { type: "deleted"; path: string; kind: "file" | "dir" }
  | { type: "renamed"; path: string; oldPath: string; kind: "file" | "dir" }
  | { type: "reloaded" };

export interface WriteOptions {
  /** Defaults to the cached version. Pass `force: true` to overwrite a newer stored copy. */
  expectedVersion?: number;
  force?: boolean;
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Project-scoped virtual file system. Keeps a cache of the whole project in
 * memory (projects are small, text-only) and persists every mutation through
 * a StorageAdapter. All paths are normalised so nothing can escape the root.
 */
export class VirtualFileSystem {
  readonly events = new Emitter<{ change: FsChange }>();
  private cache = new Map<string, FileRecord>();
  private loaded = false;

  constructor(
    readonly projectId: string,
    private readonly storage: StorageAdapter,
  ) {}

  async load(): Promise<void> {
    const records = await this.storage.listFiles(this.projectId);
    this.cache = new Map(records.map((r) => [r.path, r]));
    this.loaded = true;
    this.events.emit("change", { type: "reloaded" });
  }

  private assertLoaded() {
    if (!this.loaded) throw new IdeError("STORAGE_FAILURE", "File system not loaded");
  }

  /** All entries sorted with directories first, then alphabetically per level. */
  list(): FileRecord[] {
    this.assertLoaded();
    return [...this.cache.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  listFiles(): FileRecord[] {
    return this.list().filter((r) => r.kind === "file");
  }

  get(path: string): FileRecord | undefined {
    return this.cache.get(normalizeEntryPath(path));
  }

  exists(path: string): boolean {
    return this.cache.has(normalizeEntryPath(path));
  }

  read(path: string): string {
    const rec = this.get(path);
    if (!rec) throw new IdeError("NOT_FOUND", `No such file: ${path}`);
    if (rec.kind !== "file") throw new IdeError("NOT_A_FILE", `${path} is a directory`);
    return rec.content;
  }

  private record(path: string, kind: "file" | "dir", content: string, version: number): FileRecord {
    return { projectId: this.projectId, path, kind, content, version, updatedAt: Date.now() };
  }

  /** Directory records that must exist so that `path` has all its parents. */
  private missingParents(path: string): FileRecord[] {
    const out: FileRecord[] = [];
    let dir = dirname(path);
    while (dir !== "/") {
      const existing = this.cache.get(dir);
      if (existing && existing.kind === "file") {
        throw new IdeError("NOT_A_DIRECTORY", `${dir} is a file, cannot create ${path}`);
      }
      if (!existing) out.push(this.record(dir, "dir", "", 1));
      dir = dirname(dir);
    }
    return out;
  }

  async createFile(path: string, content = ""): Promise<FileRecord> {
    this.assertLoaded();
    const p = normalizeEntryPath(path);
    this.checkSize(content);
    if (this.cache.has(p)) throw new IdeError("ALREADY_EXISTS", `${p} already exists`);
    const parents = this.missingParents(p);
    const rec = this.record(p, "file", content, 1);
    await this.storage.applyChanges(this.projectId, {
      put: [...parents, rec],
      preconditions: [{ path: p, version: null }],
    });
    for (const d of parents) this.commitPut(d, "created");
    this.commitPut(rec, "created");
    return rec;
  }

  async createDir(path: string): Promise<FileRecord> {
    this.assertLoaded();
    const p = normalizeEntryPath(path);
    if (this.cache.has(p)) throw new IdeError("ALREADY_EXISTS", `${p} already exists`);
    const parents = this.missingParents(p);
    const rec = this.record(p, "dir", "", 1);
    await this.storage.applyChanges(this.projectId, {
      put: [...parents, rec],
      preconditions: [{ path: p, version: null }],
    });
    for (const d of parents) this.commitPut(d, "created");
    this.commitPut(rec, "created");
    return rec;
  }

  /** Creates or overwrites a file. Detects concurrent modification via versions. */
  async write(path: string, content: string, opts: WriteOptions = {}): Promise<FileRecord> {
    this.assertLoaded();
    const p = normalizeEntryPath(path);
    this.checkSize(content);
    const cur = this.cache.get(p);
    if (cur?.kind === "dir") throw new IdeError("NOT_A_FILE", `${p} is a directory`);
    if (!cur) return this.createFile(p, content);

    let base = cur.version;
    const preconditions = [];
    if (opts.force) {
      const stored = await this.storage.getFile(this.projectId, p);
      base = stored?.version ?? cur.version;
      preconditions.push({ path: p, version: stored?.version ?? null });
    } else {
      base = opts.expectedVersion ?? cur.version;
      preconditions.push({ path: p, version: base });
    }
    const rec = this.record(p, "file", content, base + 1);
    await this.storage.applyChanges(this.projectId, { put: [rec], preconditions });
    this.cache.set(p, rec);
    this.events.emit("change", { type: "updated", path: p });
    return rec;
  }

  /** Renames or moves a file or folder (children follow). */
  async rename(from: string, to: string): Promise<void> {
    this.assertLoaded();
    const src = normalizeEntryPath(from);
    const dst = normalizeEntryPath(to);
    const rec = this.cache.get(src);
    if (!rec) throw new IdeError("NOT_FOUND", `No such file or folder: ${src}`);
    if (src === dst) return;
    if (this.cache.has(dst)) throw new IdeError("ALREADY_EXISTS", `${dst} already exists`);
    if (rec.kind === "dir" && isInside(src, dst)) {
      throw new IdeError("INVALID_PATH", "Cannot move a folder into itself");
    }
    const parents = this.missingParents(dst);
    const moved = [...this.cache.values()].filter((r) => isInside(src, r.path));
    const put = moved.map((r) => ({ ...r, path: rebase(r.path, src, dst), version: r.version + 1, updatedAt: Date.now() }));
    await this.storage.applyChanges(this.projectId, {
      delete: moved.map((r) => r.path),
      put: [...parents, ...put],
      preconditions: [{ path: dst, version: null }],
    });
    for (const m of moved) this.cache.delete(m.path);
    for (const d of parents) this.commitPut(d, "created");
    for (const r of put) this.cache.set(r.path, r);
    this.events.emit("change", { type: "renamed", path: dst, oldPath: src, kind: rec.kind });
  }

  /** Deletes a file or folder recursively. */
  async delete(path: string): Promise<void> {
    this.assertLoaded();
    const p = normalizeEntryPath(path);
    const rec = this.cache.get(p);
    if (!rec) throw new IdeError("NOT_FOUND", `No such file or folder: ${p}`);
    const doomed = [...this.cache.values()].filter((r) => isInside(p, r.path));
    await this.storage.applyChanges(this.projectId, { delete: doomed.map((r) => r.path) });
    for (const d of doomed) this.cache.delete(d.path);
    this.events.emit("change", { type: "deleted", path: p, kind: rec.kind });
  }

  /** Re-reads one file from storage (used to resolve conflicts by taking the stored copy). */
  async refresh(path: string): Promise<FileRecord | undefined> {
    const p = normalizeEntryPath(path);
    const stored = await this.storage.getFile(this.projectId, p);
    if (stored) this.cache.set(p, stored);
    else this.cache.delete(p);
    this.events.emit("change", { type: "updated", path: p });
    return stored;
  }

  /** Writes many files at once (project import / template creation). Existing paths are overwritten. */
  async bulkWrite(files: { path: string; content: string }[]): Promise<void> {
    this.assertLoaded();
    const put = new Map<string, FileRecord>();
    for (const f of files) {
      const p = normalizeEntryPath(f.path);
      this.checkSize(f.content);
      for (const parent of this.missingParentsWithPending(p, put)) put.set(parent.path, parent);
      const cur = this.cache.get(p);
      if (cur?.kind === "dir") throw new IdeError("NOT_A_FILE", `${p} is a directory`);
      put.set(p, this.record(p, "file", f.content, (cur?.version ?? 0) + 1));
    }
    const records = [...put.values()];
    await this.storage.applyChanges(this.projectId, { put: records });
    for (const r of records) {
      const existed = this.cache.has(r.path);
      this.cache.set(r.path, r);
      this.events.emit("change", existed ? { type: "updated", path: r.path } : { type: "created", path: r.path, kind: r.kind });
    }
  }

  private missingParentsWithPending(path: string, pending: Map<string, FileRecord>): FileRecord[] {
    const out: FileRecord[] = [];
    let dir = dirname(path);
    while (dir !== "/") {
      const existing = this.cache.get(dir) ?? pending.get(dir);
      if (existing?.kind === "file") throw new IdeError("NOT_A_DIRECTORY", `${dir} is a file`);
      if (!existing) out.push(this.record(dir, "dir", "", 1));
      dir = dirname(dir);
    }
    return out;
  }

  private commitPut(rec: FileRecord, type: "created") {
    this.cache.set(rec.path, rec);
    this.events.emit("change", { type, path: rec.path, kind: rec.kind });
  }

  private checkSize(content: string) {
    // UTF-16 length is a cheap upper-bound proxy; exact byte count is not needed here.
    if (content.length > MAX_FILE_BYTES) {
      throw new IdeError("LIMIT_EXCEEDED", `File exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB limit`);
    }
  }

  /** Unique sibling name such as "untitled-2.txt" for "new file" flows. */
  uniquePath(dir: string, name: string): string {
    const base = dir === "/" ? "" : dir;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let candidate = `${base}/${name}`;
    for (let i = 2; this.cache.has(candidate); i++) candidate = `${base}/${stem}-${i}${ext}`;
    return candidate;
  }

  displayName(path: string) {
    return basename(path);
  }
}
