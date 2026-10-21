import {withRetainedDenialFixture} from '../../fixtures/pilot/retained-denials';
import {issueWorkRecoveryMcpProbe} from '../../../lib/server/operations/recovery-mcp-probe-issuer';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {measureWorkMaintenanceHttpBatch,requireMeasuredWorkMaintenanceHttpBatch,requireMeasuredWorkMaintenanceHttpCoverage} from '../../../lib/server/operations/work-maintenance-verification';
import {GET as maintenanceArtifact} from '../../../app/api/operations/recovery-read/[admissionId]/artifact/route';
import {POST as maintenanceMcp} from '../../../app/api/operations/recovery-read/[admissionId]/mcp/route';
import {handleMcpRequest} from '../../../lib/server/mcp/transport';
import {deriveWorkMaintenanceInventoryInTransaction} from '../../../lib/server/operations/owned-maintenance-inventory';
import {Client as McpClient,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {mcpProtocolVersion,mcpToolOutputs} from '../../../lib/contracts/mcp';
import {newMcpCredential} from '../../../lib/server/mcp/credentials';
import {readWorkRecoveryMcpRequest} from '../../../lib/server/operations/recovery-mcp-read';
import {z} from 'zod';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {sessionCookie} from '../../../lib/server/auth/sessions';
import {it,expect,vi} from 'vitest';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {Client,type PoolClient} from 'pg';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {withAuthenticatedWorkMcpRead,withAuthenticatedWorkParticipantRead,withAuthenticatedWorkRecoveryRead,createAuthenticatedWorkRecoverySession} from '../../../lib/server/operations/authenticated-recovery-read';
import {issueWorkParticipantRecoveryHttpRead,issueWorkRecoveryHttpRead,retireOwnedRecoveryHttpRead} from '../../../lib/server/operations/recovery-http-read-issuer';
import {readProfile} from '../../../lib/server/profiles/read';
import {GET as maintenanceProfile} from '../../../app/api/operations/recovery-read/[admissionId]/profile/route';
import {GET as ordinaryProfile} from '../../../app/api/customers/[customerId]/profile/route';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection,reserveWorkRecoveryProbe,reconcileWorkRecoveryProbeJournal,retireRegisteredWorkMcpProbe} from '../../../lib/server/operations/locked-work-recovery-target';
const state=vi.hoisted(()=>({connections:new Map<string,string>(),retainedKey:null as Uint8Array|null,platformChanged:false,sourceChanged:false,dirty:false,cleanupUnavailable:false,commit:'a'.repeat(40),digest:'b'.repeat(64),catalog:'c'.repeat(64)}));
// Actual owned PostgreSQL; only cloud transport/DNS and source attribution are
// controlled. These checks do not establish hosted platform acceptance.
vi.mock('pg',async original=>{const actual=await original<typeof import('pg')>();return {...actual,Client:class extends actual.Client{constructor(config?:import('pg').ClientConfig){if(state.cleanupUnavailable&&config?.connectionString?.includes('fixture.neon.tech'))throw Error('Controlled cleanup connection unavailable');super(config?.connectionString&&state.connections.has(config.connectionString)?{...config,connectionString:state.connections.get(config.connectionString)}:config);}}};});
vi.mock('../../../lib/server/operations/database-binding',async original=>{const actual=await original<typeof import('../../../lib/server/operations/database-binding')>();return {...actual,databaseTargetDigest:(connection:string,environmentId:string,name?:string)=>actual.databaseTargetDigest(state.connections.get(connection)??connection,environmentId,name)};});
vi.mock('../../../scripts/pilot-source',()=>({pilotSource:async()=>({sourceCommit:state.sourceChanged?'d'.repeat(40):state.commit,sourceDigest:state.digest,catalogDigest:state.catalog})}));
vi.mock('../../../scripts/pilot-database-safety-copy',async original=>{const actual=await original<typeof import('../../../scripts/pilot-database-safety-copy')>();return {...actual,verifyDatabaseSafetySourceBinding:async()=>({platformConnectionBindingVerified:true}),readWorkRecoveryKey:async()=>{if(!state.retainedKey)throw Error('Controlled archive key absent');return Buffer.from(state.retainedKey);}};});
vi.mock('../../../scripts/pilot-neon-archive',async original=>{const actual=await original<typeof import('../../../scripts/pilot-neon-archive')>();return {...actual,verifyWorkNeonDestination:async()=>({controlledProviderIdentity:true})};});
vi.mock('node:child_process',async original=>{const actual=await original<typeof import('node:child_process')>(),{promisify}=await import('node:util');const execute=((...args:unknown[])=>Reflect.apply(actual.execFile,actual,args)) as typeof actual.execFile;Object.defineProperty(execute,promisify.custom,{value:async(command:string,args:string[],options:unknown)=>{if(command==='git'&&args[0]==='status')return {stdout:state.dirty?' M authored-source.ts':'',stderr:''};if(command!=='vercel')return (promisify(actual.execFile) as Function)(command,args,options);return {stdout:JSON.stringify({id:state.platformChanged?'dpl_changed':'dpl_recovery',projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:null,meta:{githubCommitSha:state.commit}}),stderr:''};}});return {...actual,execFile:execute};});
async function fixture(run:(input:Parameters<typeof withLockedWorkRecoveryTarget>[0])=>Promise<void>,beforeLock?:(owner:Client)=>Promise<void>){
 state.connections.clear();state.platformChanged=false;state.sourceChanged=false;state.dirty=false;state.cleanupUnavailable=false;
 await withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
  if(beforeLock)await beforeLock(owner);
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
 const result=await withLockedWorkRecoveryTarget(input,async(db,target)=>{retained={db,target};await db.query('BEGIN');try{expect(await requireLockedWorkRecoveryConnection(db,target,input.scope)).toBe(target);
 const inventory=await deriveWorkMaintenanceInventoryInTransaction(db,target,input.signal);expect(inventory.contract).toBe('pilot-work-maintenance-inventory-v1');expect(inventory.records.length).toBeGreaterThan(0);expect(inventory.requiredOriginals.requiredOriginalsVerified).toBe(false);expect(inventory.requiredScopeHealthy).toBe(false);
 await db.query('SAVEPOINT missing_inventory_owner');await db.query('UPDATE memberships SET active=false WHERE principal_id=$1',[DEMO_IDS.mcteer]);await expect(deriveWorkMaintenanceInventoryInTransaction(db,target,input.signal)).rejects.toThrow('lacks authenticated owner scope');await db.query('ROLLBACK TO SAVEPOINT missing_inventory_owner');await db.query('RELEASE SAVEPOINT missing_inventory_owner');
 await db.query('COMMIT');return 'measured';}catch(error){await db.query('ROLLBACK');throw error;}});
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
 const controller=new AbortController();let sessionId='';
 // The callback deliberately never drains. Cancellation must retain that failure
 // while independent owner IO still retires its committed credentials.
 const cancelled=withLockedWorkRecoveryTarget({...input,signal:controller.signal},async(db,target)=>{sessionId=(await trackedSession(db,target,input)).sessionId;controller.abort(Error('Controlled work recovery cancellation'));await new Promise(()=>{});});
 await expect(cancelled).rejects.toBeInstanceOf(AggregateError);
 await expect(cancelled).rejects.toMatchObject({message:'Work recovery and independent probe cleanup incomplete',errors:[{message:'Controlled work recovery cancellation'},{message:'Recovery canonical read group did not drain within its read bound'}]});
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

it('issues registered work sessions and canonical HTTP reads from the verified target while ordinary ingress stays locked',async()=>{
 let customerId='',workspaceId='';
 await fixture(async input=>{
  const keys=['DATABASE_URL','TURAS_APP_ORIGIN','VERCEL_DEPLOYMENT_ID','VERCEL_GIT_COMMIT_SHA','TURAS_CODE_VERSION'] as const,prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try{
   await withLockedWorkRecoveryTarget(input,async(db,target)=>{
    const scope={...input.scope,workspaceId,password:process.env.TURAS_DEMO_PASSWORD!,deadline:Date.now()+59000};
    await db.query('BEGIN');try{const profile=await withAuthenticatedWorkRecoveryRead(db,target,scope,dirname(input.sourceFile),actor=>readProfile(actor,customerId,db as unknown as PoolClient,undefined,undefined,false,true));const parsed=z.object({customer:z.object({id:z.uuid()}),acceptedFacts:z.array(z.unknown())}).parse(profile);expect(parsed.customer.id).toBe(customerId);expect(parsed.acceptedFacts.length).toBeGreaterThan(0);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    await db.query('BEGIN');let admission:Awaited<ReturnType<typeof issueWorkRecoveryHttpRead>>;
    try{admission=await issueWorkRecoveryHttpRead(db,target,{...scope,deadline:Date.now()+59000,customerId,maximumRequests:2,deploymentId:target.deploymentId},dirname(input.sourceFile));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    await closeRuntimePool();process.env.DATABASE_URL=state.connections.get(input.runtimeConnection)!;process.env.TURAS_APP_ORIGIN=target.origin;process.env.VERCEL_DEPLOYMENT_ID=target.deploymentId;process.env.VERCEL_GIT_COMMIT_SHA=target.sourceCommit;process.env.TURAS_CODE_VERSION=target.sourceCommit;
    const request=()=>new Request(target.origin+'/api/operations/recovery-read/'+admission.id+'/profile',{headers:{host:new URL(target.origin).host,cookie:sessionCookie(admission.actor.token,admission.actor.expiresAt).split(';')[0],'x-turas-recovery-read':admission.secret}});
    const positive=await maintenanceProfile(request(),{params:Promise.resolve({admissionId:admission.id})});expect(positive.status).toBe(200);expect(await positive.json()).toMatchObject({data:{customer:{id:customerId}}});
    expect((await ordinaryProfile(new Request(target.origin+'/api/customers/'+customerId+'/profile',{headers:request().headers}),{params:Promise.resolve({customerId})})).status).toBe(401);
    await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,admission.id);expect((await maintenanceProfile(request(),{params:Promise.resolve({admissionId:admission.id})})).status).toBe(403);
    await closeRuntimePool();
   });
  }finally{await closeRuntimePool();for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
 },async owner=>{const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');customerId=f.customerId;workspaceId=f.actor.workspaceId;});
},210000);
it('rejects forged work target credentials changed deployment and wrong operator password before issuing sessions',async()=>fixture(async input=>{
 await withLockedWorkRecoveryTarget(input,async(db,target)=>{
  const workspaceId=(await db.query("SELECT id FROM workspaces WHERE classification='primary'")).rows[0].id,scope={...input.scope,workspaceId,password:process.env.TURAS_DEMO_PASSWORD!,deadline:Date.now()+59000};
  const before=Number((await db.query('SELECT count(*) AS count FROM login_sessions')).rows[0].count);
  await db.query('BEGIN');try{await expect(createAuthenticatedWorkRecoverySession(db,{...target},scope,dirname(input.sourceFile))).rejects.toThrow('Actual active');await db.query('ROLLBACK');}catch(error){await db.query('ROLLBACK');throw error;}
  await db.query('BEGIN');try{await expect(createAuthenticatedWorkRecoverySession(db,target,{...scope,password:'Controlled wrong password'},dirname(input.sourceFile))).rejects.toThrow('Recovery authentication unavailable');await db.query('ROLLBACK');}catch(error){await db.query('ROLLBACK');throw error;}
  await db.query('BEGIN');try{await expect(issueWorkRecoveryHttpRead(db,target,{...scope,customerId:randomUUID(),maximumRequests:1,deploymentId:'dpl_wrong'},dirname(input.sourceFile))).rejects.toThrow('Exact short-lived work recovery deployment');await db.query('ROLLBACK');}catch(error){await db.query('ROLLBACK');throw error;}
  expect(Number((await db.query('SELECT count(*) AS count FROM login_sessions')).rows[0].count)).toBe(before);
 });
}),210000);

it('rechecks canonical work session expiry and revocation after the read while the target remains active',async()=>fixture(async input=>{
 for(const change of ['expiry','revocation'])await withLockedWorkRecoveryTarget(input,async(db,target)=>{
  const workspaceId=(await db.query("SELECT id FROM workspaces WHERE classification='primary'")).rows[0].id,scope={...input.scope,workspaceId,password:process.env.TURAS_DEMO_PASSWORD!,deadline:Date.now()+(change==='expiry'?3000:59000)};let callbackRan=false;
  await db.query('BEGIN');try{
   await expect(withAuthenticatedWorkRecoveryRead(db,target,scope,dirname(input.sourceFile),async actor=>{callbackRan=true;if(change==='expiry')await db.query('SELECT pg_sleep(GREATEST(0,extract(epoch FROM ($1::timestamptz-clock_timestamp())))+0.05)',[actor.expiresAt]);else await db.query('UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1',[actor.sessionId]);return {acceptedContent:true};})).rejects.toThrow(/Recovery read probe unavailable|Exact owner recovery read probe required/);
   expect(callbackRan).toBe(true);await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
 });
}),210000);

async function withTargetRuntime<T>(input:Parameters<typeof withLockedWorkRecoveryTarget>[0],target:Parameters<typeof requireLockedWorkRecoveryConnection>[1],run:()=>Promise<T>){
 const keys=['DATABASE_URL','TURAS_APP_ORIGIN','VERCEL_DEPLOYMENT_ID','VERCEL_GIT_COMMIT_SHA','TURAS_CODE_VERSION'] as const,prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 await closeRuntimePool();try{process.env.DATABASE_URL=state.connections.get(input.runtimeConnection)!;process.env.TURAS_APP_ORIGIN=target.origin;process.env.VERCEL_DEPLOYMENT_ID=target.deploymentId;process.env.VERCEL_GIT_COMMIT_SHA=target.sourceCommit;process.env.TURAS_CODE_VERSION=target.sourceCommit;return await run();}
 finally{await closeRuntimePool();for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
}
it('authenticates real participant credentials and preserves customer grants across locked canonical reads',async()=>{
 let workspaceId='',customerId='',partnerMembershipId='';
 await fixture(async input=>{
  await withLockedWorkRecoveryTarget(input,async(db,target)=>{
   const run=async(username:'panel'|'partner',password:string,read:Parameters<typeof withAuthenticatedWorkParticipantRead>[4])=>{
    await db.query('BEGIN');try{const result=await withAuthenticatedWorkParticipantRead(db,target,{...input.scope,workspaceId,username,password,deadline:Date.now()+59000},dirname(input.sourceFile),read);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}
   };
   const read=(actor:Parameters<typeof readProfile>[0])=>readProfile(actor,customerId,db as unknown as PoolClient,undefined,undefined,false,true);
   const issue=async(username:'panel'|'partner',password:string)=>{
    await db.query('BEGIN');try{const admission=await issueWorkParticipantRecoveryHttpRead(db,target,{...input.scope,workspaceId,customerId,username,password,deadline:Date.now()+59000,maximumRequests:2,deploymentId:target.deploymentId},dirname(input.sourceFile));await db.query('COMMIT');return admission;}catch(error){await db.query('ROLLBACK');throw error;}
   };
   const http=async(admission:Awaited<ReturnType<typeof issue>>)=>withTargetRuntime(input,target,()=>maintenanceProfile(new Request(target.origin+'/api/operations/recovery-read/'+admission.id+'/profile',{headers:{host:new URL(target.origin).host,cookie:sessionCookie(admission.actor.token,admission.actor.expiresAt).split(';')[0],'x-turas-recovery-read':admission.secret}}),{params:Promise.resolve({admissionId:admission.id})}));

   for(const username of ['panel','partner'] as const){
    const password=process.env[username==='panel'?'PANEL_PASSWORD':'PARTNER_PASSWORD']!;
    await expect(run(username,'Controlled wrong participant password',read)).rejects.toThrow('Recovery authentication unavailable');
    const value=z.object({customer:z.object({id:z.uuid()}),acceptedFacts:z.array(z.unknown())}).parse(await run(username,password,read));expect(value.customer.id).toBe(customerId);expect(value.acceptedFacts.length).toBeGreaterThan(0);
    await expect(run(username,password,actor=>readProfile(actor,randomUUID(),db as unknown as PoolClient,undefined,undefined,false,true))).rejects.toThrow();
    const admission=await issue(username,password);try{const response=await http(admission);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({data:{customer:{id:customerId}}});}finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,admission.id);}

   }
   const grantProbe=await issue('partner',process.env.PARTNER_PASSWORD!);
   await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1 AND customer_id=$2",[partnerMembershipId,customerId]);
   try{expect((await http(grantProbe)).status).toBe(404);}finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,grantProbe.id);}
   await expect(run('partner',process.env.PARTNER_PASSWORD!,read)).rejects.toThrow();
   expect(z.object({customer:z.object({id:z.uuid()})}).parse(await run('panel',process.env.PANEL_PASSWORD!,read)).customer.id).toBe(customerId);
   await expect(run('partner',process.env.PARTNER_PASSWORD!,async actor=>{await db.query('UPDATE memberships SET active=false WHERE id=$1',[actor.membershipId]);})).rejects.toThrow('Exact owner recovery read probe required');
   expect((await db.query('SELECT 1 FROM login_sessions WHERE workspace_id=$1 AND principal_id=ANY($2::uuid[]) AND revoked_at IS NULL',[workspaceId,[DEMO_IDS.panel,DEMO_IDS.partner]])).rowCount).toBe(0);
  });
 },async owner=>{
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');workspaceId=f.actor.workspaceId;customerId=f.customerId;partnerMembershipId=randomUUID();const org=randomUUID();
  await owner.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic recovery partner')",[org,workspaceId]);
  await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,'internal','member',NULL),($4,$5,$3,'partner','member',$6)",[randomUUID(),DEMO_IDS.panel,workspaceId,partnerMembershipId,DEMO_IDS.partner,org]);
  await owner.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),partnerMembershipId,workspaceId,customerId,DEMO_IDS.mcteer]);
 });
},210000);

