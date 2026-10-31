export type IdeErrorCode =
  | "INVALID_PATH"
  | "INVALID_ID"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "NOT_A_FILE"
  | "NOT_A_DIRECTORY"
  | "CONFLICT"
  | "PERMISSION_DENIED"
  | "LIMIT_EXCEEDED"
  | "STORAGE_FAILURE"
  | "UNSUPPORTED";

/** Typed error shared by every engine so callers can branch on `code`. */
export class IdeError extends Error {
  readonly code: IdeErrorCode;
  constructor(code: IdeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "IdeError";
    this.code = code;
  }
}

export function isIdeError(e: unknown, code?: IdeErrorCode): e is IdeError {
  return e instanceof IdeError && (code === undefined || e.code === code);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
