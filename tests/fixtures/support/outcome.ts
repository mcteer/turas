import { randomUUID } from "node:crypto";
import type { CurrentSession } from "../../../lib/server/auth/sessions";
import { withTransaction } from "../../../lib/server/db/client";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { materializeCurrentProjection } from "../../../lib/server/retrieval/projections";
import { searchSupportEvidence } from "../../../lib/server/support/sources";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";

/** A synthetic observation with an explicit quality rubric and real human-review
 * transition. No direct accepted-head writes or quality overrides after review. */
export async function createSupportOutcomeEvidence(author: CurrentSession, reviewer: CurrentSession, customerId: string,
  options: { additionalText?: string; observedAt?: string; audience?: "internal" | "delivery" } = {}) {
  requireOwnedSupportClone();
  const observedAt = options.observedAt ?? new Date(Date.now() - 10000).toISOString();
  const audience = options.audience ?? "delivery";
  const revisionId = await withTransaction(async db => {
    const proposed = await submitProfileCommand(author, customerId, { action: "propose_record", requestKey: randomUUID(),
      requestedAudience: audience, dataCategory: "delivery_context",
      payload: { kind: "product_use", productKey: `synthetic-support-${randomUUID().slice(0, 8)}`, displayName: "Synthetic support outcome",
        state: "actual", usageDescription: `Synthetic operating ownership verification outcome observed by the human reviewer${options.additionalText ? `\n${options.additionalText}` : ""}`, observedAt },
      qualityInput: { rubricVersion: "evidence-quality-v1", R: 2, D: 4, C: 2,
        reliabilityRationale: "Human reviewed the synthetic operating observation",
        directnessRationale: "The observation directly describes the synthetic verification outcome",
        corroborationRationale: "Single reviewed synthetic observation, no independent corroboration",
        informationType: "adoption_process", dateBasis: "observation" },
    }, db) as { revisionId: string };
    const row = (await db.query(`SELECT v.content_digest,r.version,r.current_accepted_revision_id
      FROM profile_revisions v JOIN profile_records r ON r.id=v.record_id WHERE v.id=$1`, [proposed.revisionId])).rows[0];
    await submitProfileCommand(reviewer, customerId, { action: "accept_revision", requestKey: randomUUID(), revisionId: proposed.revisionId,
      digest: row.content_digest, expectedRecordVersion: Number(row.version), expectedAcceptedRevisionId: row.current_accepted_revision_id,
      rationale: "Human reviewed the dated synthetic operating outcome and its quality limitations" }, db);
    await materializeCurrentProjection(db, "accepted_profile", proposed.revisionId, audience);
    return proposed.revisionId;
  });
  const found = await searchSupportEvidence(author, customerId, null, audience, "synthetic operating ownership verification outcome");
  const source = found.results.find(item => item.reference.sourceRevisionId === revisionId);
  if (!source) throw new Error("Reviewed support outcome missing from eligible lexical discovery");
  return { reference: source.reference, observedAt };
}
