/**
 * Collaboration Engine contracts (Phase 3): Yjs CRDT documents synced over
 * WebSocket, bound to Monaco with y-monaco. Not implemented in the MVP.
 */
export interface Collaborator {
  clientId: number;
  userId: string;
  name: string;
  color: string;
}

export type CollaborationStatus = "disconnected" | "connecting" | "synced" | "offline";

export interface CollaborationSession {
  readonly status: CollaborationStatus;
  collaborators(): Collaborator[];
  /** Bind a file's text model to the shared document. Returns an unbind function. */
  bindFile(path: string, model: unknown): () => void;
  onStatus(listener: (s: CollaborationStatus) => void): () => void;
  onCollaborators(listener: (c: Collaborator[]) => void): () => void;
  disconnect(): void;
}

export interface CollaborationProvider {
  /** The server verifies project access with the token; secrets never live in the client bundle. */
  join(projectId: string, auth: { token: string }): Promise<CollaborationSession>;
}
