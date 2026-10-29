import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {pilotSource} from '../../../scripts/pilot-source';
import {pilotRecovery} from '../../../scripts/pilot-recovery';
import {writeEvidence} from '../../../scripts/pilot-evidence';
import {withRecoveryDatabaseCheckpoint} from '../../../lib/server/operations/database-checkpoint';
import {runRecoveryPgDump} from '../../../lib/server/operations/pg-dump';
import {packBackupArchive,type BackupArchiveHeader} from '../../../lib/server/operations/backup-archive';
import {encryptRecoveryFile,verifyRecoveryKey} from '../../../lib/server/operations/backup-crypto';
import {recoveryDigest,type RecoveryManifest} from '../../../lib/contracts/pilot-recovery';
import {objectKey,environmentObjectId} from '../../../lib/server/storage/private-objects';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {captureRecoveryObjects} from '../../../lib/server/operations/object-checkpoint';
import {createMcpConnection} from '../../../lib/server/mcp/management';
let root:string,sourceDatabase:string,bundle:string,keyFile:string,manifest:RecoveryManifest,header:BackupArchiveHeader,files:Map<string,string>;
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
beforeAll(async()=>{
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});root=await mkdtemp(resolve('local-artifacts/016/isolated-restore-fixture-'));await mkdir(join(root,'backups'),{mode:0o700});await mkdir(join(root,'keys'),{mode:0o700});keyFile=join(root,'keys','recovery.key');const key=randomBytes(32);await writeFile(keyFile,key,{mode:0o600});
 try{await withPilotEnvironment(async environment=>{
  sourceDatabase=environment.databaseName;const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
  try{
   const knowledge=await pilotPublishedKnowledgeFixture(db as any,'primary');
   await createMcpConnection(knowledge.actor,{requestKey:randomUUID(),name:'Synthetic restored authority',categories:['profiles'],customerIds:[knowledge.customerId],lifetimeDays:1});
   const recoveryId=randomUUID(),revision=Number((await db.query("UPDATE operations_control SET mode='locked',recovery_id=$2,revision=revision+1 WHERE environment_id=$1 RETURNING revision",[environment.environmentId,recoveryId])).rows[0].revision);
   const id=randomUUID(),source=await pilotSource();
   await withRecoveryDatabaseCheckpoint(db,{environmentId:environment.environmentId,recoveryId,controlRevision:revision,signal:environment.signal},async boundary=>{
    const database=await runRecoveryPgDump({environmentId:environment.environmentId,snapshot:boundary.snapshot,serverMajor:boundary.serverMajor,output:join(root,'backups','database.dump'),signal:environment.signal});
    const storeRoot=join(root,'source-objects');for(const namespace of activeObjectNamespaces)await mkdir(join(storeRoot,'e_'+environmentObjectId(environment.environmentId),namespace),{recursive:true,mode:0o700});
    const store=new LocalPrivateObjects(storeRoot,environment.environmentId,10485760);
    for(const namespace of ['artifact','workforce','report','gap-report'] as const){const bytes=Buffer.from('Synthetic restored '+namespace+' bytes');await store.put(objectKey(environment.environmentId,namespace,randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest:sha(bytes)});}
    const objects=await captureRecoveryObjects({store,environmentId:environment.environmentId,target:join(root,'captured-objects'),signal:environment.signal});
    const ledgerDigest=recoveryDigest((await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows);
    header={contract:'pilot-archive-v1',checkpointId:id,environmentId:environment.environmentId,capturedAt:boundary.capturedAt,
     provenance:{recoveryId,controlRevision:revision,sourceCommit:source.sourceCommit,sourceDigest:source.sourceDigest,schemaVersion:80,ledgerDigest,runtimeGrantsDigest:boundary.runtimeGrantsDigest,acceptedContentDigest:boundary.acceptedContentDigest,configurationDigest:recoveryDigest({backend:'owned-local'}),keyReference:'owned-test-key',keyVersion:'1'},
     entries:[{name:'database.dump',sizeBytes:database.sizeBytes,digest:database.digest},...objects.entries]};
    // Source identity has a catalog digest too; only contract provenance belongs
    // in the encrypted archive, never extra source metadata or caller flags.
    files=new Map([['database.dump',join(root,'backups','database.dump')],...objects.files]);
    const archive=join(root,'backups','matched.archive'),packed=await packBackupArchive({header,files,output:archive,signal:environment.signal});bundle=join(root,'backups','bundle.encrypted');const encrypted=await encryptRecoveryFile(archive,bundle,key,packed.headerDigest,environment.signal),checkpoint=(digest:string)=>({id,capturedAt:boundary.capturedAt,digest});
    const {keyReference:_,keyVersion:__,...provenance}=header.provenance;
    manifest={contract:'pilot-recovery-v1',id,environmentId:environment.environmentId,capturedAt:boundary.capturedAt,expiresAt:new Date(Date.parse(boundary.capturedAt)+7*86400000).toISOString(),...provenance,
     encryptedBundle:{digest:encrypted.digest,sizeBytes:encrypted.sizeBytes,headerDigest:packed.headerDigest},database:{checkpoint:checkpoint(database.digest),dumpDigest:database.digest,dumpBytes:database.sizeBytes,serverMajor:18,clientMajor:18},
     stores:(['artifact','workforce','report','gap-report'] as const).map(kind=>{const inventory=objects.inventory.objects.filter(object=>object.key.includes('/'+kind+'/')||['artifact','workforce'].includes(kind)&&object.key.includes('/'+kind+'-staging/'));const digest=recoveryDigest(inventory);return {kind,checkpoint:checkpoint(digest),inventoryDigest:digest,objectCount:inventory.length,complete:true};}),
     workflow:{backend:'owned-local',capability:'matched-checkpoint',checkpoint:checkpoint(recoveryDigest([])),acceptedApplicationStateInDatabase:true,unrecoverableAcceptedRecords:0,verified:true},
     key:{reference:'owned-test-key',version:'1',algorithm:'aes-256-gcm',available:true,probeDigest:verifyRecoveryKey(key)},
     // Contract fixtures exercise physical restoration. These flags are not
     // actual current-authority or outside-domain verification; result stays false.
     authority:{environmentId:environment.environmentId,capturedAt:boundary.capturedAt,watermark:'synthetic-fixture-only',digest:'a'.repeat(64),independent:true,source:'current-denials-and-replay'},
     outsideCopy:{failureDomain:'synthetic-fixture-outside',sourceFailureDomain:'synthetic-fixture-source',encryptedDigest:encrypted.digest,verified:true}};
   });
  }finally{await db.end();}
 },{postgresMajor:18,deadlineMs:180000});}finally{key.fill(0);}
},210000);
afterAll(async()=>{if(root)await rm(root,{recursive:true,force:true});});
async function restore(environment:{environmentId:string},value=manifest,encrypted=bundle,key=keyFile){
 const scope=join(root,'request-'+randomUUID());await mkdir(scope,{mode:0o700});await writeEvidence(scope,'manifest.json',value);
 return pilotRecovery(['--restore-isolated','--environment',value.environmentId,'--ledger-digest',value.ledgerDigest,'--manifest',join(scope,'manifest.json'),'--bundle',encrypted,'--key-file',key,'--source-database',sourceDatabase,'--output',join(root,'result-'+randomUUID())]);
}
it('restores complete captured content and four stores while retaining denied service',async()=>{
 await withPilotEnvironment(async environment=>{const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await db.connect();await runtime.connect();try{
  await db.query("UPDATE operations_control SET mode='locked' WHERE environment_id=$1",[environment.environmentId]);
  const result=await restore(environment);expect(result).toMatchObject({acceptedContentVerified:true,ledgerVerified:true,runtimeGrantsVerified:true,objectsVerified:true,objectCount:4,mode:'locked',currentAuthorityVerified:false,restorationReady:false,requiredScopeQuarantined:true});
  expect((await db.query("SELECT count(*)::int AS n FROM profile_records WHERE current_accepted_revision_id IS NOT NULL")).rows[0].n).toBeGreaterThan(0);
  expect((await db.query("SELECT count(*)::int AS n FROM knowledge_publications WHERE state='published'")).rows[0].n).toBeGreaterThan(0);
  expect((await db.query('SELECT count(*)::int AS n FROM login_sessions WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
  expect((await db.query('SELECT count(*)::int AS n FROM mcp_connections WHERE credential_hash IS NOT NULL')).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM customer_grants WHERE state='active'")).rows[0].n).toBe(0);
  expect((await runtime.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');await expect(runtime.query("UPDATE operations_control SET mode='open'")).rejects.toMatchObject({code:'42501'});
 }finally{await runtime.end();await db.end();}},{postgresMajor:18,deadlineMs:180000});
},210000);
it('rejects a wrong key before replacing the owned target',async()=>{
 const wrong=join(root,'keys','wrong.key');await writeFile(wrong,randomBytes(32),{mode:0o600});
 await withPilotEnvironment(async environment=>{const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();try{
  await db.query("UPDATE operations_control SET mode='locked' WHERE environment_id=$1",[environment.environmentId]);await expect(restore(environment,manifest,bundle,wrong)).rejects.toThrow();expect((await db.query('SELECT environment_id FROM turas_environment')).rows[0].environment_id).toBe(environment.environmentId);
 }finally{await db.end();}},{postgresMajor:18,deadlineMs:180000});
},210000);
it('rejects changed content despite valid encrypted bytes and revokes runtime grants',async()=>{
 const incorrect=structuredClone(header);incorrect.provenance.acceptedContentDigest='0'.repeat(64);const archive=join(root,'backups','incorrect.archive'),encrypted=join(root,'backups','incorrect.encrypted'),key=await readFile(keyFile),packed=await packBackupArchive({header:incorrect,files,output:archive,signal:AbortSignal.timeout(30000)});
 let encryptedReceipt;try{encryptedReceipt=await encryptRecoveryFile(archive,encrypted,key,packed.headerDigest,AbortSignal.timeout(30000));}finally{key.fill(0);}
 const value={...manifest,acceptedContentDigest:'0'.repeat(64),encryptedBundle:{digest:encryptedReceipt.digest,sizeBytes:encryptedReceipt.sizeBytes,headerDigest:packed.headerDigest},outsideCopy:{...manifest.outsideCopy,encryptedDigest:encryptedReceipt.digest}};
 await withPilotEnvironment(async environment=>{const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});await db.connect();await runtime.connect();try{
  await db.query("UPDATE operations_control SET mode='locked' WHERE environment_id=$1",[environment.environmentId]);await expect(restore(environment,value,encrypted)).rejects.toThrow('accepted content differs');expect((await db.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');await expect(runtime.query('SELECT * FROM principals')).rejects.toMatchObject({code:'42501'});
 }finally{await runtime.end();await db.end();}},{postgresMajor:18,deadlineMs:180000});
},210000);
