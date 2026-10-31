import { describe, expect, it } from "vitest";
import { LoginLimiter, createToken, hashPassword, isAllowedOrigin, parseCookies, verifyPassword, verifyToken } from "./auth.mjs";

const SECRET = "s".repeat(40);

describe("password hashing", () => {
  it("verifies the right password only, with salted hashes", () => {
    const h = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
    expect(hashPassword("correct horse battery")).not.toBe(h);
    expect(verifyPassword("x", "garbage")).toBe(false);
    expect(verifyPassword(undefined, h)).toBe(false);
  });
});

describe("tokens", () => {
  it("accepts valid, rejects expired, tampered and foreign-secret tokens", () => {
    const t = createToken(SECRET, 1000, 10_000);
    expect(verifyToken(SECRET, t, 10_500)).toBe(true);
    expect(verifyToken(SECRET, t, 11_001)).toBe(false);
    expect(verifyToken("o".repeat(40), t, 10_500)).toBe(false);
    const [exp, nonce, sig] = t.split(".");
    expect(verifyToken(SECRET, `${Number(exp) + 99999}.${nonce}.${sig}`, 10_500)).toBe(false);
    expect(verifyToken(SECRET, "a.b", 0)).toBe(false);
    expect(verifyToken(SECRET, undefined, 0)).toBe(false);
  });
});

describe("login limiter", () => {
  it("locks after repeated failures, per address, and unlocks later", () => {
    const l = new LoginLimiter({ maxFailures: 3, lockMs: 1000 });
    for (let i = 0; i < 3; i++) l.fail("1.1.1.1", 0);
    expect(l.check("1.1.1.1", 10).allowed).toBe(false);
    expect(l.check("2.2.2.2", 10).allowed).toBe(true);
    expect(l.check("1.1.1.1", 1001).allowed).toBe(true);
    l.fail("3.3.3.3", 0);
    l.success("3.3.3.3");
    expect(l.check("3.3.3.3", 1).allowed).toBe(true);
  });
});

describe("helpers", () => {
  it("parses cookies and checks origins exactly", () => {
    expect(parseCookies("a=1; webide_term=x.y.z")).toEqual({ a: "1", webide_term: "x.y.z" });
    expect(isAllowedOrigin("https://doongsil.co.kr", ["https://doongsil.co.kr"])).toBe(true);
    expect(isAllowedOrigin("https://doongsil.co.kr.evil.com", ["https://doongsil.co.kr"])).toBe(false);
    expect(isAllowedOrigin(undefined, ["https://doongsil.co.kr"])).toBe(false);
  });
});
