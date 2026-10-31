export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  /** Language hint used by <WebCodeEditor language="..."> to pick a template. */
  language: string;
  /** Path opened first. */
  entry: string;
  /** Whether the Phase 1 runtimes can execute it. */
  runnable: boolean;
  files: { path: string; content: string }[];
}

const webHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Project</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <h1>Hello, Web IDE 👋</h1>
      <p>Edit <code>index.html</code>, <code>style.css</code> or <code>script.js</code> and watch the preview update.</p>
      <button id="counter">Clicked 0 times</button>
    </main>
    <script src="script.js"></script>
  </body>
</html>
`;

const webCss = `:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f4f6f8;
  color: #1f2933;
}

main {
  max-width: 32rem;
  padding: 2rem;
  text-align: center;
}

button {
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 0.5rem;
  background: #3b82f6;
  color: white;
  font-size: 1rem;
  cursor: pointer;
}

button:hover {
  background: #2563eb;
}
`;

const webJs = `const button = document.getElementById("counter");
let count = 0;

button.addEventListener("click", () => {
  count += 1;
  button.textContent = \`Clicked \${count} time\${count === 1 ? "" : "s"}\`;
  console.log("button clicked", { count });
});

console.info("script.js loaded");
`;

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "web",
    name: "HTML / CSS / JavaScript",
    description: "Static web page with live preview.",
    language: "html",
    entry: "/index.html",
    runnable: true,
    files: [
      { path: "/index.html", content: webHtml },
      { path: "/style.css", content: webCss },
      { path: "/script.js", content: webJs },
    ],
  },
  {
    id: "javascript",
    name: "JavaScript script",
    description: "Plain JavaScript executed in an isolated Web Worker.",
    language: "javascript",
    entry: "/main.js",
    runnable: true,
    files: [
      {
        path: "/main.js",
        content: `// Runs in a Web Worker with a time limit. Output appears in the Console panel.
function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) =\`, fib(i));
}
`,
      },
    ],
  },
  {
    id: "typescript",
    name: "TypeScript (editing only)",
    description: "Full TypeScript diagnostics and completion. Execution arrives in a later phase.",
    language: "typescript",
    entry: "/src/index.ts",
    runnable: false,
    files: [
      {
        path: "/src/index.ts",
        content: `interface User {
  id: number;
  name: string;
}

export function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}

console.log(greet({ id: 1, name: "World" }));
`,
      },
      { path: "/README.md", content: "# TypeScript project\n\nType checking and IntelliSense work in the editor.\nRunning TypeScript requires a bundler runtime that is planned for Phase 2.\n" },
    ],
  },
  {
    id: "markdown",
    name: "Markdown notes",
    description: "A folder of Markdown documents.",
    language: "markdown",
    entry: "/README.md",
    runnable: false,
    files: [{ path: "/README.md", content: "# Notes\n\nStart writing here.\n" }],
  },
  {
    id: "blank",
    name: "Blank",
    description: "Empty project.",
    language: "plaintext",
    entry: "",
    runnable: false,
    files: [],
  },
];

export function getTemplate(id: string): ProjectTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Maps the `language` prop of <WebCodeEditor> to a template id. */
export function templateForLanguage(language: string | undefined): string {
  const hit = TEMPLATES.find((t) => t.language === language);
  return hit?.id ?? "web";
}
