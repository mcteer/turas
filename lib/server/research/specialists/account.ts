import type {PoolClient} from 'pg';
import {buildCurrentProjection} from "../../retrieval/projections";
import {retrievalSourceHasMaterialConflict} from "../../retrieval/search";
import { withTransaction } from "../../db/client";
import { lockProfileActor } from "../../profiles/policy";
import { hiddenRecord } from "../../../contracts/http";
import type { AppIdentity } from "./identity";
export async function requireResearchAccount(identity:AppIdentity,accountId:string) {
  return withTransaction(async db=>{
    await lockProfileActor(db,identity,accountId,undefined,true);
    const account=(await db.query<{id:string;name:string;synthetic:boolean}>(
      "SELECT id,display_name AS name,synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2",
      [accountId,identity.workspaceId])).rows[0];
    if(!account || account.synthetic) throw hiddenRecord();
    return account;
  });
}

/** Discovery may find a new URL; cached research may not resurrect a canonical
 * source that has been withdrawn, conflicted or made ineligible. */
export async function researchSourceIsEligible(identity:AppIdentity,accountId:string,url:string) {
  return withTransaction(db=>researchSourceIsEligibleInTransaction(db,identity,accountId,url));
}
export async function researchSourceIsEligibleInTransaction(db:PoolClient,identity:AppIdentity,accountId:string,url:string){
    await lockProfileActor(db,identity,accountId,undefined,true);
    const heads=await db.query<{id:string|null}>(`SELECT v.id FROM evidence_sources s
      LEFT JOIN LATERAL(SELECT id FROM evidence_source_revisions WHERE source_id=s.id ORDER BY version DESC LIMIT 1) v ON true
      WHERE s.workspace_id=$1 AND s.customer_id=$2 AND s.origin='independent_research' AND s.canonical_location=$3`,
      [identity.workspaceId,accountId,url]);
    for(const head of heads.rows){
      if(!head.id || !await buildCurrentProjection(db,'verified_research',head.id,identity.kind==='internal'?'internal':'delivery',identity.environmentId) ||
        await retrievalSourceHasMaterialConflict(db,{source_kind:'verified_research',source_revision_id:head.id},identity,{scope:'customer',customerId:accountId}))return false;
    }
    return true;
}
