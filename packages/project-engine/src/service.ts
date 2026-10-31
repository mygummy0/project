import { IdeError, assertProjectId, createId, type ProjectMeta, type WorkspaceState } from "@webide/shared";
import { VirtualFileSystem } from "@webide/file-engine";
import type { StorageAdapter } from "@webide/storage";
import { allowAllPermissions, type ProjectAction, type ProjectPermissions } from "./permissions";
import { getTemplate } from "./templates";

const sessionKey = (id: string) => `workspace:${id}`;

export interface CreateProjectInput {
  name: string;
  templateId?: string;
  /** Optional explicit id (must match [A-Za-z0-9_-]{1,64}); generated otherwise. */
  id?: string;
}

/** Project lifecycle: create/rename/open/delete, templates and workspace restore. */
export class ProjectService {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly permissions: ProjectPermissions = allowAllPermissions,
  ) {}

  private async authorize(id: string, action: ProjectAction) {
    if (!(await this.permissions.can(id, action))) {
      throw new IdeError("PERMISSION_DENIED", `Not allowed to ${action} project ${id}`);
    }
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const all = await this.storage.listProjects();
    const visible: ProjectMeta[] = [];
    for (const p of all) if (await this.permissions.can(p.id, "read")) visible.push(p);
    return visible.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getProject(id: string): Promise<ProjectMeta | undefined> {
    assertProjectId(id);
    await this.authorize(id, "read");
    return this.storage.getProject(id);
  }

  async createProject(input: CreateProjectInput): Promise<ProjectMeta> {
    const name = input.name.trim();
    if (!name) throw new IdeError("INVALID_ID", "Project name must not be empty");
    if (name.length > 100) throw new IdeError("LIMIT_EXCEEDED", "Project name is too long");
    const id = assertProjectId(input.id ?? createId("p-"));
    if (await this.storage.getProject(id)) {
      throw new IdeError("ALREADY_EXISTS", `Project ${id} already exists`);
    }
    await this.authorize(id, "admin");
    const templateId = input.templateId ?? "web";
    const template = getTemplate(templateId);
    if (!template) throw new IdeError("NOT_FOUND", `Unknown template "${templateId}"`);

    const now = Date.now();
    const meta: ProjectMeta = { id, name, templateId, createdAt: now, updatedAt: now };
    await this.storage.putProject(meta);
    const fs = new VirtualFileSystem(id, this.storage);
    await fs.load();
    await fs.bulkWrite(template.files);
    return meta;
  }

  /** Opens `id`, creating it from a template on first use (embedding scenario). */
  async ensureProject(id: string, defaults: { name?: string; templateId?: string } = {}): Promise<ProjectMeta> {
    assertProjectId(id);
    const existing = await this.storage.getProject(id);
    if (existing) {
      await this.authorize(id, "read");
      return existing;
    }
    return this.createProject({ id, name: defaults.name ?? id, templateId: defaults.templateId });
  }

  async renameProject(id: string, name: string): Promise<ProjectMeta> {
    assertProjectId(id);
    await this.authorize(id, "admin");
    const meta = await this.storage.getProject(id);
    if (!meta) throw new IdeError("NOT_FOUND", `Project ${id} not found`);
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new IdeError("INVALID_ID", "Invalid project name");
    const next = { ...meta, name: trimmed, updatedAt: Date.now() };
    await this.storage.putProject(next);
    return next;
  }

  async touch(id: string): Promise<void> {
    const meta = await this.storage.getProject(id);
    if (meta) await this.storage.putProject({ ...meta, updatedAt: Date.now() });
  }

  async deleteProject(id: string): Promise<void> {
    assertProjectId(id);
    await this.authorize(id, "delete");
    await this.storage.deleteProject(id);
    await this.storage.deleteKV(sessionKey(id));
  }

  async openProject(id: string): Promise<{ meta: ProjectMeta; fs: VirtualFileSystem; canWrite: boolean }> {
    assertProjectId(id);
    await this.authorize(id, "read");
    const meta = await this.storage.getProject(id);
    if (!meta) throw new IdeError("NOT_FOUND", `Project ${id} not found`);
    const fs = new VirtualFileSystem(id, this.storage);
    await fs.load();
    return { meta, fs, canWrite: await this.permissions.can(id, "write") };
  }

  loadWorkspace(id: string): Promise<WorkspaceState | undefined> {
    return this.storage.getKV<WorkspaceState>(sessionKey(id));
  }

  saveWorkspace(id: string, state: WorkspaceState): Promise<void> {
    return this.storage.setKV(sessionKey(id), state);
  }
}
