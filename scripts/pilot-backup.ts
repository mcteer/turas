import {verifyRecoveryCandidate} from '../lib/server/operations/candidate-verification';
import {pilotCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {captureOwnedRecoveryCandidate} from "../lib/server/operations/capture-candidate";
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {verifyRecoveryManifest,recoveryDigest} from '../lib/contracts/pilot-recovery';
import {verifyEncryptedRecoveryBundle} from '../lib/server/operations/backup-verification';
import {readFile} from 'node:fs/promises';
import {assessBackupSchedule} from '../lib/server/operations/backup-schedule';
import {copyNeonCaptureCandidate,expireWorkNeonArchives} from './pilot-neon-archive';
import {pilotDatabaseSafetyCopy} from './pilot-database-safety-copy';
import {pilotWorkCaptureInspect} from './pilot-work-capture-inspect';
import {pilotWorkBackupCost} from './pilot-work-backup-cost';
import {pilotWorkCaptureRehearsal} from './pilot-work-capture-rehearsal';
/** Integrity-only operator verification. Capture/current authority/outside-domain
 * verification and restore remain separate operations and acceptance gates. */
export async function pilotBackup(args=process.argv.slice(2)){
 if(args[0]==='--rehearse-work-capture')return pilotWorkCaptureRehearsal(args);
 if(args[0]==='--provision-work-cost'||args[0]==='--review-work-cost')return pilotWorkBackupCost(args);
 if(args[0]==='--database-safety-copy')return pilotDatabaseSafetyCopy(args);
 if(args[0]==='--inspect-work-capture')return pilotWorkCaptureInspect(args);
 if(args[0]==='--expire-neon-managed')return expireWorkNeonArchives(args);
 if(args[0]==='--copy-neon-candidate')return copyNeonCaptureCandidate(args);
 if(args[0]==='--copy-work-candidate')return copyNeonCaptureCandidate(args);
 if(args[0]==='--verify-candidate')return pilotVerifyCandidate(args);
 if(args[0]==='--capture-owned')return pilotCaptureCandidate(args);
 if(args[0]==='--schedule-check')return pilotBackupSchedule(args);
 if(args[0]!=='--verify'||args.length!==13)throw Error('Explicit backup verification required');
 const allowed=new Set(['environment','ledger-digest','manifest','bundle','key-file','output']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid backup verification inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size||!values.environment||!/^[a-f0-9]{64}$/.test(values['ledger-digest']))throw Error('Exact backup environment and ledger required');
 const source=await pilotSource(),root=resolve(values.output),runId=randomUUID();await createEvidenceDirectory(root);
 try{
  const manifestPath=resolve(values.manifest),manifest=verifyRecoveryManifest(await readEvidence(dirname(manifestPath),basename(manifestPath)),{environmentId:values.environment,ledgerDigest:values['ledger-digest']});
  const result=await withRecoveryCancellation(300000,signal=>verifyEncryptedRecoveryBundle({manifest,environmentId:values.environment,ledgerDigest:values['ledger-digest'],bundle:resolve(values.bundle),keyFile:resolve(values['key-file']),signal}));
  const current=await pilotSource();if(current.sourceCommit!==source.sourceCommit||current.sourceDigest!==source.sourceDigest||current.catalogDigest!==source.catalogDigest)throw Error('Backup verifier source changed');
  const receipt={version:'pilot-backup-verification-v1',runId,...source,environmentMarker:values.environment,manifestId:manifest.id,bundleDigest:manifest.encryptedBundle.digest,scopeDigest:recoveryDigest({environmentId:values.environment,manifestId:manifest.id,bundleDigest:manifest.encryptedBundle.digest,ledgerDigest:values['ledger-digest']}),verifiedAt:new Date().toISOString(),state:'pass',...result};
  await writeEvidence(root,'verification.json',receipt);console.info(JSON.stringify({state:'pass',integrityVerified:true,restorationReady:false}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{version:'pilot-backup-verification-v1',runId,...source,environmentMarker:values.environment,state:'fail',safeFailure:'incomplete_backup_verification'});throw error;}
}
async function pilotBackupSchedule(args:string[]){
 if(args.length!==7)throw Error('Explicit schedule inventory required');
 const values:Record<string,string>={},allowed=new Set(['environment','inventory','output']);
 for(let i=1;i<args.length;i+=2){const flag=args[i],key=flag.replace(/^--/,'');if(!flag.startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid schedule inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==3)throw Error('Complete schedule inputs required');
 const source=await pilotSource(),runId=randomUUID(),root=resolve(values.output);await createEvidenceDirectory(root);
 try{
  const inventory=resolve(values.inventory),schedule=JSON.parse(await readFile(new URL('../infra/pilot/backup-schedule.json',import.meta.url),'utf8'));
  const entries=await readEvidence(dirname(inventory),basename(inventory)),assessment=assessBackupSchedule({schedule,environmentId:values.environment,entries,now:Date.now()});
  const current=await pilotSource();if(current.sourceCommit!==source.sourceCommit||current.sourceDigest!==source.sourceDigest||current.catalogDigest!==source.catalogDigest)throw Error('Schedule verifier source changed');
  const receipt={...assessment,...source,runId,inventoryDigest:recoveryDigest(entries)};
  await writeEvidence(root,'schedule.json',receipt);console.info(JSON.stringify({fresh:receipt.fresh,scheduleDue:receipt.scheduleDue,scheduleExecutionVerified:false,deletionAuthorized:false}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{...source,runId,state:'fail',safeFailure:'incomplete_schedule_inventory'});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotBackup().catch(()=>{console.error('Backup verification failed; no restoration or unlock approved.');process.exitCode=1;});

async function pilotCaptureCandidate(args:string[]){
 const allowed=new Set(['environment','recovery-id','control-revision','source-root','workflow-root','key-file','key-reference','key-version','output']),values:Record<string,string>={};
 if(args.length!==19)throw Error('Complete explicit owned capture inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid owned capture input');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete owned capture scope required');
 return withRecoveryCancellation(300000,async signal=>{const candidate=await captureOwnedRecoveryCandidate({environmentId:values.environment,recoveryId:values['recovery-id'],controlRevision:Number(values['control-revision']),sourceRoot:values['source-root'],workflowRoot:values['workflow-root'],keyFile:values['key-file'],keyReference:values['key-reference'],keyVersion:values['key-version'],output:values.output},signal);console.info(JSON.stringify({state:'candidate-captured',objectCount:candidate.objects.objectCount,workflowFiles:candidate.workflow.fileCount,restorationReady:false,outsideCopyVerified:false}));return candidate;});
}

async function pilotVerifyCandidate(args:string[]){
 const allowed=new Set(['environment','candidate','bundle','key-file','output']),values:Record<string,string>={};if(args.length!==11)throw Error('Exact candidate verification inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid candidate verification input');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete candidate verification scope required');
 const root=resolve(values.output),source=await pilotSource(),id=randomUUID();await createEvidenceDirectory(root);
 try{
  const path=resolve(values.candidate),candidate=pilotCaptureCandidateSchema.parse(await readEvidence(dirname(path),basename(path)));
  const result=await withRecoveryCancellation(300000,signal=>verifyRecoveryCandidate({candidate,environmentId:values.environment,bundle:values.bundle,keyFile:values['key-file'],signal}));
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Candidate verification source changed');
  const receipt={...result,id,verifierSource:source,capturedSourceMatchesVerifier:candidate.sourceCommit===source.sourceCommit&&candidate.sourceDigest===source.sourceDigest&&candidate.catalogDigest===source.catalogDigest,verifiedAt:new Date().toISOString()};
  await writeEvidence(root,'verification.json',receipt);console.info(JSON.stringify({archiveIntegrityVerified:true,objectCount:receipt.objectCount,workflowFiles:receipt.workflowFiles,restorationReady:false}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{id,verifierSource:source,state:'fail',safeFailure:'incomplete_candidate_verification',restorationReady:false});throw error;}
}
