import { SANDBOX_FRAME_HTML, SANDBOX_HEADERS } from "@webide/preview-engine";

// Serves the isolated preview document with its own CSP (see packages/preview-engine/src/sandbox.ts).
export const dynamic = "force-static";

export function GET() {
  return new Response(SANDBOX_FRAME_HTML, { headers: SANDBOX_HEADERS });
}
