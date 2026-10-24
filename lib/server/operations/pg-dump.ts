import {Client} from 'pg';
import {spawn,spawnSync} from 'node:child_process';
import {constants} from 'node:fs';
import {open,lstat,realpath,unlink} from 'node:fs/promises';
import {dirname,basename,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {operatorRecoveryDatabase} from '../../../scripts/pilot-control';
import {recoveryPostgresImage,recoveryPostgresMajor,matchesRecoveryClient,type RecoveryPostgresMajor} from './postgres-version';
import {cleanupOwnedBackupContainer} from './backup-container-cleanup';
/** Fixed compatible client, no implicit image pull or credentials in arguments.
 * The caller holds the exporting transaction until this owned process stops. */
export async function runRecoveryPgDump(input:{environmentId:string;serverMajor:RecoveryPostgresMajor;snapshot:string;output:string;signal:AbortSignal}){
 return runSnapshotPgDump(input,operatorRecoveryDatabase(input.environmentId));
}
/** Read-only database safety copies can precede schema 057. They are not matched
 * recovery captures and cannot authorize migration, restoration or unlock. */
export async function runNeonSafetyPgDump(input:{environmentId:string;serverMajor:RecoveryPostgresMajor;snapshot:string;output:string;signal:AbortSignal;connectionString:string}){
 const url=new URL(input.connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.searchParams.get('sslmode')!=='verify-full')throw Error('Explicit verified Neon safety-copy source required');
 return runSnapshotPgDump(input,input.connectionString);
}
async function runSnapshotPgDump(input:{environmentId:string;serverMajor:RecoveryPostgresMajor;snapshot:string;output:string;signal:AbortSignal},connection:string){
 input.signal.throwIfAborted();const image=recoveryPostgresImage(input.serverMajor);if(!/^[a-fA-F0-9-]{1,128}$/.test(input.snapshot))throw Error('Exact exported snapshot required');
 const source=new Client({connectionString:connection,connectionTimeoutMillis:5000});
 await source.connect();try{const metadata=(await source.query("SELECT current_setting('server_version_num')::int AS version,environment_id FROM turas_environment")).rows;if(metadata.length!==1||metadata[0].environment_id!==input.environmentId||recoveryPostgresMajor(Number(metadata[0].version))!==input.serverMajor)throw Error('Actual dump source PostgreSQL major differs');}finally{await source.end();}
 const url=new URL(connection),parent=resolve(dirname(input.output)),name=basename(input.output),stat=await lstat(parent);
 if(/[\0\r\n,]/.test(parent)||!/^[A-Za-z0-9_-]{1,100}\.dump$/.test(name)||!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o777)!==0o700||stat.uid!==process.getuid?.()||await realpath(parent)!==parent)throw Error('Private dump destination required');
 const cached=spawnSync('docker',['image','inspect','--format','{{.Id}}',image],{encoding:'utf8',timeout:5000});if(cached.status!==0||!/^sha256:[a-f0-9]{64}\s*$/.test(cached.stdout))throw Error('Prepared compatible PostgreSQL client required');
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 // The pinned client image does not necessarily contain a public CA bundle.
 // Mount the actual root-owned OS trust bundle read-only; never fall back to
 // encryption without certificate/hostname verification for hosted databases.
 let trustRoots:string|undefined;
 if(!local){
  trustRoots=await realpath(process.platform==='darwin'?'/etc/ssl/cert.pem':'/etc/ssl/certs/ca-certificates.crt');
  const roots=await lstat(trustRoots);
  if(!roots.isFile()||roots.uid!==0||(roots.mode&0o022)!==0||roots.size<1||roots.size>5242880||/[\0\r\n,]/.test(trustRoots))throw Error('Root-controlled public certificate trust required');
 }
 const marker=randomUUID(),container='turas-016-pg-dump-'+marker,output=resolve(input.output);const file=await open(output,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);await file.close();
 const env={NODE_ENV:process.env.NODE_ENV??'production',PATH:process.env.PATH,HOME:process.env.HOME,PGHOST:local?(process.platform==='linux'?url.hostname:'host.docker.internal'):url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:local?'disable':'verify-full',...(!local?{PGSSLROOTCERT:'/ssl/system-roots.pem'}:{}),PGCONNECT_TIMEOUT:'5'};
 let created=false,complete=false;try{
  created=true;const child=spawn('docker',['run','--pull=never','--name',container,'--label','turas.016.backup-owner='+marker,...(local&&process.platform==='linux'?['--network=host']:[]),'--user',String(process.getuid?.())+':'+String(process.getgid?.()),'--cpus=1','--memory=512m','--pids-limit=64','--cap-drop=ALL','--security-opt=no-new-privileges','--read-only','--tmpfs=/tmp:rw,noexec,nosuid,size=16777216','--mount','type=bind,source='+parent+',target=/backup',...(trustRoots?['--mount','type=bind,source='+trustRoots+',target=/ssl/system-roots.pem,readonly']:[]),...Object.keys(env).filter(key=>key.startsWith('PG')).flatMap(key=>['--env',key]),image,'sh','-c','pg_dump --version && exec pg_dump "$@"','turas-dump','--format=custom','--snapshot='+input.snapshot,'--lock-wait-timeout=3s','--file=/backup/'+name],{env,stdio:['ignore','pipe','pipe'],signal:input.signal});
  let diagnostic='';child.stderr?.on('data',bytes=>{diagnostic=(diagnostic+bytes.toString()).slice(0,8192);});let version='';child.stdout?.on('data',bytes=>{version=(version+bytes.toString()).slice(0,1024);});const timer=setTimeout(()=>child.kill('SIGTERM'),300000);
  let code:number|null;try{code=await new Promise<number|null>((done,reject)=>{child.once('error',reject);child.once('exit',done);});}finally{clearTimeout(timer);}
  input.signal.throwIfAborted();if(code!==0||!matchesRecoveryClient(version,'pg_dump',input.serverMajor))throw Error('Compatible snapshot dump incomplete: '+(/connection|connect to server|sslmode|could not translate host/i.test(diagnostic)?'connection_unavailable':/permission denied/i.test(diagnostic)?'permission_unavailable':/snapshot/i.test(diagnostic)?'snapshot_unavailable':/Error response from daemon|mounts denied|OCI runtime/i.test(diagnostic)?'client_unavailable':'dump_failed'));
  const handle=await open(output,constants.O_RDONLY|constants.O_NOFOLLOW);try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||(info.mode&0o777)!==0o600||info.uid!==process.getuid?.()||info.size<1||info.size>1024**4)throw Error('Snapshot dump integrity unavailable');const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;while(position<info.size){input.signal.throwIfAborted();const read=await handle.read(buffer,0,Math.min(buffer.length,info.size-position),position);if(!read.bytesRead)throw Error('Snapshot dump changed');hash.update(buffer.subarray(0,read.bytesRead));position+=read.bytesRead;}if((await handle.stat()).size!==info.size)throw Error('Snapshot dump changed');complete=true;return {digest:hash.digest('hex'),sizeBytes:info.size,serverMajor:input.serverMajor,clientMajor:input.serverMajor};}finally{await handle.close();}
 }finally{
  if(created)cleanupOwnedBackupContainer(container,marker);
  if(!complete)await unlink(output).catch(()=>undefined);
 }
}
