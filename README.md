# Web IDE

Modular, embeddable browser IDE (Phase 1 – Editor MVP). Monaco editor, IndexedDB virtual file system,
sandboxed live preview, Web Worker JavaScript runner. UI follows VS Code "Dark Modern".

## Run

```bash
npm install
npm run dev          # http://localhost:3000  (/: project list, /editor/<projectId>: IDE)
npm test             # 38 unit tests (engines)
npm run typecheck
npm run build && npm start
```
Requires Node 20+.

## Embed

```tsx
import { WebCodeEditor } from "@webide/ui";

<div style={{ height: "100vh" }}>
  <WebCodeEditor projectId="demo-project" theme="dark" language="html"
    showExplorer showTerminal showPreview previewSandboxUrl="/sandbox" />
</div>
```
- `previewSandboxUrl`: route serving the isolated preview document. In Next.js:
  `export const GET = () => new Response(SANDBOX_FRAME_HTML, { headers: SANDBOX_HEADERS })`
  (see `apps/web/app/sandbox/route.ts`). Without it the preview falls back to `srcdoc`, which inherits the host page's CSP.
- `showTerminal` toggles the bottom panel (Console / Problems / Output). A real xterm terminal belongs to Phase 3.
- `language` only picks the starter template for a project that does not exist yet.
- Load it client-side in Next.js (`dynamic(..., { ssr: false })`), see `apps/web/components/IdeClient.tsx`.

## Features (Phase 1, all functional)
Explorer (create / rename / drag-to-move / delete, inline editing, context menu), tabs (dirty marker, close, context menu),
Monaco with one model per file (undo, cursor and scroll kept across tab switches), find/replace, format, minimap, folding,
autosave to IndexedDB with retry, local recovery and cross-tab conflict detection, project search (case/word/regex),
Problems panel from real TS/JS/JSON/CSS/HTML diagnostics, live HTML/CSS/JS preview (desktop/tablet/mobile),
Run/Stop/Restart, Web Worker JS runner with time limit, ZIP import/export, dark/light themes,
resizable and collapsible panels, settings (UI scale, editor font size), shortcuts, workspace restore, responsive mobile layout.

Shortcuts: Ctrl+S save · Ctrl+Enter run · Ctrl+B sidebar · Ctrl+J panel · Ctrl+Shift+E / F explorer / search ·
Ctrl+, settings · Alt+W close tab · F2 rename · Del delete · F1 command palette.

## Layout
See `docs/architecture.md`. Packages: `shared`, `storage`, `file-engine`, `project-engine`, `editor-core`, `language-engine`,
`runtime-engine`, `preview-engine`, `ui` (embeddable component), plus interface-only `terminal-engine`,
`collaboration-engine`, `ai-engine`. `services/*` are intentionally not created until a real need exists.

## Known limitations
- Text files only (ZIP import skips binaries). ES-module imports between preview files and local images are not resolved.
- TypeScript is edit-only (diagnostics, completion); it cannot be executed yet. C/C++/Rust/Go/Python need later runtimes.
- Mobile uses Monaco (CodeMirror 6 fallback not implemented). Split editor, project-wide replace, terminal,
  collaboration, AI and accounts/cloud storage are not implemented.
- The preview runs without `allow-same-origin`, so user code cannot use localStorage/IndexedDB/cookies.
- Models are created for every file ≤ 1 MB at load (enables cross-file IntelliSense); very large projects need lazy loading.
- UI scale uses CSS `zoom`.
