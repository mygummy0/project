import { describe, expect, it } from "vitest";
import { activate, closeIn, emptyGroups, mapPaths, normalize, openIn, split } from "./groups";

describe("editor groups", () => {
  it("opens, activates and closes tabs choosing the neighbour", () => {
    let s = openIn(openIn(openIn(emptyGroups(), "/a"), "/b"), "/c");
    expect(s.groups[0]).toEqual({ tabs: ["/a", "/b", "/c"], active: "/c" });
    s = activate(s, "/b");
    s = closeIn(s, "/b");
    expect(s.groups[0]!.active).toBe("/c");
    expect(activate(s, "/zzz")).toBe(s);
  });
  it("splits right, and removes a group once it is empty", () => {
    let s = split(openIn(emptyGroups(), "/a"));
    expect(s.groups).toHaveLength(2);
    expect(s.activeGroup).toBe(1);
    s = openIn(s, "/b", 1);
    s = split(s); // already 2 groups: reuses the last
    expect(s.groups).toHaveLength(2);
    s = closeIn(closeIn(s, "/a", 1), "/b", 1);
    expect(s.groups).toHaveLength(1);
    expect(s.activeGroup).toBe(0);
  });
  it("removing the first group keeps focus on the remaining one", () => {
    let s = openIn(split(openIn(emptyGroups(), "/a")), "/b", 1);
    s = closeIn({ ...s, activeGroup: 0 }, "/a", 0);
    expect(s.groups).toEqual([{ tabs: ["/a", "/b"], active: "/b" }]);
    expect(s.activeGroup).toBe(0);
  });
  it("maps renames and deletions across groups", () => {
    let s = openIn(split(openIn(openIn(emptyGroups(), "/d/x"), "/y")), "/d/x", 1);
    s = mapPaths(s, (p) => (p.startsWith("/d/") ? p.replace("/d/", "/e/") : p));
    expect(s.groups.flatMap((g) => g.tabs)).toEqual(["/e/x", "/y", "/y", "/e/x"]);
    s = mapPaths(s, (p) => (p === "/y" ? null : p));
    expect(s.groups.every((g) => g.active === "/e/x")).toBe(true);
  });
  it("normalize clamps and dedupes", () => {
    expect(normalize({ groups: [{ tabs: ["/a", "/a"], active: "/x" }], activeGroup: 5 })).toEqual({
      groups: [{ tabs: ["/a"], active: "/a" }],
      activeGroup: 0,
    });
  });
});
