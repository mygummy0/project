/** Pure state transitions for editor groups (split editor). At most MAX_GROUPS side by side. */
export interface EditorGroup {
  tabs: string[];
  active: string | null;
}

export interface GroupsState {
  groups: EditorGroup[];
  activeGroup: number;
}

export const MAX_GROUPS = 2;

export const emptyGroups = (): GroupsState => ({ groups: [{ tabs: [], active: null }], activeGroup: 0 });

/** Drops empty groups (keeping at least one), fixes dangling active tabs and clamps the focus. */
export function normalize(s: GroupsState): GroupsState {
  let groups = s.groups.map((g) => ({
    tabs: [...new Set(g.tabs)],
    active: g.active && g.tabs.includes(g.active) ? g.active : (g.tabs[0] ?? null),
  }));
  let activeGroup = s.activeGroup;
  if (groups.length > 1) {
    const kept = groups.filter((g) => g.tabs.length > 0);
    const focused = groups[activeGroup];
    groups = kept.length ? kept : [{ tabs: [], active: null }];
    activeGroup = focused && kept.includes(focused) ? kept.indexOf(focused) : Math.min(activeGroup, groups.length - 1);
  }
  groups = groups.slice(0, MAX_GROUPS);
  return { groups, activeGroup: Math.max(0, Math.min(activeGroup, groups.length - 1)) };
}

export function openIn(s: GroupsState, path: string, group = s.activeGroup): GroupsState {
  const groups = s.groups.map((g, i) =>
    i === group ? { tabs: g.tabs.includes(path) ? g.tabs : [...g.tabs, path], active: path } : g,
  );
  return normalize({ groups, activeGroup: group });
}

export function activate(s: GroupsState, path: string, group = s.activeGroup): GroupsState {
  if (!s.groups[group]?.tabs.includes(path)) return s;
  return normalize({ groups: s.groups.map((g, i) => (i === group ? { ...g, active: path } : g)), activeGroup: group });
}

export function closeIn(s: GroupsState, path: string, group = s.activeGroup): GroupsState {
  const groups = s.groups.map((g, i) => {
    if (i !== group) return g;
    const idx = g.tabs.indexOf(path);
    if (idx < 0) return g;
    const tabs = g.tabs.filter((p) => p !== path);
    return { tabs, active: g.active === path ? (tabs[Math.min(idx, tabs.length - 1)] ?? null) : g.active };
  });
  return normalize({ groups, activeGroup: s.activeGroup });
}

/** Applies a rename (fn returns new path) or deletion (fn returns null) to every group. */
export function mapPaths(s: GroupsState, fn: (p: string) => string | null): GroupsState {
  const groups = s.groups.map((g) => {
    const tabs = g.tabs.map(fn).filter((p): p is string => p !== null);
    const active = g.active ? fn(g.active) : null;
    return { tabs, active: active ?? tabs[0] ?? null };
  });
  return normalize({ groups, activeGroup: s.activeGroup });
}

/** "Split Right": opens the focused file in a new group to the right. */
export function split(s: GroupsState): GroupsState {
  const cur = s.groups[s.activeGroup];
  if (!cur?.active) return s;
  if (s.groups.length >= MAX_GROUPS) return openIn(s, cur.active, s.groups.length - 1);
  return normalize({ groups: [...s.groups, { tabs: [cur.active], active: cur.active }], activeGroup: s.groups.length });
}

export function allPaths(s: GroupsState): string[] {
  return [...new Set(s.groups.flatMap((g) => g.tabs))];
}
