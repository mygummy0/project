import { describe, expect, it } from "vitest";
import { SANDBOX_FRAME_HTML, SANDBOX_HEADERS } from "./sandbox";

describe("sandbox route", () => {
  it("forces an opaque origin via CSP sandbox without allow-same-origin", () => {
    const csp = SANDBOX_HEADERS["Content-Security-Policy"]!;
    expect(csp.startsWith("sandbox ")).toBe(true);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("frame-ancestors 'self'");
  });
  it("only renders HTML sent by its parent with the matching token", () => {
    expect(SANDBOX_FRAME_HTML).toContain("e.source !== parent");
    expect(SANDBOX_FRAME_HTML).toContain("__webide_render !== t");
  });
});
