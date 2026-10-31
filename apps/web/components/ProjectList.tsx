"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IndexedDBStorageAdapter } from "@webide/storage";
import { ProjectService, TEMPLATES } from "@webide/project-engine";
import type { ProjectMeta } from "@webide/shared";

export function ProjectList() {
  const [svc, setSvc] = useState<ProjectService | null>(null);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("web");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (s: ProjectService) => setProjects(await s.listProjects()), []);

  useEffect(() => {
    const storage = new IndexedDBStorageAdapter();
    storage
      .init()
      .then(async () => {
        const s = new ProjectService(storage);
        setSvc(s);
        await refresh(s);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [refresh]);

  const create = async () => {
    if (!svc) return;
    try {
      const p = await svc.createProject({ name: name || "Untitled project", templateId: template });
      window.location.href = `/editor/${encodeURIComponent(p.id)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const field = "h-7 rounded-[3px] border border-[#2b2b2b] bg-[#1f1f1f] px-2 text-[13px] text-[#ccc] outline-none focus:border-[#007acc]";
  return (
    <div className="min-h-screen bg-[#181818] p-6 text-[13px] text-[#ccc]">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-baseline justify-between border-b border-[#2b2b2b] pb-2">
          <h1 className="text-[13px] font-semibold">Projects</h1>
          <Link href="/editor/demo-project" className="text-[#3794ff] hover:underline">demo-project</Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-label="Project name" className={`${field} min-w-40 flex-1`} onKeyDown={(e) => e.key === "Enter" && void create()} />
          <select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Template" className={field}>
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button onClick={() => void create()} disabled={!svc} className="h-7 rounded-[3px] bg-[#007acc] px-3 text-white hover:bg-[#0b8ad8] disabled:opacity-50">
            New
          </button>
        </div>

        {error && <p role="alert" className="mt-3 text-[#f85149]">{error}</p>}

        <ul className="mt-3">
          {projects.length === 0 && <li className="py-2 text-[#969696]">No projects.</li>}
          {projects.map((p) => (
            <li key={p.id} className="group flex h-7 items-center justify-between gap-3 px-2 hover:bg-[#2a2d2e]">
              <Link href={`/editor/${encodeURIComponent(p.id)}`} className="min-w-0 flex-1 truncate">
                {p.name} <span className="ml-2 text-[#969696]">{p.templateId} · {new Date(p.updatedAt).toLocaleDateString()}</span>
              </Link>
              <button
                className="hidden text-[#969696] hover:text-[#f85149] group-hover:block"
                onClick={async () => {
                  if (svc && window.confirm(`Delete project "${p.name}"? This cannot be undone.`)) {
                    await svc.deleteProject(p.id);
                    await refresh(svc);
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
