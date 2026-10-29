import type {PoolClient} from 'pg';
import {z} from 'zod';
import {HttpFailure} from '../../contracts/http';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import type {CurrentSession} from '../auth/sessions';
import {readExecutionOverviewShared,readExecutionRecords} from '../execution/service';
import {executionRecordSchema} from '../execution/schema';
import {executionDigest} from '../execution/commands';
import {readPlan} from '../plans/read';
import {acceptedPlanRecoveryDigest} from './recovery-plan-projection';
const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),workspaceId:z.uuid(),customerId:z.uuid(),engagementId:z.uuid()});
const digest=z.string().regex(/^[a-f0-9]{64}$/),integer=z.coerce.number().int().nonnegative().safe();
const recordSchema=z.object({id:z.uuid(),revision_id:z.uuid(),baseline_id:z.uuid(),kind:z.string(),audience:z.enum(['internal','delivery']),content_digest:digest,version:integer,accepted_version:integer});
export type ExecutionRecoveryBinding=Awaited<ReturnType<typeof readExecutionRecoveryBinding>>;
/** Actor-independent accepted ledger inventory. No accepted head is omitted
 * because it belongs to an older baseline or has an internal audience. */
export async function readExecutionRecoveryBinding(db:PoolClient,raw:z.infer<typeof scopeSchema>){
 const scope=scopeSchema.parse(raw);
 const rows=(await db.query(`SELECT e.id,e.active_baseline_id,b.revision_id,b.plan_id,b.baseline_number,b.content_digest,p.aggregate_version,p.accepted_revision_id,e.audience
 FROM engagements e JOIN milestone_baselines b ON b.id=e.active_baseline_id AND b.engagement_id=e.id
 JOIN delivery_plans p ON p.id=b.plan_id
 WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3 AND e.customer_id=$4
 AND b.environment_id=e.environment_id AND b.workspace_id=e.workspace_id AND b.customer_id=e.customer_id
 AND p.environment_id=e.environment_id AND p.workspace_id=e.workspace_id AND p.customer_id=e.customer_id FOR SHARE OF e,p`,[scope.engagementId,scope.environmentId,scope.workspaceId,scope.customerId])).rows;
 if(rows.length!==1)throw new HttpFailure(403,'source_changed','Recovery execution baseline unavailable');
 const baseline=z.object({id:z.uuid(),active_baseline_id:z.uuid(),revision_id:z.uuid(),plan_id:z.uuid(),baseline_number:integer,content_digest:digest,aggregate_version:integer,accepted_revision_id:z.uuid(),audience:z.enum(['internal','delivery'])}).parse(rows[0]);
 const heads=(await db.query('SELECT id,current_baseline_id,version,generation,state,closeout_revision_id FROM execution_workspaces WHERE engagement_id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 FOR SHARE',[scope.engagementId,scope.environmentId,scope.workspaceId,scope.customerId])).rows;
 if(heads.length>1)throw Error('Ambiguous recovery execution head');
 const head=heads.length?z.object({id:z.uuid(),current_baseline_id:z.uuid(),version:integer,generation:integer,state:z.string(),closeout_revision_id:z.uuid().nullable()}).parse(heads[0]):null;
 const records=(await db.query(`SELECT r.id,r.accepted_revision_id AS revision_id,r.baseline_id,r.kind,v.audience,v.content_digest,r.version,d.expected_version::bigint+1 AS accepted_version
 FROM execution_records r LEFT JOIN execution_record_revisions v ON v.id=r.accepted_revision_id AND v.record_id=r.id
 LEFT JOIN LATERAL(SELECT expected_version FROM execution_review_decisions WHERE revision_id=v.id AND action='accept' ORDER BY created_at DESC,id DESC LIMIT 1)d ON true
 WHERE r.engagement_id=$1 AND r.environment_id=$2 AND r.workspace_id=$3 AND r.customer_id=$4 AND r.accepted_revision_id IS NOT NULL
 ORDER BY r.id LIMIT 257 FOR SHARE OF r`,[scope.engagementId,scope.environmentId,scope.workspaceId,scope.customerId])).rows;
 if(records.length>256)throw Error('Recovery accepted execution inventory exceeds bound');
 const accepted=records.map(row=>recordSchema.parse(row));
 const milestoneRows=(await db.query('SELECT id,baseline_id,milestone_key,state,version,current_event_id FROM execution_milestone_heads WHERE engagement_id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 ORDER BY id LIMIT 257 FOR SHARE',[scope.engagementId,scope.environmentId,scope.workspaceId,scope.customerId])).rows;
 if(milestoneRows.length>256)throw Error('Recovery milestone inventory exceeds bound');
 const milestones=milestoneRows.map(row=>z.object({id:z.uuid(),baseline_id:z.uuid(),milestone_key:z.string(),state:z.string(),version:integer,current_event_id:z.uuid().nullable()}).parse(row));
 const value={scope,baseline,head,accepted,milestones};
 return Object.freeze({...value,bindingDigest:recoveryDigest(value),generation:z.number().int().positive().safe().parse((head?.generation??0)+1)});
}
const overviewSchema=z.object({engagementId:z.uuid(),customerId:z.uuid(),baselineId:z.uuid(),baselineRevisionId:z.uuid(),planVersion:integer,generation:integer,reviewRequired:z.literal(false),closeoutReviewRequired:z.literal(false),state:z.string(),workPackages:z.array(z.object({key:z.string(),title:z.string()})),milestones:z.array(z.object({id:z.uuid(),key:z.string(),baselineId:z.uuid(),version:integer,state:z.string(),recordedState:z.string(),reviewRequired:z.literal(false)}).passthrough())}).passthrough();
const projectedRecordSchema=z.object({id:z.uuid(),revisionId:z.uuid(),acceptedRevisionId:z.uuid(),baselineId:z.uuid(),kind:z.string(),audience:z.enum(['internal','delivery']),version:integer,state:z.literal('accepted'),reviewRequired:z.boolean(),contentDigest:digest,acceptedContentDigest:digest,content:z.record(z.string(),z.unknown())}).passthrough();
export function executionRecoveryProjectionDigest(value:unknown,binding:ExecutionRecoveryBinding){
 const parsed=z.object({bindingDigest:z.literal(binding.bindingDigest),overview:overviewSchema,records:z.array(projectedRecordSchema).max(256)}).parse(value),overview=parsed.overview;
 if(overview.engagementId!==binding.scope.engagementId||overview.customerId!==binding.scope.customerId||overview.baselineId!==binding.baseline.active_baseline_id||overview.baselineRevisionId!==binding.baseline.revision_id||overview.planVersion!==binding.baseline.aggregate_version||overview.generation!==(binding.head?.generation??0)||overview.state==='review_required')throw Error('Recovery execution overview differs');
 const currentMilestones=binding.milestones.filter(row=>row.baseline_id===binding.baseline.active_baseline_id);
 if(overview.milestones.length!==currentMilestones.length||new Set(overview.milestones.map(row=>row.id)).size!==overview.milestones.length)throw Error('Recovery current milestone coverage incomplete');
 for(const expected of currentMilestones){const milestone=overview.milestones.find(row=>row.id===expected.id);if(!milestone||milestone.key!==expected.milestone_key||milestone.baselineId!==expected.baseline_id||milestone.version!==expected.version||milestone.state!==expected.state||milestone.recordedState!==expected.state||milestone.state==='review_required')throw Error('Recovery current milestone identity or eligibility differs');}
 if(parsed.records.length!==binding.accepted.length||new Set(parsed.records.map(row=>row.id)).size!==parsed.records.length)throw Error('Recovery accepted execution coverage incomplete');
 for(const expected of binding.accepted){
  const record=parsed.records.find(row=>row.id===expected.id);
  if(!record||record.revisionId!==expected.revision_id||record.acceptedRevisionId!==expected.revision_id||record.baselineId!==expected.baseline_id||record.version!==expected.accepted_version||record.kind!==expected.kind||record.audience!==expected.audience||record.contentDigest!==expected.content_digest||record.acceptedContentDigest!==expected.content_digest)throw Error('Recovery accepted execution identity differs');
  const content=executionRecordSchema.parse(record.content);
  if(content.kind!==record.kind||content.audience!==record.audience)throw Error('Recovery accepted execution content identity differs');
  if(executionDigest(record.content)!==expected.content_digest||executionDigest(content)!==expected.content_digest)throw Error('Recovery accepted execution content differs');
  if(record.baselineId===binding.baseline.active_baseline_id&&record.reviewRequired)throw Error('Current accepted execution requires review');
 }
 return recoveryDigest(parsed);
}
/** Same governed readers and authenticated client as normal delivery. Exact
 * record-by-record reads avoid session-bound cursor substitution or truncation. */
