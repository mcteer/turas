import {expect,it} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {withOwnerRecoveryReadCapability,requireOperationalOpen} from '../../../lib/server/operations/admission';
import {lockProfileActor} from '../../../lib/server/profiles/policy';
import {readProfile} from '../../../lib/server/profiles/read';
import {randomUUID} from 'node:crypto';
import {readAcceptedPlan} from '../../../lib/server/plans/read';
import {submitPlanCommand} from '../../../lib/server/plans/commands';
import {createPlanReviewPreview,decidePlan} from '../../../lib/server/plans/decisions';
import {syntheticPlanContent} from '../../fixtures/plans/seed';
import {planDraftContentSchema} from '../../../lib/contracts/plan-content';
import {withAuthenticatedOwnerRecoveryRead} from '../../../lib/server/operations/authenticated-recovery-read';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pilotSource} from '../../../scripts/pilot-source';
import {writeEvidence,readEvidence} from '../../../scripts/pilot-evidence';
import {pilotOwnedRecoveryRead} from '../../../scripts/pilot-owned-recovery-read';
import {recallPublicLearning} from '../../../lib/server/research/specialists/research-cache/public-learning-read';

async function acceptedRecoveryProposal(actor:import('../../../lib/server/auth/sessions').CurrentSession,customerId:string){
  const content=planDraftContentSchema.parse(syntheticPlanContent());content.assertions=[];content.sourceDependencies=[];
  const plan=await submitPlanCommand(actor,{action:'create',requestKey:randomUUID(),workspaceId:actor.workspaceId,customerId:customerId,workloadId:null,audience:'delivery',ownerMembershipId:actor.membershipId,content});
  const submitted=await submitPlanCommand(actor,{action:'submit',requestKey:randomUUID(),planId:plan.planId,expectedAggregateVersion:plan.aggregateVersion,revisionId:plan.revisionId,contentDigest:plan.contentDigest});
  const preview=await createPlanReviewPreview(actor,plan.planId,{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:plan.revisionId,contentDigest:plan.contentDigest});
  await decidePlan(actor,plan.planId,{action:'accept',requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:plan.revisionId,contentDigest:plan.contentDigest,reviewPreviewId:preview.previewId,rationale:'Review controlled synthetic recovery proposal',deliverySuitabilityConfirmed:true});
 return plan;
}

