import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {readHostedConfiguration} from '../../../lib/server/operations/hosted-configuration';
import {assertHostedPaidAdmission,verifyHostedPaidJobs} from '../../../scripts/pilot-hosted-paid';
async function fixture(run:(input:Parameters<typeof assertHostedPaidAdmission>[0],db:Client)=>Promise<void>){
 await withPilotEnvironment(async environment=>{
  const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  try{
   const workspaceId=randomUUID(),budgetId=randomUUID(),digest='a'.repeat(64);
   await db.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic paid admission','synthetic_pilot',$2,$3)",[workspaceId,environment.environmentId,randomUUID()]);
   await db.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$3,$3,3000000,clock_timestamp()+interval '1 hour')",[budgetId,environment.environmentId,digest]);
   const image='vcr.vercel.com/synthetic/turas/image@sha256:'+digest;
   const configuration=readHostedConfiguration({TURAS_ENVIRONMENT_ID:environment.environmentId,VERCEL_PROJECT_ID:'prj_synthetic',VERCEL_TEAM_ID:'team_synthetic',BLOB_STORE_ID:'store_synthetic',VERCEL_BLOB_RETRIES:'0',TURAS_PRIVATE_OBJECT_BACKEND:'blob',TURAS_JOB_EXECUTOR:'sandbox',TURAS_PILOT_HOSTED_JOBS_ENABLED:'1',TURAS_PILOT_SCANNER_IMAGE:image,TURAS_PILOT_PARSER_IMAGE:image,TURAS_PILOT_RENDERER_IMAGE:image,TURAS_PILOT_JOB_COST_JSON:JSON.stringify({maximumDispatches:32,budgetId,scopeDigest:digest,pricingDigest:digest})})!;
   const scope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:configuration.projectId,teamId:configuration.teamId,deploymentId:'dpl_synthetic',origin:'https://synthetic.example',environmentMarker:environment.environmentId,workspaceId,target:'preview',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:digest,catalogDigest:digest} as PilotHostedScope;
   await run({scope,db,configuration,authorizationDigest:digest,authorizationExpiresAt:new Date(Date.now()+2*3600000).toISOString(),requiredJobs:2},db);
  }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:180000});
}
it('checks actual current scoped authority without reserving or dispatching paid work',async()=>fixture(async(input,db)=>{
 expect(await assertHostedPaidAdmission(input)).toMatchObject({budgetId:input.configuration.costBudgetId,heldOrCompletedJobs:0,automaticTopUp:false});
 expect((await db.query('SELECT count(*)::int AS n FROM operations_cost_reservations WHERE budget_id=$1',[input.configuration.costBudgetId])).rows[0].n).toBe(0);
 await expect(verifyHostedPaidJobs({...input,domainKind:'artifact',domainJobIds:[randomUUID()],expectedImageDigests:['a'.repeat(64),'a'.repeat(64)]})).rejects.toThrow('receipts incomplete');
}),210000);
it('denies changed target budget expiry scope count workspace and admission before paid callbacks',async()=>fixture(async(input,db)=>{
 for(const changed of [{...input,authorizationDigest:'b'.repeat(64)},{...input,authorizationExpiresAt:new Date().toISOString()},{...input,requiredJobs:33},{...input,scope:{...input.scope,target:'production' as const}},{...input,configuration:{...input.configuration,costScopeDigest:'b'.repeat(64)}},{...input,configuration:{...input.configuration,costPricingDigest:'b'.repeat(64)}},{...input,configuration:{...input.configuration,maximumSandboxDispatches:33}}])await expect(assertHostedPaidAdmission(changed)).rejects.toThrow();
 await db.query('UPDATE workspaces SET active=false WHERE id=$1',[input.scope.workspaceId]);await expect(assertHostedPaidAdmission(input)).rejects.toThrow('authority unavailable');
 await db.query('UPDATE workspaces SET active=true WHERE id=$1',[input.scope.workspaceId]);await db.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[input.scope.environmentMarker]);await expect(assertHostedPaidAdmission(input)).rejects.toThrow('authority unavailable');
 expect((await db.query('SELECT count(*)::int AS n FROM operations_hosted_jobs')).rows[0].n).toBe(0);
}),210000);
