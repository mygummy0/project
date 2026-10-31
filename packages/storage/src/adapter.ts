import type { FileRecord, ProjectMeta } from "@webide/shared";

/** Optimistic-concurrency check evaluated atomically with the write. */
export interface Precondition {
  path: string;
  /** Expected stored version, or `null` when the path must not exist yet. */
  version: number | null;
}

export interface ChangeSet {
  put?: FileRecord[];
  /** Exact paths to delete (callers expand directories themselves). */
  delete?: string[];
  preconditions?: Precondition[];
}

/**
 * Persistence boundary of the IDE. Phase 1 ships IndexedDB + in-memory
 * implementations; a PostgreSQL / object-storage backed adapter talking to
 * `services/api` can implement the same interface later.
 */
export interface StorageAdapter {
  init(): Promise<void>;

  listProjects(): Promise<ProjectMeta[]>;
  getProject(id: string): Promise<ProjectMeta | undefined>;
  putProject(meta: ProjectMeta): Promise<void>;
  /** Removes the project and every file belonging to it. */
  deleteProject(id: string): Promise<void>;

  listFiles(projectId: string): Promise<FileRecord[]>;
  getFile(projectId: string, path: string): Promise<FileRecord | undefined>;
  /** Atomic: either every change (and precondition) applies or none do. Throws IdeError("CONFLICT"). */
  applyChanges(projectId: string, changes: ChangeSet): Promise<void>;

  /** Small key/value area (workspace state, preferences). */
  getKV<T>(key: string): Promise<T | undefined>;
  setKV<T>(key: string, value: T): Promise<void>;
  deleteKV(key: string): Promise<void>;
}
