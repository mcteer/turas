import {it,expect} from 'vitest';
import {randomUUID,randomBytes} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {issueOwnedRecoveryHttpRead,retireOwnedRecoveryHttpRead} from '../../../lib/server/operations/recovery-http-read-issuer';
import {submitPlanCommand} from '../../../lib/server/plans/commands';
import {createPlanReviewPreview,decidePlan} from '../../../lib/server/plans/decisions';
import {syntheticPlanContent} from '../../fixtures/plans/seed';
import {planDraftContentSchema} from '../../../lib/contracts/plan-content';
import {GET as maintenancePlan} from '../../../app/api/operations/recovery-read/[admissionId]/plan/route';
import {GET as ordinaryPlan} from '../../../app/api/plans/[planId]/route';
type Admission=Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>;
async function fixture(run:(input:{owner:Client;admission:Admission;request:()=>Request;planId:string;revisionId:string})=>Promise<void>,maximumRequests=3){
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary'),content=planDraftContentSchema.parse(syntheticPlanContent());content.assertions=[];content.sourceDependencies=[];
  const plan=await submitPlanCommand(f.actor,{action:'create',requestKey:randomUUID(),workspaceId:f.actor.workspaceId,customerId:f.customerId,workloadId:null,audience:'delivery',ownerMembershipId:f.actor.membershipId,content});
  const submitted=await submitPlanCommand(f.actor,{action:'submit',requestKey:randomUUID(),planId:plan.planId,expectedAggregateVersion:plan.aggregateVersion,revisionId:plan.revisionId,contentDigest:plan.contentDigest});
  const preview=await createPlanReviewPreview(f.actor,plan.planId,{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:plan.revisionId,contentDigest:plan.contentDigest});
  await decidePlan(f.actor,plan.planId,{action:'accept',requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:plan.revisionId,contentDigest:plan.contentDigest,reviewPreviewId:preview.previewId,rationale:'Review synthetic recovery HTTP plan',deliverySuitabilityConfirmed:true});
  const {recoveryId,controlRevision}=await lockAuthorityTarget(owner,environmentId),password=randomBytes(32).toString('base64url'),prior=process.env.DATABASE_URL!;
  await closeRuntimePool();await runtime.end();
  await retireOwnedLegacyRuntime(owner,{environmentId,recoveryId,controlRevision,password});
  const replacement=new URL(prior);replacement.username='turas_runtime_016';replacement.password=password;process.env.DATABASE_URL=replacement.toString();
  let admission:Admission|undefined;
  try{
   await owner.query('BEGIN');try{admission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{environmentId,recoveryId,controlRevision,workspaceId:f.actor.workspaceId,customerId:f.customerId,deadline:Date.now()+59000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests,deploymentId:null,readKind:'plan',recordId:plan.planId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
   const actual=admission;
   const request=()=>new Request(process.env.TURAS_APP_ORIGIN+'/api/operations/recovery-read/'+actual.id+'/plan',{headers:{host:new URL(process.env.TURAS_APP_ORIGIN!).host,cookie:'turas_session='+actual.actor.token,'x-turas-recovery-read':actual.secret}});
   await run({owner,admission:actual,request,planId:plan.planId,revisionId:plan.revisionId});
  }finally{try{if(admission)await retireOwnedRecoveryHttpRead(owner as unknown as PoolClient,admission.id);}finally{await closeRuntimePool();process.env.DATABASE_URL=prior;}}
 });
}
it('reads the canonical accepted plan through exact locked maintenance authority while ordinary ingress stays closed',async()=>fixture(async({owner,admission,request,planId,revisionId})=>{
 await expect(owner.query("INSERT INTO operations_recovery_http_reads SELECT (jsonb_populate_record(NULL::operations_recovery_http_reads,to_jsonb(a)||jsonb_build_object('id',$2::text,'record_digest',NULL))).* FROM operations_recovery_http_reads a WHERE id=$1",[admission.id,randomUUID()])).rejects.toMatchObject({code:'23514'});
 const response=await maintenancePlan(request(),{params:Promise.resolve({admissionId:admission.id})});expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({data:{planId,revisionId,acceptedRevisionId:revisionId,reviewState:'accepted'}});
 const normal=new Request(process.env.TURAS_APP_ORIGIN+'/api/plans/'+planId,{headers:request().headers});expect((await ordinaryPlan(normal,{params:Promise.resolve({planId})})).status).toBe(401);
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('rejects foreign credentials and wrong recovery read kinds without releasing plan content',async()=>fixture(async({admission,request})=>{
 const wrong=request();wrong.headers.set('cookie','turas_session='+randomBytes(32).toString('base64url'));
 expect((await maintenancePlan(wrong,{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
 const url=new URL(request().url);url.pathname=url.pathname.replace(/\/plan$/,'/profile');
 expect((await maintenancePlan(new Request(url,{headers:request().headers}),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
}),210000);
it('withholds changed accepted bindings and retired maintenance credentials',async()=>fixture(async({owner,admission,request,planId})=>{
 await owner.query('UPDATE delivery_plans SET aggregate_version=aggregate_version+1 WHERE id=$1',[planId]);
 expect((await maintenancePlan(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
 await retireOwnedRecoveryHttpRead(owner as unknown as PoolClient,admission.id);
 expect((await maintenancePlan(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
}),210000);
it('retains the finite reservation after a successful canonical read',async()=>fixture(async({owner,admission,request})=>{
 expect((await maintenancePlan(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(200);
 expect((await maintenancePlan(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(429);
 expect((await owner.query('SELECT used_requests FROM operations_recovery_http_reads WHERE id=$1',[admission.id])).rows[0].used_requests).toBe(1);
},1),210000);
