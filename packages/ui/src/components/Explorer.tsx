"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { basename, dirname, isInside, type FileRecord } from "@webide/shared";
import { useIde, useSession } from "../context";
import { IconChevron, IconFile, IconFolder, IconFolderOpen, IconFolderPlus, IconPlus } from "../icons";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";

interface Node {
  path: string;
  name: string;
  kind: "file" | "dir";
  children: Node[];
}

function buildTree(files: FileRecord[]): Node[] {
  const byPath = new Map<string, Node>();
  const roots: Node[] = [];
  for (const f of files) byPath.set(f.path, { path: f.path, name: basename(f.path), kind: f.kind, children: [] });
  for (const node of byPath.values()) {
    const parent = byPath.get(dirname(node.path));
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: Node[]) => {
    list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function NameInput({ initial, onCommit, onCancel }: { initial: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = ref.current?.value.trim() ?? "";
    if (commit && v) onCommit(v);
    else onCancel();
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      spellCheck={false}
      className="min-w-0 flex-1 rounded border border-ide-accent bg-ide-panel-2 px-1 py-0 text-[13px] outline-none"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}

export function Explorer() {
  const session = useSession();
  const files = useIde((s) => s.files);
  const activePath = useIde((s) => s.activePath);
  const dirty = useIde((s) => s.dirty);
  const creating = useIde((s) => s.creating);
  const readOnly = useIde((s) => s.readOnly);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [ctx, setCtx] = useState<ContextMenuState | null>(null);

  const tree = useMemo(() => buildTree(files), [files]);
  const kindOf = (p: string | null) => files.find((f) => f.path === p)?.kind;
  const targetDir = (): string => {
    if (!selected) return "/";
    return kindOf(selected) === "dir" ? selected : dirname(selected);
  };

  const toggle = (p: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const confirmDelete = (node: Node) => {
    const what = node.kind === "dir" ? `folder "${node.name}" and everything in it` : `"${node.name}"`;
    if (window.confirm(`Delete ${what}?`)) void session.remove(node.path);
  };

  const move = (from: string, toDir: string) => {
    const dest = (toDir === "/" ? "" : toDir) + "/" + basename(from);
    if (dest !== from && !isInside(from, toDir)) void session.rename(from, dest);
  };

  const creationRow = (dir: string, depth: number) =>
    creating && creating.dir === dir ? (
      <div key="__creating" className="flex items-center gap-1 py-0.5 pr-2" style={{ paddingLeft: 8 + depth * 14 + 16 }}>
        {creating.kind === "folder" ? <IconFolder /> : <IconFile />}
        <NameInput
          initial=""
          onCancel={() => session.endCreate()}
          onCommit={(name) => {
            session.endCreate();
            const full = (dir === "/" ? "" : dir) + "/" + name;
            void (creating.kind === "folder" ? session.createFolder(full) : session.createFile(full));
          }}
        />
      </div>
    ) : null;

  const renderNodes = (nodes: Node[], depth: number) =>
    nodes.map((node) => {
      const isDir = node.kind === "dir";
      const open = isDir && !collapsed.has(node.path);
      const isSel = selected === node.path;
      return (
        <div key={node.path}>
          <div
            role="treeitem"
            aria-expanded={isDir ? open : undefined}
            aria-selected={isSel}
            tabIndex={0}
            draggable={!readOnly && renaming !== node.path}
            data-testid={`tree-${node.path}`}
            className={`group flex cursor-pointer items-center gap-1 h-[22px] pr-1 text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-ide-accent ${
              dropTarget === node.path ? "bg-ide-active" : activePath === node.path || isSel ? "bg-ide-active" : "hover:bg-ide-hover"
            }`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => {
              setSelected(node.path);
              if (isDir) toggle(node.path);
              else session.openFile(node.path);
            }}
            onKeyDown={(e) => {
              if (renaming) return;
              if (e.key === "Enter") isDir ? toggle(node.path) : session.openFile(node.path);
              else if (e.key === "F2" && !readOnly) setRenaming(node.path);
              else if (e.key === "Delete" && !readOnly) confirmDelete(node);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelected(node.path);
              const dir = isDir ? node.path : dirname(node.path);
              setCtx({
                x: e.clientX,
                y: e.clientY,
                items: [
                  { label: "New File…", disabled: readOnly, onSelect: () => session.beginCreate("file", dir) },
                  { label: "New Folder…", disabled: readOnly, onSelect: () => session.beginCreate("folder", dir) },
                  { label: "", separator: true },
                  { label: "Rename", shortcut: "F2", disabled: readOnly, onSelect: () => setRenaming(node.path) },
                  { label: "Delete", shortcut: "Del", disabled: readOnly, onSelect: () => confirmDelete(node) },
                  { label: "", separator: true },
                  { label: "Copy Path", onSelect: () => void navigator.clipboard?.writeText(node.path) },
                ],
              });
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/webide-path", node.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!isDir) return;
              e.preventDefault();
              setDropTarget(node.path);
            }}
            onDragLeave={() => setDropTarget((t) => (t === node.path ? null : t))}
            onDrop={(e) => {
              if (!isDir) return;
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(null);
              const from = e.dataTransfer.getData("text/webide-path");
              if (from) move(from, node.path);
            }}
          >
            <span className="flex w-4 justify-center text-ide-muted">{isDir ? <IconChevron open={open} /> : null}</span>
            <span className="text-ide-muted">{isDir ? open ? <IconFolderOpen /> : <IconFolder /> : <IconFile />}</span>
            {renaming === node.path ? (
              <NameInput
                initial={node.name}
                onCancel={() => setRenaming(null)}
                onCommit={(name) => {
                  setRenaming(null);
                  if (name !== node.name) void session.rename(node.path, (dirname(node.path) === "/" ? "" : dirname(node.path)) + "/" + name);
                }}
              />
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
                {dirty[node.path] && <span className="h-2 w-2 shrink-0 rounded-full bg-ide-warn" title="Unsaved changes" />}
              </>
            )}
          </div>
          {isDir && open && (
            <>
              {creationRow(node.path, depth + 1)}
              {renderNodes(node.children, depth + 1)}
            </>
          )}
        </div>
      );
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[35px] shrink-0 items-center justify-between pl-5 pr-2 text-[11px] uppercase text-ide-muted">
        <span>Explorer</span>
        {!readOnly && (
          <span className="flex gap-0.5">
            <button className="rounded-[3px] p-1 hover:bg-ide-hover hover:text-ide-text" title="New File" aria-label="New file" onClick={() => session.beginCreate("file", targetDir())}><IconPlus /></button>
            <button className="rounded-[3px] p-1 hover:bg-ide-hover hover:text-ide-text" title="New Folder" aria-label="New folder" onClick={() => session.beginCreate("folder", targetDir())}><IconFolderPlus /></button>
          </span>
        )}
      </div>
      <div
        role="tree"
        className={`min-h-0 flex-1 overflow-auto pb-4 ${dropTarget === "/" ? "bg-ide-active/40" : ""}`}
        onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({
            x: e.clientX,
            y: e.clientY,
            items: [
              { label: "New File…", disabled: readOnly, onSelect: () => session.beginCreate("file", "/") },
              { label: "New Folder…", disabled: readOnly, onSelect: () => session.beginCreate("folder", "/") },
            ],
          });
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDropTarget((t) => t ?? "/");
        }}
        onDragLeave={(e) => e.currentTarget === e.target && setDropTarget(null)}
        onDrop={(e) => {
          e.preventDefault();
          setDropTarget(null);
          const from = e.dataTransfer.getData("text/webide-path");
          if (from) move(from, "/");
        }}
      >
        {creationRow("/", 0)}
        {renderNodes(tree, 0)}
        {tree.length === 0 && !creating && <p className="px-5 py-2 text-xs text-ide-muted">No files.</p>}
      </div>
      {ctx && <ContextMenu menu={ctx} onClose={() => setCtx(null)} />}
    </div>
  );
}
