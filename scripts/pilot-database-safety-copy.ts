import {Client} from 'pg';
import {z} from 'zod';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {resolve,dirname,basename,join} from 'node:path';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {recoveryDigest} from '../lib/contracts/pilot-recovery';
import {recoveryPostgresMajor} from '../lib/server/operations/postgres-version';
import {runNeonSafetyPgDump} from '../lib/server/operations/pg-dump';
import {encryptRecoveryFile,decryptRecoveryFile} from '../lib/server/operations/backup-crypto';
import {putNeonEncryptedArchive,downloadNeonEncryptedArchive,type NeonArchiveScope} from '../lib/server/operations/neon-archive';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {readOnlyDatabaseSafetyDigest} from '../lib/server/operations/recovery-content';
const execute=promisify(execFile);
export const databaseSafetySourceSchema=z.strictObject({
 contract:z.literal('pilot-database-safety-source-v1'),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),
 environmentId:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),target:z.literal('production'),schemaVersion:z.union([z.literal(55),z.literal(57)]),
 connectionBinding:z.enum(['platform-readable','protected-operator-connection']),
 databaseUrl:z.string().max(4096).refine(raw=>{try{const url=new URL(raw);return ['postgres:','postgresql:'].includes(url.protocol)&&url.hostname.endsWith('.neon.tech')&&!url.hostname.includes('-pooler.')&&url.searchParams.get('sslmode')==='verify-full';}catch{return false;}},'Explicit unpooled verified Neon source required'),
});
async function api(endpoint:string,signal:AbortSignal,input?:string){
 const result=await execute('vercel',['api',endpoint,'--raw',...(input?['--method','POST','--input',input]:[])],{signal,timeout:30000,maxBuffer:1048576,env:{NODE_ENV:process.env.NODE_ENV??'production',...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]))}});
 return JSON.parse(result.stdout) as any;
}
export const workRecoveryKeyReferenceSchema=z.strictObject({projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),variableId:z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),name:z.string().regex(/^(?:TURAS_RECOVERY_KEY_[A-F0-9]{32}|TURAS_RECOVERY_MASTER_[A-Z0-9_]{1,100})$/)});
export async function readWorkRecoveryKey(raw:z.infer<typeof workRecoveryKeyReferenceSchema>,teamId:string,expectedProjectId:string,signal:AbortSignal){
 const reference=workRecoveryKeyReferenceSchema.parse(raw);
 if(reference.projectId!==expectedProjectId||!/^team_[A-Za-z0-9]+$/.test(teamId))throw Error('Exact independent work key target required');
 const value=await api('/v1/projects/'+reference.projectId+'/env/'+reference.variableId+'?teamId='+teamId,signal);
 if(value.decrypted!==true||value.key!==reference.name||value.type!=='encrypted'||!/^([a-f0-9]{64})$/.test(value.value??''))throw Error('Independent work recovery key unavailable');
 return Buffer.from(value.value,'hex');
}
/** A database-only snapshot, explicitly distinct from a matched service backup.
 * No recovery fence, schema mutation, accepted-content rewrite or traffic change. */
