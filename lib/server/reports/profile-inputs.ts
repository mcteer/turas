import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {profilePayloadSchema,type ProfilePayload} from '../../contracts/profile-payloads';
import {reportSourceEligibility,type ReportSource,type ReportSourceScope} from './sources';
import {nativeSourceKey} from './native-sources';
import {reportSourceAudience} from './policy';
export type ReportProfileInput={revisionId:string;workloadId:string|null;payload:ProfilePayload};
/** Candidate metadata is audience scoped; original payloads are read only after eligibility checks. */
export async function selectReportProfileInputs(db:PoolClient,scope:ReportSourceScope,selection:{workloadIds:string[];includeCustomerLevel:boolean},asOf:string){
 const candidates=(await db.query(`SELECT v.id,v.revision_number,v.content_digest,r.workload_id,d.revision_id AS decision_id FROM profile_records r
 JOIN profile_revisions v ON v.id=r.current_accepted_revision_id JOIN profile_review_decisions d ON d.revision_id=v.id AND d.decision='accept'
 WHERE r.workspace_id=$1 AND r.customer_id=$2 AND v.audience=ANY($3::text[]) AND v.data_category IN ('delivery_context','internal_operations')
 AND r.kind IN ('maturity_assessment','product_use','risk','decision','outcome','next_review')
 AND (r.workload_id=ANY($4::uuid[]) OR (r.workload_id IS NULL AND $5::boolean)) ORDER BY v.id LIMIT 1001`,[scope.workspaceId,scope.customerId,reportSourceAudience(scope.audience),selection.workloadIds,selection.includeCustomerLevel])).rows;
 if(candidates.length>1000)throw new HttpFailure(422,'scope_too_large','Narrow the accepted report profile scope');
 const inputs:ReportProfileInput[]=[],sources:ReportSource[]=[];let reviewRequired=0;
 const refs:ReportSource[]=candidates.map(row=>({kind:'accepted_profile',id:row.id,revisionId:row.id,generation:Number(row.revision_number),contentDigest:row.content_digest,engagementId:null,decisionId:row.decision_id}));
 const eligibility=await reportSourceEligibility(db,scope,refs);
 const admitted=candidates.filter((_,index)=>eligibility.get(nativeSourceKey(refs[index])));
 reviewRequired=candidates.length-admitted.length;
 const payloads=new Map((await db.query('SELECT id,payload FROM profile_revisions WHERE id=ANY($1::uuid[]) AND workspace_id=$2 AND customer_id=$3',[admitted.map(row=>row.id),scope.workspaceId,scope.customerId])).rows.map(row=>[row.id,row.payload]));
 for(const row of admitted){
  const ref=refs.find(ref=>ref.revisionId===row.id)!;
  try{
   const payload=profilePayloadSchema.parse(payloads.get(row.id));
   const observed='observedAt' in payload?payload.observedAt:payload.kind==='maturity_assessment'?payload.observationEnd:payload.kind==='decision'?payload.effectiveAt:null;
   if(observed && Date.parse(observed)>Date.parse(asOf)){reviewRequired++;continue;}
   if(payload.kind==='maturity_assessment' && Date.parse(payload.reviewAt)<=Date.parse(asOf)){reviewRequired++;continue;}
   inputs.push({revisionId:row.id,workloadId:row.workload_id,payload});sources.push(ref);
  }catch(error){if(error instanceof HttpFailure && [403,404,409].includes(error.status)){reviewRequired++;continue;}throw error;}
 }
 return {inputs,sources,reviewRequired};
}