it('bounds owner recovery reads to one live actor, connection, control revision and deadline',async()=>{
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');
  const plan=await acceptedRecoveryProposal(f.actor,f.customerId);
  const locked=await lockAuthorityTarget(owner,environmentId),db=owner as unknown as PoolClient;
  const scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision,deadline:Date.now()+60000};
  await expect(withOwnerRecoveryReadCapability(db,f.actor,scope,async()=>{})).rejects.toThrow('active transaction');
  await owner.query('BEGIN');await runtime.query('BEGIN');
  const read=()=>lockProfileActor(db,f.actor,f.customerId,undefined,true);
  await expect(read()).rejects.toThrow('Service temporarily unavailable');
  await expect(withOwnerRecoveryReadCapability(db,{...f.actor,token:'a'.repeat(43)},scope,async()=>{})).rejects.toThrow('Exact owner');
  await expect(withOwnerRecoveryReadCapability(runtime as unknown as PoolClient,f.actor,scope,async()=>{})).rejects.toThrow('Exact owner');
  await expect(withOwnerRecoveryReadCapability(db,f.actor,{...scope,deadline:Date.now()-1},async()=>{})).rejects.toThrow('unavailable');
  await withOwnerRecoveryReadCapability(db,f.actor,scope,async()=>{
   await read();
   const profile=await readProfile(f.actor,f.customerId,db,undefined,undefined,false,true) as {customer:{id:string};acceptedFacts:{id:string}[]};
   expect(profile.customer.id).toBe(f.customerId);expect(profile.acceptedFacts.some(fact=>fact.id===f.originalRevisionId)).toBe(true);
   const accepted=await readAcceptedPlan(db,f.actor,f.customerId,plan.planId);
   expect(accepted?.plan.accepted_revision_id).toBe(plan.revisionId);
   await expect(readAcceptedPlan(db,{...f.actor},f.customerId,plan.planId)).rejects.toThrow('Service temporarily unavailable');
   const identity={...f.actor,userId:f.actor.principalId,environmentId};
   for(const mismatch of [{userId:'foreign'},{environmentId:'foreign'},{sessionId:'foreign'},{principalId:'foreign'},{membershipId:'foreign'},{workspaceId:'foreign'},{token:'foreign'},{role:'member' as const},{kind:'partner' as const},{loginName:'panel'}]){
    await expect(recallPublicLearning({...identity,...mismatch},f.customerId,'',AbortSignal.timeout(1000),false,db,f.actor)).rejects.toThrow();
   }
   const concurrent=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await concurrent.connect();
   try{
    await concurrent.query("SET lock_timeout='250ms'");
    await expect(concurrent.query('UPDATE operations_control SET revision=revision+1 WHERE environment_id=$1',[environmentId])).rejects.toThrow('lock timeout');
    await expect(concurrent.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[f.actor.sessionId])).rejects.toThrow('lock timeout');
   }finally{await concurrent.end();}
   await expect(lockProfileActor(db,{...f.actor},f.customerId,undefined,true)).rejects.toThrow('Service temporarily unavailable');
   await expect(requireOperationalOpen(runtime as unknown as PoolClient,f.actor,true)).rejects.toThrow('Service temporarily unavailable');
   await runtime.query('COMMIT');
   await expect(lockProfileActor(db,f.actor,f.customerId)).rejects.toThrow('Service temporarily unavailable');
   await expect(withOwnerRecoveryReadCapability(db,f.actor,scope,async()=>{})).rejects.toThrow('unavailable');
   await owner.query('UPDATE operations_control SET revision=revision+1 WHERE environment_id=$1',[environmentId]);
   await expect(read()).rejects.toThrow('Service temporarily unavailable');
  });
  await expect(read()).rejects.toThrow('Service temporarily unavailable');
  const next={...scope,controlRevision:scope.controlRevision+1};
  await expect(withOwnerRecoveryReadCapability(db,f.actor,next,async()=>{throw Error('Controlled callback failure');})).rejects.toThrow('Controlled callback failure');
  await expect(read()).rejects.toThrow('Service temporarily unavailable');
  await withOwnerRecoveryReadCapability(db,f.actor,next,async()=>{
   await owner.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[f.actor.sessionId]);
   await expect(read()).rejects.toThrow('Sign in again');
  });
  await expect(withOwnerRecoveryReadCapability(db,f.actor,next,async()=>{})).rejects.toThrow('Exact owner');
  await owner.query('COMMIT');
  expect((await owner.query('SELECT mode FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0].mode).toBe('locked');
 });
},210000);