export async function pilotDatabaseSafetyCopy(args:string[]){
 if(args.length!==7||args[0]!=='--database-safety-copy'||args[1]!=='--source'||args[3]!=='--destination'||args[5]!=='--output'||args.slice(1).some((value,index)=>index%2===1&&(!value||value.startsWith('--'))))throw Error('Explicit private safety-copy source destination and output required');
 const sourceFile=resolve(args[2]),destinationFile=resolve(args[4]),root=resolve(args[6]);
 const scope=databaseSafetySourceSchema.parse(await readEvidence(dirname(sourceFile),basename(sourceFile))),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(destinationFile),basename(destinationFile)));
 if(scope.projectId!==destination.sourceProjectId||new URL(scope.databaseUrl).hostname===new URL(destination.databaseUrl).hostname)throw Error('Exact separate database safety-copy scope required');
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(360000,async signal=>{
  const staging=await mkdtemp(join(root,'private-staging-')),localKey=randomBytes(32);let remoteKey:Buffer|undefined,keyReference:{projectId:string;variableId:string;name:string}|undefined,stage='destination';
  try{
   const cloud=await verifyWorkNeonDestination(destination,signal);
   stage='source_platform_binding';
   const {platformConnectionBindingVerified}=await verifyDatabaseSafetySourceBinding(scope,destination.teamId,signal);
   const db=new Client({connectionString:scope.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});
   stage='source_database_binding';
   let snapshot:{environmentId:string;schemaVersion:number;capturedAt:string;ledgerDigest:string;applicationContentDigest:string;sourceDatabaseName:string;serverMajor:17|18},dump:{digest:string;sizeBytes:number;serverMajor:17|18;clientMajor:17|18};
   try{
    await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL idle_in_transaction_session_timeout='180s'");
    const marker=(await db.query("SELECT environment_id,schema_version,transaction_timestamp() AS captured_at,current_setting('server_version_num')::int AS version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_environment'::regclass)) AS owner FROM turas_environment")).rows;
    if(marker.length!==1||marker[0].environment_id!==scope.environmentId||Number(marker[0].schema_version)!==scope.schemaVersion||marker[0].owner!==true)throw Error('Exact Production owner marker/schema required');
    stage='source_ledger';
    const installed=JSON.parse(await readFile(resolve('migrations/manifest.json'),'utf8')).migrations.slice(0,scope.schemaVersion).map((entry:{file:string})=>({name:entry.file.replace(/\.cjs$/,'')})).sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
    const ledger=(await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
    if(JSON.stringify(ledger)!==JSON.stringify(installed))throw Error('Exact source ledger differs');
    stage='snapshot_content';const applicationContentDigest=await readOnlyDatabaseSafetyDigest(db);
    const boundary=(await db.query('SELECT pg_export_snapshot() AS snapshot,current_database() AS database_name')).rows[0],serverMajor=recoveryPostgresMajor(Number(marker[0].version));
    snapshot={environmentId:scope.environmentId,schemaVersion:scope.schemaVersion,capturedAt:marker[0].captured_at.toISOString(),ledgerDigest:recoveryDigest(ledger),applicationContentDigest,sourceDatabaseName:boundary.database_name,serverMajor};
    stage='snapshot_dump';dump=await runNeonSafetyPgDump({environmentId:scope.environmentId,serverMajor,snapshot:boundary.snapshot,output:join(staging,'database.dump'),signal,connectionString:scope.databaseUrl});
    signal.throwIfAborted();await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK').catch(()=>undefined);throw error;}finally{await db.end();}
   const context={contract:'pilot-database-safety-copy-v2',id,sourceProjectId:scope.projectId,...snapshot,dumpDigest:dump.digest,dumpBytes:dump.sizeBytes,matchedServiceCheckpoint:false},headerDigest=recoveryDigest(context);
   stage='encryption';const encrypted=await encryptRecoveryFile(join(staging,'database.dump'),join(staging,'database.encrypted'),localKey,headerDigest,signal);
   if(encrypted.sizeBytes>67108864)throw Error('Encrypted safety copy exceeds bounded archive capacity');
   // A unique work-project key is created before copying bytes. No upsert, existing
   // key replacement, key in an archive, or secret in CLI arguments/logs.
   stage='independent_key';keyReference=await createWorkRecoveryKey({projectId:destination.operatorProjectId,teamId:destination.teamId,id,key:localKey,staging},signal);
   await writeEvidence(root,'key-reference.json',{contract:'pilot-work-key-reference-v1',id,...keyReference,keyBytesIncluded:false});
   remoteKey=await readWorkRecoveryKey(keyReference,destination.teamId,destination.operatorProjectId,signal);if(!remoteKey.equals(localKey))throw Error('Independent work key differs');
   const archive:NeonArchiveScope={contract:'pilot-neon-archive-v1',installationId:destination.installationId,id,environmentId:scope.environmentId,capturedAt:snapshot.capturedAt,expiresAt:new Date(Date.parse(snapshot.capturedAt)+7*86400000).toISOString(),ciphertextDigest:encrypted.digest,headerDigest,sizeBytes:encrypted.sizeBytes};
   stage='cloud_copy';const writeDb=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});
   try{await writeDb.connect();const capacity=(await writeDb.query('SELECT maximum_bytes FROM turas_backup.contract WHERE installation_id=$1',[destination.installationId])).rows;if(capacity.length!==1||Number(capacity[0].maximum_bytes)!==destination.maximumBytes)throw Error('Exact configured archive capacity differs');await putNeonEncryptedArchive(writeDb,archive,join(staging,'database.encrypted'),signal);}finally{await writeDb.end();}
   stage='cold_download';const cold=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});
   try{await cold.connect();await downloadNeonEncryptedArchive(cold,archive,join(staging,'cold.encrypted'),signal);}finally{await cold.end();}
   stage='cold_decryption';await decryptRecoveryFile(join(staging,'cold.encrypted'),join(staging,'cold.dump'),remoteKey,headerDigest,signal);
   if(createHash('sha256').update(await readFile(join(staging,'cold.dump'))).digest('hex')!==dump.digest)throw Error('Cold database safety-copy digest differs');
   stage='final_binding';if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Safety-copy source destination or protected checkout changed');
   const receipt={...context,...source,cloud,archive,keyReference,recordedAt:new Date().toISOString(),sourceConnectionBinding:scope.connectionBinding,platformConnectionBindingVerified,readOnlySource:true,encryptedCloudCopyVerified:true,freshConnectionVerified:true,independentKeyRetrievalVerified:true,coldDecryptionVerified:true,primaryDatabaseChanged:false,privateObjectsCaptured:false,workflowCaptured:false,currentAuthorityVerified:false,scheduledBackupVerified:false,physicalRestoreVerified:false,restorationReady:false};
   await writeEvidence(root,'database-safety-copy.json',receipt);console.info(JSON.stringify({databaseSafetyCopy:'pass',encryptedBytes:encrypted.sizeBytes,primaryDatabaseChanged:false,matchedServiceBackupVerified:false,restorationReady:false}));return receipt;
  }catch(error){
   const message=error instanceof Error?error.message:'';
   const safeDetail=/^(?:Exact Production owner marker\/schema required|Exact source ledger differs|Encrypted safety copy exceeds bounded archive capacity|Compatible snapshot dump incomplete: (?:connection_unavailable|permission_unavailable|snapshot_unavailable|client_unavailable|dump_failed))$/.test(message)?message:undefined;
   await writeEvidence(root,'failure.json',{id,...source,keyReference:keyReference??null,state:'fail',stage,safeDetail,safeFailure:'incomplete_database_safety_copy',primaryDatabaseChanged:false,restorationReady:false});throw error;
  }
  finally{localKey.fill(0);remoteKey?.fill(0);await rm(staging,{recursive:true,force:true});}
 });
}

