import type * as Monaco from "monaco-editor";

export type MonacoApi = typeof Monaco;

/** Capabilities per language, so the UI can state honestly what is supported. */
export interface LanguageSupport {
  id: string;
  label: string;
  /** "language-service" = real analysis (diagnostics, completion, hover, definitions) running in a worker. */
  intelligence: "language-service" | "syntax-only";
  formatting: boolean;
  diagnostics: boolean;
}

export const LANGUAGE_SUPPORT: LanguageSupport[] = [
  { id: "typescript", label: "TypeScript", intelligence: "language-service", formatting: true, diagnostics: true },
  { id: "javascript", label: "JavaScript", intelligence: "language-service", formatting: true, diagnostics: true },
  { id: "html", label: "HTML", intelligence: "language-service", formatting: true, diagnostics: true },
  { id: "css", label: "CSS", intelligence: "language-service", formatting: true, diagnostics: true },
  { id: "json", label: "JSON", intelligence: "language-service", formatting: true, diagnostics: true },
  { id: "markdown", label: "Markdown", intelligence: "syntax-only", formatting: false, diagnostics: false },
];

let configured = false;

/**
 * Configures Monaco's built-in (in-browser) language services once. Remote
 * language servers would plug in later through services/lsp-gateway.
 */
export function configureMonacoLanguages(monaco: MonacoApi): void {
  if (configured) return;
  configured = true;
  const ts = monaco.typescript;

  const compilerOptions: Monaco.typescript.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.Preserve,
    esModuleInterop: true,
    strict: true,
    noEmit: true,
    lib: ["es2020", "dom", "dom.iterable"],
  };
  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  // Models for every project file are created up-front so cross-file imports resolve.
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.javascriptDefaults.setEagerModelSync(true);
  const diagnostics = { noSemanticValidation: false, noSyntaxValidation: false };
  ts.typescriptDefaults.setDiagnosticsOptions(diagnostics);
  ts.javascriptDefaults.setDiagnosticsOptions(diagnostics);

  monaco.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    enableSchemaRequest: false, // never fetch remote schemas on behalf of user files
  });
}