it('uses the actual SDK and persisted bearer scope for locked recovery with customer pagination and revocation',async()=>{
 let workspaceId='',customerId='',otherCustomerId='',credential='',connectionId='';
 await fixture(async input=>{
  await withLockedWorkRecoveryTarget(input,async(db,target)=>{
   await db.query('BEGIN');let admission:Awaited<ReturnType<typeof issueWorkRecoveryHttpRead>>;
   try{admission=await issueWorkRecoveryHttpRead(db,target,{...input.scope,workspaceId,customerId:null,password:process.env.TURAS_DEMO_PASSWORD!,deadline:Date.now()+59000,maximumRequests:10,deploymentId:target.deploymentId,readKind:'mcp',recordId:connectionId},dirname(input.sourceFile));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
   const client=new McpClient({name:'synthetic-locked-recovery',version:'1.0.0'},{versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});
   const sdkFetch:typeof fetch=async(url,options)=>withTargetRuntime(input,target,async()=>{
    const request=new Request(url,options),headers=new Headers(request.headers);headers.set('host',new URL(request.url).host);headers.set('cookie',sessionCookie(admission.actor.token,admission.actor.expiresAt).split(';')[0]);headers.set('x-turas-recovery-read',admission.secret);
    return maintenanceMcp(new Request(target.origin+'/api/operations/recovery-read/'+admission.id+'/mcp',{method:request.method,headers,body:await request.arrayBuffer(),signal:request.signal}),{params:Promise.resolve({admissionId:admission.id})});
   });
   try{
    expect((await sdkFetch(target.origin+'/api/mcp/v1',{method:'POST',headers:{authorization:'Bearer tmcp.'+connectionId+'.'+randomBytes(32).toString('base64url'),'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).status).toBe(401);
    await expect(readWorkRecoveryMcpRequest(db,target,new Request(target.origin+'/api/mcp/v1?unexpected=1',{method:'POST',headers:{host:new URL(target.origin).host,'content-type':'application/json'},body:'{}'}))).rejects.toThrow('Recovery MCP request unavailable');
    await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp/v1',target.origin),{fetch:sdkFetch,requestInit:{headers:{authorization:'Bearer '+credential}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{timeout:10000});
    const identity=mcpToolOutputs.turas_identity_v1.parse((await client.callTool({name:'turas_identity_v1',arguments:{}})).structuredContent);expect(identity.status).toBe('available');if(identity.status==='available')expect(identity.data.workspaceId).toBe(workspaceId);
    const customers=mcpToolOutputs.turas_customers_list_v1.parse((await client.callTool({name:'turas_customers_list_v1',arguments:{limit:1}})).structuredContent);expect(customers.status).toBe('available');expect(customers.nextCursor).toBeTruthy();
    const next=mcpToolOutputs.turas_customers_list_v1.parse((await client.callTool({name:'turas_customers_list_v1',arguments:{limit:1,cursor:customers.nextCursor}})).structuredContent);expect(next.status).toBe('available');expect(next.nextCursor).toBeNull();if(customers.status==='available'&&next.status==='available')expect(new Set([...customers.data.items,...next.data.items].map(row=>row.customerId))).toEqual(new Set([customerId,otherCustomerId]));
    await withTargetRuntime(input,target,async()=>{expect((await handleMcpRequest(new Request(target.origin+'/api/mcp/v1',{method:'POST',headers:{host:new URL(target.origin).host,authorization:'Bearer '+credential,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}))).status).toBe(503);});
    const profile=mcpToolOutputs.turas_profile_read_v1.parse((await client.callTool({name:'turas_profile_read_v1',arguments:{customerId,section:'facts',limit:20}})).structuredContent);expect(profile.status).toBe('available');if(profile.status==='available')expect(profile.data.items.length).toBeGreaterThan(0);
    const denied=await client.callTool({name:'turas_profile_read_v1',arguments:{customerId:randomUUID(),section:'facts',limit:20}});expect(denied.isError||mcpToolOutputs.turas_profile_read_v1.parse(denied.structuredContent).status==='unavailable').toBeTruthy();
    await db.query('BEGIN');
    await expect(withAuthenticatedWorkMcpRead(db,target,'Bearer '+credential,Date.now()+9000,async()=>{
     await db.query('UPDATE mcp_connections SET revoked_at=clock_timestamp(),revoker_membership_id=membership_id,credential_hash=NULL WHERE id=$1',[connectionId]);return {mustNotEscape:true};
    })).rejects.toThrow('Authentication required');await db.query('COMMIT');
    await expect(client.callTool({name:'turas_identity_v1',arguments:{}})).rejects.toThrow();
   }finally{try{await client.close();}finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,admission.id);}}
  });
 },async owner=>{
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');workspaceId=f.actor.workspaceId;customerId=f.customerId;otherCustomerId=randomUUID();
  await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic second MCP customer',true)",[otherCustomerId,workspaceId]);await owner.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[otherCustomerId,workspaceId]);
  const issued=newMcpCredential();credential=issued.credential;connectionId=issued.id;await owner.query('BEGIN');
  await owner.query("INSERT INTO mcp_connections(id,environment_id,workspace_id,principal_id,membership_id,name,categories,scope_digest,credential_hash,expires_at) VALUES($1,$2,$3,$4,$5,'Synthetic recovery SDK',ARRAY['profiles'], $6,$7,clock_timestamp()+interval '10 minutes')",[connectionId,process.env.TURAS_ENVIRONMENT_ID,workspaceId,f.actor.principalId,f.actor.membershipId,createHash('sha256').update(connectionId).digest('hex'),issued.hash]);
  for(const id of [customerId,otherCustomerId])await owner.query('INSERT INTO mcp_connection_customers(connection_id,workspace_id,customer_id) VALUES($1,$2,$3)',[connectionId,workspaceId,id]);await owner.query('COMMIT');
 });
},210000);

it('measures actual selected work HTTP reads without granting full service and rejects forged or changed batch proofs',async()=>{
 let customerId='',workspaceId='';
 await fixture(async input=>{
  const targets:Parameters<typeof requireLockedWorkRecoveryConnection>[1][]=[];let allRecords:Parameters<typeof measureWorkMaintenanceHttpBatch>[0]['records']=[];
  await withLockedWorkRecoveryTarget(input,async(db,target)=>{targets.push(target);await db.query('BEGIN');try{allRecords=(await deriveWorkMaintenanceInventoryInTransaction(db,target,input.signal)).records.map(({kind,recordId})=>({kind,recordId}));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}});const target=targets[0];
  const originalFetch=globalThis.fetch;let corrupt=false;
  const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
   const incoming=new Request(url,options),address=new URL(incoming.url),headers=new Headers(incoming.headers);headers.set('host',address.host);const request=new Request(incoming,{headers});if(address.origin!==target.origin)throw Error('Controlled work HTTP transport left target');
   return withTargetRuntime(input,target,async()=>{
    if(address.pathname.startsWith('/api/customers/'))return ordinaryProfile(request,{params:Promise.resolve({customerId:address.pathname.split('/')[3]})});
    const id=address.pathname.split('/')[4];
    if(address.pathname.endsWith('/artifact'))return maintenanceArtifact(request,{params:Promise.resolve({admissionId:id})});
    if(!address.pathname.endsWith('/profile'))throw Error('Controlled work HTTP route unavailable');
    const response=await maintenanceProfile(request,{params:Promise.resolve({admissionId:id})});
    if(corrupt&&response.status===200)return Response.json({data:{customer:{id:randomUUID()},contextVersion:0,acceptedFacts:[],workloads:[]}},{headers:{'x-turas-code-version':target.sourceCommit}});return response;
   });
  });
  try{
   const records=[{kind:'profile' as const,recordId:customerId}],batch=await measureWorkMaintenanceHttpBatch({target:input,records,password:process.env.TURAS_DEMO_PASSWORD!,journalDirectory:dirname(input.sourceFile)});
   expect(batch).toMatchObject({verifiedRecords:1,maintenanceHttpVerified:true,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false});
   await withLockedWorkRecoveryTarget(input,async(db,current)=>{
    await db.query('BEGIN');try{
     await expect(requireMeasuredWorkMaintenanceHttpBatch(db,current,{...batch},input.signal)).rejects.toThrow('Actual fresh');
     expect(await requireMeasuredWorkMaintenanceHttpBatch(db,current,batch,input.signal)).toBe(batch);
     await expect(requireMeasuredWorkMaintenanceHttpCoverage(db,current,[batch,batch],input.signal)).rejects.toThrow('Duplicate');
     await expect(requireMeasuredWorkMaintenanceHttpCoverage(db,current,[{...batch}],input.signal)).rejects.toThrow('Actual fresh');
     const inventory=await deriveWorkMaintenanceInventoryInTransaction(db,current,input.signal);
     if(inventory.records.length===batch.verifiedRecords)expect(await requireMeasuredWorkMaintenanceHttpCoverage(db,current,[batch],input.signal)).toMatchObject({maintenanceRecordCoverageVerified:true,requiredScopeHealthy:false,restorationReady:false});
     else await expect(requireMeasuredWorkMaintenanceHttpCoverage(db,current,[batch],input.signal)).rejects.toThrow('Complete work maintenance record coverage');
     await db.query('SAVEPOINT changed_batch');await db.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customerId]);await expect(requireMeasuredWorkMaintenanceHttpBatch(db,current,batch,input.signal)).rejects.toThrow('coverage changed');await db.query('ROLLBACK TO SAVEPOINT changed_batch');await db.query('RELEASE SAVEPOINT changed_batch');await db.query('COMMIT');
    }catch(error){await db.query('ROLLBACK');throw error;}
   });
   const batches=[batch],missing=allRecords.filter(record=>!records.some(selected=>selected.kind===record.kind&&selected.recordId===record.recordId));
   for(let offset=0;offset<missing.length;offset+=8)batches.push(await measureWorkMaintenanceHttpBatch({target:input,records:missing.slice(offset,offset+8),password:process.env.TURAS_DEMO_PASSWORD!,journalDirectory:dirname(input.sourceFile)}));
   await withLockedWorkRecoveryTarget(input,async(db,current)=>{await db.query('BEGIN');try{expect(await requireMeasuredWorkMaintenanceHttpCoverage(db,current,batches,input.signal)).toMatchObject({verifiedRecords:allRecords.length,maintenanceRecordCoverageVerified:true,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false});await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}});
   corrupt=true;await expect(measureWorkMaintenanceHttpBatch({target:input,records,password:process.env.TURAS_DEMO_PASSWORD!,journalDirectory:dirname(input.sourceFile)})).rejects.toThrow();
   const retirement=vi.spyOn(await import('../../../lib/server/operations/recovery-http-read-issuer'),'retireOwnedRecoveryHttpRead').mockRejectedValue(Error('Controlled record retirement failure'));
   try{const error=await measureWorkMaintenanceHttpBatch({target:input,records,password:process.env.TURAS_DEMO_PASSWORD!,journalDirectory:dirname(input.sourceFile)}).then(()=>null,error=>error);expect(error).toBeInstanceOf(AggregateError);expect(error.errors).toHaveLength(2);expect(error.errors[1].message).toBe('Controlled record retirement failure');}finally{retirement.mockRestore();}

   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});try{await db.connect();expect((await db.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.workspace_id=$1 AND (a.revoked_at IS NULL OR s.revoked_at IS NULL)',[workspaceId])).rowCount).toBe(0);}finally{await db.end();}
  }finally{transport.mockRestore();expect(globalThis.fetch).toBe(originalFetch);}
 },async owner=>{const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');customerId=f.customerId;workspaceId=f.actor.workspaceId;});
},210000);

it('issues a fresh bounded MCP probe after genuine cold denial reconciliation and retires original identities through interruption and restart',async()=>{
 let workspaceId='',customerId='',capturedConnectionId='',partnerMembershipId='',foreignCustomerId='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);
   expect((await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[capturedConnectionId])).rows[0].credential_hash).toBeNull();
   let fresh:Awaited<ReturnType<typeof issueWorkRecoveryMcpProbe>>|undefined;
   await withLockedWorkRecoveryTarget(input,async(db,target)=>{
    const issue=async(current:typeof retained,password=process.env.TURAS_DEMO_PASSWORD!,customers=[customerId],username:'mcteer'|'partner'='mcteer')=>{
     const deadline=Math.min(Date.now()+55000,target.deadline);await db.query('BEGIN');
     try{const result=await issueWorkRecoveryMcpProbe(db,target,{...input.scope,workspaceId,deadline,password,username,mcp:{categories:['profiles'],customerIds:customers,expiresAt:new Date(deadline).toISOString(),retained:current}},dirname(input.sourceFile));await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}
    };
    await expect(issue({...retained})).rejects.toThrow('Actual independently retained');await expect(issue(retained,'incorrect')).rejects.toThrow('Recovery authentication unavailable');
    await expect(issue(retained,process.env.TURAS_DEMO_PASSWORD!,[])).rejects.toThrow('Customer categories require selected customers');
    fresh=await issue(retained);expect(fresh.connection.id).not.toBe(capturedConnectionId);expect(Date.parse(fresh.connection.expiresAt)-Date.now()).toBeLessThanOrEqual(59000);
    expect((await db.query('SELECT mcp_probe_connection,mcp_credential_digest FROM operations_recovery_http_reads WHERE id=$1',[fresh.admission.id])).rows).toEqual([{mcp_probe_connection:true,mcp_credential_digest:createHash('sha256').update(fresh.credential.split('.')[2]).digest('hex')}]);
    async function readAndRetire(issued:NonNullable<typeof fresh>){const client=new McpClient({name:'synthetic-fresh-recovery',version:'1.0.0'},{versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});
    const sdkFetch:typeof fetch=async(url,options)=>withTargetRuntime(input,target,async()=>{
     const request=new Request(url,options),headers=new Headers(request.headers);headers.set('host',new URL(target.origin).host);headers.set('cookie',sessionCookie(issued.admission.actor.token,issued.admission.actor.expiresAt).split(';')[0]);headers.set('x-turas-recovery-read',issued.admission.secret);
     return maintenanceMcp(new Request(target.origin+'/api/operations/recovery-read/'+issued.admission.id+'/mcp',{method:request.method,headers,body:await request.arrayBuffer(),signal:request.signal}),{params:Promise.resolve({admissionId:issued.admission.id})});
    });
    try{await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp/v1',target.origin),{fetch:sdkFetch,requestInit:{headers:{authorization:'Bearer '+issued.credential}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{timeout:10000});const identity=mcpToolOutputs.turas_identity_v1.parse((await client.callTool({name:'turas_identity_v1',arguments:{}})).structuredContent);expect(identity.status).toBe('available');if(identity.status==='available')expect(identity.data.kind).toBe(issued.admission.actor.kind);const profile=mcpToolOutputs.turas_profile_read_v1.parse((await client.callTool({name:'turas_profile_read_v1',arguments:{customerId,section:'facts',limit:20}})).structuredContent);expect(profile.status).toBe('available');if(profile.status==='available')expect(profile.data.items.length).toBeGreaterThan(0);}
    finally{await client.close();await db.query('BEGIN');try{await retireRegisteredWorkMcpProbe(db,target,issued.probe);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}}
    }
    await readAndRetire(fresh);
    const partner=await issue(retained,process.env.PARTNER_PASSWORD!,[customerId],'partner');await readAndRetire(partner);
    await expect(issue(retained,process.env.PARTNER_PASSWORD!,[foreignCustomerId],'partner')).rejects.toThrow();
    await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1 AND customer_id=$2",[partnerMembershipId,customerId]);
    await expect(issue(retained,process.env.PARTNER_PASSWORD!,[customerId],'partner')).rejects.toThrow();
    expect((await db.query('SELECT state FROM customer_grants WHERE membership_id=$1 AND customer_id=$2',[partnerMembershipId,customerId])).rows[0].state).toBe('revoked');
   });
   expect((await owner.query('SELECT revoked_at IS NOT NULL AND credential_hash IS NULL AS retired FROM mcp_connections WHERE id=$1',[fresh!.connection.id])).rows).toEqual([{retired:true}]);
   let interrupted:typeof fresh;
   await expect(withLockedWorkRecoveryTarget(input,async(db,target)=>{
    const deadline=Math.min(Date.now()+55000,target.deadline);await db.query('BEGIN');try{interrupted=await issueWorkRecoveryMcpProbe(db,target,{...input.scope,workspaceId,deadline,password:process.env.TURAS_DEMO_PASSWORD!,username:'mcteer',mcp:{categories:['profiles'],customerIds:[customerId],expiresAt:new Date(deadline).toISOString(),retained}},dirname(input.sourceFile));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}state.cleanupUnavailable=true;throw Error('Controlled fresh MCP lost acknowledgement');
   })).rejects.toThrow('Work recovery and independent probe cleanup incomplete');state.cleanupUnavailable=false;
   await withLockedWorkRecoveryTarget(input,async(db,target)=>{await db.query('BEGIN');try{await reconcileWorkRecoveryProbeJournal(db,target,{journalDirectory:dirname(input.sourceFile),intentNames:['probe-'+interrupted!.probe.sessionId+'-intent.json'],password:process.env.TURAS_DEMO_PASSWORD!});await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}});
   expect((await owner.query('SELECT revoked_at IS NOT NULL AND credential_hash IS NULL AS retired FROM mcp_connections WHERE id=$1',[interrupted!.connection.id])).rows).toEqual([{retired:true}]);
   expect((await owner.query('SELECT credential_hash FROM mcp_connections WHERE id=$1',[capturedConnectionId])).rows[0].credential_hash).toBeNull();
  });}finally{state.cleanupUnavailable=false;state.retainedKey=null;await owner.end();}
 },async owner=>{const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');workspaceId=f.actor.workspaceId;customerId=f.customerId;
 const org=randomUUID();partnerMembershipId=randomUUID();foreignCustomerId=randomUUID();await owner.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic fresh MCP partner')",[org,workspaceId]);await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,'partner','member',$4)",[partnerMembershipId,DEMO_IDS.partner,workspaceId,org]);await owner.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),partnerMembershipId,workspaceId,customerId,DEMO_IDS.mcteer]);await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic unassigned fresh MCP customer',true)",[foreignCustomerId,workspaceId]);await owner.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[foreignCustomerId,workspaceId]);const created=await createMcpConnection(f.actor,{requestKey:randomUUID(),name:'Synthetic captured credential',categories:['profiles'],customerIds:[customerId],lifetimeDays:1});capturedConnectionId=created.connection.id;});
},210000);
