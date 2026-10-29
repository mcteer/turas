import {Client} from 'pg';
import {z} from 'zod';
import {constants} from 'node:fs';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,readdir,lstat,realpath,open,unlink} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';

const sourceDigest='555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const regular=z.strictObject({path:z.string(),bytes:z.number().int().positive().max(16777216),digest});
const manifestSchema=z.strictObject({contract:z.literal('pilot-native-client-v2'),platform:z.literal('linux/amd64'),version:z.literal('18.6'),sourceDigest:z.literal(sourceDigest),source:z.literal('https://ftp.postgresql.org/pub/source/v18.6/postgresql-18.6.tar.bz2'),files:z.array(regular).length(10)});
const requiredFiles=['bin/pg_dump','bin/pg_restore','lib/libpq.so.5.18','lib/libssl.so.3','lib/libcrypto.so.3','lib/libz.so.1','POSTGRESQL-LICENSE','licenses/OPENSSL-LICENSE.txt','licenses/ZLIB-README','lib/libpq.so.5'];

/** Public, build-produced tools only. Never accept an executable or library path
 * from a customer request. A manifest cannot select other binaries or libraries. */
export async function verifyNativePostgresClient(assetRoot:string){
 const root=resolve(assetRoot),directory=await lstat(root);
 if(!directory.isDirectory()||directory.isSymbolicLink()||(directory.mode&0o022)||![0,process.getuid?.()].includes(directory.uid)||await realpath(root)!==root)throw Error('Immutable native client root required');
 const metadataPath=join(root,'manifest.json'),metadataInfo=await lstat(metadataPath);
 if(!metadataInfo.isFile()||metadataInfo.isSymbolicLink()||metadataInfo.nlink!==1||(metadataInfo.mode&0o022)||![0,process.getuid?.()].includes(metadataInfo.uid)||metadataInfo.size>65536||await realpath(metadataPath)!==metadataPath)throw Error('Immutable native client manifest required');
 const metadata=await readFile(metadataPath);
 const manifest=manifestSchema.parse(JSON.parse(metadata.toString('utf8')));
 if(new Set(manifest.files.map(row=>row.path)).size!==10||manifest.files.some(row=>!requiredFiles.includes(row.path)))throw Error('Exact native client inventory required');
 const pq=manifest.files.find(row=>row.path==='lib/libpq.so.5.18')!,alias=manifest.files.find(row=>row.path==='lib/libpq.so.5')!;
 if(pq.digest!==alias.digest||pq.bytes!==alias.bytes)throw Error('Native client library alias differs');
 for(const name of await readdir(root))if(!['bin','lib','licenses','manifest.json','POSTGRESQL-LICENSE'].includes(name))throw Error('Unlisted native client asset');
 for(const name of ['bin','lib','licenses']){const path=join(root,name),info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o022)||![0,process.getuid?.()].includes(info.uid)||await realpath(path)!==path)throw Error('Immutable native client directory required');for(const child of await readdir(path))if(!requiredFiles.includes(name+'/'+child))throw Error('Unlisted native client library or binary');}
 for(const row of manifest.files){
  const path=join(root,row.path),info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||(info.mode&0o022)||![0,process.getuid?.()].includes(info.uid)||info.size!==row.bytes||await realpath(path)!==path||createHash('sha256').update(await readFile(path)).digest('hex')!==row.digest)throw Error('Native client bytes differ');
 }
 return {root,manifestDigest:createHash('sha256').update(metadata).digest('hex'),sourceDigest,clientMajor:18 as const};
}

