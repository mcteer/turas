import {Client} from 'pg';
import {join,resolve} from 'node:path';
import {readFile,rm} from 'node:fs/promises';
import {workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {verifyRecoveryCandidate} from './candidate-verification';
import {withPrivateRecoveryKey} from './recovery-key';
import {decryptRecoveryFile} from './backup-crypto';
import {unpackBackupArchive} from './backup-archive';
import {restoreOwnedWorkDump} from './pg-restore';
import {restoreOwnedRecoveryObjects} from './object-restore';
import {recoveryContentDigest} from './recovery-content';
import {quarantineRestoredAuthority} from './recovery-quarantine';

/** Authenticated work capture rehearsal into a disposable local cluster.
 * Restores public application data and private objects, then quarantines all
 * authority. No provider schema, managed execution or current permission proof
 * is inferred, and no runtime is started or granted access. */
export async function restoreIsolatedWorkCapture(input:{candidate:unknown;bundle:string;keyFile:string;output:string;signal:AbortSignal}){
 const targetUrl=requireOwnedPilotDatabase(process.env,true),candidate=workCaptureCandidateSchema.parse(input.candidate),root=resolve(input.output);
 await verifyRecoveryCandidate({...input,candidate,environmentId:candidate.environmentId});
 const archive=join(root,'work.archive'),unpacked=join(root,'unpacked');
 try{
  const header=await withPrivateRecoveryKey({file:input.keyFile,excludedRoots:[root,resolve(input.bundle,'..')],signal:input.signal},async key=>{
   await decryptRecoveryFile(input.bundle,archive,key,candidate.encryptedBundle.headerDigest,input.signal);
   return unpackBackupArchive({archive,target:unpacked,expectedHeaderDigest:candidate.encryptedBundle.headerDigest,environmentId:candidate.environmentId,checkpointId:candidate.id,signal:input.signal});
  });
  const restored=await restoreOwnedWorkDump({dump:join(unpacked,'database.dump'),...candidate.database,sourceDatabaseName:candidate.sourceDatabaseName,sourceEnvironmentId:candidate.environmentId,signal:input.signal});
  const db=new Client({connectionString:targetUrl,connectionTimeoutMillis:5000,statement_timeout:10000});await db.connect();
  try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
   try{
    await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL transaction_timeout='60s'");
    const ledger=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
    const installed=JSON.parse(await readFile(resolve('migrations/manifest.json'),'utf8')).migrations.map((entry:{file:string})=>({name:entry.file.replace(/\.cjs$/,'')})).sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
    if(JSON.stringify(ledger)!==JSON.stringify(installed)||recoveryDigest(ledger)!==candidate.ledgerDigest)throw Error('Restored work migration ledger differs');
    if(await recoveryContentDigest(db)!==candidate.acceptedContentDigest)throw Error('Restored work accepted content differs');
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
   const objects=await restoreOwnedRecoveryObjects({header,unpacked,target:join(root,'objects'),signal:input.signal});
   if(objects.inventoryDigest!==candidate.objects.inventoryDigest||objects.objectCount!==candidate.objects.objectCount)throw Error('Restored work object inventory differs');
   if(!restored.recoveryId||!restored.controlRevision)throw Error('Restored work lock identity unavailable');
   const quarantine=await quarantineRestoredAuthority(db,{environmentId:candidate.environmentId,recoveryId:restored.recoveryId,controlRevision:restored.controlRevision});
   return {...restored,contract:'pilot-work-isolated-restore-v1' as const,environmentId:candidate.environmentId,acceptedContentVerified:true,ledgerVerified:true,objectsVerified:true,objectCount:objects.objectCount,requiredScopeQuarantined:quarantine.allRequiredScopesQuarantined,workflowReconciled:false,permanentReplayVerified:false,currentAuthorityVerified:false,restorationReady:false,mode:'locked' as const};
  }finally{await db.end();}
 }finally{await rm(archive,{force:true});}
}
