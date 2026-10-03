import { spawnSync } from "node:child_process";
import { requireOwnedExecutionClone } from "./execution-eval-environment";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
// Preparation attests existing007 workforce/parser prerequisites; no schema work.
if (process.argv.length !== 2) throw new Error("Execution preparation takes no overrides");
const isOwned = (() => { try { requireOwnedExecutionClone(); return true; } catch { return false; } })();
if (!isOwned) requireTestDatabaseUrl();
const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/prepare-staffing.ts"],
  { env: process.env, stdio: "inherit", timeout: 600_000 });
if (child.error || child.status !== 0) throw new Error("Execution prerequisites unavailable");
