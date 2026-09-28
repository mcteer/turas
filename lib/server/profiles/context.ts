import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileActor } from "./policy";
import { readProfile } from "./read";
import { withTransaction } from "../db/client";
import type { RecordKind } from "../../contracts/profile-payloads";

type ProfileProjection = {
  customer: { id: string; displayName: string; synthetic: boolean };
  workloads: { id: string }[];
  acceptedFacts: Record<string, unknown>[];
  attributedResearch: Record<string, unknown>[];
  contextVersion: string;
};

export async function readEligibleContext(actor: ProfileActor, customerId: string,
  options: { limit?: number; query?: string; workloadId?: string; kind?: RecordKind; page?: number } = {},
  existingClient?: PoolClient): Promise<unknown> {
  const limit = options.limit ?? 20;
  const page = options.page ?? 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 ||
      !Number.isInteger(page) || page < 1 || page > 10 ||
      (options.query?.length ?? 0) > 200) throw new HttpFailure(422, "invalid_query", "Invalid context query");
  const run = async (client: PoolClient) => {
    const profile = await readProfile(actor, customerId, client) as ProfileProjection;
    if (options.workloadId && !profile.workloads.some((workload) => workload.id === options.workloadId)) {
      throw hiddenRecord();
    }
    const asOf = new Date();
    const entries: Record<string, unknown>[] = [];
    const query = options.query?.toLocaleLowerCase();
    for (const fact of profile.acceptedFacts) {
      if (fact.supportStatus !== "settled" && fact.supportStatus !== "restricted_source") continue;
      if (options.kind && fact.kind !== options.kind) continue;
      if (options.workloadId && fact.workloadId !== options.workloadId) continue;
      if (query && !JSON.stringify({ payload: fact.payload,
        approvedArtifactExcerpt: fact.approvedArtifactExcerpt }).toLocaleLowerCase().includes(query)) continue;
      entries.push({ type: "accepted_manual", citationId: fact.id, kind: fact.kind,
        workloadId: fact.workloadId, payload: fact.payload, quality: fact.quality,
        ...(fact.approvedArtifactExcerpt ? { approvedArtifactExcerpt: fact.approvedArtifactExcerpt } : {}),
        ...(fact.supportStatus === "restricted_source" ?
          { sourceStatus: "restricted", sourceAttestation: fact.sourceAttestation } : {}) });
    }
    for (const source of profile.attributedResearch) {
      if (query && !JSON.stringify(source.supportedClaim).toLocaleLowerCase().includes(query)) continue;
      entries.push({ type: "attributed_research", citationId: source.sourceRevisionId,
        supportedClaim: source.supportedClaim, location: source.location, quality: source.quality });
    }
    const selected: Record<string, unknown>[] = [];
    let bytes = 0;
    const offset = (page - 1) * limit;
    for (const entry of entries.slice(offset)) {
      const size = Buffer.byteLength(JSON.stringify(entry));
      if (selected.length >= limit || bytes + size > 24 * 1024) break;
      selected.push(entry);
      bytes += size;
    }
    const validUntilCandidates = [asOf.getTime() + 86_400_000];
    for (const entry of selected) {
      const quality = entry.quality as { validUntil?: string } | undefined;
      const deadline = Date.parse(quality?.validUntil ?? "");
      if (Number.isFinite(deadline) && deadline > asOf.getTime()) validUntilCandidates.push(deadline);
    }
    const truncated = offset + selected.length < entries.length;
    return { contractVersion: "customer-context-v1", customer: profile.customer,
      contextVersion: profile.contextVersion, asOf: asOf.toISOString(),
      validUntil: new Date(Math.min(...validUntilCandidates)).toISOString(),
      entries: selected, page, complete: !truncated, truncated,
      knownGaps: truncated ? ["Additional authorized context was omitted by the result limit"] : [] };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}
