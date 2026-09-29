import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";

// Each file gets a fresh process: earlier feature suites mutate process.env.
const testDatabaseUrl = requireTestDatabaseUrl();
const networkTimeout = new URL(testDatabaseUrl).hostname.endsWith(".neon.tech") ?
  ["--testTimeout", "120000", "--hookTimeout", "120000"] : [];
const files = ["contracts","integration","unit"].flatMap((group) =>
  readdirSync(`tests/${group}`)
    .filter((name) => /^(retrieval|knowledge|research|evidence-conflicts).*\.test\.ts$/.test(name))
    .sort().map((name) => `tests/${group}/${name}`));

for (const file of files) {
  console.log(`Checking ${file}`);
  const run = spawnSync(process.execPath,["node_modules/vitest/vitest.mjs","run",file,...networkTimeout],{
    stdio: "inherit",env: process.env });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
console.log(`Passed ${files.length} isolated 005 test files`);
