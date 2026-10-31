/**
 * AI Engine contracts. The IDE works fully without any provider configured:
 * `NoAiProvider` reports unavailability and the UI hides AI affordances.
 * Real providers call a server route so API keys never reach the browser.
 */
export type AiTask = "explain" | "diagnose" | "refactor" | "generate" | "edit-selection";

export interface AiRequest {
  task: AiTask;
  projectId: string;
  path?: string;
  selection?: { text: string; startLine: number; endLine: number };
  instruction?: string;
}

export interface ProposedChange {
  path: string;
  original: string;
  proposed: string;
}

export interface AiResponse {
  message: string;
  /** Changes are only previewed as a diff; applying them requires explicit user approval. */
  changes: ProposedChange[];
}

export interface AiProvider {
  readonly id: string;
  readonly available: boolean;
  complete(request: AiRequest, signal?: AbortSignal): Promise<AiResponse>;
}

export const NoAiProvider: AiProvider = {
  id: "none",
  available: false,
  async complete() {
    throw new Error("No AI provider is configured");
  },
};
