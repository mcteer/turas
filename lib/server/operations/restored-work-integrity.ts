import {Client,type PoolClient} from 'pg';
import {verifyRecoveryCandidate} from './candidate-verification';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {recoveryContentDigest} from './recovery-content';
import {currentRecoveryStateDigest} from './recovery-state';
import {recoveryGrantCheckpoint} from './grant-checkpoint';
import {verifiedObjectInventory,activeObjectNamespaces} from '../storage/inventory';
import {LocalPrivateObjects} from '../storage/local-objects';
const scopeSchema=z.strictObject({environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive()});
const measured=new WeakMap<object,{databaseName:string;serverAddress:string;serverPort:number;serverIdentity:string;storeIdentity:string}>();
export type RestoredWorkIntegrity=Readonly<{contract:'pilot-restored-work-integrity-v1';environmentId:string;recoveryId:string;controlRevision:number;candidateId:string;encryptedBundleDigest:string;headerDigest:string;ledgerDigest:string;acceptedContentDigest:string;objectsDigest:string;objectCount:number;sourceGrantsDigest:string;closedTargetGrantsDigest:string;measuredStateDigest:string;measuredAt:string;restorationReady:false}>;
async function ownerTarget(db:Client|PoolClient,scope:z.infer<typeof scopeSchema>){
 const selected=new URL(requireOwnedPilotDatabase(process.env,true));
 const row=(await db.query(`SELECT current_database() AS name,inet_server_addr()::text AS address,inet_server_port() AS port,
  current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner,
  encode(sha256(convert_to((pg_control_system()).system_identifier::text,'UTF8')),'hex') AS server_identity,current_user AS role,e.environment_id,e.schema_version,c.mode,c.revision,c.recovery_id
  FROM turas_environment e JOIN operations_control c USING(environment_id)`)).rows;
 if(row.length!==1||row[0].owner!==true||row[0].role!==decodeURIComponent(selected.username)||row[0].name!==decodeURIComponent(selected.pathname.slice(1))||row[0].environment_id!==scope.environmentId||Number(row[0].schema_version)!==79||row[0].mode!=='locked'||Number(row[0].revision)!==scope.controlRevision||row[0].recovery_id!==scope.recoveryId)throw Error('Exact locked owned integrity target required');
 const selectedDb=new Client({connectionString:selected.toString(),connectionTimeoutMillis:5000,statement_timeout:5000});
 try{await selectedDb.connect();const actual=(await selectedDb.query("SELECT current_database() AS name,encode(sha256(convert_to((pg_control_system()).system_identifier::text,'UTF8')),'hex') AS server_identity")).rows[0];if(actual.name!==row[0].name||actual.server_identity!==row[0].server_identity)throw Error('Selected owned integrity endpoint differs');}finally{await selectedDb.end();}
 return {databaseName:String(row[0].name),serverAddress:String(row[0].address),serverPort:Number(row[0].port),serverIdentity:String(row[0].server_identity)};
}
async function storeIdentity(root:string){
 const direct=resolve(root),info=await lstat(direct);
 if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o700||await realpath(direct)!==direct)throw Error('Exact private restored store required');
 return recoveryDigest({root:direct,device:info.dev,inode:info.ino});
}
/** Internal restore step, after authenticated archive/SQL restoration and before
 * quarantine changes accepted authority data. Measures actual database/bytes;
 * source grant provenance and closed target grants are deliberately separate. */
