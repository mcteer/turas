import {z} from 'zod';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {rm} from 'node:fs/promises';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {workRecoveryKeyReferenceSchema,readWorkRecoveryKey} from './pilot-database-safety-copy';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {readWorkCapture} from '../lib/server/operations/work-capture-read';
const keySchema=z.strictObject({contract:z.literal('pilot-work-master-key-reference-v1'),reference:workRecoveryKeyReferenceSchema,version:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/)});

/** Cold operator inspection with actual independent project/key/resource reads.
 * No source connection, Production mutation or implicit readiness decision. */
export async function pilotWorkCaptureInspect(args:string[]){
 if(args.length!==11||args[0]!=='--inspect-work-capture')throw Error('Explicit work capture inspection required');
 const allowed=new Set(['destination','key-reference','archive-id','environment','output']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const name=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(name)||values[name]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid work inspection argument');values[name]=args[i+1];}
 if(Object.keys(values).length!==5)throw Error('Complete work inspection scope required');z.uuid().parse(values['archive-id']);
 const file=resolve(values.destination),keyFile=resolve(values['key-reference']),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(file),basename(file))),keyReference=keySchema.parse(await readEvidence(dirname(keyFile),basename(keyFile)));
 if(keyReference.reference.projectId!==destination.operatorProjectId||!/^TURAS_RECOVERY_MASTER_[A-Z0-9_]{1,100}$/.test(keyReference.reference.name))throw Error('Exact independently retained work master required');
 const source=await pilotSource(),preservation=await pilotProtectedSnapshot(),root=resolve(values.output),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(300000,async signal=>{
  let master:Buffer|undefined;
  try{
   const cloud=await verifyWorkNeonDestination(destination,signal);
   master=await readWorkRecoveryKey(keyReference.reference,destination.teamId,destination.operatorProjectId,signal);
   const inspected=await readWorkCapture({connectionString:destination.databaseUrl,installationId:destination.installationId,archiveId:values['archive-id'],environmentId:values.environment,sourceProjectId:destination.sourceProjectId,master,masterReference:keyReference.reference.name,masterVersion:keyReference.version,output:root,signal});
   const fresh=await readWorkRecoveryKey(keyReference.reference,destination.teamId,destination.operatorProjectId,signal);
   try{if(!fresh.equals(master))throw Error('Retained work master changed during inspection');}finally{fresh.fill(0);}
   if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(preservation))throw Error('Cold work placement or protected checkout changed');
   const receipt={contract:'pilot-work-cold-inspection-receipt-v1',id,...source,recordedAt:new Date().toISOString(),archiveId:values['archive-id'],environmentId:values.environment,cloud,capturedSourceCommit:inspected.candidate.sourceCommit,capturedSourceDigest:inspected.candidate.sourceDigest,encryptedArchiveVerified:true,captureMetadataVerified:true,separateKeyRetrieved:true,independentWorkPlacementVerified:true,sourceAccessed:false,databaseRestored:false,currentAuthorityVerified:false,scheduledInvocationVerified:false,restorationReady:false};
   await writeEvidence(root,'candidate.json',inspected.candidate);await writeEvidence(root,'archive-header.json',inspected.header);
   await writeEvidence(root,'inspection.json',receipt);console.info(JSON.stringify({coldWorkInspection:'pass',sourceAccessed:false,databaseRestored:false,restorationReady:false}));return receipt;
  }catch(error){for(const name of ['candidate.encrypted','matched.archive','unpacked','candidate.json','archive-header.json'])await rm(resolve(root,name),{recursive:true,force:true});await writeEvidence(root,'failure.json',{contract:'pilot-work-cold-inspection-failure-v1',id,...source,state:'fail',restorationReady:false});throw error;}
  finally{master?.fill(0);}
 });
}