it('authenticates an owned post-quarantine read and retires its temporary session even after a SQL failure',async()=>{
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const db=owner as unknown as PoolClient,f=await pilotPublishedKnowledgeFixture(db,'primary');
  const plan=await acceptedRecoveryProposal(f.actor,f.customerId);
  const locked=await lockAuthorityTarget(owner,environmentId),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision};
  await quarantineRestoredAuthority(owner,scope);
  const input={...scope,workspaceId:f.actor.workspaceId,deadline:Date.now()+60000,password:process.env.TURAS_DEMO_PASSWORD!};
  await expect(withAuthenticatedOwnerRecoveryRead(db,input,async()=>{})).rejects.toThrow('SAVEPOINT');
  await runtime.query('BEGIN');
  await expect(withAuthenticatedOwnerRecoveryRead(runtime as unknown as PoolClient,input,async()=>{})).rejects.toThrow('Exact owner');
  await runtime.query('COMMIT');
  await owner.query('BEGIN');
  const count=Number((await owner.query('SELECT count(*) FROM login_sessions')).rows[0].count);
  await expect(withAuthenticatedOwnerRecoveryRead(db,{...input,password:input.password+'x'},async()=>{})).rejects.toThrow('Recovery authentication unavailable');
  await expect(withAuthenticatedOwnerRecoveryRead(db,{...input,workspaceId:randomUUID()},async()=>{})).rejects.toThrow('Recovery authentication unavailable');
  expect(Number((await owner.query('SELECT count(*) FROM login_sessions')).rows[0].count)).toBe(count);
  let sessionId='';
  await withAuthenticatedOwnerRecoveryRead(db,input,async actor=>{
   sessionId=actor.sessionId;expect(Object.isFrozen(actor)).toBe(true);expect(actor.sessionId).not.toBe(f.actor.sessionId);
   const profile=await readProfile(actor,f.customerId,db,undefined,undefined,false,true) as {customer:{id:string};acceptedFacts:{id:string}[]};
   expect(profile.customer.id).toBe(f.customerId);expect(profile.acceptedFacts.some(fact=>fact.id===f.originalRevisionId)).toBe(true);
   await expect(lockProfileActor(db,actor,f.customerId)).rejects.toThrow('Service temporarily unavailable');
  });
  expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[sessionId])).rows[0].revoked_at).toBeInstanceOf(Date);
  await expect(withAuthenticatedOwnerRecoveryRead(db,input,async()=>{await owner.query('SELECT 1/0');})).rejects.toThrow('division by zero');
  expect(Number((await owner.query('SELECT count(*) FROM login_sessions WHERE revoked_at IS NULL')).rows[0].count)).toBe(0);
  await owner.query('COMMIT');
  expect(Number((await owner.query('SELECT count(*) FROM login_sessions WHERE revoked_at IS NULL')).rows[0].count)).toBe(0);
  expect(Number((await owner.query('SELECT count(*) FROM operations_recovery_quarantines')).rows[0].count)).toBe(7);
  expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
  await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/authenticated-read-command-'));
  try{
   const source=await pilotSource(),commandScope={contract:'pilot-owned-recovery-read-scope-v1',...source,...scope,workspaceId:f.actor.workspaceId,customerId:f.customerId,expiresAt:new Date(Date.now()+60000).toISOString(),acceptedProfileRevisionIds:[f.originalRevisionId],acceptedPlans:[{id:plan.planId,revisionId:plan.revisionId}]};
   await writeEvidence(root,'scope.json',commandScope);await writeEvidence(root,'credential.json',{contract:'pilot-owned-recovery-credential-v1',loginName:'mcteer',password:input.password});
   const args=['--probe-owned-service','--scope',join(root,'scope.json'),'--credential',join(root,'credential.json'),'--output',join(root,'success')];
   const result=await pilotOwnedRecoveryRead(args);
   expect(result).toMatchObject({temporarySessionRevoked:true,mode:'locked',requiredScopeHealthy:false,authenticatedHttpVerified:false,serviceOpened:false,restorationReady:false,modelCalls:0,providerCalls:0});
   expect(result.plans[0]).toMatchObject({id:plan.planId,revisionId:plan.revisionId});
   await writeEvidence(root,'wrong-scope.json',{...commandScope,acceptedPlans:[{id:plan.planId,revisionId:randomUUID()}]});
   await expect(pilotOwnedRecoveryRead(['--probe-owned-service','--scope',join(root,'wrong-scope.json'),'--credential',join(root,'credential.json'),'--output',join(root,'failure')])).rejects.toThrow('Required accepted recovery plan differs');
   expect(await readEvidence(join(root,'failure'),'failure.json')).toMatchObject({stage:'canonical_plans',serviceOpened:false,restorationReady:false});
   expect(Number((await owner.query('SELECT count(*) FROM login_sessions WHERE revoked_at IS NULL')).rows[0].count)).toBe(0);
  }finally{await rm(root,{recursive:true,force:true});}
 });
},210000);
