import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Railway precisa de 0.0.0.0; localhost gera 502 no proxy. */
process.env.HOST = process.env.HOST?.trim() || "0.0.0.0";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(root, "dist", "server", "entry.mjs");
/** 768 MB heap: seguro com Memory 2 GB no Railway; 384 gerava OOM sob carga. */
const child = spawn(process.execPath, ["--max-old-space-size=768", entry], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
