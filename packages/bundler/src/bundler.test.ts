import { describe, expect, it } from "vitest";
import { bundle, cdnUrl } from "./bundler";

const files = (o: Record<string, string>) => new Map(Object.entries(o));

function run(code: string) {
  const logs: unknown[] = [];
  const fn = new Function("console", "self", code);
  fn({ log: (...a: unknown[]) => logs.push(a.join(" ")) }, {});
  return logs;
}

describe("bundle", () => {
  it("transpiles TS, resolves relative imports without extensions and index files, json", () => {
    const b = bundle({
      entry: "/src/main.ts",
      cdn: null,
      files: files({
        "/src/main.ts": `import { add } from "./math"; import type { X } from "./types"; import cfg from "../config.json"; import { hi } from "./lib"; const n: number = add(2, 3); console.log(n, cfg.name, hi());`,
        "/src/math.ts": `export const add = (a: number, b: number): number => a + b;`,
        "/src/types.ts": `export interface X { a: 1 }`,
        "/src/lib/index.js": `export function hi() { return "hi"; }`,
        "/config.json": `{"name":"demo"}`,
      }),
    });
    expect(b.errors).toEqual([]);
    expect(b.modules).not.toContain("/src/types.ts");
    expect(run(b.code)).toEqual(["5 demo hi"]);
  });

  it("handles cycles and default exports", () => {
    const b = bundle({
      entry: "/a.js",
      cdn: null,
      files: files({
        "/a.js": `import b from "./b.js"; export const A = "A"; console.log(b());`,
        "/b.js": `import { A } from "./a.js"; export default () => "B sees " + A;`,
      }),
    });
    expect(run(b.code)).toEqual(["B sees A"]);
  });

  it("transpiles JSX with the automatic runtime as an npm external", () => {
    const b = bundle({ entry: "/App.tsx", files: files({ "/App.tsx": `export default () => <div>hi</div>;`, "/package.json": `{"dependencies":{"react":"^18.3.1"}}` }) });
    expect(b.externals).toEqual(["react/jsx-runtime"]);
    expect(b.externalUrls["react/jsx-runtime"]).toBe("https://esm.sh/react@18.3.1/jsx-runtime");
  });

  it("reports syntax errors, unresolved imports and missing entry", () => {
    expect(bundle({ entry: "/x.ts", files: files({ "/x.ts": "const = ;" }) }).errors[0]?.path).toBe("/x.ts");
    expect(bundle({ entry: "/x.ts", files: files({ "/x.ts": `import "./nope";` }) }).errors[0]?.message).toMatch(/Cannot resolve/);
    expect(bundle({ entry: "/missing.ts", files: files({}) }).errors).toHaveLength(1);
    expect(bundle({ entry: "/x.ts", cdn: null, files: files({ "/x.ts": `import "lodash";` }) }).errors[0]?.message).toMatch(/npm imports/);
  });

  it("pins versions from package.json in CDN urls", () => {
    expect(cdnUrl("react-dom/client", { react: "18.3.1", "react-dom": "^18.3.1" }, "https://esm.sh/")).toBe(
      "https://esm.sh/react-dom@18.3.1/client",
    );
    expect(cdnUrl("@scope/pkg/sub", {}, "https://cdn/")).toBe("https://cdn/@scope/pkg/sub");
  });
});
