import type { AppIdentity } from "../identity";
import { requireResearchAccount } from "../account";
import { withTransaction } from "../../../db/client";
import { readEligibleContext } from "../../../profiles/context";
import { currentKnowledgeHeaders } from "../../../knowledge/read";
import { readProfile } from "../../../profiles/read";
import { customerContextSchema } from "./schema";
import { digest } from "../research-cache/schema";
import type { CustomerResearchContext } from "./schema";

/** Legacy public learning did not mutate the private journey/snapshot hash.
 * Keep that distinction while projecting checked research into today's profile:
 * source-version/new-source checks govern research reuse separately. */
export function researchContextDigest(context:CustomerResearchContext) {
  const {moreAvailable:_coverage,publicEvidenceVersion:_publicVersion,...stable}=context;
  return digest(JSON.stringify({...stable,evidence:context.evidence.filter(entry=>entry.basis!=="checked_public_research")}));
}

/** Legacy context assembly over the current authorized canonical stores. No
 * demo snapshot, legacy login or parallel accepted-claims store is introduced. */
export async function loadResearchContext(identity:AppIdentity,accountId:string,signal?:AbortSignal) {
  signal?.throwIfAborted();
  const account=await requireResearchAccount(identity,accountId);
  return withTransaction(async db=>{
    const profile=await readProfile(identity,accountId,db,undefined,undefined,false,true) as {
      acceptedFacts:Array<Record<string,unknown>>;attributedResearch:Array<Record<string,unknown>>;
    };
    const manualVersion=digest(JSON.stringify(profile.acceptedFacts.map(fact=>({
      id:fact.id,workloadId:fact.workloadId,payload:fact.payload,supportStatus:fact.supportStatus,
    }))));
    const publicEvidenceVersion=digest(JSON.stringify(profile.attributedResearch.map(source=>({
      location:source.location,title:source.title,passage:source.passage,
      supportedClaim:source.supportedClaim,publicationAt:source.publicationAt,
      productNames:source.productNames,
    })).sort((a,b)=>String(a.location).localeCompare(String(b.location)))));
    const read=await readEligibleContext(identity,accountId,{limit:20,shareActorRows:true},db) as {
      contextVersion:string;truncated:boolean;entries:Record<string,unknown>[];
    };
    const headers=await currentKnowledgeHeaders(db,identity);
    const date=(value:unknown)=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)?value.slice(0,10):null;
    const evidence=read.entries.map(entry=>{
      const publicSource=entry.type==='attributed_research';
      const payload=entry.payload as Record<string,unknown>|undefined;
      const text=publicSource?`${entry.supportedClaim}\nOriginal source passage: ${entry.passage}\nLast checked: ${entry.retrievalAt}`:JSON.stringify(payload);
      return {id:`${entry.type}:${entry.citationId}`,title:String(entry.title??entry.kind??'Customer record'),
        summary:text.slice(0,4000),observedAt:publicSource?date(entry.publicationAt)??date(entry.observationAt):date(payload?.observedAt)??date(payload?.observationEnd),
        reviewAfter:date(payload?.reviewAt),source:publicSource?String(entry.location):`profile:${entry.citationId}`,
        scope:entry.workloadId?`Workload ${entry.workloadId}`:'Customer',
        basis:publicSource?'checked_public_research' as const:'approved_customer_record' as const};
    });
    signal?.throwIfAborted();
    return customerContextSchema.parse({accountId,name:account.name,synthetic:false,
      snapshotVersion:`current-manual:${manualVersion}`,
      publicEvidenceVersion,
      solutionKnowledgeVersion:digest(JSON.stringify(headers)),researchPolicyVersion:'account-attribution-passage-discovery-v3',
      journalStatus:profile.acceptedFacts.length?'available':'empty',moreAvailable:read.truncated || headers.length>100,
      evidence});
  });
}

/** A specialist may add its own checked public knowledge, but may not silently
 * rebind its assessment to changed human facts, permissions or solution policy. */
export async function finalizeResearchContext(identity:AppIdentity,context:CustomerResearchContext,signal:AbortSignal) {
  const current=await loadResearchContext(identity,context.accountId,signal);
  if(researchContextDigest(current)!==researchContextDigest(context)) throw new Error("Customer context changed during research");
  return current;
}
