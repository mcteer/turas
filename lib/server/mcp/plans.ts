import { createHash,randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { McpReadActor } from '../auth/read-actor';
import { mcpToolInputs,mcpPlanSchema,mcpContractVersion } from '../../contracts/mcp';
import { readAcceptedPlan } from '../plans/read';
import { createMcpHandle,resolveMcpHandle } from './handles';
import { requireMcpScope } from './policy';
import { unavailableMcp } from './projections';
const filterDigest=createHash('sha256').update('accepted-plans-v1').digest('hex');
const envelope=<T>(data:T,status:'available'|'empty'='available',nextCursor:string|null=null)=>({contractVersion:mcpContractVersion,status,requestId:randomUUID(),data,nextCursor});
export async function readMcpPlan(db:PoolClient,actor:McpReadActor,raw:unknown){
  const input=mcpToolInputs.turas_plan_read_v1.parse(raw);await requireMcpScope(db,actor,'plans',input.customerId);
  const accepted=await readAcceptedPlan(db,actor,input.customerId,input.planId);
  if(!accepted)return unavailableMcp('not_found');
  if(input.expectedRevisionId && input.expectedRevisionId!==accepted.revision.id)return unavailableMcp('source_changed');
  const {plan,revision,content}=accepted;
  return envelope(mcpPlanSchema.parse({planId:plan.id,customerId:input.customerId,revisionId:revision.id,generation:Number(revision.revision_number),
    digest:revision.content_digest,audience:plan.audience,state:'accepted',dependencyState:'current',content:{title:content.title,asOf:new Date(content.asOf).toISOString(),
      ...(content.startDate!==undefined?{startDate:content.startDate}:{}),...(content.startDateUnknownReason?{startDateUnknownReason:content.startDateUnknownReason}:{}),
      ...(content.targetDate!==undefined?{targetDate:content.targetDate}:{}),...(content.targetDateUnknownReason?{targetDateUnknownReason:content.targetDateUnknownReason}:{}),
      sections:content.sections.filter(section=>section.key!=='staffing'),assertions:content.assertions.map(assertion=>({...assertion,sourceDependencyIds:[]})),
      diagrams:content.diagrams,designDecisions:content.designDecisions.map(({links,...decision})=>decision),
      workPackages:content.workPackages.map(({effort,...work})=>work),milestones:content.milestones.map(({effort,...milestone})=>milestone)}}));
}
export async function listMcpPlans(db:PoolClient,actor:McpReadActor,raw:unknown){
  const input=mcpToolInputs.turas_plans_list_v1.parse(raw);await requireMcpScope(db,actor,'plans',input.customerId);
  const cursor=input.cursor?await resolveMcpHandle(db,actor,input.cursor,{kind:'cursor',category:'plans',customerId:input.customerId,section:'plans',filterDigest}):undefined;
  const snapshot=(await db.query<{digest:string}>(`SELECT encode(sha256(convert_to(coalesce(string_agg(concat_ws(':',id,accepted_revision_id),
    '|' ORDER BY id),''),'UTF8')),'hex') AS digest FROM delivery_plans WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
      AND accepted_revision_id IS NOT NULL AND (audience='delivery' OR $4='internal')`,[actor.environmentId,actor.workspaceId,input.customerId,actor.kind])).rows[0].digest;
  if(cursor&&cursor.contentDigest!==snapshot)return unavailableMcp('source_changed');
  const candidates=(await db.query<{id:string}>(`SELECT id FROM delivery_plans WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3
    AND accepted_revision_id IS NOT NULL AND (audience='delivery' OR $4='internal') AND ($5::uuid IS NULL OR id>$5) ORDER BY id LIMIT 101`,
    [actor.environmentId,actor.workspaceId,input.customerId,actor.kind,cursor?.positionId??null])).rows;
  const items=[];let last:string|undefined,more=false;
  for(const row of candidates.slice(0,100)){
    const result=await readMcpPlan(db,actor,{customerId:input.customerId,planId:row.id});
    if(result.status==='available'&&result.data){if(items.length===input.limit){more=true;break;}items.push({planId:result.data.planId,revisionId:result.data.revisionId,generation:result.data.generation,digest:result.data.digest,
      title:result.data.content.title,audience:result.data.audience});}
    last=row.id;
  }
  if(candidates.length>100&&!more)return unavailableMcp('incomplete');
  const nextCursor=more&&last?await createMcpHandle(db,actor,{kind:'cursor',category:'plans',customerId:input.customerId,section:'plans',filterDigest,
    positionId:last,contentDigest:snapshot}):null;
  return envelope({items},items.length?'available':'empty',nextCursor);
}
