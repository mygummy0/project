# Architecture

```
apps/web (Next.js App Router: /, /editor/[projectId], /sandbox, CSP headers)
   └─ @webide/ui   WebCodeEditor, IdeSession (orchestrator), Zustand store, React components
        ├─ project-engine   ProjectService, templates, permissions hook, workspace restore
        │    └─ file-engine VirtualFileSystem, search, AutosaveScheduler, zip import/export
        │         └─ storage StorageAdapter (IndexedDB, Memory)   ← future: API/PostgreSQL adapter
        ├─ editor-core      Monaco loader/workers/themes, ModelManager (1 model per file URI), MonacoEditorView
        ├─ language-engine  Monaco built-in language services configuration + capability table
        ├─ runtime-engine   RuntimeAdapter, RuntimeManager (state machine), BrowserPreviewAdapter, JsWorkerAdapter
        ├─ preview-engine   buildPreviewDocument, console bridge, PreviewController, sandbox document
        └─ bundler          sucrase transpile (TS/JSX) + module graph → CommonJS-style registry; npm → ESM CDN
   shared: IdeError, path normalisation, Emitter, language map, types
   interface-only: terminal-engine, collaboration-engine, ai-engine
```

## Engine contracts
| Engine | Responsibility | Public API | Errors | Depends on |
|---|---|---|---|---|
| storage | persistence | `StorageAdapter` (atomic `applyChanges` with version preconditions) | `STORAGE_FAILURE`, `CONFLICT` | shared |
| file-engine | project tree (memory + persisted) | `VirtualFileSystem`, `searchFiles`, `AutosaveScheduler`, zip | `IdeError` codes | storage |
| project-engine | project lifecycle | `ProjectService`, `TEMPLATES`, `ProjectPermissions` | `PERMISSION_DENIED`, `INVALID_ID` | file-engine |
| editor-core | Monaco integration | `loadMonaco`, `ModelManager`, `MonacoEditorView` | load errors shown in UI | language-engine |
| preview-engine | safe live preview | `PreviewController`, `buildPreviewDocument`, `SANDBOX_*` | status `error` + log | shared |
| bundler | TS/JSX/CSS/JSON modules → one script | `bundle`, `bundleToModuleScript`, `cdnUrl` | `errors[]` with path/line | shared, sucrase |
| runtime-engine | run / stop / restart | `RuntimeAdapter`, `RuntimeManager` | status `error` / `timeout`, output | preview-engine |

State: engines own their state and emit typed events; the UI keeps one Zustand store per editor instance.
Cleanup: `IdeSession.dispose()` flushes autosave, stops runtime/preview and disposes all Monaco models.

## Security model
- The preview runs in `/sandbox`, served with `Content-Security-Policy: sandbox allow-scripts …` (no `allow-same-origin`),
  so it has an opaque origin and cannot reach the IDE DOM, cookies or storage (E2E check: `parent.document` throws
  `SecurityError`). Host messages are validated by `event.source` plus a per-build token.
- IDE shell CSP: `default-src 'self'`, `worker-src 'self' blob:`, `object-src 'none'`, `frame-ancestors 'self'`.
- All paths pass `normalizePath` (no traversal); project ids match `[A-Za-z0-9_-]{1,64}`; ZIP import normalises entries and enforces limits.
- A per-project permission hook (`ProjectPermissions`) is enforced in `ProjectService`; the local provider allows everything.
- The script runner executes user code as part of a blob worker's source (no `eval`), so it works under the
  IDE's CSP without `'unsafe-eval'`.
- No API keys exist in the client; AI providers must go through a server route.
- WebContainers (COOP/COEP) are not used, so embedding is not constrained by cross-origin isolation; revisit before adopting them.

## Next phases
Done in Phase 2: bundler (TS/React preview, multi-module TS runner), split editor, project-wide replace.
Remaining Phase 2: CodeMirror 6 mobile fallback, Pyodide worker runtime (must run inside the sandbox origin because the
IDE CSP blocks remote scripts), npm typings acquisition, Prettier, image assets in the preview. Phase 3: accounts + PostgreSQL adapter (`services/api`), LSP gateway, Yjs collaboration,
sandboxed execution workers (CPU/memory/time/network limits), xterm terminal over a WebSocket PTY, opt-in AI panel, Git.