export async function measureRestoredWorkIntegrity(db:Client|PoolClient,input:{candidate:unknown;scope:z.infer<typeof scopeSchema>;storeRoot:string;bundle:string;keyFile:string;signal:AbortSignal}){
 const candidate=workCaptureCandidateSchema.parse(input.candidate),scope=scopeSchema.parse(input.scope);
 if(candidate.environmentId!==scope.environmentId)throw Error('Restored integrity source differs');
 await verifyRecoveryCandidate({candidate,environmentId:scope.environmentId,bundle:input.bundle,keyFile:input.keyFile,signal:input.signal});
 input.signal.throwIfAborted();await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');
 try{
  await db.query("SET LOCAL lock_timeout='3000ms'");await db.query("SET LOCAL statement_timeout='10000ms'");await db.query("SET LOCAL transaction_timeout='120s'");
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
  const target={...await ownerTarget(db,scope),storeIdentity:await storeIdentity(input.storeRoot)};
  // Acquire every included table SHARE lock before reading any measured state.
  // READ COMMITTED then observes commits that preceded our waited-for fences.
  const measuredStateDigest=await currentRecoveryStateDigest(db);
  const roles=(await db.query("SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,has_database_privilege(rolname,current_database(),'CONNECT') AS connect FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') ORDER BY rolname")).rows;
  if(roles.length!==2||roles.some(row=>row.rolcanlogin||row.rolsuper||row.rolcreatedb||row.rolcreaterole||row.rolreplication||row.rolbypassrls||row.connect)||(await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND usename IN('turas_runtime','turas_runtime_016') LIMIT 1")).rowCount)throw Error('Restored runtime admission must remain retired');
  const ledger=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
  const installed=JSON.parse(await readFile(resolve('migrations/manifest.json'),'utf8')).migrations.map((row:{file:string})=>({name:row.file.replace(/\.cjs$/,'')})).sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
  if(JSON.stringify(ledger)!==JSON.stringify(installed)||recoveryDigest(ledger)!==candidate.ledgerDigest)throw Error('Restored integrity migration ledger differs');
  if(await recoveryContentDigest(db)!==candidate.acceptedContentDigest)throw Error('Restored integrity accepted content differs');
  const inventory=await verifiedObjectInventory(new LocalPrivateObjects(input.storeRoot,scope.environmentId,10485760),scope.environmentId,activeObjectNamespaces,input.signal,{maximumObjects:256,maximumBytes:24*1024*1024});
  if(inventory.digest!==candidate.objects.inventoryDigest||inventory.objects.length!==candidate.objects.objectCount)throw Error('Restored integrity object inventory differs');
  const proof:RestoredWorkIntegrity=Object.freeze({contract:'pilot-restored-work-integrity-v1',...scope,candidateId:candidate.id,encryptedBundleDigest:candidate.encryptedBundle.digest,headerDigest:candidate.encryptedBundle.headerDigest,ledgerDigest:candidate.ledgerDigest,acceptedContentDigest:candidate.acceptedContentDigest,objectsDigest:inventory.digest,objectCount:inventory.objects.length,sourceGrantsDigest:candidate.runtimeGrantsDigest,closedTargetGrantsDigest:await recoveryGrantCheckpoint(db),measuredStateDigest,measuredAt:new Date().toISOString(),restorationReady:false});
  input.signal.throwIfAborted();await db.query('COMMIT');measured.set(proof,target);return proof;
 }catch(error){await db.query('ROLLBACK');throw error;}
}
/** A JSON receipt is descriptive evidence only. Composed in-process verification
 * must receive the actual measured object and rebind its exact owner target. */
export async function requireMeasuredWorkIntegrity(db:Client|PoolClient,proof:RestoredWorkIntegrity,scope:z.infer<typeof scopeSchema>,storeRoot:string,signal:AbortSignal){
 const target=measured.get(proof);if(!target||proof.environmentId!==scope.environmentId||proof.recoveryId!==scope.recoveryId||proof.controlRevision!==scope.controlRevision)throw Error('Actual measured work integrity proof required');
 await db.query('SAVEPOINT measured_work_integrity');await db.query('RELEASE SAVEPOINT measured_work_integrity');
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[scope.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
 if(JSON.stringify({...await ownerTarget(db,scopeSchema.parse(scope)),storeIdentity:await storeIdentity(storeRoot)})!==JSON.stringify(target))throw Error('Measured work integrity target changed');
 const inventory=await verifiedObjectInventory(new LocalPrivateObjects(storeRoot,scope.environmentId,10485760),scope.environmentId,activeObjectNamespaces,signal,{maximumObjects:256,maximumBytes:24*1024*1024});
 if(inventory.digest!==proof.objectsDigest||inventory.objects.length!==proof.objectCount)throw Error('Measured work integrity object inventory differs');
 return proof;
}
