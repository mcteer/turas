import {physicalRecoveryTiming} from '../lib/server/operations/recovery-timing';
import {recoveryManifestSchema} from '../lib/contracts/pilot-recovery';
import {workCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {resolve,dirname,basename} from 'node:path';
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
 if(args[0]!=='--restore-work-isolated'||args.length!==11)throw Error('Explicit isolated work recovery inputs required');
 const allowed=new Set(['environment','candidate','bundle','key-file','output']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid isolated work recovery inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete isolated work recovery scope required');
 const candidatePath=resolve(values.candidate),candidate=workCaptureCandidateSchema.parse(await readEvidence(dirname(candidatePath),basename(candidatePath)));
 if((candidate as {environmentId?:unknown})?.environmentId!==values.environment)throw Error('Explicit work restore source differs');
 const root=resolve(values.output),source=await pilotSource(),id=randomUUID(),startedAt=new Date().toISOString();await createEvidenceDirectory(root);
 await writeEvidence(root,'started.json',{version:'pilot-work-isolated-recovery-v1',id,...source,environmentMarker:values.environment,startedAt,restorationReady:false});
 try{
  const result=await withRecoveryCancellation(900000,signal=>restoreIsolatedWorkCapture({candidate,bundle:resolve(values.bundle),keyFile:resolve(values['key-file']),output:root,signal}));
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Work recovery source changed');
  const finishedAt=new Date().toISOString(),timing=physicalRecoveryTiming({capturedAt:candidate.capturedAt,restoreStartedAt:startedAt,physicalRestoreFinishedAt:finishedAt});
  const receipt={version:'pilot-work-isolated-recovery-v1',id,...source,...result,startedAt,finishedAt,timing,physicalRestore:'pass',paidCalls:0,hostedProof:false,rpoVerified:false,rtoVerified:false};
  await writeEvidence(root,'restored.json',receipt);console.info(JSON.stringify({physicalRestore:'pass',objects:result.objectCount,requiredScopeQuarantined:true,currentAuthorityVerified:false,restorationReady:false,paidCalls:0}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{version:'pilot-work-isolated-recovery-v1',id,...source,state:'fail',safeFailure:'incomplete_work_isolated_restore',restorationReady:false});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotRecovery().catch(()=>{console.error('Isolated recovery failed; no unlock, runtime start or promotion approved.');process.exitCode=1;});
