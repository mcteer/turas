import {Client} from 'pg';
import {z} from 'zod';
import {resolve,join,dirname,basename} from 'node:path';
import {mkdtemp,realpath,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pilotWorkCaptureInspect} from './pilot-work-capture-inspect';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {workRecoveryKeyReferenceSchema,readWorkRecoveryKey} from './pilot-database-safety-copy';
import {deriveWorkBackupKey} from '../lib/server/operations/work-backup-run';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {withPilotEnvironment,requireOwnedPilotDatabase} from './pilot-environment';
import {pilotWorkRecovery} from './pilot-recovery';
const keySchema=z.strictObject({contract:z.literal('pilot-work-master-key-reference-v1'),reference:workRecoveryKeyReferenceSchema,version:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/)});

/** Cold, separately keyed archive rehearsal. Creates and destroys only an
 * owned local target; never restores into the source or starts its runtime. */
export async function pilotWorkCaptureRehearsal(args:string[]){
 if(args.length!==11||args[0]!=='--rehearse-work-capture')throw Error('Explicit cold work capture rehearsal required');
 const allowed=new Set(['destination','key-reference','archive-id','environment','output']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid cold work rehearsal argument');values[key]=args[i+1];}
 if(Object.keys(values).length!==5)throw Error('Complete cold work rehearsal scope required');z.uuid().parse(values['archive-id']);
 const destinationFile=resolve(values.destination),keyFile=resolve(values['key-reference']),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(destinationFile),basename(destinationFile))),keyReference=keySchema.parse(await readEvidence(dirname(keyFile),basename(keyFile)));
 if(keyReference.reference.projectId!==destination.operatorProjectId||!/^TURAS_RECOVERY_MASTER_[A-Z0-9_]{1,100}$/.test(keyReference.reference.name))throw Error('Exact separate work master required');
 const source=await pilotSource(),root=resolve(values.output),startedAt=new Date().toISOString();await createEvidenceDirectory(root);
 const inspection=join(root,'inspection');let keyRoot:string|undefined,master:Buffer|undefined,archiveKey:Buffer|undefined;
 try{
  await pilotWorkCaptureInspect(['--inspect-work-capture','--destination',destinationFile,'--key-reference',keyFile,'--archive-id',values['archive-id'],'--environment',values.environment,'--output',inspection]);
  const signal=AbortSignal.timeout(300000),cloud=await verifyWorkNeonDestination(destination,signal);
  master=await readWorkRecoveryKey(keyReference.reference,destination.teamId,destination.operatorProjectId,signal);
  archiveKey=deriveWorkBackupKey(master,{installationId:destination.installationId,environmentId:values.environment,archiveId:values['archive-id']});
  keyRoot=await mkdtemp(join(await realpath(tmpdir()),'turas-work-rehearsal-key-'));const archiveKeyFile=join(keyRoot,'key');await writeFile(archiveKeyFile,archiveKey,{mode:0o600,flag:'wx'});
  const restored=await withPilotEnvironment(async environment=>{
   const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();try{await owner.query("UPDATE operations_control SET mode='locked' WHERE environment_id=$1",[environment.environmentId]);}finally{await owner.end();}
   return pilotWorkRecovery(['--restore-work-isolated','--environment',values.environment,'--candidate',join(inspection,'candidate.json'),'--bundle',join(inspection,'candidate.encrypted'),'--key-file',archiveKeyFile,'--output',join(root,'restore')]);
  },{postgresMajor:18,deadlineMs:300000});
  if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Cold work rehearsal binding changed');
  const fresh=await readWorkRecoveryKey(keyReference.reference,destination.teamId,destination.operatorProjectId,signal);try{if(!fresh.equals(master))throw Error('Separate work master changed');}finally{fresh.fill(0);}
  await rm(keyRoot,{recursive:true,force:true});keyRoot=undefined;
  const receipt={contract:'pilot-work-cold-rehearsal-v1',...source,archiveId:values['archive-id'],environmentId:values.environment,startedAt,finishedAt:new Date().toISOString(),coldArchiveVerified:true,separateKeyRetrieved:true,acceptedContentVerified:restored.acceptedContentVerified,ledgerVerified:restored.ledgerVerified,objectsVerified:restored.objectsVerified,objectCount:restored.objectCount,requiredScopeQuarantined:true,ownedTargetRemoved:true,ephemeralKeyRemoved:true,originalArchiveRetained:true,primaryDatabaseChanged:false,workflowReconciled:false,currentAuthorityVerified:false,permanentReplayVerified:false,rtoVerified:false,restorationReady:false};
  await writeEvidence(root,'rehearsal.json',receipt);console.info(JSON.stringify({coldWorkRehearsal:'pass',ownedTargetRemoved:true,objectCount:receipt.objectCount,currentAuthorityVerified:false,restorationReady:false}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{contract:'pilot-work-cold-rehearsal-v1',...source,state:'fail',safeFailure:'incomplete_cold_work_rehearsal',primaryDatabaseChanged:false,restorationReady:false});throw error;}
 finally{master?.fill(0);archiveKey?.fill(0);if(keyRoot)await rm(keyRoot,{recursive:true,force:true});}
}
