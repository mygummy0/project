# Web IDE

Modular, embeddable browser IDE. Monaco editor, IndexedDB virtual file system, sandboxed live preview with an
in-browser TS/JSX bundler (React apps with npm packages via esm.sh), Web Worker script runner, split editor.
UI follows VS Code "Dark Modern".

## Run

```bash
npm install
npm run dev          # http://localhost:3000  (/: project list, /editor/<projectId>: IDE)
npm test             # unit tests (engines, bundler, editor groups)
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

## Deploy (open it from any browser by URL)
The app is a standard Next.js app with no server-side state (projects live in each visitor's browser),
so any Next.js host works. With Vercel:
1. Sign in at vercel.com with GitHub → **Add New… → Project** → import this repository.
2. Set **Root Directory** to `apps/web` (framework: Next.js; install/build commands: defaults).
3. Deploy → the site is available at `https://<project>.vercel.app` (`/editor/demo-project` opens the IDE).

Self-hosting: `npm install && npm run build && npm start` (port 3000) behind any reverse proxy.
Note: projects are stored per browser (IndexedDB); cloud sync/accounts are Phase 3.

## Features
Explorer (create / rename / drag-to-move / delete, inline editing, context menu), tabs (dirty marker, close, context menu),
Monaco with one model per file (undo, cursor and scroll kept across tab switches), find/replace, format, minimap, folding,
autosave to IndexedDB with retry, local recovery and cross-tab conflict detection, project search (case/word/regex),
Problems panel from real TS/JS/JSON/CSS/HTML diagnostics, live HTML/CSS/JS preview (desktop/tablet/mobile),
Run/Stop/Restart, Web Worker JS runner with time limit, ZIP import/export, dark/light themes,
**Phase 2:** module bundler (TS/TSX/JSX via sucrase, relative imports, CSS/JSON imports, npm packages from esm.sh
pinned by `/package.json`, in-page build error overlay), React + TypeScript template, multi-module TypeScript
script runner, split editor (two groups, per-group tabs and cursor/scroll state, draggable divider),
project-wide replace (plain/regex with `$1`, undoable per file),
resizable and collapsible panels, settings (UI scale, editor font size), shortcuts, workspace restore, responsive mobile layout.

Shortcuts: Ctrl+S save · Ctrl+Enter run · Ctrl+B sidebar · Ctrl+J panel · Ctrl+Shift+E / F explorer / search ·
Ctrl+, settings · Ctrl+\\ split editor · Ctrl+1/2 focus group · Alt+W close tab · F2 rename · Del delete ·
F1 command palette.

## Layout
See `docs/architecture.md`. Packages: `shared`, `storage`, `file-engine`, `project-engine`, `editor-core`, `language-engine`,
`runtime-engine`, `preview-engine`, `bundler`, `ui` (embeddable component), plus interface-only `terminal-engine`,
`collaboration-engine`, `ai-engine`. `services/*` are intentionally not created until a real need exists.

## Known limitations
- Text files only (ZIP import skips binaries); local images are not resolved in the preview.
- npm imports need network access to esm.sh from the visitor's browser and work in the preview only (the script
  runner runs under the IDE CSP). npm packages are typed as `any` (no typings download yet), so `noImplicitAny` is off.
- Run executes the active script file (or main/index); for HTML projects it starts the preview.
- Python, C/C++, Rust, Go need later runtimes. Mobile uses Monaco (CodeMirror 6 fallback not implemented).
  Terminal, collaboration, AI and accounts/cloud storage are not implemented.
- The preview runs without `allow-same-origin`, so user code cannot use localStorage/IndexedDB/cookies.
- Models are created for every file ≤ 1 MB at load (enables cross-file IntelliSense); very large projects need lazy loading.
- UI scale uses CSS `zoom`.
