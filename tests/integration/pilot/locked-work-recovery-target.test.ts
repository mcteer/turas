import {it,expect,vi} from 'vitest';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {Client} from 'pg';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection,reserveWorkRecoveryProbe,reconcileWorkRecoveryProbeJournal} from '../../../lib/server/operations/locked-work-recovery-target';
const state=vi.hoisted(()=>({connections:new Map<string,string>(),platformChanged:false,sourceChanged:false,dirty:false,cleanupUnavailable:false,commit:'a'.repeat(40),digest:'b'.repeat(64),catalog:'c'.repeat(64)}));
// Actual owned PostgreSQL; only cloud transport/DNS and source attribution are
// controlled. These checks do not establish hosted platform acceptance.
vi.mock('pg',async original=>{const actual=await original<typeof import('pg')>();return {...actual,Client:class extends actual.Client{constructor(config?:import('pg').ClientConfig){if(state.cleanupUnavailable&&config?.connectionString?.includes('fixture.neon.tech'))throw Error('Controlled cleanup connection unavailable');super(config?.connectionString&&state.connections.has(config.connectionString)?{...config,connectionString:state.connections.get(config.connectionString)}:config);}}};});
vi.mock('../../../scripts/pilot-source',()=>({pilotSource:async()=>({sourceCommit:state.sourceChanged?'d'.repeat(40):state.commit,sourceDigest:state.digest,catalogDigest:state.catalog})}));
vi.mock('../../../scripts/pilot-database-safety-copy',async original=>{const actual=await original<typeof import('../../../scripts/pilot-database-safety-copy')>();return {...actual,verifyDatabaseSafetySourceBinding:async()=>({platformConnectionBindingVerified:true})};});
vi.mock('node:child_process',async original=>{const actual=await original<typeof import('node:child_process')>(),{promisify}=await import('node:util');const execute=((...args:unknown[])=>Reflect.apply(actual.execFile,actual,args)) as typeof actual.execFile;Object.defineProperty(execute,promisify.custom,{value:async(command:string,args:string[],options:unknown)=>{if(command==='git'&&args[0]==='status')return {stdout:state.dirty?' M authored-source.ts':'',stderr:''};if(command!=='vercel')return (promisify(actual.execFile) as Function)(command,args,options);return {stdout:JSON.stringify({id:state.platformChanged?'dpl_changed':'dpl_recovery',projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:null,meta:{githubCommitSha:state.commit}}),stderr:''};}});return {...actual,execFile:execute};});
async function fixture(run:(input:Parameters<typeof withLockedWorkRecoveryTarget>[0])=>Promise<void>){
 state.connections.clear();state.platformChanged=false;state.sourceChanged=false;state.dirty=false;state.cleanupUnavailable=false;
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  const locked=await lockAuthorityTarget(owner,environmentId),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision},password=randomBytes(32).toString('base64url');await closeRuntimePool();await runtime.end();await retireOwnedLegacyRuntime(owner,{...scope,password});
  const selected=requireOwnedPilotDatabase(process.env,true),actualRuntime=new URL(selected);actualRuntime.username='turas_runtime_016';actualRuntime.password=password;
  const ownerUrl=new URL(selected);ownerUrl.hostname='fixture.neon.tech';ownerUrl.port='';ownerUrl.search='?sslmode=verify-full';
  const runtimeUrl=new URL(ownerUrl);runtimeUrl.username='turas_runtime_016';runtimeUrl.password=password;
  state.connections.set(ownerUrl.href,selected);state.connections.set(runtimeUrl.href,actualRuntime.href);
  const root=await mkdtemp(resolve('local-artifacts/016/locked-work-target-'));
  try{
   const sourceFile=join(root,'source.json');await writeFile(sourceFile,JSON.stringify({contract:'pilot-database-safety-source-v1',projectId:'prj_recovery',environmentId,target:'preview',schemaVersion:79,connectionBinding:'platform-readable',databaseUrl:ownerUrl.href}),{mode:0o600});
   await run({sourceFile,scope,runtimeConnection:runtimeUrl.href,signal:AbortSignal.timeout(120000),deadline:Date.now()+110000,hostedScope:{contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_recovery',teamId:'team_recovery',deploymentId:'dpl_recovery',origin:'https://recovery.vercel.app',environmentMarker:environmentId,workspaceId:randomUUID(),target:'preview',sourceCommit:state.commit,sourceDigest:state.digest,catalogDigest:state.catalog}});
  }finally{await rm(root,{recursive:true,force:true});state.connections.clear();state.platformChanged=false;state.sourceChanged=false;state.dirty=false;state.cleanupUnavailable=false;}
 });
}
it('binds an actual locked owner and authenticated runtime for one work recovery lifetime',async()=>fixture(async input=>{
 let retained:unknown;
 const result=await withLockedWorkRecoveryTarget(input,async(db,target)=>{retained={db,target};await db.query('BEGIN');try{expect(await requireLockedWorkRecoveryConnection(db,target,input.scope)).toBe(target);await db.query('COMMIT');return 'measured';}catch(error){await db.query('ROLLBACK');throw error;}});
 expect(result).toBe('measured');const expired=retained as {db:Client;target:Parameters<typeof requireLockedWorkRecoveryConnection>[1]};await expect(requireLockedWorkRecoveryConnection(expired.db,expired.target,input.scope)).rejects.toThrow('Actual active');
}),210000);
it('rejects serialized capabilities foreign clients and nontransactional use',async()=>fixture(async input=>{
 await withLockedWorkRecoveryTarget(input,async(db,target)=>{
  await expect(requireLockedWorkRecoveryConnection(db,{...target},input.scope)).rejects.toThrow('Actual active');
  const foreign=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});try{await foreign.connect();await expect(requireLockedWorkRecoveryConnection(foreign,target,input.scope)).rejects.toThrow('Actual active');}finally{await foreign.end();}
  await expect(requireLockedWorkRecoveryConnection(db,target,input.scope)).rejects.toThrow();
 });
}),210000);
it('refuses changed recovery control and releases its owned connection after failure',async()=>fixture(async input=>{
 await expect(withLockedWorkRecoveryTarget(input,async(db,target)=>{await db.query('UPDATE operations_control SET revision=revision+1');await db.query('BEGIN');try{await requireLockedWorkRecoveryConnection(db,target,input.scope);}finally{await db.query('ROLLBACK');}})).rejects.toThrow('Exact locked work recovery owner');
}),210000);
it('rejects changed platform or source and mismatched runtime endpoints without certifying recovery',async()=>fixture(async input=>{
 state.dirty=true;await expect(withLockedWorkRecoveryTarget(input,async()=>{})).rejects.toThrow('Clean committed');state.dirty=false;state.cleanupUnavailable=false;
 const runtime=new URL(input.runtimeConnection);runtime.pathname='/different';await expect(withLockedWorkRecoveryTarget({...input,runtimeConnection:runtime.href},async()=>{})).rejects.toThrow('platform and runtime target differ');
 await expect(withLockedWorkRecoveryTarget(input,async()=>{state.platformChanged=true;})).rejects.toThrow('Hosted deployment identity');state.platformChanged=false;
 await expect(withLockedWorkRecoveryTarget(input,async()=>{state.sourceChanged=true;})).rejects.toThrow('Work recovery source changed');
}),210000);

