import type { CanRun, RuntimeAdapter, RuntimeContext, RuntimeHandle, RuntimeResult, RuntimeSink } from "./types";

const WORKER_SOURCE = `
"use strict";
function fmt(v){
  if(typeof v==="string")return v;
  if(v instanceof Error)return v.stack||String(v);
  if(typeof v==="function")return "[Function "+(v.name||"anonymous")+"]";
  try{var seen=[];var s=JSON.stringify(v,function(k,x){
    if(typeof x==="object"&&x!==null){if(seen.indexOf(x)>-1)return "[Circular]";seen.push(x);}
    return typeof x==="bigint"?String(x)+"n":x;},2);
    return s===undefined?String(v):s;}catch(e){return String(v);}
}
["log","info","warn","error","debug"].forEach(function(l){
  console[l]=function(){postMessage({t:"c",level:l,text:Array.prototype.slice.call(arguments).map(fmt).join(" ")});};
});
self.onmessage=function(e){
  var code=e.data.code;
  Promise.resolve().then(function(){return (0,eval)(code);}).then(function(){
    postMessage({t:"done"});
  },function(err){
    postMessage({t:"err",message:(err&&err.stack)||String(err)});
  });
};
`;

/**
 * Runs a plain JavaScript file in a dedicated Web Worker: no DOM access, and a
 * runaway loop is ended by terminating the worker when the time limit hits.
 */
export class JsWorkerAdapter implements RuntimeAdapter {
  readonly id = "js-worker";
  readonly label = "JavaScript (Web Worker)";

  canRun(ctx: RuntimeContext): CanRun {
    const target = this.target(ctx);
    return target ? { ok: true } : { ok: false, reason: "open or create a .js file to run it" };
  }

  private target(ctx: RuntimeContext): string | null {
    const files = ctx.getFiles();
    const isJs = (p: string) => /\.(m?js)$/i.test(p) && files.has(p);
    if (ctx.activePath && isJs(ctx.activePath)) return ctx.activePath;
    for (const c of ["/main.js", "/index.js"]) if (files.has(c)) return c;
    return null;
  }

  run(ctx: RuntimeContext, sink: RuntimeSink): RuntimeHandle {
    const path = this.target(ctx)!;
    const code = ctx.getFiles().get(path)!;
    sink.write({ level: "system", text: `Running ${path}`, source: "runtime" });

    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
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
    worker.postMessage({ code: `${code}\n//# sourceURL=${path}` });

    return { done, stop: () => end({ status: "stopped" }) };
  }
}
