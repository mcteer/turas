import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import type { ProfileActor } from "./policy";
import { readProfile } from "./read";
import { withTransaction } from "../db/client";
import type { RecordKind } from "../../contracts/profile-payloads";
import { searchEvidence } from "../retrieval/search";
import { contextPage } from "../../profiles/context-pages";

/** Shared governed path for new customer factual-context retrieval. */
export async function readGovernedEvidenceContext(actor: ProfileActor, customerId: string,
  query: string, options: { scope?: "customer" | "shared" | "combined";
    use?: "discovery" | "accepted_fact" | "current_fact"; limit?: number;
    audience?:"internal"|"delivery";workloadId?:string|null } = {}) {
  return searchEvidence(actor,{ scope: options.scope ?? "combined",
    customerId: options.scope === "shared" ? undefined : customerId,query,
    workloadId:options.scope === "shared" ? undefined:options.workloadId ?? undefined,
    use: options.use ?? "accepted_fact",limit: options.limit ?? 5 },
  options.audience ? {audience:options.audience,workloadId:options.workloadId ?? null}:undefined);
}

type ProfileProjection = {
  customer: { id: string; displayName: string; synthetic: boolean };
  workloads: { id: string }[];
  acceptedFacts: Record<string, unknown>[];
  attributedResearch: Record<string, unknown>[];
  contextVersion: string;
};

