import type { FileRecord } from "@webide/shared";

export interface SearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
}

export interface SearchMatch {
  path: string;
  /** 1-based line and column. */
  line: number;
  column: number;
  length: number;
  preview: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  truncated: boolean;
  /** Set when the query is an invalid regular expression. */
  error?: string;
}

const MAX_PREVIEW = 300;

export function buildMatcher(query: string, opts: SearchOptions): RegExp | string {
  let source = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (opts.wholeWord) source = `\\b(?:${source})\\b`;
  try {
    return new RegExp(source, opts.caseSensitive ? "g" : "gi");
  } catch (e) {
    return (e as Error).message;
  }
}

/** Plain-text search over the given files (comes from the in-memory project cache). */
export function searchFiles(files: Iterable<FileRecord>, query: string, opts: SearchOptions = {}): SearchResult {
  if (!query) return { matches: [], truncated: false };
  const re = buildMatcher(query, opts);
  if (typeof re === "string") return { matches: [], truncated: false, error: re };
  const max = opts.maxResults ?? 500;
  const matches: SearchMatch[] = [];
  for (const f of files) {
    if (f.kind !== "file") continue;
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        matches.push({
          path: f.path,
          line: i + 1,
          column: m.index + 1,
          length: m[0].length,
          preview: line.length > MAX_PREVIEW ? line.slice(Math.max(0, m.index - 60), m.index + 200) : line,
        });
        if (matches.length >= max) return { matches, truncated: true };
      }
    }
  }
  return { matches, truncated: false };
}
