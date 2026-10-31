import JSZip from "jszip";
import { IdeError, normalizeEntryPath } from "@webide/shared";

export interface ZipLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxFiles: 2000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
};

export interface ImportedFile {
  path: string;
  content: string;
}

export interface ZipImportResult {
  files: ImportedFile[];
  /** Entries that were not imported, with the reason (binary, ignored, unsafe path, too large…). */
  skipped: { path: string; reason: string }[];
}

const IGNORED = [/^\/__MACOSX\//, /(^|\/)\.DS_Store$/, /^\/\.git\//, /(^|\/)node_modules\//];

export async function exportProjectZip(files: { path: string; content: string }[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path.replace(/^\//, ""), f.content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/**
 * Reads a ZIP into text files. Every entry path is normalised (blocking
 * "zip-slip" style `../` entries) and size limits protect against zip bombs.
 */
export async function importProjectZip(
  data: ArrayBuffer | Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (cause) {
    throw new IdeError("UNSUPPORTED", "Not a valid ZIP archive", { cause });
  }
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  if (entries.length > limits.maxFiles) {
    throw new IdeError("LIMIT_EXCEEDED", `Archive has more than ${limits.maxFiles} files`);
  }

  const skipped: ZipImportResult["skipped"] = [];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const out: ImportedFile[] = [];
  let total = 0;

  for (const entry of entries) {
    let path: string;
    try {
      path = normalizeEntryPath(entry.name);
    } catch {
      skipped.push({ path: entry.name, reason: "unsafe or invalid path" });
      continue;
    }
    if (IGNORED.some((re) => re.test(path))) {
      skipped.push({ path, reason: "ignored" });
      continue;
    }
    const bytes = await entry.async("uint8array");
    if (bytes.byteLength > limits.maxFileBytes) {
      skipped.push({ path, reason: "file too large" });
      continue;
    }
    total += bytes.byteLength;
    if (total > limits.maxTotalBytes) {
      throw new IdeError("LIMIT_EXCEEDED", "Archive is too large");
    }
    try {
      out.push({ path, content: decoder.decode(bytes) });
    } catch {
      skipped.push({ path, reason: "binary file (only text files are supported)" });
    }
  }

  return { files: stripCommonRoot(out), skipped };
}

/** "project/index.html" + "project/a.css" → "/index.html" + "/a.css". */
function stripCommonRoot(files: ImportedFile[]): ImportedFile[] {
  if (files.length === 0) return files;
  const first = files[0]!.path.split("/")[1];
  const shared = files.every((f) => f.path.split("/").length > 2 && f.path.split("/")[1] === first);
  if (!shared) return files;
  return files.map((f) => ({ ...f, path: "/" + f.path.split("/").slice(2).join("/") }));
}
