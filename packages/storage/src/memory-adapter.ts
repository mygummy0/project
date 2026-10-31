import { IdeError, type FileRecord, type ProjectMeta } from "@webide/shared";
import type { ChangeSet, StorageAdapter } from "./adapter";

/** In-memory adapter used by tests and as an ephemeral fallback. */
export class MemoryStorageAdapter implements StorageAdapter {
  private projects = new Map<string, ProjectMeta>();
  private files = new Map<string, Map<string, FileRecord>>();
  private kv = new Map<string, unknown>();

  async init(): Promise<void> {}

  async listProjects() {
    return [...this.projects.values()].map((p) => ({ ...p }));
  }
  async getProject(id: string) {
    const p = this.projects.get(id);
    return p ? { ...p } : undefined;
  }
  async putProject(meta: ProjectMeta) {
    this.projects.set(meta.id, { ...meta });
  }
  async deleteProject(id: string) {
    this.projects.delete(id);
    this.files.delete(id);
  }
  async listFiles(projectId: string) {
    return [...(this.files.get(projectId)?.values() ?? [])].map((f) => ({ ...f }));
  }
  async getFile(projectId: string, path: string) {
    const f = this.files.get(projectId)?.get(path);
    return f ? { ...f } : undefined;
  }
  async applyChanges(projectId: string, changes: ChangeSet) {
    const bucket = this.files.get(projectId) ?? new Map<string, FileRecord>();
    for (const pre of changes.preconditions ?? []) {
      const cur = bucket.get(pre.path);
      if ((cur?.version ?? null) !== pre.version) {
        throw new IdeError("CONFLICT", `Version conflict on ${pre.path}`);
      }
    }
    for (const p of changes.delete ?? []) bucket.delete(p);
    for (const f of changes.put ?? []) bucket.set(f.path, { ...f });
    this.files.set(projectId, bucket);
  }
  async getKV<T>(key: string) {
    return this.kv.get(key) as T | undefined;
  }
  async setKV<T>(key: string, value: T) {
    this.kv.set(key, value);
  }
  async deleteKV(key: string) {
    this.kv.delete(key);
  }
}