async function systemTrustRoots(){
 for(const candidate of ['/etc/ssl/certs/ca-certificates.crt','/etc/pki/tls/certs/ca-bundle.crt']){
  let path:string;try{path=await realpath(candidate);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
  const info=await lstat(path);
  if(!info.isFile()||info.uid!==0||(info.mode&0o022)||info.size<1||info.size>5242880)throw Error('Root-controlled system trust required');return path;
 }
 throw Error('Root-controlled system trust unavailable');
}

/** Trusted hosted backup execution without Docker or a processing sandbox.
 * Caller retains its exported, owner-fenced snapshot until this process exits.
 * Provider/model/mail secrets never enter the child environment. */
export async function runNativeRecoveryPgDump(input:{assetRoot:string;connectionString:string;environmentId:string;serverMajor:18;snapshot:string;output:string;signal:AbortSignal}){
 input.signal.throwIfAborted();if(process.platform!=='linux'||process.arch!=='x64'||input.serverMajor!==18||!/^([a-fA-F0-9-]){1,128}$/.test(input.snapshot))throw Error('Compatible Linux PostgreSQL 18 execution required');
 const client=await verifyNativePostgresClient(input.assetRoot),url=new URL(input.connectionString),local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Explicit verified backup source required');
 if(local?(process.env.VERCEL==='1'||process.env.TURAS_PILOT_OWNED!=='1'||process.env.TURAS_TEST_ENVIRONMENT_ID!==input.environmentId||!/^test-pilot-[a-f0-9]{12}$/.test(input.environmentId)||!/^\/turas_test_016_eval_[a-f0-9]{12}$/.test(url.pathname)):(!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||url.searchParams.get('sslmode')!=='verify-full'))throw Error('Explicit verified backup source required');
 const parent=resolve(dirname(input.output)),name=basename(input.output),directory=await lstat(parent);
 if(!/^[A-Za-z0-9_-]{1,100}\.dump$/.test(name)||!directory.isDirectory()||directory.isSymbolicLink()||directory.uid!==process.getuid?.()||(directory.mode&0o777)!==0o700||await realpath(parent)!==parent)throw Error('Private native dump destination required');
 const db=new Client({connectionString:input.connectionString,connectionTimeoutMillis:5000,statement_timeout:5000});
 try{await db.connect();const marker=(await db.query("SELECT environment_id,schema_version,current_setting('server_version_num')::int AS version,current_database() AS name,current_user AS role FROM turas_environment")).rows;if(marker.length!==1||marker[0].environment_id!==input.environmentId||Number(marker[0].schema_version)!==80||Math.floor(Number(marker[0].version)/10000)!==18||marker[0].name!==decodeURIComponent(url.pathname.slice(1))||marker[0].role!==decodeURIComponent(url.username))throw Error('Actual native dump source differs');}finally{await db.end();}
 const env:NodeJS.ProcessEnv={NODE_ENV:'production',PATH:'/usr/bin:/bin',LD_LIBRARY_PATH:join(client.root,'lib'),PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:local?'disable':'verify-full',PGCONNECT_TIMEOUT:'5',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=120000',...(!local?{PGSSLROOTCERT:await systemTrustRoots()}:{}),LANG:'C'};
 const binary=join(client.root,'bin/pg_dump');
 const version=await promisify(execFile)(binary,['--version'],{env,timeout:10000,maxBuffer:4096,signal:input.signal});if(version.stdout.trim()!=='pg_dump (PostgreSQL) 18.6')throw Error('Native PostgreSQL version differs');
 const output=resolve(input.output),file=await open(output,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600),initial=await file.stat();await file.close();let complete=false;
 try{
  const signal=AbortSignal.any([input.signal,AbortSignal.timeout(120000)]),child=spawn(binary,['--format=custom','--snapshot='+input.snapshot,'--lock-wait-timeout=3s','--file='+output],{env,stdio:['ignore','ignore','ignore'],signal});
  // Bound disk usage during execution, and await close before deleting output.
  // An AbortError can arrive before the operating system has stopped pg_dump.
  let processError:Error|undefined,checking:Promise<void>|undefined,boundError:Error|undefined;
  const monitor=setInterval(()=>{if(checking)return;checking=lstat(output).then(info=>{
   if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.ino!==initial.ino||info.dev!==initial.dev||info.size>67108864){boundError=Error('Native dump exceeded its bound');child.kill('SIGKILL');}
  }).catch(()=>{boundError=Error('Native dump destination unavailable');child.kill('SIGKILL');}).finally(()=>{checking=undefined;});},100);
  let code:number|null;
  try{code=await new Promise<number|null>(done=>{child.once('error',error=>{processError=error;});child.once('close',done);});}finally{clearInterval(monitor);await checking;}
  if(boundError)throw boundError;if(processError)throw processError;signal.throwIfAborted();if(code!==0)throw Error('Native snapshot dump incomplete');
  const dump=await open(output,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const info=await dump.stat();if(!info.isFile()||info.nlink!==1||info.ino!==initial.ino||info.dev!==initial.dev||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size<1||info.size>67108864)throw Error('Native dump byte inventory differs');
   const hash=createHash('sha256'),buffer=Buffer.alloc(65536);let position=0;while(position<info.size){input.signal.throwIfAborted();const part=await dump.read(buffer,0,Math.min(buffer.length,info.size-position),position);if(!part.bytesRead)throw Error('Native dump truncated');hash.update(buffer.subarray(0,part.bytesRead));position+=part.bytesRead;}
   if((await dump.stat()).size!==info.size)throw Error('Native dump changed');complete=true;
   return {digest:hash.digest('hex'),sizeBytes:info.size,serverMajor:18 as const,clientMajor:18 as const,clientManifestDigest:client.manifestDigest};
  }finally{await dump.close();}
 }finally{if(!complete)await unlink(output).catch(error=>{if(error.code!=='ENOENT')throw error;});}
}
