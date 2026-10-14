import {it,expect} from 'vitest';
import {Client} from 'pg';
import {mkdir,mkdtemp,writeFile,readFile,rm,copyFile,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureOwnedRecoveryCandidate} from '../../../lib/server/operations/capture-candidate';
import {pilotRecovery} from '../../../scripts/pilot-recovery';
import {workCaptureCandidateSchema,type WorkCaptureCandidate} from '../../../lib/contracts/pilot-capture';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {objectKey,environmentObjectId} from '../../../lib/server/storage/private-objects';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';

it('authenticates separate encrypted work bytes, restores accepted content and six stores, and quarantines authority',async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/work-rehearsal-')),key=randomBytes(32);
 let candidate:WorkCaptureCandidate|undefined,sourceEnvironmentId='';
 try{
  await mkdir(join(root,'keys'),{mode:0o700});await writeFile(join(root,'keys','key'),key,{mode:0o600});await mkdir(join(root,'cold'),{mode:0o700});
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    sourceEnvironmentId=environment.environmentId;await pilotPublishedKnowledgeFixture(db as any,'primary');
    const recoveryId=randomUUID(),revision=Number((await db.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environment.environmentId,recoveryId])).rows[0].revision);
    const objects=join(root,'source-objects'),workflow=join(root,'empty-workflow');await mkdir(objects,{mode:0o700});await mkdir(workflow,{mode:0o700});
    const store=new LocalPrivateObjects(objects,environment.environmentId,10485760);
    for(const namespace of activeObjectNamespaces){await mkdir(join(objects,'e_'+environmentObjectId(environment.environmentId),namespace),{recursive:true,mode:0o700});const bytes=Buffer.from('Synthetic work restore '+namespace),digest=createHash('sha256').update(bytes).digest('hex');await store.put(objectKey(environment.environmentId,namespace,randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});}
    const owned=await captureOwnedRecoveryCandidate({environmentId:environment.environmentId,recoveryId,controlRevision:revision,sourceRoot:objects,workflowRoot:workflow,keyFile:join(root,'keys','key'),keyReference:'synthetic-work-key',keyVersion:'1',output:join(root,'capture')},environment.signal);
    // This synthetic fixture supplies an empty managed-execution inventory;
    // it makes no claim to checkpoint or resume any provider workflow.
    const {providerCalls:_,...common}=owned;
    const {stableBytesCaptured:__stable,...emptyWorkflow}=owned.workflow;
    candidate=workCaptureCandidateSchema.parse({...common,contract:'pilot-work-capture-candidate-v1',modelCalls:0,mailCalls:0,workflow:{...emptyWorkflow,backend:'managed-workflow',capability:'interrupted-reconciliation',reconciliationVerified:false}});
    await copyFile(join(root,'capture','candidate.encrypted'),join(root,'cold','candidate.encrypted'));await chmod(join(root,'cold','candidate.encrypted'),0o600);
   }finally{await db.end();}
  },{postgresMajor:18,deadlineMs:180000});
  await rm(join(root,'capture'),{recursive:true,force:true});await rm(join(root,'source-objects'),{recursive:true,force:true});await rm(join(root,'empty-workflow'),{recursive:true,force:true});
  if(!candidate)throw Error('Synthetic work candidate unavailable');const captured=candidate;
  await writeFile(join(root,'cold','candidate.json'),JSON.stringify(captured),{mode:0o600});
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    await db.query("UPDATE operations_control SET mode='locked'");
    const result=await pilotRecovery(['--restore-work-isolated','--environment',captured.environmentId,'--candidate',join(root,'cold','candidate.json'),'--bundle',join(root,'cold','candidate.encrypted'),'--key-file',join(root,'keys','key'),'--output',join(root,'restore')]);
    expect(result).toMatchObject({acceptedContentVerified:true,ledgerVerified:true,objectsVerified:true,objectCount:6,requiredScopeQuarantined:true,currentAuthorityVerified:false,permanentReplayVerified:false,workflowReconciled:false,restorationReady:false,mode:'locked'});
    expect((await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0]).toEqual({environment_id:sourceEnvironmentId,schema_version:57});
    expect(Number((await db.query('SELECT count(*) FROM operations_recovery_quarantines')).rows[0].count)).toBe(7);
    expect(Number((await db.query("SELECT count(*) FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rows[0].count)).toBe(0);
    expect((await readFile(join(root,'cold','candidate.encrypted'))).length).toBe(captured.encryptedBundle.sizeBytes);
   }finally{await db.end();}
  },{postgresMajor:18,deadlineMs:180000});
 }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
},420000);
