import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP for the IDE shell. The user's preview code never runs under this policy:
 * it lives in /sandbox, which sends its own policy (see preview-engine/sandbox.ts).
 * 'unsafe-inline' is required by Next.js inline bootstrap scripts without a nonce setup;
 * Monaco workers are bundled (worker-src 'self' blob:).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@webide/ui",
    "@webide/shared",
    "@webide/storage",
    "@webide/file-engine",
    "@webide/project-engine",
    "@webide/editor-core",
    "@webide/language-engine",
    "@webide/runtime-engine",
    "@webide/preview-engine",
    "@webide/bundler",
  ],
  async headers() {
    return [
      {
        // Everything except the sandbox route, which sets its own headers.
        source: "/((?!sandbox).*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
