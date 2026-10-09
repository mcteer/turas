import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {expansionId,expansionVersion} from '../../contracts/expansion';
import {getServerConfig} from '../config';
import {withTransaction} from '../db/client';
import {lockOriginalHeader} from '../plans/sources';
import {verifySupportSources} from '../support/sources';
import {lockExpansionActor,type ExpansionActor} from './policy';
import {expansionScope} from './repository';
import {admitExpansionRequest} from './commands';
import {expansionLinkMetadata,verifyExpansionLinkPlans,mergeExpansionDependencies} from './links';
import {dependencyUnion} from './dependencies';
import {expansionOutput} from './projection-schema';
const querySchema=z.object({workloadId:expansionId.optional()}).strict();
export const expansionDeliveryChoicesSchema=z.object({plans:z.array(z.object({planId:expansionId,revisionId:expansionId,title:z.string().min(1).max(200)}).strict()).max(50),engagements:z.array(z.object({engagementId:expansionId,baselineId:expansionId,revisionId:expansionId,generation:expansionVersion,title:z.string().min(1).max(200)}).strict()).max(50)}).strict();
export async function readExpansionDeliveryChoices(actor:ExpansionActor,customerId:string,raw:unknown){
 const input=querySchema.parse(raw);await admitExpansionRequest(actor,customerId,'read');
 return withTransaction(async db=>{
  await lockExpansionActor(db,actor,customerId);const workloadId=input.workloadId??null;await expansionScope(db,actor,customerId,workloadId);const env=getServerConfig().TURAS_ENVIRONMENT_ID;
  const plans=(await db.query(`SELECT id,accepted_revision_id FROM delivery_plans WHERE environment_id=$1 AND workspace_id=$2 AND customer_id=$3 AND accepted_revision_id IS NOT NULL AND ($4::uuid IS NULL OR workload_id=$4) ORDER BY id LIMIT 51`,[env,actor.workspaceId,customerId,workloadId])).rows;
  const engagements=(await db.query(`SELECT e.id,b.id AS baseline_id,b.revision_id,b.baseline_number FROM engagements e JOIN milestone_baselines b ON b.id=e.active_baseline_id WHERE e.environment_id=$1 AND e.workspace_id=$2 AND e.customer_id=$3 AND ($4::uuid IS NULL OR e.workload_id=$4) ORDER BY e.id LIMIT 51`,[env,actor.workspaceId,customerId,workloadId])).rows;
  if(plans.length>50||engagements.length>50)throw new HttpFailure(422,'scope_too_large','Choose a workload to narrow delivery links');
  const candidates=[];
  for(const plan of plans)candidates.push({kind:'plan' as const,row:plan,selected:[] as string[],metadata:await expansionLinkMetadata(db,actor,customerId,workloadId,[],[{kind:'plan_revision',planId:plan.id,revisionId:plan.accepted_revision_id}])});
  for(const engagement of engagements)candidates.push({kind:'engagement' as const,row:engagement,selected:[engagement.id],metadata:await expansionLinkMetadata(db,actor,customerId,workloadId,[engagement.id],[])});
  const closure=await dependencyUnion(db,actor,customerId,candidates.flatMap(candidate=>[...candidate.metadata.refs,...candidate.metadata.planDependencies.map(source=>({kind:source.kind,sourceRevisionId:source.revisionId,generation:source.generation,contentDigest:source.contentDigest}))]));
  for(const dependency of mergeExpansionDependencies([closure]))if(!['execution_record','milestone_baseline'].includes(dependency.kind))await lockOriginalHeader(db,dependency.kind as 'accepted_profile'|'approved_excerpt'|'verified_research'|'shared_knowledge',dependency.revisionId);
  const eligible=new Set<typeof candidates[number]>();
  for(const candidate of [...candidates].sort((a,b)=>(a.metadata.plans[0]?.planId??'').localeCompare(b.metadata.plans[0]?.planId??''))){
   try{await verifyExpansionLinkPlans(db,actor,customerId,candidate.metadata,true);eligible.add(candidate);}catch(error){if(!(error instanceof HttpFailure)||![404,409,422].includes(error.status))throw error;}
  }
  const result:{plans:z.infer<typeof expansionDeliveryChoicesSchema>['plans'];engagements:z.infer<typeof expansionDeliveryChoicesSchema>['engagements']}={plans:[],engagements:[]};
  for(const candidate of candidates){if(!eligible.has(candidate))continue;
   try{if(candidate.selected.length)await verifySupportSources(db,actor,customerId,workloadId,'internal',candidate.selected,candidate.metadata.refs,true);
    const revisionId=candidate.kind==='plan'?candidate.row.accepted_revision_id:candidate.row.revision_id;
    const payload=(await db.query('SELECT title FROM plan_revision_payloads WHERE revision_id=$1',[revisionId])).rows[0];if(!payload)continue;
    if(candidate.kind==='plan')result.plans.push({planId:candidate.row.id,revisionId,title:payload.title});
    else result.engagements.push({engagementId:candidate.row.id,baselineId:candidate.row.baseline_id,revisionId,generation:Number(candidate.row.baseline_number),title:payload.title});
   }catch(error){if(!(error instanceof HttpFailure)||![404,409,422].includes(error.status))throw error;}
  }
  return expansionOutput(expansionDeliveryChoicesSchema,result);
 });
}