export async function readRecoveryExecution(db:PoolClient,actor:CurrentSession,binding:ExecutionRecoveryBinding){
 const {scope,baseline}=binding,overview=await readExecutionOverviewShared(db,actor,scope.engagementId);
 const plan=await readPlan(actor,baseline.plan_id,baseline.revision_id,db);
 acceptedPlanRecoveryDigest(plan,{planId:baseline.plan_id,customerId:scope.customerId,revisionId:baseline.revision_id,generation:String(baseline.aggregate_version)});
 const content=z.object({milestones:z.array(z.unknown()),workPackages:z.array(z.unknown()),asOf:z.string()}).parse(plan.content);
 const payload=(await db.query('SELECT content FROM milestone_baseline_payloads WHERE baseline_id=$1',[baseline.active_baseline_id])).rows;
 if(payload.length!==1||recoveryDigest(payload[0].content)!==recoveryDigest({milestones:content.milestones,workPackages:content.workPackages,asOf:content.asOf}))throw Error('Recovery baseline payload differs from its accepted plan');
 const records=[];
 for(const expected of binding.accepted){const page=await readExecutionRecords(actor,scope.engagementId,{state:'accepted',recordId:expected.id,limit:1},false,db,true,false);if(page.records.length!==1||page.nextCursor!==null||page.generation!==(binding.head?.generation??0))throw Error('Recovery accepted execution record unavailable');records.push(page.records[0]);}
 const result={bindingDigest:binding.bindingDigest,overview,records};executionRecoveryProjectionDigest(result,binding);
 if((await readExecutionRecoveryBinding(db,scope)).bindingDigest!==binding.bindingDigest)throw Error('Recovery execution ledger changed');
 return result;
}