export async function verifyDatabaseSafetySourceBinding(scope:z.infer<typeof databaseSafetySourceSchema>,teamId:string,signal:AbortSignal){
 databaseSafetySourceSchema.parse(scope);if(!/^team_[A-Za-z0-9]+$/.test(teamId))throw Error('Exact source work team required');
   const project=await api('/v9/projects/'+scope.projectId+'?teamId='+teamId,signal);
   if(project.id!==scope.projectId||project.accountId!==teamId)throw Error('Actual source work project differs');
   const variables=await api('/v9/projects/'+scope.projectId+'/env?teamId='+teamId,signal),owners=variables.envs?.filter((row:any)=>row.key==='DATABASE_URL_UNPOOLED'&&row.target?.includes(scope.target)&&!row.gitBranch);
   if(owners?.length!==1)throw Error('Exact current Production owner binding required');
   const owner=await api('/v1/projects/'+scope.projectId+'/env/'+owners[0].id+'?teamId='+teamId,signal);
   let platformConnectionBindingVerified=false;
   if(owner.decrypted===true&&typeof owner.value==='string'){
    const currentUrl=new URL(owner.value);currentUrl.searchParams.set('sslmode','verify-full');
    if(currentUrl.href!==scope.databaseUrl)throw Error('Current Production owner connection differs');
    platformConnectionBindingVerified=true;
   }else if(scope.connectionBinding!=='protected-operator-connection'||owner.type!=='sensitive'||owner.decrypted!==false||owner.value!==undefined||owner.key!=='DATABASE_URL_UNPOOLED'||!owner.target?.includes('production'))throw Error('Production owner binding unavailable');
 return {platformConnectionBindingVerified};
}
export async function createWorkRecoveryKey(input:{projectId:string;teamId:string;id:string;key:Buffer;staging:string;kind?:'archive'|'master'},signal:AbortSignal){
 if(!/^prj_[A-Za-z0-9]+$/.test(input.projectId)||!/^team_[A-Za-z0-9]+$/.test(input.teamId)||input.key.length!==32)throw Error('Exact independent work key target required');z.uuid().parse(input.id);
 if(input.kind!==undefined&&!['archive','master'].includes(input.kind))throw Error('Explicit work recovery key kind required');
 const name=(input.kind==='master'?'TURAS_RECOVERY_MASTER_':'TURAS_RECOVERY_KEY_')+input.id.replaceAll('-','').toUpperCase(),body=join(input.staging,'key-request.json');
 await writeFile(body,JSON.stringify({key:name,value:input.key.toString('hex'),type:'encrypted',target:['production'],comment:'Operator-only encrypted recovery key; retain independently of archive expiry'}),{flag:'wx',mode:0o600});
 let created;try{created=await api('/v10/projects/'+input.projectId+'/env?teamId='+input.teamId,signal,body);}finally{await rm(body,{force:true});}
 const keyRow=Array.isArray(created.created)?created.created.find((row:any)=>row.key===name):created.created;
 if(created.failed?.length||keyRow?.key!==name||!keyRow.id)throw Error('Independent work key creation unverified');
 return workRecoveryKeyReferenceSchema.parse({projectId:input.projectId,variableId:keyRow.id,name});
}
