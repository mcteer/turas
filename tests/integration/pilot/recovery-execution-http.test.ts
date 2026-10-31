import {it,expect,vi} from 'vitest';
import {randomUUID,randomBytes} from 'node:crypto';
import type {Client,PoolClient} from 'pg';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {reportsDeliveryFixture,addReviewedReportActivity} from '../../fixtures/reports/delivery';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {issueOwnedRecoveryHttpRead,retireOwnedRecoveryHttpRead} from '../../../lib/server/operations/recovery-http-read-issuer';
import {readExecutionRecoveryBinding,executionRecoveryProjectionDigest} from '../../../lib/server/operations/recovery-execution-read';
import {readExecutionOverview,readExecutionRecords,submitExecutionCommand} from '../../../lib/server/execution/service';
import {readPlan} from '../../../lib/server/plans/read';
import {submitPlanCommand} from '../../../lib/server/plans/commands';
import {createPlanReviewPreview,decidePlan} from '../../../lib/server/plans/decisions';
import {GET as maintenanceExecution} from '../../../app/api/operations/recovery-read/[admissionId]/execution/route';
import {GET as ordinaryExecution} from '../../../app/api/execution/engagements/[engagementId]/route';
import {sessionCookie} from '../../../lib/server/auth/sessions';
type Baseline=Awaited<ReturnType<typeof reportsDeliveryFixture>>;
type Admission=Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>;
type Input={owner:Client;admission:Admission;request:()=>Request;baseline:Baseline;acceptedIds:string[];binding:Awaited<ReturnType<typeof readExecutionRecoveryBinding>>};
async function fixture(run:(input:Input)=>Promise<void>,options:{maximumRequests?:number;beforeLock?:(baseline:Baseline)=>Promise<void>}={}){
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const baseline=await reportsDeliveryFixture(),delivery=await addReviewedReportActivity(baseline,{narrative:'Accepted delivery recovery observation'}),internal=await addReviewedReportActivity(baseline,{audience:'internal',narrative:'Accepted internal recovery observation'});
  const accepted=(await readExecutionRecords(baseline.author,baseline.engagementId,{state:'accepted',recordId:delivery.id,limit:1})).records[0];
  const view=await readExecutionOverview(baseline.author,baseline.engagementId);
  await submitExecutionCommand(baseline.author,baseline.engagementId,{version:'execution-v1',action:'record.revise',requestKey:randomUUID(),expectedVersions:{execution:view.version,record:accepted.version},payload:{recordId:accepted.id,record:{...accepted.content,narrative:'Pending correction must not substitute accepted content'}}});
  if(options.beforeLock)await options.beforeLock(baseline);
  const locked=await lockAuthorityTarget(owner,environmentId),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision},password=randomBytes(32).toString('base64url'),prior=process.env.DATABASE_URL!;
  await closeRuntimePool();await runtime.end();await retireOwnedLegacyRuntime(owner,{...scope,password});
  const replacement=new URL(prior);replacement.username='turas_runtime_016';replacement.password=password;process.env.DATABASE_URL=replacement.href;
  let admission:Admission|undefined;
  try{
   await owner.query('BEGIN');let binding:Input['binding'];try{binding=await readExecutionRecoveryBinding(owner as unknown as PoolClient,{environmentId,workspaceId:baseline.reviewer.workspaceId,customerId:baseline.customerId,engagementId:baseline.engagementId});admission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:baseline.reviewer.workspaceId,customerId:baseline.customerId,deadline:Date.now()+59000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:options.maximumRequests??3,deploymentId:null,readKind:'execution',recordId:baseline.engagementId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
   const actual=admission,request=()=>new Request(process.env.TURAS_APP_ORIGIN+'/api/operations/recovery-read/'+actual.id+'/execution',{headers:{host:new URL(process.env.TURAS_APP_ORIGIN!).host,cookie:sessionCookie(actual.actor.token,actual.actor.expiresAt).split(';')[0],'x-turas-recovery-read':actual.secret}});
   await run({owner,admission:actual,request,baseline,acceptedIds:[delivery.id,internal.id],binding});
  }finally{try{if(admission)await retireOwnedRecoveryHttpRead(owner as unknown as PoolClient,admission.id);}finally{await closeRuntimePool();process.env.DATABASE_URL=prior;}}
 });
}
it('reads every accepted execution record and baseline without substituting an administrator-visible pending revision',async()=>fixture(async({owner,admission,request,baseline,acceptedIds,binding})=>{
 const response=await maintenanceExecution(request(),{params:Promise.resolve({admissionId:admission.id})});expect(response.status).toBe(200);
 const {data}=await response.json();expect(data.records.map((row:{id:string})=>row.id).sort()).toEqual(acceptedIds.sort());expect(data.records.some((row:{audience:string})=>row.audience==='internal')).toBe(true);expect(JSON.stringify(data)).not.toContain('Pending correction');expect(executionRecoveryProjectionDigest(data,binding)).toMatch(/^[a-f0-9]{64}$/);
 expect(()=>executionRecoveryProjectionDigest({...data,overview:{...data.overview,milestones:data.overview.milestones.slice(1)}},binding)).toThrow('milestone coverage incomplete');expect(()=>executionRecoveryProjectionDigest({...data,overview:{...data.overview,milestones:data.overview.milestones.map((row:object)=>({...row,reviewRequired:true}))}},binding)).toThrow();
 expect(()=>executionRecoveryProjectionDigest({...data,records:data.records.slice(1)},binding)).toThrow('coverage incomplete');expect(()=>executionRecoveryProjectionDigest({...data,records:data.records.map((row:object)=>({...row,content:null}))},binding)).toThrow();
 expect((await ordinaryExecution(new Request(process.env.TURAS_APP_ORIGIN+'/api/execution/engagements/'+baseline.engagementId,{headers:request().headers}),{params:Promise.resolve({engagementId:baseline.engagementId})})).status).toBe(401);expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
it('rejects foreign cookies and a different fixed maintenance read kind',async()=>fixture(async({admission,request})=>{
 const diagnostic=vi.spyOn(console,'error');
 const foreign=request();foreign.headers.set('cookie','turas_session='+randomBytes(32).toString('base64url'));try{const response=await maintenanceExecution(foreign,{params:Promise.resolve({admissionId:admission.id})});if(response.status!==403){const body=await response.json();throw Error('Controlled execution diagnostic '+JSON.stringify({status:response.status,code:/^[a-z_]{1,64}$/.test(body.error?.code)?body.error.code:'unknown',diagnostics:diagnostic.mock.calls.map(row=>row[0]).filter(value=>typeof value==='string'&&value.startsWith('{\"kind\":\"recovery_execution_read_failed\"'))}));}}finally{diagnostic.mockRestore();}
 const wrong=new URL(request().url);wrong.pathname=wrong.pathname.replace(/\/execution$/,'/profile');expect((await maintenanceExecution(new Request(wrong,{headers:request().headers}),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
}),210000);
it('rejects changed execution generations and retired probe credentials',async()=>fixture(async({owner,admission,request,baseline})=>{
 await owner.query('UPDATE execution_workspaces SET generation=generation+1 WHERE engagement_id=$1',[baseline.engagementId]);expect((await maintenanceExecution(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
 await retireOwnedRecoveryHttpRead(owner as unknown as PoolClient,admission.id);expect((await maintenanceExecution(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
}),210000);
it('fails missing accepted payload coverage and retains the committed finite allowance after reader failure',async()=>fixture(async({owner,admission,request,binding})=>{
 await owner.query('DELETE FROM execution_record_payloads WHERE revision_id=$1',[binding.accepted[0].revision_id]);const failed=await maintenanceExecution(request(),{params:Promise.resolve({admissionId:admission.id})});expect(failed.status).not.toBe(200);expect((await failed.text())).not.toContain('Accepted delivery recovery observation');
 expect((await owner.query('SELECT used_requests FROM operations_recovery_http_reads WHERE id=$1',[admission.id])).rows[0].used_requests).toBe(1);expect((await maintenanceExecution(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(429);
},{maximumRequests:1}),210000);
it('inventories accepted older-baseline records instead of omitting them when current delivery needs reconciliation',async()=>fixture(async({owner,admission,request,baseline,binding,acceptedIds})=>{
 expect(binding.baseline.active_baseline_id).not.toBe(baseline.baselineId);expect(binding.accepted.map(row=>row.id).sort()).toEqual(acceptedIds.sort());expect(binding.accepted.every(row=>row.baseline_id===baseline.baselineId)).toBe(true);
 expect((await maintenanceExecution(request(),{params:Promise.resolve({admissionId:admission.id})})).status).not.toBe(200);expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
},{beforeLock:async baseline=>{
 const current=await readPlan(baseline.author,baseline.created.planId),created=await submitPlanCommand(baseline.author,{action:'save',requestKey:randomUUID(),planId:baseline.created.planId,expectedAggregateVersion:current.aggregateVersion,parentRevisionId:current.revisionId,baseAcceptedRevisionId:current.acceptedRevisionId,changeReason:'Review a replacement synthetic baseline',content:{...baseline.content,title:'Reviewed replacement recovery baseline'}});
 const submitted=await submitPlanCommand(baseline.author,{action:'submit',requestKey:randomUUID(),planId:created.planId,expectedAggregateVersion:created.aggregateVersion,revisionId:created.revisionId,contentDigest:created.contentDigest});
 const preview=await createPlanReviewPreview(baseline.reviewer,created.planId,{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:created.revisionId,contentDigest:created.contentDigest});
 await decidePlan(baseline.reviewer,created.planId,{action:'accept',requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:created.revisionId,contentDigest:created.contentDigest,reviewPreviewId:preview.previewId,rationale:'Review replacement synthetic recovery baseline',deliverySuitabilityConfirmed:true});
}}),210000);
