import {CURRENT_SCHEMA_VERSION} from '../../contracts/current-schema';
import {spawn,spawnSync} from 'node:child_process';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {Client} from 'pg';
import {recoveryPostgresImage,recoveryPostgresMajor,matchesRecoveryClient,type RecoveryPostgresMajor} from './postgres-version';
import {cleanupOwnedBackupContainer} from './backup-container-cleanup';

/** Preserve Preview's public trigger dependencies without copying its private
 * fingerprint ledger or source authority. This fence is local bootstrap only;
 * it is deliberately not a restoration of the source's copied-request policy. */
export async function prepareOwnedPreviewCloneRestoreFence(db:Client,sourceEnvironmentId:string){
 const ownedUrl=new URL(requireOwnedPilotDatabase(process.env,true)),target=decodeURIComponent(ownedUrl.pathname.slice(1));
 const actual=db as unknown as {connectionParameters?:{host:string;port:number;database:string};connection?:{stream?:{remoteAddress?:string;remotePort?:number}}},parameters=actual.connectionParameters,stream=actual.connection?.stream;
 if(!/^turas-preview-[A-Za-z0-9_.:-]{1,240}$/.test(sourceEnvironmentId)||!/^turas_test_016_eval_[a-f0-9]{12}$/.test(target))throw Error('Owned Preview restore source required');
 if(parameters?.host!=='127.0.0.1'||parameters.database!==target||Number(parameters.port)!==Number(ownedUrl.port||5432)||stream?.remoteAddress!=='127.0.0.1'||stream.remotePort!==Number(ownedUrl.port||5432))throw Error('Actual owned Preview restore connection required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL transaction_timeout='15s'");
  const state=(await db.query(`SELECT current_database() AS database,current_user AS actor,session_user AS login,
   pg_get_userbyid(d.datdba) AS owner,e.environment_id,e.schema_version,c.mode,
   current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.operations_control'::regclass)) AS control_owner
   FROM pg_database d CROSS JOIN public.turas_environment e JOIN public.operations_control c USING(environment_id)
   WHERE d.datname=current_database() FOR UPDATE OF c`)).rows;
  if(state.length!==1||state[0].database!==target||state[0].actor!==state[0].owner||state[0].login!==state[0].owner||!state[0].control_owner||state[0].schema_version!==CURRENT_SCHEMA_VERSION||state[0].environment_id!==process.env.TURAS_ENVIRONMENT_ID||state[0].mode!=='locked'||(await db.query("SELECT 1 FROM pg_database WHERE NOT datistemplate AND datname NOT IN(current_database(),'postgres') LIMIT 1")).rowCount)throw Error('Fresh locked owned Preview restore required');
  const roles=(await db.query("SELECT rolname,rolcanlogin,has_database_privilege(rolname,current_database(),'CONNECT') AS connect FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') ORDER BY rolname")).rows;
  if(roles.length!==2||roles.some(row=>row.rolcanlogin||row.connect)||(await db.query("SELECT 1 FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016') LIMIT 1")).rowCount||(await db.query("SELECT to_regnamespace('turas_preview_clone') AS schema")).rows[0].schema!==null)throw Error('Isolated fresh Preview restore fence required');
  await db.query(`CREATE SCHEMA turas_preview_clone;
   CREATE FUNCTION turas_preview_clone.refuse_copied_request() RETURNS trigger
   LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $fence$
   BEGIN
    IF current_database()<>'${target}' OR current_user<>session_user
     OR current_user<>(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())
     OR TG_TABLE_SCHEMA<>'public' OR TG_NAME<>'preview_clone_copied_request' OR TG_OP NOT IN('INSERT','UPDATE')
    THEN RAISE EXCEPTION 'Owned restore bootstrap required' USING ERRCODE='42501'; END IF;
    RETURN NEW;
   END $fence$;
   REVOKE ALL ON SCHEMA turas_preview_clone FROM PUBLIC,turas_runtime,turas_runtime_016;
   REVOKE ALL ON FUNCTION turas_preview_clone.refuse_copied_request() FROM PUBLIC,turas_runtime,turas_runtime_016`);
  await db.query('COMMIT');
  return {contract:'owned-preview-clone-bootstrap-fence-v1' as const,ownerOnly:true as const,sourceCopiedRequestPolicyRestored:false as const,privateCloneRowsRestored:false as const};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}
/** Restore only into a separately created disposable 016 database. No app or
 * worker starts here; the caller must reapply roles and retain the recovery lock. */
export async function restoreOwnedRecoveryDump(input:{dump:string;serverMajor:RecoveryPostgresMajor;clientMajor:RecoveryPostgresMajor;digest:string;sizeBytes:number;sourceDatabaseName:string;sourceEnvironmentId:string;signal:AbortSignal}){
 return restoreOwnedDump(input,'owned-local');
}
/** Work captures restore accepted public application data into a fresh owned
 * cluster. Provider/legacy schemas remain retained in the original backup, and
 * neither role restoration nor current authority is asserted by this primitive. */
export async function restoreOwnedWorkDump(input:{dump:string;serverMajor:RecoveryPostgresMajor;clientMajor:RecoveryPostgresMajor;digest:string;sizeBytes:number;sourceDatabaseName:string;sourceEnvironmentId:string;signal:AbortSignal}){
 return restoreOwnedDump(input,'work-capture');
}
async function restoreOwnedDump(input:{dump:string;serverMajor:RecoveryPostgresMajor;clientMajor:RecoveryPostgresMajor;digest:string;sizeBytes:number;sourceDatabaseName:string;sourceEnvironmentId:string;signal:AbortSignal},sourceKind:'owned-local'|'work-capture'){
 input.signal.throwIfAborted();if(input.clientMajor!==input.serverMajor)throw Error('Matched recovery source and client major required');const image=recoveryPostgresImage(input.serverMajor),url=new URL(requireOwnedPilotDatabase(process.env,true)),target=decodeURIComponent(url.pathname.slice(1));
 const sourceIdentityValid=sourceKind==='owned-local'?/^test-pilot-[a-f0-9]{12}$/.test(input.sourceEnvironmentId)&&/^turas_test_016_eval_[a-f0-9]{12}$/.test(input.sourceDatabaseName):/^[A-Za-z0-9_.:-]{1,256}$/.test(input.sourceEnvironmentId)&&/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/.test(input.sourceDatabaseName);
 if(!/^[a-f0-9]{64}$/.test(input.digest)||!Number.isSafeInteger(input.sizeBytes)||input.sizeBytes<1||input.sizeBytes>1024**4||!sourceIdentityValid||target===input.sourceDatabaseName)throw Error('Separate owned recovery target required');
 let previewCloneBootstrap:Awaited<ReturnType<typeof prepareOwnedPreviewCloneRestoreFence>>|undefined;
 const db=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});await db.connect();try{if((await db.query("SELECT current_user=pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='operations_control'::regclass")).rows[0]?.owner!==true)throw Error('Restore requires actual database owner authority');const major=recoveryPostgresMajor(Number((await db.query("SELECT current_setting('server_version_num')::int AS version")).rows[0].version));if(major!==input.serverMajor)throw Error('Matched restore target PostgreSQL major required');const rows=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  if(rows.length!==1||rows[0].environment_id!==process.env.TURAS_ENVIRONMENT_ID||rows[0].environment_id===input.sourceEnvironmentId||rows[0].schema_version!==CURRENT_SCHEMA_VERSION)throw Error('Fresh owned restore marker required');
  const control=(await db.query('SELECT mode FROM operations_control WHERE environment_id=$1',[rows[0].environment_id])).rows[0];if(control?.mode!=='locked')throw Error('Owned restore target must be locked');
  if(sourceKind==='work-capture'){
   if((await db.query("SELECT 1 FROM pg_database WHERE NOT datistemplate AND datname NOT IN(current_database(),'postgres') LIMIT 1")).rowCount)throw Error('Fresh isolated work restore cluster required');
   const existing=(await db.query("SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016')")).rows;
   if(existing.some(role=>role.rolsuper||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.rolbypassrls))throw Error('Restricted owned restore roles required');
   await db.query('ALTER ROLE turas_runtime NOLOGIN');
   if(!existing.some(role=>role.rolname==='turas_runtime_016'))await db.query('CREATE ROLE turas_runtime_016 NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS');else await db.query('ALTER ROLE turas_runtime_016 NOLOGIN');
   await db.query('REVOKE CONNECT ON DATABASE "'+target+'" FROM PUBLIC,turas_runtime,turas_runtime_016');
   const backends=(await db.query("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND usename IN('turas_runtime','turas_runtime_016') AND pid<>pg_backend_pid()")).rows;
   for(const row of backends)if((await db.query('SELECT pg_terminate_backend($1) AS terminated',[row.pid])).rows[0]?.terminated!==true)throw Error('Owned restore runtime drain unverified');
   if(input.sourceEnvironmentId.startsWith('turas-preview-'))previewCloneBootstrap=await prepareOwnedPreviewCloneRestoreFence(db,input.sourceEnvironmentId);
  }
  await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT,INSERT,UPDATE,DELETE ON TABLES FROM turas_runtime');
 }finally{await db.end();}
 const dump=resolve(input.dump),parent=dirname(dump),name=basename(dump),directory=await lstat(parent);
 if(/[\0\r\n,]/.test(parent)||!/^[A-Za-z0-9_-]{1,100}\.dump$/.test(name)||!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o777)!==0o700||directory.uid!==process.getuid?.()||await realpath(parent)!==parent)throw Error('Private restore source required');
 const file=await open(dump,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const stat=await file.stat();if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size!==input.sizeBytes)throw Error('Restore dump inventory differs');const hash=createHash('sha256'),bytes=Buffer.alloc(65536);let position=0;
  while(position<stat.size){input.signal.throwIfAborted();const read=await file.read(bytes,0,Math.min(bytes.length,stat.size-position),position);if(!read.bytesRead)throw Error('Restore dump truncated');hash.update(bytes.subarray(0,read.bytesRead));position+=read.bytesRead;}if(hash.digest('hex')!==input.digest||(await file.stat()).size!==stat.size)throw Error('Restore dump integrity differs');
 }finally{await file.close();}
 const prepared=spawnSync('docker',['image','inspect','--format','{{.Id}}',image],{encoding:'utf8',timeout:5000});if(prepared.status!==0||!/^sha256:[a-f0-9]{64}\s*$/.test(prepared.stdout))throw Error('Prepared compatible PostgreSQL restore client required');
 const marker=randomUUID(),container='turas-016-pg-restore-'+marker,env={NODE_ENV:process.env.NODE_ENV??'test',PATH:process.env.PATH,HOME:process.env.HOME,PGHOST:process.platform==='linux'?url.hostname:'host.docker.internal',PGPORT:url.port||'5432',PGDATABASE:target,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c turas.restore_loading=on'};
 try{const child=spawn('docker',['run','--pull=never','--name',container,'--label','turas.016.backup-owner='+marker,...(process.platform==='linux'?['--network=host']:[]),'--user',String(process.getuid?.())+':'+String(process.getgid?.()),'--cpus=1','--memory=512m','--pids-limit=64','--cap-drop=ALL','--security-opt=no-new-privileges','--read-only','--tmpfs=/tmp:rw,noexec,nosuid,size=16777216','--mount','type=bind,source='+parent+',target=/backup,readonly',...Object.keys(env).filter(key=>key.startsWith('PG')).flatMap(key=>['--env',key]),image,'sh','-c','pg_restore --version && exec pg_restore "$@"','turas-restore','--dbname='+target,'--clean','--if-exists','--no-owner',...(sourceKind==='work-capture'?['--no-acl','--schema=public']:[]),'--exit-on-error','/backup/'+name],{env,stdio:['ignore','pipe','pipe'],signal:input.signal});let version='';child.stdout?.on('data',bytes=>{version=(version+bytes.toString()).slice(0,1024);});child.stderr?.on('data',()=>{});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);let code:number|null;try{code=await new Promise<number|null>((done,reject)=>{child.once('error',reject);child.once('exit',done);});}finally{clearTimeout(timer);}input.signal.throwIfAborted();if(code!==0||!matchesRecoveryClient(version,'pg_restore',input.serverMajor))throw Error('Owned database restore incomplete');const verified=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});let workControl:{recoveryId:string;controlRevision:number}|undefined;await verified.connect();try{const restored=(await verified.query('SELECT e.environment_id,e.schema_version,c.mode FROM turas_environment e JOIN operations_control c USING(environment_id)')).rows;if(restored.length!==1||restored[0].environment_id!==input.sourceEnvironmentId||restored[0].schema_version!==CURRENT_SCHEMA_VERSION||(sourceKind==='owned-local'&&restored[0].mode!=='locked'))throw Error('Restored marker differs');if(sourceKind==='work-capture'){const recoveryId=randomUUID();const row=(await verified.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[input.sourceEnvironmentId,recoveryId])).rows[0];workControl={recoveryId,controlRevision:Number(row.revision)};}await verified.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM turas_runtime');}finally{await verified.end();}return {serverMajor:input.serverMajor,clientMajor:input.serverMajor,targetDatabaseName:target,restorationReady:false as const,...(sourceKind==='work-capture'?{...workControl,databaseSchemasRestored:['public'],allDatabaseSchemasVerified:false,runtimeGrantsVerified:false,...(previewCloneBootstrap?{previewCloneBootstrap}:{})}: {})};
 }finally{
  // Stop the owned restore process before revoking grants: a still-running
  // pg_restore must not reapply privileges after the failure fence is checked.
  try{
   cleanupOwnedBackupContainer(container,marker);
  }finally{
   const closed=new Client({connectionString:url.toString(),connectionTimeoutMillis:5000});
   try{await closed.connect();await closed.query("SET statement_timeout='5000ms'");await closed.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM turas_runtime');if(sourceKind==='work-capture'){await closed.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM turas_runtime_016');await closed.query('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,turas_runtime,turas_runtime_016');await closed.query('REVOKE ALL ON SCHEMA public FROM PUBLIC,turas_runtime,turas_runtime_016');await closed.query('REVOKE CONNECT ON DATABASE "'+target+'" FROM PUBLIC,turas_runtime,turas_runtime_016');}if((await closed.query("SELECT to_regclass('public.operations_control') AS control")).rows[0]?.control)await closed.query("UPDATE operations_control SET mode='locked' WHERE mode<>'locked'");}
   finally{await closed.end();}
  }
 }
}
