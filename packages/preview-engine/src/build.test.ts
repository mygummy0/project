import { describe, expect, it } from "vitest";
import { buildPreviewDocument } from "./build";

const files = (o: Record<string, string>) => new Map(Object.entries(o));

describe("buildPreviewDocument", () => {
  it("inlines local css/js and injects the bridge first", () => {
    const b = buildPreviewDocument(
      files({
        "/index.html": `<html><head><link rel="stylesheet" href="style.css"></head><body><script src="./app/main.js"></script></body></html>`,
        "/style.css": "body{color:red}",
        "/app/main.js": "console.log('</script>')",
      }),
      { token: "T1" },
    );
    expect(b.warnings).toEqual([]);
    expect(b.html).toContain("<style data-src=\"/style.css\">body{color:red}</style>");
    expect(b.html).toContain("console.log('<\\/script>')");
    expect(b.html).not.toContain('src="./app/main.js"');
    expect(b.html.indexOf('"T1"')).toBeGreaterThan(-1);
    expect(b.html.indexOf('"T1"')).toBeLessThan(b.html.indexOf("data-src"));
  });
  it("leaves external urls and reports missing files", () => {
    const b = buildPreviewDocument(
      files({
        "/index.html": `<link rel="stylesheet" href="https://cdn.x/a.css"><script src="https://cdn.x/a.js"></script><script src="missing.js"></script><body></body>`,
      }),
      { token: "T" },
    );
    expect(b.html).toContain("https://cdn.x/a.css");
    expect(b.html).toContain("https://cdn.x/a.js");
    expect(b.warnings).toEqual(["Script not found: missing.js"]);
  });
  it("falls back to another html file and errors without any", () => {
    expect(buildPreviewDocument(files({ "/about.html": "<p>x</p>" }), { token: "T" }).entry).toBe("/about.html");
    const none = buildPreviewDocument(files({ "/a.js": "" }), { token: "T" });
    expect(none.error).toBeTruthy();
  });
  it("keeps inline scripts untouched", () => {
    const b = buildPreviewDocument(files({ "/index.html": "<head></head><script>var a=1</script>" }), { token: "T" });
    expect(b.html).toContain("<script>var a=1</script>");
  });
  it("bundles TSX entry scripts and module scripts", () => {
    const b = buildPreviewDocument(
      files({
        "/index.html": `<head></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>`,
        "/src/main.tsx": `import { msg } from "./msg"; import "./app.css"; document.getElementById("root")!.textContent = msg;`,
        "/src/msg.ts": `export const msg: string = "hi";`,
        "/src/app.css": `body{color:red}`,
      }),
      { token: "T" },
    );
    expect(b.errors).toEqual([]);
    expect(b.html).toContain('"/src/msg.ts"');
    expect(b.html).not.toContain(' src="/src/main.tsx"');
  });
  it("shows module build errors", () => {
    const b = buildPreviewDocument(files({ "/index.html": `<body><script src="a.ts"></script></body>`, "/a.ts": `import "./nope";` }), { token: "T" });
    expect(b.errors[0]).toMatch(/Cannot resolve/);
    expect(b.html).toContain("Build failed");
  });
});
