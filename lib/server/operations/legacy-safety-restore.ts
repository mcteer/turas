import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {reconcileOwnedCredentialDenials} from './recovery-credential-denials';
import {verifyRecoveryDenialSnapshot} from './recovery-denial-snapshot';
import {Client} from 'pg';
import {spawn,spawnSync} from 'node:child_process';
import {constants} from 'node:fs';
import {open,lstat,realpath,readFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {runner} from 'node-pg-migrate';
import {z} from 'zod';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {recoveryPostgresImage,recoveryPostgresMajor,matchesRecoveryClient} from './postgres-version';
import {recoveryContentDigest} from './recovery-content';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {quarantineRestoredAuthority} from './recovery-quarantine';
import {databaseSafetyBoundarySchema,readDatabaseSafetyBoundary} from './database-safety-boundary';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const scopeSchema=z.strictObject({dump:z.string().min(1),digest,sizeBytes:z.number().int().positive().max(67108864),sourceEnvironmentId:z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/),sourceDatabaseName:z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/),sourceSchema:z.union([z.literal(38),z.literal(55),z.literal(57),z.literal(77),z.literal(79),z.literal(80),z.literal(81),z.literal(82),z.literal(83),z.literal(84),z.literal(CURRENT_SCHEMA_VERSION)]),sourceTarget:z.enum(['preview','production']).default('production'),serverMajor:z.union([z.literal(17),z.literal(18)]),applicationContentDigest:digest,ledgerDigest:digest,databaseBoundary:databaseSafetyBoundarySchema.optional()}).superRefine((value,ctx)=>{
 if(value.databaseBoundary&&![77,79,80,81,82,83,84,CURRENT_SCHEMA_VERSION].includes(value.sourceSchema))ctx.addIssue({code:'custom',message:'Current source required for safety boundary'});
 if(value.sourceSchema===38&&value.sourceTarget!=='preview')ctx.addIssue({code:'custom',message:'Schema 38 rehearsal requires explicit Preview source'});
});
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
/** Restore/rehearse only in an independently owned matching-schema disposable target.
 * Public/runtime CONNECT is removed before restore. No application, worker,
 * native runtime, provider dispatch, Production target or unlock is available. */
