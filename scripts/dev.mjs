import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const cwd = process.cwd();
// Personnel storage is explicit; the supervised maintenance worker owns its
// separate import, cleanup and heartbeat loops. Preserve the selected DB/eve data.
if (process.env.TURAS_WORKFORCE_STORE_ROOT && !isAbsolute(process.env.TURAS_WORKFORCE_STORE_ROOT)) {
  throw new Error("Workforce store root must be absolute");
}
const next = spawn(resolve(cwd, "node_modules/.bin/next"), ["dev"], {
  cwd, env: process.env, stdio: ["inherit", "pipe", "pipe"],
});
let worker;
let artifactWorker;
let stopping = false;
let buffered = "";

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  worker?.kill("SIGTERM");
  artifactWorker?.kill("SIGTERM");
  next.kill("SIGTERM");
  process.exitCode = code;
}

function consume(text) {
  buffered += text;
  const match = buffered.match(/server listening at (http:\/\/127\.0\.0\.1:\d+)\//);
  if (match && !worker && !stopping) {
    worker = spawn(process.execPath, ["--import", "tsx", "scripts/maintenance-worker.ts"], {
      cwd, env: { ...process.env, TURAS_EVE_INTERNAL_ORIGIN: `${match[1]}/` },
      stdio: "inherit",
    });
    worker.on("exit", (code) => { if (!stopping) stop(code || 1); });
    artifactWorker = spawn(process.execPath, ["--import", "tsx", "scripts/artifact-worker.ts"], {
      cwd, env: { ...process.env, TURAS_EVE_INTERNAL_ORIGIN: `${match[1]}/` }, stdio: "inherit",
    });
    artifactWorker.on("exit", (code) => { if (!stopping) stop(code || 1); });
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
