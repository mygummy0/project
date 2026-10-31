/**
 * Script injected into the sandboxed preview document. It forwards console
 * output and runtime errors to the parent window via postMessage. The token
 * lets the host ignore messages that did not originate from this build.
 */
export function createBridgeScript(token: string): string {
  return `(function(){
var T=${JSON.stringify(token)};
function send(m){m.__webide=T;try{parent.postMessage(m,"*");}catch(e){}}
function fmt(v,d){
  if(typeof v==="string")return v;
  if(v instanceof Error)return v.stack||String(v);
  if(typeof v==="function")return "[Function "+(v.name||"anonymous")+"]";
  if(typeof v==="symbol"||typeof v==="undefined"||typeof v==="bigint")return String(v);
  try{var seen=[];var s=JSON.stringify(v,function(k,x){
    if(typeof x==="object"&&x!==null){if(seen.indexOf(x)>-1)return "[Circular]";seen.push(x);}
    if(typeof x==="function")return "[Function]";
    return x;},2);
    return s===undefined?String(v):(s.length>4000?s.slice(0,4000)+"…":s);
  }catch(e){return String(v);}
}
["log","info","warn","error","debug"].forEach(function(level){
  var orig=console[level];
  console[level]=function(){
    var args=Array.prototype.slice.call(arguments);
    send({type:"console",level:level,text:args.map(fmt).join(" ")});
    try{orig&&orig.apply(console,args);}catch(e){}
  };
});
window.addEventListener("error",function(e){
  send({type:"error",message:e.message||"Script error",source:e.filename||"",line:e.lineno||0,column:e.colno||0});
});
window.addEventListener("unhandledrejection",function(e){
  send({type:"error",message:"Unhandled promise rejection: "+fmt(e.reason),source:"",line:0,column:0});
});
window.addEventListener("load",function(){send({type:"ready"});});
})();`;
}

export type BridgeMessage =
  | { __webide: string; type: "console"; level: "log" | "info" | "warn" | "error" | "debug"; text: string }
  | { __webide: string; type: "error"; message: string; source: string; line: number; column: number }
  | { __webide: string; type: "ready" };