export async function restoreOwnedLegacySafetyCopy(raw:z.input<typeof scopeSchema>,signal:AbortSignal,denials?:{snapshot:unknown;contextDigest:string;backupCapturedAt:string}){
 const input=scopeSchema.parse(raw),url=new URL(requireOwnedPilotDatabase(process.env,true)),target=decodeURIComponent(url.pathname.slice(1)),targetMarker=process.env.TURAS_ENVIRONMENT_ID!;
 if(target===input.sourceDatabaseName||targetMarker===input.sourceEnvironmentId)throw Error('Separate owned legacy restore target required');
 if(denials)verifyRecoveryDenialSnapshot(denials.snapshot,{environmentId:input.sourceEnvironmentId,contextDigest:denials.contextDigest,after:denials.backupCapturedAt,now:Date.now()});
 signal.throwIfAborted();const dump=resolve(input.dump),parent=dirname(dump),name=basename(dump),directory=await lstat(parent);
 if(/[\0\r\n,]/.test(parent)||!/^[A-Za-z0-9_-]{1,100}\.dump$/.test(name)||!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid?.()||(directory.mode&0o777)!==0o700||await realpath(parent)!==parent)throw Error('Private owned legacy dump required');
 const file=await open(dump,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size!==input.sizeBytes)throw Error('Legacy dump file differs');
  const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;
  while(position<stat.size){signal.throwIfAborted();const part=await file.read(buffer,0,Math.min(buffer.length,stat.size-position),position);if(!part.bytesRead)throw Error('Legacy dump truncated');hash.update(buffer.subarray(0,part.bytesRead));position+=part.bytesRead;}
  if(hash.digest('hex')!==input.digest||(await file.stat()).size!==stat.size)throw Error('Legacy dump digest differs');
 }finally{await file.close();}
 const image=recoveryPostgresImage(input.serverMajor),prepared=spawnSync('docker',['image','inspect','--format','{{.Id}}',image],{encoding:'utf8',timeout:5000});if(prepared.status!==0||!/^sha256:[a-f0-9]{64}\s*$/.test(prepared.stdout))throw Error('Prepared matched legacy restore client required');
 const owner=new Client({connectionString:url.href,connectionTimeoutMillis:5000,statement_timeout:10000});let fenced=false;let runtimeRoles=['turas_runtime'];
 const token=randomUUID(),container='turas-016-legacy-restore-'+token;
 const clientEnv={PATH:process.env.PATH,HOME:process.env.HOME,PGHOST:process.platform==='linux'?url.hostname:'host.docker.internal',PGPORT:url.port||'5432',PGDATABASE:target,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c turas.restore_loading=on'};
 try{
  await owner.connect();
  const marker=(await owner.query("SELECT e.environment_id,e.schema_version,current_setting('server_version_num')::int AS version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_environment'::regclass)) AS owner FROM turas_environment e")).rows;
  if(marker.length!==1||marker[0].environment_id!==targetMarker||Number(marker[0].schema_version)!==input.sourceSchema||marker[0].owner!==true||recoveryPostgresMajor(Number(marker[0].version))!==input.serverMajor)throw Error('Exact owned legacy restore marker/owner required');
  runtimeRoles=(await owner.query("SELECT rolname FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') ORDER BY rolname")).rows.map(row=>String(row.rolname));
  if(!runtimeRoles.includes('turas_runtime'))throw Error('Owned runtime perimeter missing');
  const roles=runtimeRoles.map(quote).join(',');
  // Prevent inherited default permissions and any existing runtime connection
  // from serving a partial source snapshot or the migration's initial open row.
  await owner.query('REVOKE CONNECT ON DATABASE '+quote(target)+' FROM PUBLIC,'+roles);fenced=true;
  await owner.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename=ANY($1::text[]) AND pid<>pg_backend_pid()",[runtimeRoles]);
  await owner.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM '+roles);
  await owner.query('REVOKE ALL ON SCHEMA public FROM PUBLIC,'+roles);
  await owner.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT,INSERT,UPDATE,DELETE ON TABLES FROM '+roles);
  signal.throwIfAborted();
  const child=spawn('docker',['run','--pull=never','--name',container,'--label','turas.016.backup-owner='+token,...(process.platform==='linux'?['--network=host']:[]),'--user',String(process.getuid?.())+':'+String(process.getgid?.()),'--cpus=1','--memory=512m','--pids-limit=64','--cap-drop=ALL','--security-opt=no-new-privileges','--read-only','--tmpfs=/tmp:rw,noexec,nosuid,size=16777216','--mount','type=bind,source='+parent+',target=/backup,readonly',...Object.keys(clientEnv).filter(key=>key.startsWith('PG')).flatMap(key=>['--env',key]),image,'sh','-c','pg_restore --version && exec pg_restore "$@"','turas-legacy-restore','--dbname='+target,'--clean','--if-exists','--no-owner','--no-acl','--exit-on-error','/backup/'+name],{env:{NODE_ENV:process.env.NODE_ENV??'production',...clientEnv},signal,stdio:['ignore','pipe','pipe']});
  let version='';child.stdout?.on('data',bytes=>{version=(version+bytes.toString()).slice(0,1024);});child.stderr?.on('data',()=>undefined);
  const timer=setTimeout(()=>child.kill('SIGTERM'),180000);let code:number|null;
  try{code=await new Promise<number|null>((done,reject)=>{child.once('error',reject);child.once('exit',done);});}finally{clearTimeout(timer);}
  signal.throwIfAborted();if(code!==0||!matchesRecoveryClient(version,'pg_restore',input.serverMajor))throw Error('Owned legacy restore incomplete');
  await owner.query('REVOKE ALL ON SCHEMA public FROM PUBLIC,'+roles);await owner.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM '+roles);
  const restored=(await owner.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(restored.length!==1||restored[0].environment_id!==input.sourceEnvironmentId||Number(restored[0].schema_version)!==input.sourceSchema)throw Error('Restored legacy source marker differs');
  const manifest=JSON.parse(await readFile(resolve('migrations/manifest.json'),'utf8'));
  const expected=manifest.migrations.slice(0,input.sourceSchema).map((entry:{file:string})=>({name:entry.file.replace(/\.cjs$/,'')})).sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
  const ledger=(await owner.query('SELECT name FROM turas_migrations ORDER BY name')).rows;
  if(JSON.stringify(ledger)!==JSON.stringify(expected)||recoveryDigest(ledger)!==input.ledgerDigest)throw Error('Restored legacy ledger differs');
  await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try{if(await recoveryContentDigest(owner)!==input.applicationContentDigest)throw Error('Restored legacy application content differs');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
  if(input.databaseBoundary){
   await owner.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   try{
    const actual=await readDatabaseSafetyBoundary(owner,input.sourceEnvironmentId,new Date(input.databaseBoundary.capturedAt),signal);
    if(recoveryDigest(actual)!==recoveryDigest(input.databaseBoundary))throw Error('Restored safety boundary differs');
    await owner.query('COMMIT');
   }catch(error){await owner.query('ROLLBACK');throw error;}
  }
  // Verify every checked-in migration before explicit forward rehearsal. This is
  // confined to the owned target; source URLs/credentials never reach this client.
  if(manifest.version!==CURRENT_SCHEMA_VERSION||manifest.migrations.length!==CURRENT_SCHEMA_VERSION)throw Error('Exact forward migration catalog required');
  for(const entry of manifest.migrations){if(createHash('sha256').update(await readFile(resolve('migrations',entry.file))).digest('hex')!==entry.sha256)throw Error('Forward migration checksum differs');}
  signal.throwIfAborted();
  await runner({dbClient:owner,dir:resolve('migrations'),migrationsTable:'turas_migrations',ignorePattern:'manifest\\.json',direction:'up',singleTransaction:true,advisoryLockMode:'wait',logger:{info:()=>undefined,warn:()=>undefined,error:()=>undefined}});
  await owner.query('UPDATE turas_environment SET schema_version=$2 WHERE environment_id=$1',[input.sourceEnvironmentId,CURRENT_SCHEMA_VERSION]);
  const recoveryId=randomUUID(),control=(await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[input.sourceEnvironmentId,recoveryId])).rows;
  if(control.length!==1)throw Error('Forward recovery fence missing');
  const credentialReconciliation=denials?await reconcileOwnedCredentialDenials(owner,denials.snapshot,{environmentId:input.sourceEnvironmentId,recoveryId,controlRevision:Number(control[0].revision),snapshotDigest:denials.contextDigest,backupCapturedAt:denials.backupCapturedAt}):null;
  await quarantineRestoredAuthority(owner,{environmentId:input.sourceEnvironmentId,recoveryId,controlRevision:Number(control[0].revision)});
  const current=(await owner.query('SELECT e.schema_version,c.mode FROM turas_environment e JOIN operations_control c USING(environment_id)')).rows;
  if(current.length!==1||current[0].schema_version!==CURRENT_SCHEMA_VERSION||current[0].mode!=='locked'||(await owner.query('SELECT count(*)::int AS n FROM turas_migrations')).rows[0].n!==CURRENT_SCHEMA_VERSION)throw Error('Forward rehearsal lock/ledger differs');
  return {contract:denials?'pilot-owned-legacy-restore-v2' as const:'pilot-owned-legacy-restore-v1' as const,targetDatabaseName:target,sourceEnvironmentId:input.sourceEnvironmentId,sourceTarget:input.sourceTarget,sourceSchema:input.sourceSchema,targetSchema:CURRENT_SCHEMA_VERSION,applicationContentVerified:true,sourceLedgerVerified:true,...(input.databaseBoundary?{snapshotBoundaryVerified:true}:{}),forwardMigrationsVerified:true,mode:'locked' as const,runtimeConnectionDenied:true,credentialDenialsReapplied:denials!==undefined,credentialReconciliation,currentAuthorityVerified:false,workflowResumed:false,restorationReady:false};
 }finally{
  // Stop the exact owned restore client before maintaining the final perimeter.
  try{
   const inspected=spawnSync('docker',['inspect','--format','{{index .Config.Labels "turas.016.backup-owner"}}',container],{encoding:'utf8',timeout:10000});
   if(inspected.status===0){if(inspected.stdout.trim()!==token)throw Error('Legacy restore cleanup ownership differs');if(spawnSync('docker',['rm','--force',container],{stdio:'ignore',timeout:10000}).status!==0)throw Error('Legacy restore cleanup unverified');}
   else if(!/No such (?:object|container)/i.test(inspected.stderr))throw Error('Legacy restore cleanup unverified');
  }finally{
   try{if(fenced){const roles=runtimeRoles.map(quote).join(',');await owner.query('REVOKE CONNECT ON DATABASE '+quote(target)+' FROM PUBLIC,'+roles);await owner.query('REVOKE ALL ON SCHEMA public FROM PUBLIC,'+roles);await owner.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM '+roles);}}
   finally{await owner.end();}
  }
 }
}
