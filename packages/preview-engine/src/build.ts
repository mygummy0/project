import { resolveRelative } from "@webide/shared";
import { createBridgeScript } from "./bridge";

export interface PreviewBuild {
  html: string;
  entry: string | null;
  /** Non-fatal problems, e.g. a <script src> pointing to a missing file. */
  warnings: string[];
  /** Fatal problem: no HTML entry point. */
  error?: string;
}

export interface BuildOptions {
  entry?: string;
  token: string;
}

const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;

function parseAttrs(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs.set(m[1]!.toLowerCase(), m[3] ?? m[4] ?? m[5] ?? "");
  }
  return attrs;
}

function serializeAttrs(attrs: Map<string, string>, omit: string[]): string {
  let out = "";
  for (const [k, v] of attrs) {
    if (omit.includes(k)) continue;
    out += ` ${k}="${v.replace(/"/g, "&quot;")}"`;
  }
  return out;
}

function localRef(entry: string, ref: string): string | null {
  const clean = ref.trim().split(/[?#]/)[0] ?? "";
  if (!clean || EXTERNAL.test(ref.trim())) return null;
  try {
    return resolveRelative(entry, clean);
  } catch {
    return null;
  }
}

const escapeScript = (s: string) => s.replace(/<\/(script)/gi, "<\\/$1");
const escapeStyle = (s: string) => s.replace(/<\/(style)/gi, "<\\/$1");

function errorDoc(message: string): string {
  const safe = message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
  return `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:2rem;color:#888">${safe}</body>`;
}

/**
 * Turns the project's files into one self-contained srcdoc: local
 * stylesheets and scripts are inlined (the preview has no origin to serve
 * them from) and the console bridge is injected first.
 *
 * Limitations (documented): ES-module imports between files and binary
 * assets are not resolved in Phase 1; `<script type="module" src>` is inlined
 * as a module without relative import support.
 */
export function buildPreviewDocument(files: ReadonlyMap<string, string>, opts: BuildOptions): PreviewBuild {
  const warnings: string[] = [];
  let entry = opts.entry && files.has(opts.entry) ? opts.entry : null;
  if (!entry && files.has("/index.html")) entry = "/index.html";
  if (!entry) entry = [...files.keys()].filter((p) => /\.html?$/i.test(p)).sort()[0] ?? null;
  if (!entry) {
    const error = "No HTML file found. Create an index.html to preview a web page.";
    return { html: errorDoc(error), entry: null, warnings, error };
  }

  let html = files.get(entry)!;
  const entryPath = entry;

  html = html.replace(/<link\b([^>]*?)\/?>/gi, (full, raw: string) => {
    const attrs = parseAttrs(raw);
    if (!/\bstylesheet\b/i.test(attrs.get("rel") ?? "")) return full;
    const href = attrs.get("href");
    if (!href) return full;
    const target = localRef(entryPath, href);
    if (!target) return full;
    const css = files.get(target);
    if (css === undefined) {
      warnings.push(`Stylesheet not found: ${href}`);
      return `<!-- missing stylesheet: ${target} -->`;
    }
    return `<style data-src="${target}">${escapeStyle(css)}</style>`;
  });

  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (full, raw: string) => {
    const attrs = parseAttrs(raw);
    const src = attrs.get("src");
    if (!src) return full;
    const target = localRef(entryPath, src);
    if (!target) return full;
    const code = files.get(target);
    if (code === undefined) {
      warnings.push(`Script not found: ${src}`);
      return `<!-- missing script: ${target} -->`;
    }
    return `<script${serializeAttrs(attrs, ["src", "integrity", "crossorigin"])} data-src="${target}">${escapeScript(code)}</script>`;
  });

  const bridge = `<script>${escapeScript(createBridgeScript(opts.token))}</script>`;
  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b[^>]*>/i, (m) => m + bridge);
  } else if (/<html\b[^>]*>/i.test(html)) {
    html = html.replace(/<html\b[^>]*>/i, (m) => m + "<head>" + bridge + "</head>");
  } else {
    html = bridge + html;
  }

  return { html, entry, warnings };
}