async function trackedSession(db:Client,target:Parameters<typeof requireLockedWorkRecoveryConnection>[1],input:Parameters<typeof withLockedWorkRecoveryTarget>[0],withAdmission=false){
 await db.query('BEGIN');try{
 const row=(await db.query("SELECT m.id,m.workspace_id FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id WHERE p.login_name='mcteer' AND m.kind='internal' AND m.role='admin' AND w.classification='primary'")).rows[0];
 const intent=await reserveWorkRecoveryProbe(db,target,{workspaceId:row.workspace_id,membershipId:row.id,journalDirectory:dirname(input.sourceFile)});
 await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,created_at,expires_at,membership_id,workspace_id) SELECT $1,principal_id,$2,clock_timestamp(),clock_timestamp()+interval '60 seconds',id,workspace_id FROM memberships WHERE id=$3",[intent.sessionId,createHash('sha256').update(intent.sessionToken).digest('hex'),row.id]);
 if(withAdmission){const customer=(await db.query('SELECT id FROM customer_references WHERE workspace_id=$1 LIMIT 1',[row.workspace_id])).rows[0];await db.query("INSERT INTO operations_recovery_http_reads(id,environment_id,recovery_id,control_revision,session_id,workspace_id,customer_id,source_commit,origin,deployment_id,secret_hash,database_binding_digest,expires_at,maximum_requests) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,clock_timestamp()+interval '45 seconds',1)",[intent.admissionId,target.environmentId,target.recoveryId,target.controlRevision,intent.sessionId,row.workspace_id,customer.id,target.sourceCommit,target.origin,target.deploymentId,createHash('sha256').update(intent.admissionSecret).digest('hex'),target.databaseBindingDigest]);}
 await db.query('COMMIT');return intent;
 }catch(error){await db.query('ROLLBACK');throw error;}
}
async function requireRetiredIntent(input:Parameters<typeof withLockedWorkRecoveryTarget>[0],sessionId:string){
 const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});try{await db.connect();expect((await db.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1',[sessionId])).rows).toEqual([{retired:true}]);}finally{await db.end();}
 expect(JSON.parse(await readFile(join(dirname(input.sourceFile),'probe-'+sessionId+'-retired.json'),'utf8'))).toMatchObject({contract:'pilot-work-recovery-probe-retirement-v1',sessionId,credentialsAbsentOrRevoked:true});
}
it('durably registers exact probe identities and independently retires committed sessions after callback failure',async()=>fixture(async input=>{
 let sessionId='';await expect(withLockedWorkRecoveryTarget(input,async(db,target)=>{sessionId=(await trackedSession(db,target,input)).sessionId;throw Error('Controlled lost acknowledgement');})).rejects.toThrow('Controlled lost acknowledgement');
 await requireRetiredIntent(input,sessionId);
 await expect(withLockedWorkRecoveryTarget(input,async(db,target)=>{sessionId=(await trackedSession(db,target,input)).sessionId;})).rejects.toThrow('Work recovery session retirement incomplete');
 await requireRetiredIntent(input,sessionId);
}),210000);
it('retires registered credentials after cancellation using an independent uncancelled owner connection',async()=>fixture(async input=>{
 const controller=new AbortController();let sessionId='';await expect(withLockedWorkRecoveryTarget({...input,signal:controller.signal},async(db,target)=>{sessionId=(await trackedSession(db,target,input)).sessionId;controller.abort(Error('Controlled work recovery cancellation'));await new Promise(()=>{});})).rejects.toThrow('Controlled work recovery cancellation');
 await requireRetiredIntent(input,sessionId);
}),210000);

async function retainedProbe(input:Parameters<typeof withLockedWorkRecoveryTarget>[0],admission=false){
 let sessionId='';try{await expect(withLockedWorkRecoveryTarget(input,async(db,target)=>{sessionId=(await trackedSession(db,target,input,admission)).sessionId;state.cleanupUnavailable=true;throw Error('Controlled interrupted probe');})).rejects.toThrow('Work recovery and independent probe cleanup incomplete');}finally{state.cleanupUnavailable=false;}return sessionId;
}
async function resumeProbe(input:Parameters<typeof withLockedWorkRecoveryTarget>[0],sessionId:string,password=process.env.TURAS_DEMO_PASSWORD!){
 return withLockedWorkRecoveryTarget(input,async(db,target)=>{await db.query('BEGIN');try{const result=await reconcileWorkRecoveryProbeJournal(db,target,{journalDirectory:dirname(input.sourceFile),intentNames:['probe-'+sessionId+'-intent.json'],password});await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}});
}
it('reconciles genuine retained session preimages after restart and refuses forged journals or wrong operator credentials',async()=>fixture(async input=>{
 const sessionId=await retainedProbe(input),root=dirname(input.sourceFile),intentFile=join(root,'probe-'+sessionId+'-intent.json'),credentialFile=join(root,'private-probe-'+sessionId+'-credentials.json');
 const originalIntent=await readFile(intentFile),originalCredentials=await readFile(credentialFile);
 await expect(resumeProbe(input,sessionId,'Incorrect controlled operator password')).rejects.toThrow('operator authentication');
 const credentials=JSON.parse(originalCredentials.toString());credentials.sessionToken=randomBytes(32).toString('base64url');const forged=Buffer.from(JSON.stringify(credentials)+'\n'),intent=JSON.parse(originalIntent.toString());intent.credentialDigest=createHash('sha256').update(forged).digest('hex');
 await writeFile(credentialFile,forged);await writeFile(intentFile,JSON.stringify(intent)+'\n');
 try{await expect(resumeProbe(input,sessionId)).rejects.toThrow('session cleanup identity differs');const check=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});try{await check.connect();expect((await check.query('SELECT revoked_at IS NULL AS live FROM login_sessions WHERE id=$1',[sessionId])).rows[0].live).toBe(true);}finally{await check.end();}}
 finally{await writeFile(credentialFile,originalCredentials);await writeFile(intentFile,originalIntent);}
 expect(await resumeProbe(input,sessionId)).toMatchObject({probes:1,serviceOpened:false,restorationReady:false});await requireRetiredIntent(input,sessionId);
}),210000);
it('reconciles original admission credentials idempotently after a lost commit acknowledgement without renewing authority',async()=>fixture(async input=>{
 const sessionId=await retainedProbe(input,true),originalQuery=Client.prototype.query;let loseAck=false;
 Client.prototype.query=(function(this:Client,...args:unknown[]){const result=Reflect.apply(originalQuery,this,args);if(args[0]==='COMMIT'&&loseAck){loseAck=false;return Promise.resolve(result).then(()=>{throw Error('Controlled lost cleanup commit acknowledgement');});}return result;}) as typeof originalQuery;
 try{await expect(withLockedWorkRecoveryTarget(input,async(db,target)=>{await db.query('BEGIN');await reconcileWorkRecoveryProbeJournal(db,target,{journalDirectory:dirname(input.sourceFile),intentNames:['probe-'+sessionId+'-intent.json'],password:process.env.TURAS_DEMO_PASSWORD!});loseAck=true;await db.query('COMMIT');})).rejects.toThrow('Controlled lost cleanup commit acknowledgement');}finally{Client.prototype.query=originalQuery;}
 await requireRetiredIntent(input,sessionId);expect(await resumeProbe(input,sessionId)).toMatchObject({probes:1,serviceOpened:false});await requireRetiredIntent(input,sessionId);
}),210000);
it('retains every concurrent reservation for cleanup and enforces the shared thirty-two probe bound',async()=>fixture(async input=>{
 for(const count of [4,33]){
  const sessions:string[]=[];
  await expect(withLockedWorkRecoveryTarget(input,async(db,target)=>{
   await db.query('BEGIN');
   const row=(await db.query("SELECT m.id,m.workspace_id FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id WHERE p.login_name='mcteer' AND m.kind='internal' AND m.role='admin' AND w.classification='primary'")).rows[0];
   const reservations=await Promise.allSettled(Array.from({length:count},()=>reserveWorkRecoveryProbe(db,target,{workspaceId:row.workspace_id,membershipId:row.id,journalDirectory:dirname(input.sourceFile)})));
   const accepted=reservations.flatMap(result=>result.status==='fulfilled'?[result.value]:[]),rejected=reservations.filter(result=>result.status==='rejected');
   expect(accepted.length).toBe(Math.min(count,32));expect(rejected.length).toBe(Math.max(0,count-32));
   for(const intent of accepted){await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,created_at,expires_at,membership_id,workspace_id) SELECT $1,principal_id,$2,clock_timestamp(),clock_timestamp()+interval '60 seconds',id,workspace_id FROM memberships WHERE id=$3",[intent.sessionId,createHash('sha256').update(intent.sessionToken).digest('hex'),row.id]);sessions.push(intent.sessionId);}
   await db.query('COMMIT');throw Error('Controlled concurrent probe interruption');
  })).rejects.toThrow('Controlled concurrent probe interruption');
  for(const sessionId of sessions)await requireRetiredIntent(input,sessionId);
 }
}),210000);