export async function readEligibleContext(actor: ProfileActor, customerId: string,
  options: { limit?: number; query?: string; workloadId?: string; kind?: RecordKind;
    page?: number;audience?:"internal"|"delivery";customerWideOnly?:boolean;shareActorRows?:boolean;
    staffingFence?: boolean; journeyOnly?:boolean; offset?:number; citationIds?:readonly string[] } = {},
  existingClient?: PoolClient): Promise<unknown> {
  const limit = options.limit ?? 20;
  const page = options.page ?? 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > 20 ||
      !Number.isInteger(page) || page < 1 || page > 10 ||
      (options.offset!==undefined&&(!options.journeyOnly||!Number.isInteger(options.offset)||options.offset<0||options.offset>100000)) ||
      (options.citationIds!==undefined&&(!options.journeyOnly||options.citationIds.length>10)) ||
      (options.query?.length ?? 0) > 200) throw new HttpFailure(422, "invalid_query", "Invalid context query");
  const run = async (client: PoolClient) => {
    const profile = await readProfile(actor, customerId, client,options.workloadId,
      options.audience,options.customerWideOnly ?? false,options.shareActorRows ?? false,options.staffingFence ?? false) as ProfileProjection;
    if (options.workloadId && !profile.workloads.some((workload) => workload.id === options.workloadId)) {
      throw hiddenRecord();
    }
    const asOf = new Date();
    const entries: Record<string, unknown>[] = [];
    const query = options.query?.toLocaleLowerCase();
    for (const fact of profile.acceptedFacts) {
      if (fact.supportStatus !== "settled" && fact.supportStatus !== "restricted_source") continue;
      if (options.kind && fact.kind !== options.kind) continue;
      if (options.workloadId && fact.workloadId && fact.workloadId !== options.workloadId) continue;
      if (options.customerWideOnly && fact.workloadId) continue;
      if(options.journeyOnly && (!fact.payload || typeof fact.payload!=='object' || !('legacyJourney' in fact.payload)))continue;
      if(options.citationIds && !options.citationIds.includes(String(fact.id)))continue;
      if (query && !JSON.stringify({ payload: fact.payload,
        approvedArtifactExcerpt: fact.approvedArtifactExcerpt }).toLocaleLowerCase().includes(query)) continue;
      entries.push({ type: "accepted_manual", citationId: fact.id, kind: fact.kind,
        recordId:fact.recordId,createdAt:fact.createdAt,
        workloadId: fact.workloadId, payload: fact.payload, quality: fact.quality,
        ...(fact.approvedArtifactExcerpt ? { approvedArtifactExcerpt: fact.approvedArtifactExcerpt } : {}),
        ...(fact.supportStatus === "restricted_source" ?
          { sourceStatus: "restricted", sourceAttestation: fact.sourceAttestation } : {}) });
    }
    for (const source of profile.attributedResearch) {
      if(options.journeyOnly)continue;
      if (query && !JSON.stringify({ title: source.title, passage: source.passage,
        claim: source.supportedClaim, products: source.productNames }).toLocaleLowerCase().includes(query)) continue;
      entries.push({ type: "attributed_research", citationId: source.sourceRevisionId,
        acceptanceState: "accepted", acceptanceBasis: "independent_research",
        supportedClaim: source.supportedClaim, passage: source.passage, title: source.title,
        productNames: source.productNames, publicationAt: source.publicationAt,
        observationAt: source.observationAt, retrievalAt: source.retrievalAt,
        location: source.location, quality: source.quality });
    }
    if(options.journeyOnly)entries.sort((a,b)=>{
      if(options.citationIds)return options.citationIds.indexOf(String(a.citationId))-options.citationIds.indexOf(String(b.citationId));
      const observed=(entry:Record<string,unknown>)=>String((entry.payload as {legacyJourney?:{observedAt?:string}})?.legacyJourney?.observedAt??'');
      return observed(b).localeCompare(observed(a))||String(b.createdAt??'').localeCompare(String(a.createdAt??''))||String(a.citationId).localeCompare(String(b.citationId));
    });
    const offset=options.offset;
    let packed:ReturnType<typeof contextPage<Record<string,unknown>>>;
    let nextOffset:number|null=null;
    if(offset!==undefined){
      const selected:Record<string,unknown>[]=[];let bytes=0,oversized=0,cursor=offset;
      for(;cursor<entries.length;cursor++){
        const size=Buffer.byteLength(JSON.stringify(entries[cursor]));
        if(size>24*1024){oversized++;continue;}
        if(selected.length>=limit||bytes+size>24*1024)break;
        selected.push(entries[cursor]);bytes+=size;
      }
      nextOffset=cursor<entries.length?cursor:null;
      packed={entries:selected,hasNextPage:nextOffset!==null,oversized};
    }else packed=contextPage(entries, page, limit);
    const selected = packed.entries;
    const validUntilCandidates = [asOf.getTime() + 86_400_000];
    for (const entry of selected) {
      const quality = entry.quality as { validUntil?: string } | undefined;
      const deadline = Date.parse(quality?.validUntil ?? "");
      if (Number.isFinite(deadline) && deadline > asOf.getTime()) validUntilCandidates.push(deadline);
    }
    const truncated = packed.hasNextPage || packed.oversized > 0;
    return { contractVersion: "customer-context-v1", customer: profile.customer,
      contextVersion: profile.contextVersion, asOf: asOf.toISOString(),
      validUntil: new Date(Math.min(...validUntilCandidates)).toISOString(),
      entries: selected, page, nextPage: offset===undefined&&packed.hasNextPage ? page + 1 : null,
      ...(offset!==undefined?{offset,nextOffset,moreAvailable:nextOffset!==null}:{}),
      complete: !truncated, truncated,
      knownGaps: [...(packed.hasNextPage ? ["Additional authorized context is available on the next page"] : []),
        ...(packed.oversized ? ["Some authorized records exceed the per-page byte limit; use evidence search to retrieve their passages"] : [])] };
  };
  return existingClient ? run(existingClient) : withTransaction(run);
}

/** Staffing never falls back to the actor's default internal audience. This
 * authoritative read must precede plan/workforce locks in the native prefix.
 * Only the governed accepted delivery projection is returned, with explicit
 * bounded coverage; callers charge it before model injection. */
export async function readStaffingDeliveryContext(actor: ProfileActor, customerId: string, workloadId: string | null,
  client: PoolClient) {
  return readEligibleContext(actor, customerId, { audience: "delivery", workloadId: workloadId ?? undefined,
    customerWideOnly: workloadId === null, limit: 20, shareActorRows: true, staffingFence: true }, client) as Promise<{
      contractVersion: "customer-context-v1"; customer: { id: string; displayName: string; synthetic: boolean };
      contextVersion: string; asOf: string; validUntil: string; entries: Record<string, unknown>[];
      page: number; complete: boolean; truncated: boolean; knownGaps: string[];
    }>;
}

/** Only a durable execution attempt can use this quota-independent identity
 * context. No ordinary profile/research read can select this path via options. */
export async function readExecutionIdentityContext(actor: ProfileActor, attemptId: string, client: PoolClient) {
  const { readAdmittedExecutionIdentity } = await import("./read");
  return readAdmittedExecutionIdentity(client, actor, attemptId);
}
