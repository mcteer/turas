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
 if(args[0]!=='--restore-work-isolated'||![11,15].includes(args.length))throw Error('Explicit isolated work recovery inputs required');
 const allowed=new Set(['environment','candidate','bundle','key-file','output','denials','destination']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid isolated work recovery inputs');values[key]=args[i+1];}
 if(!['environment','candidate','bundle','key-file','output'].every(key=>values[key])||!!values.denials!==!!values.destination||Object.keys(values).length!==(values.denials?7:5))throw Error('Complete isolated work recovery scope required');
 const candidatePath=resolve(values.candidate),candidate=workCaptureCandidateSchema.parse(await readEvidence(dirname(candidatePath),basename(candidatePath)));
 if((candidate as {environmentId?:unknown})?.environmentId!==values.environment)throw Error('Explicit work restore source differs');
 const root=resolve(values.output),source=await pilotSource(),id=randomUUID(),startedAt=new Date().toISOString();await createEvidenceDirectory(root);
 await writeEvidence(root,'started.json',{version:'pilot-work-isolated-recovery-v1',id,...source,environmentMarker:values.environment,startedAt,restorationReady:false});
 try{
  const result=await withRecoveryCancellation(900000,async signal=>{
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
    return {...restored,requiredOriginals};
   }finally{if(staging)await rm(staging,{recursive:true,force:true});}
  });
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Work recovery source changed');
  const finishedAt=new Date().toISOString(),timing=physicalRecoveryTiming({capturedAt:candidate.capturedAt,restoreStartedAt:startedAt,physicalRestoreFinishedAt:finishedAt});
  const receipt={version:'pilot-work-isolated-recovery-v1',id,...source,...result,startedAt,finishedAt,timing,physicalRestore:'pass',paidCalls:0,hostedProof:false,rpoVerified:false,rtoVerified:false};
  await writeEvidence(root,'restored.json',receipt);console.info(JSON.stringify({physicalRestore:'pass',objects:result.objectCount,requiredScopeQuarantined:true,currentAuthorityVerified:false,restorationReady:false,paidCalls:0}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{version:'pilot-work-isolated-recovery-v1',id,...source,state:'fail',safeFailure:'incomplete_work_isolated_restore',restorationReady:false});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotRecovery().catch(()=>{console.error('Isolated recovery failed; no unlock, runtime start or promotion approved.');process.exitCode=1;});
