import {researchReadActor} from './identity';
import type {CurrentSession} from '../../auth/sessions';
import type {PoolClient} from 'pg';
import {readVerifiedResearchProjectionRows} from "../../retrieval/research-projection";
import {getServerConfig} from "../../config";
import { withTransaction } from "../../db/client";
import { lockProfileActor,lockProfileActors } from "../../profiles/policy";
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
export type ResearchSourceReference={accountId:string;url:string};
export const researchSourceKey=(source:ResearchSourceReference)=>JSON.stringify([source.accountId.toLowerCase(),source.url]);
/** Every URL is eligible only when ALL of its canonical heads are eligible.
 * Newly discovered URLs without canonical headers retain the original true result. */
export async function researchSourcesAreEligibleInTransaction(db:PoolClient,identity:AppIdentity,sources:readonly ResearchSourceReference[],authorizationActor:CurrentSession=identity){
 await lockProfileActors(db,researchReadActor(identity,authorizationActor),sources.map(source=>source.accountId),undefined,true);
 const result=new Map(sources.map(source=>[researchSourceKey(source),true]));
 if(!sources.length)return result;
 const requested=[...new Map(sources.map(source=>[researchSourceKey(source),source])).values()];
 const heads=(await db.query<{account_id:string;url:string;id:string|null}>(`SELECT request.account_id,request.url,v.id
  FROM jsonb_to_recordset($2::jsonb) AS request(account_id uuid,url text)
  JOIN evidence_sources s ON s.workspace_id=$1 AND s.customer_id=request.account_id AND s.origin='independent_research' AND s.canonical_location=request.url
  LEFT JOIN LATERAL(SELECT id FROM evidence_source_revisions WHERE source_id=s.id ORDER BY version DESC LIMIT 1) v ON true`,
 [identity.workspaceId,JSON.stringify(requested.map(source=>({account_id:source.accountId,url:source.url})))])).rows;
 const ids=[...new Set(heads.flatMap(head=>head.id?[head.id]:[]))];
 const eligible=await readVerifiedResearchProjectionRows(db,ids,identity.kind==='internal'?'internal':'delivery',identity.environmentId);
 const conflicts=ids.length?(await db.query<{id:string}>(`SELECT v.id FROM evidence_source_revisions v
  WHERE v.id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM evidence_conflict_targets conflict WHERE conflict.state='confirmed' AND conflict.environment_id=$2
   AND ((conflict.first_kind='verified_research' AND conflict.first_revision_id=v.id) OR(conflict.second_kind='verified_research' AND conflict.second_revision_id=v.id))
   AND (conflict.scope='shared' OR(conflict.scope='customer' AND conflict.workspace_id=$3 AND conflict.customer_id=v.customer_id)))`,[ids,getServerConfig().TURAS_ENVIRONMENT_ID,identity.workspaceId])).rows:[];
 const blocked=new Set(conflicts.map(row=>row.id));
 for(const head of heads)if(!head.id||!eligible.has(head.id)||blocked.has(head.id))result.set(researchSourceKey({accountId:head.account_id,url:head.url}),false);
 return result;
}
export async function researchSourceIsEligibleInTransaction(db:PoolClient,identity:AppIdentity,accountId:string,url:string){
 return (await researchSourcesAreEligibleInTransaction(db,identity,[{accountId,url}])).get(researchSourceKey({accountId,url}))===true;
}
