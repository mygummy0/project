export type ProjectAction = "read" | "write" | "delete" | "admin";

/**
 * Per-project authorisation hook. The default local provider allows
 * everything (single-user, browser-local data). A hosted deployment injects an
 * implementation backed by user sessions and project roles.
 */
export interface ProjectPermissions {
  can(projectId: string, action: ProjectAction): boolean | Promise<boolean>;
}

export const allowAllPermissions: ProjectPermissions = { can: () => true };

export function readOnlyPermissions(): ProjectPermissions {
  return { can: (_id, action) => action === "read" };
}
