import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";
import { createProfileTestSession } from "../profiles";
import { withSupportDatabase } from "./environment";
import { supportReadinessKeys, supportReadinessRubricVersion } from "../../../lib/support/readiness";
import type { SupportAssessment } from "../../../lib/contracts/support";

/** Bootstrap only synthetic identities, never bypass a support review decision. */
export async function createSupportActors(appRoot: string) {
  requireOwnedSupportClone();
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(appRoot, "scripts/bootstrap-demo.ts")], {
    cwd: appRoot, env: process.env, encoding: "utf8", timeout: 30_000, maxBuffer: 100_000,
  });
  if (result.error || result.status !== 0) throw new Error("Owned support identity bootstrap failed");
  return withSupportDatabase(async db => ({
    author: await createProfileTestSession(db, "panel"),
    reviewer: await createProfileTestSession(db, "mcteer"),
    partner: await createProfileTestSession(db, "partner"),
  }));
}

export function unknownSupportAssessment(observationDate = Temporal.Now.plainDateISO("UTC").toString()): SupportAssessment {
  return { contractVersion: "support-v1", rubricVersion: supportReadinessRubricVersion,
    title: "Synthetic support readiness", observationDate,
    nextReviewDate: Temporal.PlainDate.from(observationDate).add({ days: 7 }).toString(), timezone: "UTC",
    checks: supportReadinessKeys.map(key => ({ key, status: "unknown", rationale: "No accepted operating evidence",
      sourceKeys: [], discoveryNeed: "Confirm operating ownership and evidence" })),
  };
}
