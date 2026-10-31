import { bundle } from "@webide/bundler";
import type { CanRun, RuntimeAdapter, RuntimeContext, RuntimeHandle, RuntimeResult, RuntimeSink } from "./types";

/**
 * Prelude placed before the user's bundled code in the worker script. The code
 * is part of the worker source itself (no eval), so it works under a CSP
 * without 'unsafe-eval'. Pending timers are tracked so "finished" is only
 * reported once queued callbacks have run.
 */
const WORKER_PRELUDE = `
"use strict";
function __fmt(v){
  if(typeof v==="string")return v;
  if(v instanceof Error)return v.stack||String(v);
  if(typeof v==="function")return "[Function "+(v.name||"anonymous")+"]";
  try{var seen=[];var s=JSON.stringify(v,function(k,x){
    if(typeof x==="object"&&x!==null){if(seen.indexOf(x)>-1)return "[Circular]";seen.push(x);}
    return typeof x==="bigint"?String(x)+"n":x;},2);
    return s===undefined?String(v):s;}catch(e){return String(v);}
}
["log","info","warn","error","debug"].forEach(function(l){
  console[l]=function(){postMessage({t:"c",level:l,text:Array.prototype.slice.call(arguments).map(__fmt).join(" ")});};
});
var __finished=false,__timers=new Set(),__done=false;
function __check(){ if(__finished&&!__done&&__timers.size===0){ __done=true; postMessage({t:"done"}); } }
function __later(){ Promise.resolve().then(function(){ return Promise.resolve(); }).then(__check); }
var __st=self.setTimeout,__ct=self.clearTimeout,__si=self.setInterval,__ci=self.clearInterval;
self.setTimeout=function(fn,ms){
  var args=Array.prototype.slice.call(arguments,2);
  var id=__st(function(){ __timers.delete(id); try{ if(typeof fn==="function")fn.apply(self,args); } finally { __later(); } },ms);
  __timers.add(id); return id;
};
self.clearTimeout=function(id){ __ct(id); if(__timers.delete(id))__later(); };
self.setInterval=function(){ var id=__si.apply(self,arguments); __timers.add(id); return id; };
self.clearInterval=function(id){ __ci(id); if(__timers.delete(id))__later(); };
self.addEventListener("unhandledrejection",function(e){ postMessage({t:"err",message:"Unhandled promise rejection: "+__fmt(e.reason)}); });
`;

/**
 * Runs a plain JavaScript file in a dedicated Web Worker: no DOM access, and a
 * runaway loop is ended by terminating the worker when the time limit hits.
 */
export class JsWorkerAdapter implements RuntimeAdapter {
  readonly id = "js-worker";
  readonly label = "Script runner (Web Worker)";

  canRun(ctx: RuntimeContext): CanRun {
    const target = this.target(ctx);
    return target ? { ok: true } : { ok: false, reason: "open or create a .js or .ts file to run it" };
  }

  private target(ctx: RuntimeContext): string | null {
    const files = ctx.getFiles();
    const isScript = (p: string) => /\.(m?js|ts|tsx)$/i.test(p) && files.has(p);
    if (ctx.activePath && isScript(ctx.activePath)) return ctx.activePath;
    for (const c of ["/main.js", "/index.js", "/main.ts", "/index.ts", "/src/main.ts", "/src/index.ts"]) if (files.has(c)) return c;
    return null;
  }

  run(ctx: RuntimeContext, sink: RuntimeSink): RuntimeHandle {
    const path = this.target(ctx)!;
    // TS is transpiled and local imports are bundled; npm imports are not available in the worker
    // because it runs under the IDE's CSP (no remote scripts).
    const b = bundle({ entry: path, files: ctx.getFiles(), cdn: null });
    if (b.errors.length) {
      for (const e of b.errors) {
        sink.write({ level: "error", text: `${e.path}${e.line ? `:${e.line}:${e.column ?? 0}` : ""} ${e.message}`, source: "error" });
      }
      return { done: Promise.resolve({ status: "error", message: "Build failed" }), stop() {} };
    }
    const code = b.code;
    sink.write({ level: "system", text: `Running ${path}`, source: "runtime" });

    const source = `${WORKER_PRELUDE}
try {
${code}
} catch (e) { postMessage({ t: "err", message: (e && e.stack) || String(e) }); }
__finished = true; __later();
//# sourceURL=webide-run${path}`;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    let settled = false;
    let finish!: (r: RuntimeResult) => void;
    const done = new Promise<RuntimeResult>((resolve) => (finish = resolve));

    const end = (r: RuntimeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      finish(r);
    };
    const timer = setTimeout(
      () => end({ status: "timeout", message: `Stopped: exceeded ${ctx.timeoutMs} ms time limit` }),
      ctx.timeoutMs,
    );

    worker.onmessage = (e: MessageEvent) => {
      const d = e.data as { t: string; level?: "log"; text?: string; message?: string };
      if (d.t === "c") sink.write({ level: d.level ?? "log", text: d.text ?? "", source: "console" });
      else if (d.t === "done") end({ status: "completed" });
      else if (d.t === "err") {
        sink.write({ level: "error", text: d.message ?? "Error", source: "error" });
        end({ status: "error", message: "Uncaught error" });
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      sink.write({
        level: "error",
        text: e.message || "Worker error",
        source: "error",
        location: e.lineno ? { path, line: e.lineno, column: e.colno } : undefined,
      });
      end({ status: "error", message: "Uncaught error" });
    };

    return { done, stop: () => end({ status: "stopped" }) };
  }
}
