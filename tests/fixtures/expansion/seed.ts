import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { requireOwnedExpansionClone } from "../../../scripts/expansion-eval-environment";
import { createProfileTestSession } from "../profiles";
import { withExpansionDatabase } from "./environment";

/** Bootstrap only synthetic identities, never bypass a expansion review decision. */
export async function createExpansionActors(appRoot: string) {
  requireOwnedExpansionClone();
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(appRoot, "scripts/bootstrap-demo.ts")], {
    cwd: appRoot, env: process.env, encoding: "utf8", timeout: 30_000, maxBuffer: 100_000,
  });
  if (result.error || result.status !== 0) throw new Error("Owned expansion identity bootstrap failed");
  return withExpansionDatabase(async db => ({
    author: await createProfileTestSession(db, "panel"),
    reviewer: await createProfileTestSession(db, "mcteer"),
    partner: await createProfileTestSession(db, "partner"),
  }));
}
