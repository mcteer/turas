import {z} from 'zod';
import {verifyOwnedMaintenanceRecovery} from '../lib/server/operations/owned-maintenance-verification';
import {verifyConfiguredCredentials} from '../lib/server/auth/credentials';
import {parseServerConfig} from '../lib/server/config';
import {DEMO_IDS} from '../lib/server/bootstrap-ids';
import {mintOwnedRestoreTarget,bindOwnedRestoredSource,withOwnedRestoreTarget,verifyOwnedRestoredRequiredObjects} from '../lib/server/operations/owned-restore-target';
import {readRetainedWorkDenialSnapshot} from './pilot-denial-reader';
import {mkdtemp,rm} from 'node:fs/promises';
import {physicalRecoveryTiming} from '../lib/server/operations/recovery-timing';
import {recoveryManifestSchema} from '../lib/contracts/pilot-recovery';
import {workCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {resolve,dirname,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {restoreIsolatedRecovery} from '../lib/server/operations/isolated-restore';
import {pilotLegacySafetyRehearsal} from './pilot-legacy-safety-rehearsal';
import {restoreIsolatedWorkCapture} from '../lib/server/operations/work-isolated-restore';

export async function pilotRecovery(args=process.argv.slice(2)){
 if(args[0]==='--restore-work-isolated')return pilotWorkRecovery(args);
 if(args[0]==='--restore-database-safety-copy')return pilotLegacySafetyRehearsal(args);
 if(args[0]!=='--restore-isolated'||args.length!==15)throw Error('Explicit isolated recovery inputs required');
 const allowed=new Set(['environment','ledger-digest','manifest','bundle','key-file','source-database','output']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid isolated recovery inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size||!/^[a-f0-9]{64}$/.test(values['ledger-digest']))throw Error('Complete isolated recovery scope required');
 const root=resolve(values.output),source=await pilotSource(),id=randomUUID(),startedAt=new Date().toISOString();await createEvidenceDirectory(root);
 await writeEvidence(root,'started.json',{version:'pilot-isolated-recovery-v1',id,...source,environmentMarker:values.environment,startedAt,mode:'locked',restorationReady:false});
 try{
  const manifestPath=resolve(values.manifest),manifest=recoveryManifestSchema.parse(await readEvidence(dirname(manifestPath),basename(manifestPath)));
  const result=await withRecoveryCancellation(900000,signal=>restoreIsolatedRecovery({manifest,environmentId:values.environment,ledgerDigest:values['ledger-digest'],bundle:resolve(values.bundle),keyFile:resolve(values['key-file']),sourceDatabaseName:values['source-database'],output:root,signal}));
  const current=await pilotSource();if(JSON.stringify(current)!==JSON.stringify(source))throw Error('Recovery source changed');
  const finishedAt=new Date().toISOString(),timing=physicalRecoveryTiming({capturedAt:manifest.capturedAt,restoreStartedAt:startedAt,physicalRestoreFinishedAt:finishedAt});
  const receipt={version:'pilot-isolated-recovery-v1',id,...source,...result,startedAt,finishedAt,timing,physicalRestore:'pass',paidCalls:0,hostedProof:false,rpoVerified:false,rtoVerified:false};
  await writeEvidence(root,'restored.json',receipt);console.info(JSON.stringify({physicalRestore:'pass',mode:'locked',currentAuthorityVerified:false,restorationReady:false,paidCalls:0}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{version:'pilot-isolated-recovery-v1',id,...source,state:'fail',safeFailure:'incomplete_isolated_restore',restorationReady:false});throw error;}
}
/** Protected, disposable target only; does not start an application or promote. */
export async function pilotWorkRecovery(args:string[]){
 if(args[0]!=='--restore-work-isolated'||![11,13,15,17].includes(args.length))throw Error('Explicit isolated work recovery inputs required');
 const allowed=new Set(['environment','candidate','bundle','key-file','output','denials','destination','maintenance-configuration']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid isolated work recovery inputs');values[key]=args[i+1];}
 if(!['environment','candidate','bundle','key-file','output'].every(key=>values[key])||!!values.denials!==!!values.destination||Object.keys(values).length!==5+(values.denials?2:0)+(values['maintenance-configuration']?1:0))throw Error('Complete isolated work recovery scope required');
 const candidatePath=resolve(values.candidate),candidate=workCaptureCandidateSchema.parse(await readEvidence(dirname(candidatePath),basename(candidatePath)));
 if((candidate as {environmentId?:unknown})?.environmentId!==values.environment)throw Error('Explicit work restore source differs');
 const root=resolve(values.output),source=await pilotSource(),id=randomUUID(),startedAt=new Date().toISOString();await createEvidenceDirectory(root);
 const maintenanceFile=values['maintenance-configuration']?resolve(values['maintenance-configuration']):undefined;
 const maintenance=maintenanceFile?z.strictObject({contract:z.literal('pilot-owned-maintenance-configuration-v1'),environmentId:z.string().min(1).max(256),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),catalogDigest:z.string().regex(/^[a-f0-9]{64}$/),password:z.string().min(1).max(4096),rendererImage:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).parse(await readEvidence(dirname(maintenanceFile),basename(maintenanceFile))):undefined;
 if(maintenance&&(maintenance.environmentId!==candidate.environmentId||maintenance.sourceCommit!==source.sourceCommit||maintenance.sourceDigest!==source.sourceDigest||maintenance.catalogDigest!==source.catalogDigest||verifyConfiguredCredentials('mcteer',maintenance.password,parseServerConfig(process.env))!==DEMO_IDS.mcteer))throw Error('Exact source and configured maintenance owner required');
 const deadline=Date.now()+900000;
 await writeEvidence(root,'started.json',{version:'pilot-work-isolated-recovery-v1',id,...source,environmentMarker:values.environment,startedAt,restorationReady:false});
 try{
  const result=await withRecoveryCancellation(Math.max(1,deadline-Date.now()),async signal=>{
   const staging=values.denials?await mkdtemp(join(root,'current-denials-')):undefined;
   try{
    const currentDenials=staging?await readRetainedWorkDenialSnapshot({receipt:values.denials,destination:values.destination,staging,environmentId:candidate.environmentId,after:candidate.capturedAt},signal):undefined;
    // Authenticate ownership before replacing the runner marker with the source.
    // The serialized restore receipt cannot mint this capability afterward.
    const runnerEnvironment=process.env.TURAS_ENVIRONMENT_ID??'',ownerLabel=runnerEnvironment.replace(/^test-pilot-/,'');
    const target=await mintOwnedRestoreTarget({container:'turas-016-check-'+ownerLabel,ownerLabel,environmentId:runnerEnvironment},signal);
    const restored=await restoreIsolatedWorkCapture({candidate,bundle:resolve(values.bundle),keyFile:resolve(values['key-file']),output:root,signal,currentDenials});
    const scope={environmentId:restored.environmentId,recoveryId:restored.physicalIntegrity.recoveryId,controlRevision:restored.physicalIntegrity.controlRevision};
    await bindOwnedRestoredSource(target,restored.physicalIntegrity,join(root,'objects'),signal);
    const requiredOriginals=await withOwnedRestoreTarget(target,scope,signal,async db=>{
     await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
     try{const proof=await verifyOwnedRestoredRequiredObjects(db,target,scope,signal);signal.throwIfAborted();await db.query('COMMIT');return proof;}
     catch(error){await db.query('ROLLBACK');throw error;}
    });
    const physicalRestoreFinishedAt=new Date().toISOString();
    if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Work recovery source changed');
    await writeEvidence(root,'physical-restored.json',{version:'pilot-work-physical-recovery-v1',id,...source,...restored,requiredOriginals,physicalRestoreFinishedAt,restorationReady:false});
    const maintenanceVerification=maintenance?await verifyOwnedMaintenanceRecovery({target,scope,password:maintenance.password,rendererImage:maintenance.rendererImage,signal,deadline}):undefined;
    return {...restored,requiredOriginals,physicalRestoreFinishedAt,...(maintenanceVerification?{maintenance:maintenanceVerification}:{})};
   }finally{if(staging)await rm(staging,{recursive:true,force:true});}
  });
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Work recovery source changed');
  const finishedAt=new Date().toISOString(),timing=physicalRecoveryTiming({capturedAt:candidate.capturedAt,restoreStartedAt:startedAt,physicalRestoreFinishedAt:result.physicalRestoreFinishedAt});
  const receipt={version:'pilot-work-isolated-recovery-v1',id,...source,...result,startedAt,finishedAt,timing,physicalRestore:'pass',paidCalls:0,hostedProof:false,rpoVerified:false,rtoVerified:false};
  await writeEvidence(root,'restored.json',receipt);console.info(JSON.stringify({physicalRestore:'pass',objects:result.objectCount,requiredScopeQuarantined:true,currentAuthorityVerified:false,restorationReady:false,paidCalls:0}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{version:'pilot-work-isolated-recovery-v1',id,...source,state:'fail',safeFailure:'incomplete_work_isolated_restore',restorationReady:false});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotRecovery().catch(()=>{console.error('Isolated recovery failed; no unlock or promotion approved.');process.exitCode=1;});
