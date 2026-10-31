import { describe, expect, it } from "vitest";
import { buildAmbientTypes } from "./index";

describe("buildAmbientTypes", () => {
  it("declares listed packages and ignores invalid names", () => {
    const t = buildAmbientTypes(JSON.stringify({ dependencies: { react: "18", "@scope/x": "1", 'bad"name': "1" } }));
    expect(t).toContain('declare module "react";');
    expect(t).toContain('declare module "@scope/x/*";');
    expect(t).not.toContain("bad");
  });
  it("tolerates missing or invalid package.json", () => {
    expect(buildAmbientTypes(undefined)).toContain("*.css");
    expect(buildAmbientTypes("{")).toContain("*.css");
  });
});
