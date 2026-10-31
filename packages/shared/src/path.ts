import { IdeError } from "./errors";

const MAX_SEGMENT = 255;
const MAX_PATH = 1024;
// eslint-disable-next-line no-control-regex
const BAD_SEGMENT = /[\u0000-\u001f<>:"|?*\\]/;

/**
 * Normalises a user supplied path into an absolute POSIX path ("/a/b.txt").
 * Rejects NUL/control characters and any attempt to climb above the root,
 * which is what keeps every file operation inside the project sandbox.
 */
export function normalizePath(input: string): string {
  if (typeof input !== "string" || input.length === 0) {
    throw new IdeError("INVALID_PATH", "Path must be a non-empty string");
  }
  if (input.length > MAX_PATH) throw new IdeError("INVALID_PATH", "Path is too long");
  const parts: string[] = [];
  for (const seg of input.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) throw new IdeError("INVALID_PATH", `Path escapes project root: ${input}`);
      parts.pop();
      continue;
    }
    if (seg.length > MAX_SEGMENT || BAD_SEGMENT.test(seg)) {
      throw new IdeError("INVALID_PATH", `Invalid name "${seg}"`);
    }
    if (seg.trim() !== seg || /\.$/.test(seg)) {
      throw new IdeError("INVALID_PATH", `Invalid name "${seg}"`);
    }
    parts.push(seg);
  }
  return "/" + parts.join("/");
}

/** Like normalizePath but refuses the project root. */
export function normalizeEntryPath(input: string): string {
  const p = normalizePath(input);
  if (p === "/") throw new IdeError("INVALID_PATH", "Path must not be the project root");
  return p;
}

export function joinPath(...segments: string[]): string {
  return normalizePath(segments.join("/"));
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i).toLowerCase();
}

/** True if `child` is `parent` or lives below it. */
export function isInside(parent: string, child: string): boolean {
  if (parent === "/") return true;
  return child === parent || child.startsWith(parent + "/");
}

/** Replace the `from` prefix of `path` with `to` (used when moving folders). */
export function rebase(path: string, from: string, to: string): string {
  return to + path.slice(from.length);
}

/** Resolve a reference found in a document at `fromFile` (e.g. an <img src>). */
export function resolveRelative(fromFile: string, ref: string): string {
  if (ref.startsWith("/")) return normalizePath(ref);
  return normalizePath(dirname(fromFile) + "/" + ref);
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Project ids come from URLs, so they are validated before touching storage. */
export function assertProjectId(id: string): string {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new IdeError("INVALID_ID", `Invalid project id "${String(id).slice(0, 80)}"`);
  }
  return id;
}

export function createId(prefix = ""): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix + rnd;
}
