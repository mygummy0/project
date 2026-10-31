import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { IdeError, type FileRecord, type ProjectMeta } from "@webide/shared";
import type { ChangeSet, StorageAdapter } from "./adapter";

interface WebIdeDB extends DBSchema {
  projects: { key: string; value: ProjectMeta };
  files: {
    key: [string, string];
    value: FileRecord;
    indexes: { byProject: string };
  };
  kv: { key: string; value: unknown };
}

/** Browser persistence: projects, files and small key/values in IndexedDB. */
export class IndexedDBStorageAdapter implements StorageAdapter {
  private db: IDBPDatabase<WebIdeDB> | null = null;

  constructor(private readonly dbName = "webide") {}

  async init(): Promise<void> {
    if (this.db) return;
    try {
      this.db = await openDB<WebIdeDB>(this.dbName, 1, {
        upgrade(db) {
          db.createObjectStore("projects", { keyPath: "id" });
          const files = db.createObjectStore("files", { keyPath: ["projectId", "path"] });
          files.createIndex("byProject", "projectId");
          db.createObjectStore("kv");
        },
      });
    } catch (cause) {
      throw new IdeError("STORAGE_FAILURE", "Could not open IndexedDB", { cause });
    }
  }

  private get conn(): IDBPDatabase<WebIdeDB> {
    if (!this.db) throw new IdeError("STORAGE_FAILURE", "Storage not initialised; call init()");
    return this.db;
  }

  listProjects() {
    return this.conn.getAll("projects");
  }
  getProject(id: string) {
    return this.conn.get("projects", id);
  }
  async putProject(meta: ProjectMeta) {
    await this.conn.put("projects", meta);
  }
  async deleteProject(id: string) {
    const tx = this.conn.transaction(["projects", "files"], "readwrite");
    let cursor = await tx.objectStore("files").index("byProject").openCursor(id);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.objectStore("projects").delete(id);
    await tx.done;
  }

  listFiles(projectId: string) {
    return this.conn.getAllFromIndex("files", "byProject", projectId);
  }
  getFile(projectId: string, path: string) {
    return this.conn.get("files", [projectId, path]);
  }

  async applyChanges(projectId: string, changes: ChangeSet) {
    const tx = this.conn.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    try {
      for (const pre of changes.preconditions ?? []) {
        const cur = await store.get([projectId, pre.path]);
        if ((cur?.version ?? null) !== pre.version) {
          throw new IdeError("CONFLICT", `Version conflict on ${pre.path}`);
        }
      }
      for (const p of changes.delete ?? []) await store.delete([projectId, p]);
      for (const f of changes.put ?? []) await store.put(f);
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* already finished */
      }
      await tx.done.catch(() => undefined);
      throw e;
    }
    await tx.done;
  }

  async getKV<T>(key: string) {
    return (await this.conn.get("kv", key)) as T | undefined;
  }
  async setKV<T>(key: string, value: T) {
    await this.conn.put("kv", value, key);
  }
  async deleteKV(key: string) {
    await this.conn.delete("kv", key);
  }
}
