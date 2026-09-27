import { spawn } from "node:child_process";
import { resolve } from "node:path";

const cwd = process.cwd();
const next = spawn(resolve(cwd, "node_modules/.bin/next"), ["dev"], {
  cwd, env: process.env, stdio: ["inherit", "pipe", "pipe"],
});
let worker;
let stopping = false;
let buffered = "";

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  worker?.kill("SIGTERM");
  next.kill("SIGTERM");
  process.exitCode = code;
}

function consume(text) {
  buffered += text;
  const match = buffered.match(/server listening at (http:\/\/127\.0\.0\.1:\d+)\//);
  if (match && !worker && !stopping) {
    worker = spawn(resolve(cwd, "node_modules/.bin/tsx"), ["scripts/maintenance-worker.ts"], {
      cwd, env: { ...process.env, TURAS_EVE_INTERNAL_ORIGIN: `${match[1]}/` },
      stdio: "inherit",
    });
    worker.on("exit", (code) => { if (!stopping) stop(code || 1); });
  }
  buffered = buffered.slice(-1_000);
}
next.stdout.on("data", (chunk) => {
  const value = chunk.toString();
  process.stdout.write(value);
  consume(value);
});
next.stderr.on("data", (chunk) => {
  const value = chunk.toString();
  process.stderr.write(value);
  consume(value);
});
next.on("exit", (code) => { if (!stopping) stop(code || 1); });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop());
}
