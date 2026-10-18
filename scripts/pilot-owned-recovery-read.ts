import {Client,type PoolClient} from 'pg';
import {z} from 'zod';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {requireOwnedPilotDatabase} from './pilot-environment';
import {pilotSource} from './pilot-source';
import {readEvidence,createEvidenceDirectory,writeEvidence,evidenceDigest} from './pilot-evidence';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {withAuthenticatedOwnerRecoveryRead} from '../lib/server/operations/authenticated-recovery-read';
import {readProfile} from '../lib/server/profiles/read';
import {readAcceptedPlan} from '../lib/server/plans/read';
import {currentRecoveryStateDigest} from '../lib/server/operations/recovery-state';

const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const ownedRecoveryReadScopeSchema=z.strictObject({contract:z.literal('pilot-owned-recovery-read-scope-v1'),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),workspaceId:z.uuid(),customerId:z.uuid(),expiresAt:z.iso.datetime({offset:true}),acceptedProfileRevisionIds:z.array(z.uuid()).min(1).max(50),acceptedPlans:z.array(z.strictObject({id:z.uuid(),revisionId:z.uuid()})).min(1).max(20)}).superRefine((value,ctx)=>{
 if(new Set(value.acceptedProfileRevisionIds).size!==value.acceptedProfileRevisionIds.length||new Set(value.acceptedPlans.map(plan=>plan.id)).size!==value.acceptedPlans.length)ctx.addIssue({code:'custom',message:'Unique exact recovery read records required'});
});
const credentialSchema=z.strictObject({contract:z.literal('pilot-owned-recovery-credential-v1'),loginName:z.literal('mcteer'),password:z.string().min(1).max(4096)});
/** Actual governed reads on an owned locked restore only. This is a partial
 * diagnostic, never complete required-service, HTTP, Workflow or unlock proof. */
export async function pilotOwnedRecoveryRead(args:string[]){
 const allowed=new Set(['scope','credential','output']),values:Record<string,string>={};
 if(args[0]!=='--probe-owned-service'||args.length!==7)throw Error('Explicit private owned recovery read inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid owned recovery read inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==3)throw Error('Complete owned recovery read scope required');
 const connection=requireOwnedPilotDatabase(process.env,true),source=await pilotSource();
 const privateJson=async(file:string)=>{const path=resolve(file);return readEvidence(dirname(path),basename(path));};
 const scope=ownedRecoveryReadScopeSchema.parse(await privateJson(values.scope));
 if((['sourceCommit','sourceDigest','catalogDigest'] as const).some(key=>scope[key]!==source[key]))throw Error('Owned recovery read source differs');
 const remaining=Date.parse(scope.expiresAt)-Date.now();if(remaining<=0||remaining>300000)throw Error('Fresh bounded owned recovery read scope required');
 const credential=credentialSchema.parse(await privateJson(values.credential)),root=resolve(values.output),id=randomUUID();
 await createEvidenceDirectory(root);
 return withRecoveryCancellation(remaining,async signal=>{
  const db=new Client({connectionString:connection,connectionTimeoutMillis:5000,statement_timeout:5000});let transaction=false,stage='owned_admission';
  try{
   await db.connect();await db.query('BEGIN');transaction=true;
   await db.query("SET LOCAL lock_timeout='3000ms'");
   await db.query("SELECT set_config('transaction_timeout',$1,true)",[Math.max(1,Date.parse(scope.expiresAt)-Date.now())+'ms']);
   const probes=await withAuthenticatedOwnerRecoveryRead(db as unknown as PoolClient,{environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,workspaceId:scope.workspaceId,deadline:Date.parse(scope.expiresAt),password:credential.password},async actor=>{
    stage='canonical_profile';signal.throwIfAborted();
    const profile=await readProfile(actor,scope.customerId,db as unknown as PoolClient,undefined,undefined,false,true) as {customer:{id:string};acceptedFacts:{id:string}[]};
    if(profile.customer.id!==scope.customerId||scope.acceptedProfileRevisionIds.some(revision=>!profile.acceptedFacts.some(fact=>fact.id===revision)))throw Error('Required accepted recovery profile differs');
    const plans=[];stage='canonical_plans';
    for(const expected of scope.acceptedPlans){signal.throwIfAborted();const plan=await readAcceptedPlan(db as unknown as PoolClient,actor,scope.customerId,expected.id);if(!plan||plan.plan.accepted_revision_id!==expected.revisionId)throw Error('Required accepted recovery plan differs');plans.push({id:expected.id,revisionId:expected.revisionId,resultDigest:evidenceDigest(JSON.stringify(plan))});}
    return {sessionId:actor.sessionId,profileDigest:evidenceDigest(JSON.stringify(profile)),plans};
   });
   stage='retired_session';signal.throwIfAborted();
   const retired=(await db.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1',[probes.sessionId])).rows;
   if(retired.length!==1||retired[0].retired!==true)throw Error('Recovery probe session must be retired');
   const currentStateDigest=await currentRecoveryStateDigest(db);signal.throwIfAborted();
   if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Owned recovery read source changed');
   await db.query('COMMIT');transaction=false;
   const receipt={contract:'pilot-owned-recovery-read-v1',id,...source,scopeDigest:evidenceDigest(JSON.stringify(scope)),environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,workspaceId:scope.workspaceId,customerId:scope.customerId,completedAt:new Date().toISOString(),profileDigest:probes.profileDigest,acceptedProfileRevisions:scope.acceptedProfileRevisionIds,plans:probes.plans,currentStateDigest,temporarySessionRevoked:true,mode:'locked',requiredScopeHealthy:false,authenticatedHttpVerified:false,workflowReconciled:false,serviceOpened:false,restorationReady:false,modelCalls:0,providerCalls:0};
   await writeEvidence(root,'reads.json',receipt);return receipt;
  }catch(error){if(transaction)await db.query('ROLLBACK').catch(()=>{});await writeEvidence(root,'failure.json',{id,...source,stage,safeFailure:'incomplete_owned_recovery_read',serviceOpened:false,restorationReady:false});throw error;}
  finally{await db.end();}
 });
}
