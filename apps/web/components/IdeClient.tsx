"use client";

import dynamic from "next/dynamic";
import type { WebCodeEditorProps } from "@webide/ui";

// The IDE touches IndexedDB, Workers and Monaco, so it is client-only.
const WebCodeEditor = dynamic(() => import("@webide/ui").then((m) => m.WebCodeEditor), {
  ssr: false,
  loading: () => <div style={{ color: "#8591a3", padding: 24, font: "14px system-ui" }}>Loading editor…</div>,
});

export function IdeClient(props: WebCodeEditorProps) {
  // Set NEXT_PUBLIC_TERMINAL_URL (e.g. "/terminal") at build time to enable the Terminal tab.
  return <WebCodeEditor previewSandboxUrl="/sandbox" terminalUrl={process.env.NEXT_PUBLIC_TERMINAL_URL || undefined} {...props} />;
}
