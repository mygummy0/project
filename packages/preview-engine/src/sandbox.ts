/**
 * Dedicated sandbox document for the preview iframe.
 *
 * Why not plain `srcdoc`? A srcdoc document inherits the CSP of the IDE page,
 * so a strict IDE policy would also break the user's own pages (CDN scripts,
 * fetch). Serving this document from its own route lets the IDE keep a strict
 * CSP while the preview gets a permissive one. Because the response carries a
 * `Content-Security-Policy: sandbox …` header (no allow-same-origin), the
 * document always has an opaque origin: it cannot touch the IDE's DOM,
 * cookies, localStorage or IndexedDB, even if opened directly in a tab.
 *
 * Protocol: the parent loads `<route>?t=<token>`; the page announces itself
 * with {__webide_frame: token}; the parent answers with
 * {__webide_render: token, html}; the page replaces itself with that HTML.
 */
export const SANDBOX_FRAME_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview sandbox</title>
<script>
(function(){
  var t = new URLSearchParams(location.search).get("t") || "";
  function onMsg(e){
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || d.__webide_render !== t || typeof d.html !== "string") return;
    removeEventListener("message", onMsg);
    try { document.open(); document.write(d.html); document.close(); } catch (err) { /* reported by the injected bridge */ }
  }
  addEventListener("message", onMsg);
  parent.postMessage({ __webide_frame: t }, "*");
})();
</script></head><body></body></html>`;

export const SANDBOX_FLAGS = "allow-scripts allow-modals allow-forms allow-popups";

/** Response headers for the sandbox route. */
export const SANDBOX_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": `sandbox ${SANDBOX_FLAGS}; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self'`,
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
