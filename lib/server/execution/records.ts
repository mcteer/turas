import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { Temporal } from "@js-temporal/polyfill";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
import { getServerConfig } from "../config";
import type { ExecutionActor } from "./policy";
import type { ExecutionCommand,ExecutionRecordContent } from "./schema";
import { executionDigest } from "./commands";
import { verifyExecutionSources,lockExecutionOriginalSources } from "./sources";
import { executionBaseline,verifyBaseline,lockExecutionHead,advanceExecution } from "./baselines";
import {validateRegisterContent} from "./registers";
import type { ExecutionRecordMetadata } from "./projection";
export async function executionRecordHead(db:PoolClient,actor:ExecutionActor,engagementId:string,recordId:string,lock=false) {
  const row=(await db.query<ExecutionRecordMetadata>(`SELECT id,author_membership_id,current_revision_id,accepted_revision_id,version,state,kind,baseline_id
    FROM execution_records WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND engagement_id=$4 ${lock?'FOR UPDATE':''}`,
    [recordId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,engagementId])).rows[0];
  if (!row) throw hiddenRecord(); return row;
}
export async function validateRecordContent(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,baselineId:string,content:ExecutionRecordContent) {
  if (actor.kind==='partner' && content.audience!=='delivery') throw new HttpFailure(403,'forbidden','Delivery audience required');
  if (Temporal.PlainDate.compare(content.eventDate,Temporal.Now.plainDateISO(content.timezone))>0) throw new HttpFailure(422,'invalid_input','Observed event date cannot be in the future');
  const keys=(await db.query<{item_kind:string;item_key:string}>(`SELECT item_kind,item_key FROM execution_baseline_items WHERE baseline_id=$1
    AND environment_id=$2 AND workspace_id=$3 AND engagement_id=$4`,[baselineId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,engagementId])).rows;
  if ((content.workPackageKey!==null && !keys.some(k=>k.item_kind==='work_package'&&k.item_key===content.workPackageKey)) ||
    content.milestoneKeys.some(key=>!keys.some(k=>k.item_kind==='milestone'&&k.item_key===key)) ||
    (content.kind==='activity' && content.subtype!=='work' && !keys.some(k=>k.item_kind==='milestone'&&k.item_key===content.milestoneKey)))
    throw new HttpFailure(422,'invalid_input','Use exact items from the bound baseline');
  if (content.ownerMembershipId) {
    const owner=(await db.query<{active:boolean;principal_active:boolean;kind:string;organization_active:boolean;granted:boolean}>(`SELECT m.active,p.active AS principal_active,m.kind,
      COALESCE(o.active,false) AS organization_active,EXISTS(SELECT 1 FROM customer_grants g WHERE g.membership_id=m.id AND g.customer_id=$2 AND g.state='active') AS granted
      FROM memberships m JOIN principals p ON p.id=m.principal_id LEFT JOIN partner_organizations o ON o.id=m.partner_org_id
      WHERE m.id=$1 AND m.workspace_id=$3`,[content.ownerMembershipId,customerId,actor.workspaceId])).rows[0];
    if (!owner?.active || !owner.principal_active || (owner.kind==='partner'&&(!owner.organization_active||!owner.granted))) throw hiddenRecord();
  }
  await validateRegisterContent(db,actor,engagementId,baselineId,content);
}
export async function lockRecordContext(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,baselineId:string,content:ExecutionRecordContent){
  let baseline=await executionBaseline(db,actor,customerId,engagementId,baselineId);
  const replacementId=content.kind==="scope_change"&&content.state==="implemented"?content.replacementBaselineId:null;
  let replacement=replacementId?await executionBaseline(db,actor,customerId,engagementId,replacementId):null;
  await db.query("SELECT id FROM delivery_plans WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[...new Set([baseline.plan_id,...(replacement?[replacement.plan_id]:[])])].sort()]);
  baseline=await executionBaseline(db,actor,customerId,engagementId,baselineId);
  if(replacement)replacement=await executionBaseline(db,actor,customerId,engagementId,replacement.id);
  const baselineRef=(b:typeof baseline)=>({id:b.id,kind:"milestone_baseline" as const,sourceRevisionId:b.id,generation:Number(b.baseline_number),contentDigest:b.content_digest});
  if(replacement){
    await lockExecutionOriginalSources(db,actor,customerId,engagementId,[...content.references,baselineRef(baseline),baselineRef(replacement)]);
    await db.query("SELECT id FROM engagements WHERE id=$1 FOR UPDATE",[engagementId]);
    await validateRegisterContent(db,actor,engagementId,baselineId,content);
    const sourceDigest=await verifyExecutionSources(db,actor,customerId,engagementId,content.audience,[...content.references,baselineRef(replacement)],false);
    return {baseline,effectiveBaselineId:replacement.id,sourceDigest};
  }
  if(baseline.active_baseline_id!==baseline.id)throw new HttpFailure(409,"source_changed","Current baseline required");
  const sourceDigest=await verifyExecutionSources(db,actor,customerId,engagementId,content.audience,[...content.references,baselineRef(baseline)],true);
  return {baseline,effectiveBaselineId:baseline.id,sourceDigest};
}
async function appendRecord(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,recordId:string,baselineId:string,content:ExecutionRecordContent) {
  // Search receipts authorize the author's selection at intake. Durable review
  // binds exact source revision/generation/digest/locator under each reader's
  // current authority; it never inherits another member's private receipt.
  content={...content,references:content.references.map(ref=>{
    if ("citationId" in ref) { const {citationId:_receipt,...durable}=ref; return durable; }
    return ref;
  })};
  const revisionId=randomUUID(),env=getServerConfig().TURAS_ENVIRONMENT_ID;
  const number=Number((await db.query('SELECT COALESCE(MAX(revision_number),0)+1 AS n FROM execution_record_revisions WHERE record_id=$1',[recordId])).rows[0].n);
  const digest=executionDigest(content);
  await db.query(`INSERT INTO execution_record_revisions(id,environment_id,workspace_id,customer_id,engagement_id,record_id,kind,revision_number,baseline_id,audience,event_date,timezone,
    work_package_key,owner_membership_id,content_digest,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [revisionId,env,actor.workspaceId,customerId,engagementId,recordId,content.kind,number,baselineId,content.audience,content.eventDate,content.timezone,
      content.workPackageKey,content.ownerMembershipId,digest,actor.membershipId]);
  await db.query('INSERT INTO execution_record_payloads(revision_id,content) VALUES($1,$2)',[revisionId,JSON.stringify(content)]);
  for (const ref of content.references) await db.query(`INSERT INTO execution_record_sources(id,environment_id,workspace_id,customer_id,engagement_id,revision_id,
    source_kind,source_revision_id,source_generation,content_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [randomUUID(),env,actor.workspaceId,customerId,engagementId,revisionId,ref.kind,ref.sourceRevisionId,ref.generation,ref.contentDigest]);
  await db.query("UPDATE execution_records SET current_revision_id=$2,state='draft' WHERE id=$1",[recordId,revisionId]);
  return {revisionId,digest};
}
export async function saveRecord(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,
  command:Extract<ExecutionCommand,{action:'record.create'|'record.revise'}>) {
  const prior=command.action==='record.revise'?await executionRecordHead(db,actor,engagementId,command.payload.recordId):null;
  const baselineId=command.action==='record.create'?command.payload.baselineId:prior!.baseline_id;
  const context=await lockRecordContext(db,actor,customerId,engagementId,baselineId,command.payload.record);
  const execution=await lockExecutionHead(db,actor,engagementId,command.expectedVersions.execution);
  if (execution.current_baseline_id!==context.effectiveBaselineId) throw new HttpFailure(409,'source_changed','Reconcile the current baseline');
  await validateRecordContent(db,actor,customerId,engagementId,baselineId,command.payload.record);
  const id=prior?.id??randomUUID();
  let version=1;
  if (prior && command.action==='record.revise') {
    const locked=await executionRecordHead(db,actor,engagementId,id,true);
    if (locked.author_membership_id!==actor.membershipId) throw hiddenRecord();
    if (Number(locked.version)!==command.expectedVersions.record) throw new HttpFailure(409,'stale_version','Record changed; refresh');
    if (locked.kind!==command.payload.record.kind || ['submitted','retracted'].includes(locked.state)) throw new HttpFailure(422,'approval_blocked','Record cannot be revised in this state');
    version=Number(locked.version)+1;
    await db.query('UPDATE execution_records SET version=$2 WHERE id=$1',[id,version]);
  } else await db.query(`INSERT INTO execution_records(id,environment_id,workspace_id,customer_id,engagement_id,baseline_id,kind,author_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,baselineId,command.payload.record.kind,actor.membershipId]);
  await appendRecord(db,actor,customerId,engagementId,id,baselineId,command.payload.record);
  const next=await advanceExecution(db,execution);
  return {state:'committed' as const,executionGeneration:next.generation,changed:[{id,version},{id:execution.id,version:next.version}]};
}
export async function submitRecord(db:PoolClient,actor:ExecutionActor,customerId:string,engagementId:string,command:Extract<ExecutionCommand,{action:'record.submit'}>) {
  const pre=await executionRecordHead(db,actor,engagementId,command.payload.recordId);
  if (pre.author_membership_id!==actor.membershipId) throw hiddenRecord();
  const revision=(await db.query<{content_digest:string;content:ExecutionRecordContent}>(`SELECT v.content_digest,p.content FROM execution_record_revisions v JOIN execution_record_payloads p ON p.revision_id=v.id
    WHERE v.id=$1 AND v.record_id=$2`,[command.payload.revisionId,pre.id])).rows[0];
  if (!revision) throw hiddenRecord();
  const context=await lockRecordContext(db,actor,customerId,engagementId,pre.baseline_id,revision.content);
  const execution=await lockExecutionHead(db,actor,engagementId,command.expectedVersions.execution),record=await executionRecordHead(db,actor,engagementId,pre.id,true);
  if (Number(record.version)!==command.expectedVersions.record || record.current_revision_id!==command.payload.revisionId || revision.content_digest!==command.payload.contentDigest)
    throw new HttpFailure(409,'stale_version','Record changed; refresh');
  if (record.state!=='draft') throw new HttpFailure(422,'approval_blocked','Only draft records can be submitted');
  if(execution.current_baseline_id!==context.effectiveBaselineId)throw new HttpFailure(409,"source_changed","Reconcile the current baseline");
  await validateRecordContent(db,actor,customerId,engagementId,record.baseline_id,revision.content);
  const version=Number(record.version)+1;
  await db.query("UPDATE execution_records SET state='submitted',version=$2 WHERE id=$1",[record.id,version]);
  await db.query(`INSERT INTO execution_review_decisions(id,environment_id,workspace_id,customer_id,engagement_id,record_id,revision_id,action,expected_version,request_key,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,'submit',$8,$9,$10)`,[randomUUID(),getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,record.id,command.payload.revisionId,
      command.expectedVersions.record,command.requestKey,actor.membershipId]);
  const next=await advanceExecution(db,execution);
  return {state:'committed' as const,executionGeneration:next.generation,changed:[{id:record.id,version},{id:execution.id,version:next.version}]};
}
