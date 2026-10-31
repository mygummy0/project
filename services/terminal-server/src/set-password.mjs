#!/usr/bin/env node
// Sets the terminal password: prompts (hidden), then writes TERMINAL_PASSWORD_HASH (and a random
// TERMINAL_SECRET if missing) into the env file. The password itself is never stored.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { hashPassword } from "./auth.mjs";

const file = process.argv[2] ?? "/etc/webide/terminal.env";

function ask(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (ch) => {
      for (const c of ch) {
        if (c === "\u0003") process.exit(130);
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(buf);
        }
        if (c === "\u007f") buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on("data", onData);
  });
}

const pw = await ask("New terminal password (min 12 chars): ");
if (pw.length < 12) {
  console.error("Too short. Use at least 12 characters (a long passphrase is best).");
  process.exit(1);
}
if (pw !== (await ask("Repeat password: "))) {
  console.error("Passwords do not match.");
  process.exit(1);
}

const vars = new Map();
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#")) vars.set(line.slice(0, i), line.slice(i + 1));
  }
}
vars.set("TERMINAL_PASSWORD_HASH", hashPassword(pw));
if (!vars.get("TERMINAL_SECRET") || vars.get("TERMINAL_SECRET").length < 32) vars.set("TERMINAL_SECRET", randomBytes(32).toString("hex"));
// Changing the password rotates the secret so every existing login cookie is invalidated.
vars.set("TERMINAL_SECRET", randomBytes(32).toString("hex"));
writeFileSync(file, [...vars].map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
chmodSync(file, 0o600);
console.log(`Saved to ${file}. Restart the service: sudo systemctl restart webide-terminal`);
