import { describe, expect, it } from "vitest";
import { assertProjectId, basename, dirname, extname, isInside, normalizePath, resolveRelative } from "./path";
import { languageFromPath } from "./language";

describe("normalizePath", () => {
  it("normalises separators and dots", () => {
    expect(normalizePath("a//b/./c.txt")).toBe("/a/b/c.txt");
    expect(normalizePath("\\a\\b")).toBe("/a/b");
    expect(normalizePath("/a/b/../c")).toBe("/a/c");
    expect(normalizePath("/")).toBe("/");
  });
  it("rejects traversal and bad names", () => {
    expect(() => normalizePath("../etc/passwd")).toThrow();
    expect(() => normalizePath("/a/../../x")).toThrow();
    expect(() => normalizePath("a\0b")).toThrow();
    expect(() => normalizePath("a/b:c")).toThrow();
    expect(() => normalizePath("")).toThrow();
  });
});

describe("helpers", () => {
  it("dirname/basename/extname", () => {
    expect(dirname("/a/b.ts")).toBe("/a");
    expect(dirname("/b.ts")).toBe("/");
    expect(basename("/a/b.ts")).toBe("b.ts");
    expect(extname("/a/B.TSX")).toBe(".tsx");
    expect(extname("/a/.gitignore")).toBe("");
  });
  it("isInside", () => {
    expect(isInside("/a", "/a/b")).toBe(true);
    expect(isInside("/a", "/ab")).toBe(false);
    expect(isInside("/", "/x")).toBe(true);
  });
  it("resolveRelative", () => {
    expect(resolveRelative("/src/index.html", "style.css")).toBe("/src/style.css");
    expect(resolveRelative("/src/index.html", "../a.js")).toBe("/a.js");
    expect(resolveRelative("/src/index.html", "/a.js")).toBe("/a.js");
  });
  it("project ids", () => {
    expect(assertProjectId("demo-project")).toBe("demo-project");
    expect(() => assertProjectId("../x")).toThrow();
    expect(() => assertProjectId("")).toThrow();
  });
  it("languageFromPath", () => {
    expect(languageFromPath("/a.tsx")).toBe("typescript");
    expect(languageFromPath("/a.unknown")).toBe("plaintext");
  });
});
