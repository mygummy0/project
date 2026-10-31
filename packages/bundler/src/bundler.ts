import { transform } from "sucrase";
import { dirname, extname, normalizePath } from "@webide/shared";

export interface BundleOptions {
  entry: string;
  files: ReadonlyMap<string, string>;
  /** ESM CDN used for npm imports in the browser preview; `null` disables npm imports. */
  cdn?: string | null;
}

export interface BundleError {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export interface Bundle {
  /** Classic script that defines and runs every module (CommonJS-style registry). */
  code: string;
  /** npm specifiers ("react", "react-dom/client") that must be preloaded into `__webide_externals`. */
  externals: string[];
  /** Resolved CDN URL per external specifier. */
  externalUrls: Record<string, string>;
  modules: string[];
  errors: BundleError[];
}

const SCRIPT_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const RESOLVE_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css"];
export const BUNDLEABLE = /\.(tsx?|jsx|mjs|cjs|js)$/i;

export function isBareSpecifier(s: string): boolean {
  return !s.startsWith(".") && !s.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(s);
}

function resolveLocal(from: string, spec: string, files: ReadonlyMap<string, string>): string | null {
  let base: string;
  try {
    base = spec.startsWith("/") ? normalizePath(spec) : normalizePath(dirname(from) + "/" + spec);
  } catch {
    return null;
  }
  for (const ext of RESOLVE_EXT) if (files.has(base + ext)) return base + ext;
  for (const ext of RESOLVE_EXT.slice(1)) if (files.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

function transformModule(path: string, source: string): string {
  const ext = extname(path);
  if (ext === ".json") return `module.exports = ${JSON.stringify(JSON.parse(source))};`;
  if (ext === ".css") return `__webide_css(${JSON.stringify(path)}, ${JSON.stringify(source)});`;
  const isTs = ext === ".ts" || ext === ".tsx";
  const transforms: ("typescript" | "jsx" | "imports")[] = isTs ? ["typescript"] : [];
  if (ext !== ".ts") transforms.push("jsx");
  transforms.push("imports");
  return transform(source, {
    transforms,
    jsxRuntime: "automatic",
    production: true,
    filePath: path,
    // Type-only imports must not become runtime requires.
    keepUnusedImports: false,
  }).code;
}

/** `{ "react": "18.3.1" }` from /package.json, if present. */
function readDependencies(files: ReadonlyMap<string, string>): Record<string, string> {
  const raw = files.get("/package.json");
  if (!raw) return {};
  try {
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
    return pkg.dependencies ?? {};
  } catch {
    return {};
  }
}

function packageName(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/**
 * CDN URL for an npm specifier. Versions come from /package.json (range
 * prefixes stripped). Pin exact versions so packages that share a peer
 * (react-dom → react) resolve to the same module URL and instance.
 */
export function cdnUrl(spec: string, deps: Record<string, string>, cdn: string): string {
  const name = packageName(spec);
  const sub = spec.slice(name.length);
  const version = deps[name]?.trim().replace(/^[\^~=v]+/, "");
  return `${cdn}${name}${version ? "@" + version : ""}${sub}`;
}

/**
 * Minimal browser bundler: transpiles TS/JSX with sucrase, follows relative
 * imports through the project files and emits a CommonJS-style module
 * registry. npm imports are left as externals for the caller to preload.
 */
export function bundle(opts: BundleOptions): Bundle {
  const { files, entry } = opts;
  const cdn = opts.cdn === undefined ? "https://esm.sh/" : opts.cdn;
  const errors: BundleError[] = [];
  const defs: string[] = [];
  const maps: Record<string, Record<string, string>> = {};
  const externals = new Set<string>();
  const seen = new Set<string>();
  const queue = [entry];

  if (!files.has(entry)) {
    return { code: "", externals: [], externalUrls: {}, modules: [], errors: [{ path: entry, message: "Entry file not found" }] };
  }

  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    let code: string;
    try {
      code = transformModule(path, files.get(path)!);
    } catch (e) {
      const err = e as Error & { loc?: { line: number; column: number } };
      errors.push({ path, message: err.message, line: err.loc?.line, column: err.loc?.column });
      continue;
    }
    const map: Record<string, string> = {};
    for (const m of code.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)) {
      const spec = m[2]!;
      if (spec in map) continue;
      if (isBareSpecifier(spec)) {
        externals.add(spec);
        map[spec] = "ext:" + spec;
        continue;
      }
      const target = resolveLocal(path, spec, files);
      if (!target) {
        errors.push({ path, message: `Cannot resolve "${spec}"` });
        continue;
      }
      if (!SCRIPT_EXT.includes(extname(target)) && ![".json", ".css"].includes(extname(target))) {
        errors.push({ path, message: `Unsupported import "${spec}" (only scripts, .json and .css)` });
        continue;
      }
      map[spec] = target;
      queue.push(target);
    }
    maps[path] = map;
    defs.push(`${JSON.stringify(path)}: function (module, exports, require) {\n${code}\n}`);
  }

  if (externals.size && cdn === null) {
    errors.push({ path: entry, message: `npm imports are not available here: ${[...externals].join(", ")}` });
  }
  const deps = readDependencies(files);
  const externalUrls: Record<string, string> = {};
  if (cdn) for (const s of externals) externalUrls[s] = cdnUrl(s, deps, cdn);

  const code = `(function () {
var __defs = {${defs.join(",\n")}};
var __maps = ${JSON.stringify(maps)};
var __ext = (typeof window !== "undefined" ? window : self).__webide_externals || {};
var __cache = {};
function __webide_css(id, css) {
  if (typeof document === "undefined") return;
  var el = document.querySelector('style[data-module="' + id + '"]') || document.createElement("style");
  el.setAttribute("data-module", id);
  el.textContent = css;
  document.head.appendChild(el);
}
function __load(id) {
  if (__cache[id]) return __cache[id].exports;
  var module = { exports: {} };
  __cache[id] = module;
  __defs[id].call(module.exports, module, module.exports, function (spec) {
    var t = (__maps[id] || {})[spec];
    if (!t) throw new Error("Cannot find module '" + spec + "' from " + id);
    if (t.indexOf("ext:") === 0) {
      var ns = __ext[t.slice(4)];
      if (!ns) throw new Error("npm module '" + spec + "' is not available");
      return ns;
    }
    return __load(t);
  });
  return module.exports;
}
__load(${JSON.stringify(entry)});
})();`;
  return { code, externals: [...externals], externalUrls, modules: [...seen], errors };
}

/** Module script that preloads npm externals from the CDN, then runs the bundle. */
export function bundleToModuleScript(b: Bundle): string {
  if (b.externals.length === 0) return b.code;
  const specs = JSON.stringify(b.externals);
  const urls = JSON.stringify(b.externals.map((s) => b.externalUrls[s]));
  return `const __specs = ${specs};
const __urls = ${urls};
const __mods = await Promise.all(__urls.map((u) => import(u)));
window.__webide_externals = {};
__specs.forEach((s, i) => { window.__webide_externals[s] = Object.assign({ __esModule: true }, __mods[i]); });
${b.code}`;
}
