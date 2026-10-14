import {Client} from 'pg';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {verifyRecoveryManifest,recoveryDigest} from '../../contracts/pilot-recovery';
import {verifyEncryptedRecoveryBundle,verifyRecoveryArchiveIndex} from './backup-verification';
import {withPrivateRecoveryKey} from './recovery-key';
import {decryptRecoveryFile} from './backup-crypto';
import {unpackBackupArchive} from './backup-archive';
import {restoreOwnedRecoveryDump} from './pg-restore';
import {recoveryContentDigest} from './recovery-content';
import {recoveryGrantCheckpoint} from './grant-checkpoint';
import {quarantineRestoredAuthority} from './recovery-quarantine';
import {LocalPrivateObjects} from '../storage/local-objects';
import {activeObjectNamespaces,verifiedObjectInventory} from '../storage/inventory';
import {environmentObjectId,objectKey} from '../storage/private-objects';

/** Physical recovery into an owned, already locked disposable target. Never
 * starts a runtime, reconciles current authority, unlocks, promotes or deletes
 * source backups. Production/Preview restore require their separate procedure. */
export async function restoreIsolatedRecovery(input:{manifest:unknown;environmentId:string;ledgerDigest:string;bundle:string;keyFile:string;sourceDatabaseName:string;output:string;signal:AbortSignal}){
 const targetUrl=requireOwnedPilotDatabase(process.env,true),targetEnvironmentId=process.env.TURAS_ENVIRONMENT_ID!;
 const manifest=verifyRecoveryManifest(input.manifest,{environmentId:input.environmentId,ledgerDigest:input.ledgerDigest});
 if(!/^test-pilot-[a-f0-9]{12}$/.test(manifest.environmentId)||manifest.environmentId===targetEnvironmentId)throw Error('Separate owned restore identity required');
 const root=resolve(input.output);
 await verifyEncryptedRecoveryBundle({...input,manifest});
 input.signal.throwIfAborted();
 const archive=join(root,'matched.archive'),unpacked=join(root,'unpacked');
 let restored=false;
 try{
  const header=await withPrivateRecoveryKey({file:input.keyFile,excludedRoots:[root,resolve(input.bundle,'..')],signal:input.signal},async key=>{
   await decryptRecoveryFile(resolve(input.bundle),archive,key,manifest.encryptedBundle.headerDigest,input.signal);
   return unpackBackupArchive({archive,target:unpacked,expectedHeaderDigest:manifest.encryptedBundle.headerDigest,environmentId:manifest.environmentId,checkpointId:manifest.id,signal:input.signal});
  });
  verifyRecoveryArchiveIndex(header,manifest);
  const result=await restoreOwnedRecoveryDump({dump:join(unpacked,'database.dump'),serverMajor:manifest.database.serverMajor,clientMajor:manifest.database.clientMajor,digest:manifest.database.dumpDigest,sizeBytes:manifest.database.dumpBytes,sourceDatabaseName:input.sourceDatabaseName,sourceEnvironmentId:manifest.environmentId,signal:input.signal});
  restored=true;
  const db=new Client({connectionString:targetUrl,connectionTimeoutMillis:5000});await db.connect();
  try{
   await db.query("SET statement_timeout='5000ms'");await db.query("SET lock_timeout='3000ms'");await db.query("SET transaction_timeout='30s'");
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
   try{
    await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='5000ms'");
    const ledger=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
    const installed=JSON.parse(await readFile(resolve('migrations/manifest.json'),'utf8')).migrations.map((entry:{file:string})=>({name:entry.file.replace(/\.cjs$/,'')})).sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
    if(JSON.stringify(ledger)!==JSON.stringify(installed)||recoveryDigest(ledger)!==manifest.ledgerDigest)throw Error('Restored migration ledger differs');
    if(await recoveryContentDigest(db)!==manifest.acceptedContentDigest)throw Error('Restored accepted content differs');
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}
   // Explicit owner grants, never request-time migration or implicit readiness.
   await db.query(await readFile(resolve('scripts/db-role-setup.sql'),'utf8'));
   if(await recoveryGrantCheckpoint(db)!==manifest.runtimeGrantsDigest)throw Error('Restored runtime grants differ');
   if((await db.query('SELECT mode FROM operations_control WHERE environment_id=$1',[manifest.environmentId])).rows[0]?.mode!=='locked')throw Error('Restore lock differs');
   await quarantineRestoredAuthority(db,{environmentId:manifest.environmentId,recoveryId:manifest.recoveryId,controlRevision:manifest.controlRevision});
  }finally{await db.end();}
  const storeRoot=join(root,'objects');await mkdir(storeRoot,{mode:0o700});
  for(const namespace of activeObjectNamespaces)await mkdir(join(storeRoot,'e_'+environmentObjectId(manifest.environmentId),namespace),{recursive:true,mode:0o700});
  const store=new LocalPrivateObjects(storeRoot,manifest.environmentId,10485760);
  for(const entry of header.entries.filter(entry=>entry.name.startsWith('objects/'))){
   input.signal.throwIfAborted();const [,namespace,id]=entry.name.split('/'),bytes=await readFile(join(unpacked,entry.name));
   await store.put(objectKey(manifest.environmentId,namespace as 'artifact',id),(async function*(){yield bytes;})(),entry);
  }
  const inventory=await verifiedObjectInventory(store,manifest.environmentId,activeObjectNamespaces,input.signal);
  const expected=header.entries.filter(entry=>entry.name.startsWith('objects/')).map(entry=>{const [,namespace,id]=entry.name.split('/');return {key:objectKey(manifest.environmentId,namespace as 'artifact',id),sizeBytes:entry.sizeBytes,digest:entry.digest};}).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  if(recoveryDigest(inventory.objects)!==recoveryDigest(expected))throw Error('Restored object inventory differs');
  input.signal.throwIfAborted();
  return {...result,environmentMarker:manifest.environmentId,acceptedContentVerified:true,ledgerVerified:true,runtimeGrantsVerified:true,objectsVerified:true,objectCount:inventory.objects.length,
   workflowBytesVerified:true,workflowRuntimeResumed:false,currentAuthorityVerified:false,restorationReady:false,requiredScopeQuarantined:true,mode:'locked' as const};
 }catch(error){
  // A restored target always retains the snapshot's lock. A failed verification
  // also removes runtime table access before handing it back for investigation.
  if(restored){const db=new Client({connectionString:targetUrl,connectionTimeoutMillis:5000});try{await db.connect();await db.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM turas_runtime');}finally{await db.end();}}
  throw error;
 }finally{await rm(archive,{force:true});}
}
