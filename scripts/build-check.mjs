import { spawnSync } from "node:child_process";

for (const script of ["build:eve:check", "build:web:check"]) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
