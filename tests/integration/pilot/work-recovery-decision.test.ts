import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {requireAuthenticatedRetainedDenials} from '../../../scripts/pilot-denial-reader';
import {beginRetainedWorkDenialHistory,advanceRetainedWorkDenialHistory,requireRetainedWorkDenialHistory} from '../../../scripts/pilot-retained-denial-history';
import {measureWorkSandboxTerminalInventory,requireMeasuredWorkSandboxTerminalInventory} from '../../../lib/server/operations/work-sandbox-terminal-inventory';
import {deriveWorkMaintenanceInventoryInTransaction} from '../../../lib/server/operations/owned-maintenance-inventory';
import {auditRecoveredRequestFencesInTransaction} from '../../../lib/server/operations/recovery-replay-audit';
import {auditRecoveryLearningCosts} from '../../../lib/server/operations/recovery-learning-cost-audit';
import {auditRecoveryServiceCosts} from '../../../lib/server/operations/recovery-service-cost-audit';
import {auditRecoveryDispatchState} from '../../../lib/server/operations/recovery-dispatch-audit';
import {auditRecoveryModelHolds} from '../../../lib/server/operations/recovery-model-hold-audit';
import {createOwnedConversation} from '../../../lib/server/conversations/repository';
import {auditRecoveryEffectGuards} from '../../../lib/server/operations/recovery-effect-guards';
import {measureWorkOldHttpAdmission,requireMeasuredWorkOldHttpAdmission} from '../../../lib/server/operations/work-old-http-admission';
import {PilotHostHttpJournal} from '../../../scripts/pilot-host-http-journal';
import {measureWorkManagedTerminalInventory,requireMeasuredWorkManagedTerminalInventory} from '../../../lib/server/operations/work-managed-terminal-inventory';
import {measureWorkTargetIntegrity,requireMeasuredWorkTargetIntegrity} from '../../../lib/server/operations/work-target-integrity';
import {refreshMeasuredWorkMcpDenials,measureWorkMcpCategoryBatch,measureWorkMcpCategoryWindow,measureWorkMcpCategory,requireMeasuredWorkMcpCategory,deriveWorkMcpScopeInTransaction,requireMeasuredWorkMcpCoverage} from '../../../lib/server/operations/work-mcp-verification';
import {withRetainedDenialFixture} from '../../fixtures/pilot/retained-denials';
import {quarantineRestoredAuthority,quarantineLockedWorkAuthority} from '../../../lib/server/operations/recovery-quarantine';
import {POST as maintenanceMcp} from '../../../app/api/operations/recovery-read/[admissionId]/mcp/route';
import {handleMcpRequest} from '../../../lib/server/mcp/transport';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {it,expect,vi} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {Client,type PoolClient} from 'pg';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withWorkRecoveryReadDeadline,withWorkRecoveryReadGroup,withLockedWorkRecoveryDecision,withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection} from '../../../lib/server/operations/locked-work-recovery-target';
const state=vi.hoisted(()=>({container:'',containerOwner:'',allowCapture:false,retainedKeys:new Map<string,Uint8Array>(),connections:new Map<string,string>(),blobObjects:new Map<string,Uint8Array>(),retainedKey:null as Uint8Array|null,platformChanged:false,sourceChanged:false,dirty:false,cleanupUnavailable:false,directorySyncFailurePath:null as string|null,hostedTarget:'preview' as 'preview'|'production',commit:'a'.repeat(40),digest:'b'.repeat(64),catalog:'c'.repeat(64)}));
// Actual owned PostgreSQL; only cloud transport/DNS and source attribution are
// controlled. These checks do not establish hosted platform acceptance.
vi.mock('node:fs/promises',async original=>{
 const actual=await original<typeof import('node:fs/promises')>(),{constants}=await import('node:fs');
 return {...actual,open:async(...args:unknown[])=>{const handle=await Reflect.apply(actual.open,actual,args);
  if(state.directorySyncFailurePath&&typeof args[0]==='string'&&resolve(args[0])===state.directorySyncFailurePath&&typeof args[1]==='number'&&(args[1]&constants.O_DIRECTORY)!==0)Object.defineProperty(handle,'sync',{value:async()=>{throw Error('Controlled peer parent namespace sync failure');}});
  return handle;
 }};
});
vi.mock('pg',async original=>{const actual=await original<typeof import('pg')>();return {...actual,Client:class extends actual.Client{constructor(config?:import('pg').ClientConfig){if(state.cleanupUnavailable&&config?.connectionString?.includes('fixture.neon.tech'))throw Error('Controlled cleanup connection unavailable');super(config?.connectionString&&state.connections.has(config.connectionString)?{...config,connectionString:state.connections.get(config.connectionString)}:config);}}};});
vi.mock('../../../lib/server/operations/database-binding',async original=>{const actual=await original<typeof import('../../../lib/server/operations/database-binding')>();return {...actual,databaseTargetDigest:(connection:string,environmentId:string,name?:string)=>actual.databaseTargetDigest(state.connections.get(connection)??connection,environmentId,name)};});
vi.mock('../../../scripts/pilot-source',()=>({pilotSource:async()=>({sourceCommit:state.sourceChanged?'d'.repeat(40):state.commit,sourceDigest:state.digest,catalogDigest:state.catalog})}));
vi.mock('../../../scripts/pilot-database-safety-copy',async original=>{const actual=await original<typeof import('../../../scripts/pilot-database-safety-copy')>();return {...actual,verifyDatabaseSafetySourceBinding:async()=>({platformConnectionBindingVerified:true}),createWorkRecoveryKey:async(input:{projectId:string;id:string;key:Uint8Array})=>{if(!state.allowCapture)throw Error('Controlled source capture not admitted');const name='TURAS_RECOVERY_KEY_'+input.id.replaceAll('-','').toUpperCase();state.retainedKeys.set(name,Buffer.from(input.key));return {projectId:input.projectId,variableId:'env_'+input.id,name};},readWorkRecoveryKey:async(reference:{name:string})=>{const key=state.retainedKeys.get(reference.name)??state.retainedKey;if(!key)throw Error('Controlled archive key absent');return Buffer.from(key);}};});
vi.mock('../../../scripts/pilot-neon-archive',async original=>{const actual=await original<typeof import('../../../scripts/pilot-neon-archive')>();return {...actual,verifyWorkNeonDestination:async()=>({controlledProviderIdentity:true})};});
vi.mock('node:child_process',async original=>{const actual=await original<typeof import('node:child_process')>(),{promisify}=await import('node:util');const execute=((...args:unknown[])=>Reflect.apply(actual.execFile,actual,args)) as typeof actual.execFile;Object.defineProperty(execute,promisify.custom,{value:async(command:string,args:string[],options:unknown)=>{if(command==='git'&&args[0]==='status')return {stdout:state.dirty?' M authored-source.ts':'',stderr:''};if(command!=='vercel')return (promisify(actual.execFile) as Function)(command,args,options);return {stdout:JSON.stringify({id:state.platformChanged?'dpl_changed':'dpl_recovery',projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:state.hostedTarget==='production'?'production':null,meta:{githubCommitSha:state.commit}}),stderr:''};}});return {...actual,execFile:execute};});
vi.mock('@vercel/blob',async original=>({...await original<typeof import('@vercel/blob')>(),
 get:async(key:string,options:Record<string,unknown>)=>{if(!((options.storeId==='syntheticStore'&&options.oidcToken==='synthetic.oidc.identity'&&!('token' in options))||(options.token==='vercel_blob_rw_syntheticStore_SYNTHETICFIXTUREONLY'&&!('storeId' in options)&&!('oidcToken' in options))))throw Error('Exact controlled private store binding required');const bytes=state.blobObjects.get(key);return bytes?{statusCode:200,blob:{pathname:key,size:bytes.length},stream:new ReadableStream({start(controller){controller.enqueue(Uint8Array.from(bytes));controller.close();}})}:null;},
 list:async(options:Record<string,unknown>)=>{if(!((options.storeId==='syntheticStore'&&options.oidcToken==='synthetic.oidc.identity'&&!('token' in options))||(options.token==='vercel_blob_rw_syntheticStore_SYNTHETICFIXTUREONLY'&&!('storeId' in options)&&!('oidcToken' in options))))throw Error('Exact controlled private store binding required');const rows=[...state.blobObjects].filter(([key])=>key.startsWith(String(options.prefix))).map(([pathname,bytes])=>({pathname,size:bytes.length,uploadedAt:new Date('2026-01-01T00:00:00Z')}));if(rows.length>Number(options.limit))throw Error('Controlled fixture page overflow');return {blobs:rows,hasMore:false};},
}));
vi.mock('../../../lib/server/operations/managed-edge-transport',()=>({managedEdgeRead:async(input:{host:string;headers:Record<string,string>;query?:string;signal:AbortSignal})=>{input.signal.throwIfAborted();const response=await fetch('https://'+input.host+'/api/auth/session'+(input.query??''),{method:'GET',headers:input.headers,redirect:'manual',signal:input.signal});return {status:response.status,headers:response.headers,body:Buffer.from(await response.arrayBuffer())};},pinManagedControlEdge:()=>Object.freeze({contract:'controlled-edge-pin'})}));
async function fixture(run:(input:Parameters<typeof withLockedWorkRecoveryTarget>[0])=>Promise<void>,beforeLock?:(owner:Client)=>Promise<void>,hostedTarget:'preview'|'production'='preview',ownedDeadlineMs?:450000){
 state.hostedTarget=hostedTarget;for(const key of state.retainedKeys.values())key.fill(0);state.retainedKeys.clear();state.blobObjects.clear();state.connections.clear();state.platformChanged=false;state.sourceChanged=false;state.dirty=false;state.cleanupUnavailable=false;
 await withAuthorityEnvironment(async(owner,runtime,environmentId,owned)=>{
  state.container=owned.databaseContainer;state.containerOwner=owned.databaseOwnerLabel;
  if(beforeLock)await beforeLock(owner);
  const locked=await lockAuthorityTarget(owner,environmentId),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision},password=randomBytes(32).toString('base64url');await closeRuntimePool();await runtime.end();await retireOwnedLegacyRuntime(owner,{...scope,password});
  const selected=requireOwnedPilotDatabase(process.env,true),actualRuntime=new URL(selected);actualRuntime.username='turas_runtime_016';actualRuntime.password=password;
  const ownerUrl=new URL(selected);ownerUrl.hostname='fixture.neon.tech';ownerUrl.port='';ownerUrl.search='?sslmode=verify-full';
  const runtimeUrl=new URL(ownerUrl);runtimeUrl.username='turas_runtime_016';runtimeUrl.password=password;
  state.connections.set(ownerUrl.href,selected);state.connections.set(runtimeUrl.href,actualRuntime.href);
  const root=await mkdtemp(resolve('local-artifacts/016/locked-work-target-'));
  try{
   const sourceFile=join(root,'source.json');await writeFile(sourceFile,JSON.stringify({contract:'pilot-database-safety-source-v1',projectId:'prj_recovery',environmentId,target:hostedTarget,schemaVersion:79,connectionBinding:'platform-readable',databaseUrl:ownerUrl.href}),{mode:0o600});
   await run({sourceFile,scope,runtimeConnection:runtimeUrl.href,signal:AbortSignal.timeout(150000),deadline:Date.now()+140000,hostedScope:{contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_recovery',teamId:'team_recovery',deploymentId:'dpl_recovery',origin:'https://recovery.vercel.app',environmentMarker:environmentId,workspaceId:randomUUID(),target:hostedTarget,sourceCommit:state.commit,sourceDigest:state.digest,catalogDigest:state.catalog}});
  }finally{await rm(root,{recursive:true,force:true});state.connections.clear();state.platformChanged=false;state.sourceChanged=false;state.dirty=false;state.cleanupUnavailable=false;}
 },{deadlineMs:ownedDeadlineMs});
}
async function withTargetRuntime<T>(input:Parameters<typeof withLockedWorkRecoveryTarget>[0],target:Parameters<typeof requireLockedWorkRecoveryConnection>[1],run:()=>Promise<T>){
 const keys=['DATABASE_URL','TURAS_APP_ORIGIN','VERCEL_DEPLOYMENT_ID','VERCEL_GIT_COMMIT_SHA','TURAS_CODE_VERSION'] as const,prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 await closeRuntimePool();try{process.env.DATABASE_URL=state.connections.get(input.runtimeConnection)!;process.env.TURAS_APP_ORIGIN=target.origin;process.env.VERCEL_DEPLOYMENT_ID=target.deploymentId;process.env.VERCEL_GIT_COMMIT_SHA=target.sourceCommit;process.env.TURAS_CODE_VERSION=target.sourceCommit;return await run();}
 finally{await closeRuntimePool();for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
}
function controlledEffectsPlatform(request:Request){const url=new URL(request.url),key='controlled_effects_automation_key',host='recovery.vercel.app';
  if(url.origin==='https://api.vercel.com'){
   if(url.pathname==='/v9/projects/prj_recovery')return Response.json({id:'prj_recovery',accountId:'team_recovery',targets:{production:{id:'dpl_recovery'}},protectionBypass:{[key]:{scope:'automation-bypass',isEnvVar:false,note:'Controlled current key',createdAt:1000,createdBy:'operator'}},crons:{deploymentId:'dpl_recovery',definitions:[['/eve/v1/turas/watchdog','* * * * *'],['/api/internal/research-maintenance','17 3 * * *'],['/eve/v1/turas/jobs','* * * * *']].map(([path,schedule])=>({path,schedule,host}))}});
   if(url.pathname.startsWith('/v13/deployments/'))return Response.json({id:'dpl_recovery',url:host,projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:'production',meta:{githubCommitSha:state.commit}});
   if(url.pathname==='/v6/deployments')return Response.json({deployments:[{uid:'dpl_recovery',url:host,projectId:'prj_recovery',created:1000,target:'production',readyState:'READY'}],pagination:{next:null}});
   if(url.pathname==='/v4/aliases')return Response.json({aliases:[],pagination:{count:0,next:null,prev:null}});
   if(url.pathname==='/v1/workflow/v2/runs')return Response.json({data:[],cursor:null,hasMore:false});
   if(url.pathname==='/v1/security/firewall/config/active')return Response.json({firewallEnabled:true,crs:{general:{active:false,action:'log'}},updatedAt:'2026-10-19T00:00:00Z',projectKey:'prj_recovery#active',id:'config_effects',ips:[],changes:[],version:1,ownerId:'team_recovery',rules:[{id:'rule_effects',name:'Current host',description:'Controlled fence',active:true,valid:true,validationErrors:null,conditionGroup:[{conditions:[{type:'host',op:'ninc',value:[host]}]}],action:{mitigate:{action:'deny'}}}]});
   if(url.pathname==='/v1/security/firewall/bypass/rules')return Response.json({error:{code:'forbidden',message:'Conditional bypass is unavailable for this team.'}},{status:403});
   if(url.pathname==='/v1/security/firewall/bypass')return Response.json({result:[]});throw Error('Unexpected effects platform route');
  }
  if(url.origin==='https://vercel.com'&&url.pathname==='/api/v2/sandboxes')return Response.json({sandboxes:[],pagination:{count:0,next:null}});
 return undefined;
}
// Genuine owned SQL/object archive, repackaged only with controlled hosted
// provenance. This supports composition tests, never hosted acceptance.
async function controlledPhysicalIntegrity(input:Parameters<typeof withLockedWorkRecoveryTarget>[0],directory='composition-integrity'){
 const {captureOwnedRecoveryCandidate}=await import('../../../lib/server/operations/capture-candidate'),{verifyNativePostgresClient}=await import('../../../lib/server/operations/native-postgres'),{activeObjectNamespaces}=await import('../../../lib/server/storage/inventory'),{environmentObjectId}=await import('../../../lib/server/storage/private-objects'),{decryptRecoveryFile,encryptRecoveryFile}=await import('../../../lib/server/operations/backup-crypto'),{packBackupArchive,unpackBackupArchive}=await import('../../../lib/server/operations/backup-archive'),{workCaptureCandidateSchema}=await import('../../../lib/contracts/pilot-capture'),{recoveryDigest}=await import('../../../lib/contracts/pilot-recovery');
 const root=join(dirname(input.sourceFile),directory),sourceRoot=join(root,'originals'),workflowRoot=join(root,'workflow'),keys=join(root,'keys'),rebound=join(root,'rebound'),key=randomBytes(32),signal=input.signal;
 for(const directory of [root,sourceRoot,workflowRoot,keys,rebound])await mkdir(directory,{mode:0o700});const keyFile=join(keys,'key');await writeFile(keyFile,key,{mode:0o600});
 for(const namespace of activeObjectNamespaces)await mkdir(join(sourceRoot,'e_'+environmentObjectId(input.scope.environmentId),namespace),{recursive:true,mode:0o700});
 try{
  const owned=await captureOwnedRecoveryCandidate({...input.scope,sourceRoot,workflowRoot,keyFile,keyReference:'synthetic-composition-key',keyVersion:'1',output:join(root,'capture')},signal),archive=join(root,'original.archive');await decryptRecoveryFile(join(root,'capture/candidate.encrypted'),archive,key,owned.encryptedBundle.headerDigest,signal);
  const unpacked=join(root,'unpacked'),header=await unpackBackupArchive({archive,target:unpacked,expectedHeaderDigest:owned.encryptedBundle.headerDigest,environmentId:input.scope.environmentId,checkpointId:owned.id,signal}),assetRoot=resolve('infra/pilot/native-postgres/linux-amd64'),native=await verifyNativePostgresClient(assetRoot),configurationDigest=recoveryDigest({environmentId:input.scope.environmentId,databaseName:owned.sourceDatabaseName,sourceProjectId:input.hostedScope.projectId,storeId:'syntheticStore',backend:'private-blob',workflow:'managed-workflow',clientManifestDigest:native.manifestDigest});
  const packed=await packBackupArchive({header:{...header,provenance:{...header.provenance,configurationDigest}},files:new Map(header.entries.map(entry=>[entry.name,join(unpacked,entry.name)])),output:join(rebound,'candidate.archive'),signal}),bundle=join(rebound,'candidate.encrypted'),encrypted=await encryptRecoveryFile(join(rebound,'candidate.archive'),bundle,key,packed.headerDigest,signal),{providerCalls:_calls,...common}=owned;
  const candidate=workCaptureCandidateSchema.parse({...common,configurationDigest,contract:'pilot-work-capture-candidate-v1',workflow:{inventoryDigest:recoveryDigest([]),fileCount:0,entries:[],backend:'managed-workflow',capability:'interrupted-reconciliation',runtimeStoppedVerified:false,resumptionVerified:false,reconciliationVerified:false},encryptedBundle:{headerDigest:packed.headerDigest,...encrypted},modelCalls:0,mailCalls:0}),material={target:input,candidate,bundle,keyFile,assetRoot,storeId:'syntheticStore',oidcToken:'synthetic.oidc.identity'};
  process.env.VERCEL_BLOB_RETRIES='0';return {material,proof:await measureWorkTargetIntegrity(material)};
 }finally{key.fill(0);}
}
it('commits a pending recovery decision only after live checks and rolls back drift cancellation and callback commit attempts',async()=>fixture(async input=>{
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{
  const row=(await owner.query('SELECT id,display_name FROM customer_references ORDER BY id LIMIT 1')).rows[0];expect(row).toBeTruthy();
  const read=async()=>(await owner.query('SELECT display_name FROM customer_references WHERE id=$1',[row.id])).rows[0].display_name;
  await expect(withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(Object.keys(db)).toEqual(['query']);await requireLockedWorkRecoveryConnection(db,target,input.scope);const before=(await db.query("SELECT current_setting('transaction_timeout') AS transaction_timeout")).rows[0].transaction_timeout;await deriveWorkMaintenanceInventoryInTransaction(db,target,input.signal);expect((await db.query("SELECT current_setting('transaction_timeout') AS transaction_timeout")).rows[0].transaction_timeout).toBe(before);await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Committed measured decision']);expect(await read()).toBe(row.display_name);return 'committed';})).resolves.toBe('committed');expect(await read()).toBe('Committed measured decision');
  for(const drift of ['source','platform'] as const){
   await expect(withLockedWorkRecoveryDecision(input,async db=>{await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Must roll back']);if(drift==='source')state.sourceChanged=true;else state.platformChanged=true;})).rejects.toThrow();state.sourceChanged=false;state.platformChanged=false;expect(await read()).toBe('Committed measured decision');
  }
  for(const sql of ['COMMIT',"SELECT E''\n'\\''; COMMIT; SELECT E''\n'\\''","SELECT $é$'$é$; COMMIT; SELECT $é$'$é$",'SELECT 1; -- hidden\rCOMMIT',"UPDATE customer_references SET display_name='Must roll back'; COMMIT"]){
   await expect(withLockedWorkRecoveryDecision(input,async db=>{await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Must roll back']);await db.query(sql);})).rejects.toThrow('transaction control');expect(await read()).toBe('Committed measured decision');
  }
  let getterRead=false,submitted=false;
  for(const config of [{get text(){getterRead=true;return 'COMMIT';}},{text:'SELECT 1',submit(connection:{query:(sql:string)=>void}){submitted=true;connection.query('COMMIT');}}]){
   await expect(withLockedWorkRecoveryDecision(input,async db=>{await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Must roll back']);await db.query(config);})).rejects.toThrow('SQL string and parameters');expect(await read()).toBe('Committed measured decision');
  }expect(getterRead).toBe(false);expect(submitted).toBe(false);
  const cancelled=new AbortController();await expect(withLockedWorkRecoveryDecision({...input,signal:cancelled.signal},async db=>{await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Must roll back']);cancelled.abort(Error('Controlled decision cancellation'));})).rejects.toThrow('Controlled decision cancellation');expect(await read()).toBe('Committed measured decision');
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{
   const first=withWorkRecoveryReadGroup(db,target,[async()=>{await db.query('SELECT pg_sleep(0.05)');return 1;}]);
   await expect(withWorkRecoveryReadGroup(db,target,[async()=>2])).rejects.toThrow('Bounded genuine recovery read group required');
   expect(await first).toEqual([1]);
  });
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(await withWorkRecoveryReadGroup(db,target,Array.from({length:8},(_,index)=>async()=>Number((await db.query('SELECT $1::int AS value',[index])).rows[0].value)))).toEqual([0,1,2,3,4,5,6,7]);});
  for(const mode of ['sql-error','read-cancellation'] as const){
   await expect(withLockedWorkRecoveryDecision(input,async(db,target)=>{
    await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Parallel owner must roll back']);
    await withWorkRecoveryReadGroup(db,target,[async()=>{if(mode==='sql-error')return db.query('SELECT 1/0');return withWorkRecoveryReadDeadline(db,target,AbortSignal.timeout(25),()=>db.query('SELECT pg_sleep(1)'));},async()=>db.query('SELECT pg_sleep(1)')]);
   })).rejects.toThrow();expect(await read()).toBe('Committed measured decision');
  }

 }finally{await owner.end();}
}),210000);

it('measures exhaustive fresh work MCP category pages through SDK and rejects changed projections or forged measurements',async()=>{
 let workspaceId='',customerId='',phase='setup';const conversationIds:string[]=[];
 await fixture(async input=>{
 input={...input,signal:AbortSignal.timeout(380000),deadline:Date.now()+290000};
 const token='controlled-effects-token',key='controlled_effects_automation_key',secret=randomBytes(32).toString('base64url'),previousCron=process.env.CRON_SECRET;process.env.CRON_SECRET=secret;
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{const physical=await controlledPhysicalIntegrity(input);await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async (retained,refreshDenials,readHistoricalDenials)=>{
   const ownedFlag=process.env.TURAS_PILOT_OWNED;delete process.env.TURAS_PILOT_OWNED;
   try{expect(await quarantineLockedWorkAuthority(input,retained)).toMatchObject({independentDenialsApplied:true,mode:'locked',restorationReady:false});}
   finally{if(ownedFlag===undefined)delete process.env.TURAS_PILOT_OWNED;else process.env.TURAS_PILOT_OWNED=ownedFlag;}
   let selectedTarget:Parameters<typeof requireLockedWorkRecoveryConnection>[1]|undefined;
   await withLockedWorkRecoveryTarget(input,async(_db,target)=>{selectedTarget=target;});const target=selectedTarget!;let corrupt=false,uncorruptedIdentities=0;
   const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
    const incoming=new Request(url,options),address=new URL(incoming.url),headers=new Headers(incoming.headers);headers.set('host',address.host);
    const platform=controlledEffectsPlatform(incoming);if(platform)return platform;
    if(address.pathname==='/api/auth/session'){
     const original=address.origin+'/api/auth/session',header=incoming.headers.has('x-vercel-protection-bypass'),query=address.searchParams.has('x-vercel-protection-bypass'),cookie=incoming.headers.has('cookie');
     if(!header&&!query&&!cookie)return new Response(null,{status:302,headers:{location:'https://vercel.com/sso-api?url='+encodeURIComponent(original)}});
     if(incoming.headers.has('x-vercel-set-bypass-cookie'))return new Response(null,{status:307,headers:{location:original,'set-cookie':'_vercel_jwt=controlled_effects_cookie; Path=/; Secure; HttpOnly; SameSite=Lax'}});
     return Response.json({error:{code:'authentication_required'}},{status:401,headers:{'x-turas-code-version':state.commit}});
    }
    if(['/api/internal/research-maintenance','/eve/v1/turas/jobs'].includes(address.pathname))return withTargetRuntime(input,target,async()=>{if(address.pathname==='/api/internal/research-maintenance'){const {GET}=await import('../../../app/api/internal/research-maintenance/route');return GET(incoming);}const {authorizeHeavyDispatch,assertHostedDispatchReady}=await import('../../../lib/server/operations/dispatch'),{failure,success}=await import('../../../lib/contracts/http');try{authorizeHeavyDispatch(incoming);await assertHostedDispatchReady();return success({status:'accepted'});}catch(error){return failure(error);}});
    if(address.origin!==target.origin)throw Error('Controlled MCP category transport left target');
    if(incoming.method==='GET')return withTargetRuntime(input,target,async()=>{
     const request=new Request(incoming,{headers}),id=address.pathname.split('/')[4];
     if(address.pathname.startsWith('/api/customers/')){const {GET}=await import('../../../app/api/customers/[customerId]/profile/route');return GET(request,{params:Promise.resolve({customerId:address.pathname.split('/')[3]})});}
     if(address.pathname.startsWith('/api/conversations/')){const {GET}=await import('../../../app/api/conversations/[id]/route');return GET(request,{params:Promise.resolve({id:address.pathname.split('/')[3]})});}
     if(address.pathname.endsWith('/profile')){const {GET}=await import('../../../app/api/operations/recovery-read/[admissionId]/profile/route');return GET(request,{params:Promise.resolve({admissionId:id})});}
     if(address.pathname.endsWith('/conversation')){const {GET}=await import('../../../app/api/operations/recovery-read/[admissionId]/conversation/route');return GET(request,{params:Promise.resolve({admissionId:id})});}
     if(address.pathname.endsWith('/artifact')){const {GET}=await import('../../../app/api/operations/recovery-read/[admissionId]/artifact/route');return GET(request,{params:Promise.resolve({admissionId:id})});}
     throw Error('Controlled service GET unavailable');
    });
    if(!address.pathname.endsWith('/mcp')&&address.pathname!=='/api/mcp/v1')throw Error('Controlled MCP category transport left target');
    if(address.pathname==='/api/mcp/v1')return withTargetRuntime(input,target,()=>handleMcpRequest(new Request(incoming,{headers})));
    const response=await withTargetRuntime(input,target,()=>maintenanceMcp(new Request(incoming,{headers}),{params:Promise.resolve({admissionId:address.pathname.split('/')[4]})}));
    if(corrupt&&response.status===200){const rpc=await response.json();if(rpc.result?.structuredContent?.data?.workspaceId){if(uncorruptedIdentities>0)uncorruptedIdentities--;else rpc.result.structuredContent.data.workspaceId=randomUUID();}return Response.json(rpc,{headers:response.headers});}return response;
   });
   try{
    const args={target:input,selection:{workspaceId,username:'mcteer' as const,category:'profiles' as const,customerId},password:process.env.TURAS_DEMO_PASSWORD!,retained,journalDirectory:dirname(input.sourceFile)};
    phase='initial-category';const proof=await measureWorkMcpCategory(args);expect(proof).toMatchObject({calls:5,boundaryCalls:2,actualSdkVerified:true,categoryCoverageVerified:true,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false});
    await withLockedWorkRecoveryTarget(input,async(db,current)=>{await db.query('BEGIN');try{expect(await requireMeasuredWorkMcpCategory(db,current,proof)).toBe(proof);await expect(requireMeasuredWorkMcpCategory(db,current,{...proof})).rejects.toThrow('Actual fresh');const inventory=await deriveWorkMcpScopeInTransaction(db,current);expect(inventory.required).toContainEqual(proof.selection);await expect(requireMeasuredWorkMcpCoverage(db,current,[proof])).rejects.toThrow('Complete unique');await expect(requireMeasuredWorkMcpCoverage(db,current,[proof,proof])).rejects.toThrow('Complete unique');await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}});
    phase='current-denial-refresh';
    expect(()=>refreshMeasuredWorkMcpDenials([{...proof}],retained)).toThrow('Actual fresh');
    expect(()=>refreshMeasuredWorkMcpDenials([proof],{...retained})).toThrow('genuine independent');
    expect(()=>refreshMeasuredWorkMcpDenials([proof,proof],retained)).toThrow('unique');
    const foreignRoot=join(dirname(input.sourceFile),'foreign-denial-lineage');await mkdir(foreignRoot,{mode:0o700});const originalRetainedKey=state.retainedKey;
    try{await withRetainedDenialFixture(owner,input.scope.environmentId,foreignRoot,{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async foreign=>{expect(foreign.backupCapturedAt).toBe(retained.backupCapturedAt);expect(()=>refreshMeasuredWorkMcpDenials([proof],foreign)).toThrow('Same genuine independent denial lineage');},undefined,retained.backupCapturedAt);}finally{state.retainedKey=originalRetainedKey;}
    const originalCompleted=proof.completedAt,originalTranscript=proof.transcriptDigest,freshDenials=await refreshDenials();
    expect(()=>refreshMeasuredWorkMcpDenials([proof],freshDenials)).not.toThrow();
    expect(()=>refreshMeasuredWorkMcpDenials([proof],retained)).toThrow('Monotonic');
    expect(proof.completedAt).toBe(originalCompleted);expect(proof.transcriptDigest).toBe(originalTranscript);
    // All-or-nothing validation: a forged later entry must not rebind the first.
    const newerDenials=await refreshDenials();expect(()=>refreshMeasuredWorkMcpDenials([proof,{...proof}],newerDenials)).toThrow('Actual fresh');
    expect(()=>refreshMeasuredWorkMcpDenials([proof],freshDenials)).not.toThrow();
    expect(()=>refreshMeasuredWorkMcpDenials([proof],newerDenials)).not.toThrow();
    const originalHistory=beginRetainedWorkDenialHistory(freshDenials);expect(()=>requireRetainedWorkDenialHistory({...originalHistory},freshDenials,input.scope.environmentId)).toThrow('Genuine current');
    const denialHistory=advanceRetainedWorkDenialHistory(originalHistory,newerDenials);expect(()=>advanceRetainedWorkDenialHistory(originalHistory,newerDenials)).toThrow('Genuine finite');expect(requireRetainedWorkDenialHistory(denialHistory,newerDenials,input.scope.environmentId).baseline).toBe(freshDenials);expect(()=>requireRetainedWorkDenialHistory(denialHistory,{...newerDenials},input.scope.environmentId)).toThrow('Genuine current');
    let historical:Awaited<ReturnType<typeof readHistoricalDenials>>|undefined;
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(newerDenials.snapshot.capturedAt)+300001);try{expect(()=>refreshMeasuredWorkMcpDenials([proof],newerDenials)).toThrow('Fresh independent');historical=await readHistoricalDenials();expect(()=>requireAuthenticatedRetainedDenials(historical!,input.scope.environmentId)).toThrow('Actual independently retained');expect(()=>beginRetainedWorkDenialHistory(historical!)).toThrow('Actual independently retained');}finally{clock.mockRestore();}
    expect(requireRetainedWorkDenialHistory(beginRetainedWorkDenialHistory(historical!,newerDenials),newerDenials,input.scope.environmentId).baseline).toBe(historical);

    // The independent current replay still consumes every original transcript.
    await withLockedWorkRecoveryDecision(input,(db,current)=>requireMeasuredWorkMcpCategory(db,current,proof));
    // Later windows use this exact refreshed capability; no fresh JSON authority.
    retained=newerDenials;args.retained=retained;
    phase='negative-drift';const originalAdmission=(await owner.query('SELECT id FROM operations_recovery_http_reads WHERE workspace_id=$1 AND mcp_probe_connection ORDER BY created_at,id LIMIT 1',[workspaceId])).rows[0].id;
    for(const drift of ['content','membership','probe'] as const)await withLockedWorkRecoveryTarget(input,async(db,current)=>{await db.query('BEGIN');try{
     if(drift==='content')await db.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customerId]);
     if(drift==='membership')await db.query('UPDATE memberships SET active=false WHERE workspace_id=$1 AND principal_id=$2',[workspaceId,DEMO_IDS.mcteer]);
     if(drift==='probe')await db.query('UPDATE operations_recovery_http_reads SET revoked_at=NULL WHERE id=$1',[originalAdmission]);
     await expect(requireMeasuredWorkMcpCategory(db,current,proof)).rejects.toThrow(drift==='content'?'category changed':drift==='probe'?'probe retirement changed':/authentication unavailable|membership|participant/i);
    }finally{await db.query('ROLLBACK');}});
    phase='paginated-knowledge';const knowledge=await measureWorkMcpCategory({...args,selection:{...args.selection,category:'knowledge',customerId:null}});expect(knowledge.calls).toBe(16);
    expect((await owner.query('SELECT count(*)::int AS count FROM operations_recovery_http_reads a JOIN mcp_connections mc ON mc.id=a.record_id WHERE a.workspace_id=$1 AND a.read_kind=\'mcp\' AND NOT a.mcp_probe_connection AND a.expires_at=mc.expires_at AND a.revoked_at IS NOT NULL',[workspaceId])).rows[0].count).toBeGreaterThan(0);
    phase='current-scope';const needed=await withLockedWorkRecoveryTarget(input,async(db,current)=>{await db.query('BEGIN');try{const inventory=await deriveWorkMcpScopeInTransaction(db,current);await db.query('COMMIT');return inventory.required;}catch(error){await db.query('ROLLBACK');throw error;}});
    expect(new Set(needed.map(value=>value.username))).toEqual(new Set(['mcteer','panel','partner']));expect(needed.length).toBeGreaterThan(32);
    const proofs=[proof,knowledge],missing=needed.filter(selected=>!proofs.some(value=>JSON.stringify(value.selection)===JSON.stringify(selected)));let partialWindow=false;
    while(missing.length){phase='remaining-categories-'+missing.length;const first=missing[0],batch=missing.filter(value=>value.workspaceId===first.workspaceId&&value.username===first.username).slice(0,32);const password=first.username==='mcteer'?process.env.TURAS_DEMO_PASSWORD!:first.username==='panel'?process.env.PANEL_PASSWORD!:process.env.PARTNER_PASSWORD!;
     const completed=await measureWorkMcpCategoryWindow({...args,selections:batch,password});expect(completed.length).toBeGreaterThan(0);expect(completed.length).toBeLessThanOrEqual(25);partialWindow||=completed.length<batch.length;
     for(const measured of completed){const index=missing.findIndex(selected=>JSON.stringify(selected)===JSON.stringify(measured.selection));expect(index).toBeGreaterThanOrEqual(0);missing.splice(index,1);}proofs.push(...completed);
    }expect(partialWindow).toBe(true);

    phase='mixed-canonical-and-hosted-branches';
    const {measureWorkMcpCanonicalScope,requireWorkMcpBranchCoverage}=await import('../../../lib/server/operations/work-mcp-branch-verification'),{recoveryDigest}=await import('../../../lib/contracts/pilot-recovery');
    const branchPasswords={mcteer:process.env.TURAS_DEMO_PASSWORD!,panel:process.env.PANEL_PASSWORD!,partner:process.env.PARTNER_PASSWORD!};
    const canonical=await measureWorkMcpCanonicalScope({target:input,passwords:branchPasswords,retained,journalDirectory:args.journalDirectory});
    expect(canonical.requiredSelections).toBe(needed.length);expect(canonical.hostedSdkVerified).toBe(false);
    const representatives=new Set(canonical.representatives.map(selected=>recoveryDigest(selected))),hostedBranches=proofs.filter(measurement=>representatives.has(recoveryDigest(measurement.selection)));
    expect(hostedBranches.length).toBe(canonical.representatives.length);expect(hostedBranches.length).toBeLessThan(proofs.length);
    const requireBranches=(db:Client,target:Parameters<typeof requireLockedWorkRecoveryConnection>[1],baseline=canonical,branches=hostedBranches)=>requireWorkMcpBranchCoverage(db,target,baseline,branches,branchPasswords,retained,args.journalDirectory);
    await withLockedWorkRecoveryDecision(input,async(db,current)=>{
     await expect(requireBranches(db,current,{...canonical})).rejects.toThrow('Genuine exhaustive');
     await expect(requireBranches(db,current,canonical,hostedBranches.slice(1))).rejects.toThrow('Every hosted branch');
     await expect(requireBranches(db,current,canonical,[{...hostedBranches[0],transcriptDigest:'f'.repeat(64)},...hostedBranches.slice(1)])).rejects.toThrow('Genuine unchanged hosted');
     expect(await requireBranches(db,current)).toMatchObject({contract:'pilot-work-mcp-coverage-v2',canonicalSelections:needed.length,hostedBranches:hostedBranches.length,exhaustiveCanonicalScopeCoverageVerified:true,actualHostedSdkBranchCoverageVerified:true});
    });
    for(const drift of ['accepted-content','authorization'] as const){
     await expect(withLockedWorkRecoveryDecision(input,async(db,current)=>{
      if(drift==='accepted-content')await db.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customerId]);
      else await db.query('UPDATE memberships SET active=false WHERE workspace_id=$1 AND principal_id=$2',[workspaceId,DEMO_IDS.panel]);
      await requireBranches(db,current);
     })).rejects.toThrow();
    }

    phase='service-http';const {measureWorkMaintenanceHttpBatch}=await import('../../../lib/server/operations/work-maintenance-verification'),{measureWorkConversationHttpBatch}=await import('../../../lib/server/operations/work-conversation-http'),{verifyWorkRecoveryService,requireVerifiedWorkRecoveryService}=await import('../../../lib/server/operations/work-recovery-service');
    const records=await withLockedWorkRecoveryDecision(input,async(db,current)=>(await deriveWorkMaintenanceInventoryInTransaction(db,current,input.signal)).records.map(({kind,recordId})=>({kind,recordId}))),maintenance:Awaited<ReturnType<typeof measureWorkMaintenanceHttpBatch>>[]=[];
    for(let offset=0;offset<records.length;offset+=8)maintenance.push(await measureWorkMaintenanceHttpBatch({target:input,records:records.slice(offset,offset+8),password:args.password,journalDirectory:args.journalDirectory}));
    const passwords={mcteer:process.env.TURAS_DEMO_PASSWORD!,panel:process.env.PANEL_PASSWORD!,partner:process.env.PARTNER_PASSWORD!},conversations=[await measureWorkConversationHttpBatch({target:input,recordIds:conversationIds,passwords,journalDirectory:args.journalDirectory})];
    phase='parallel-final-drift';const originalGeneration=(await owner.query('SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1',[customerId])).rows[0].internal_generation;let concurrentFailure:unknown;
    try{await withLockedWorkRecoveryDecision(input,async(db,current)=>{await db.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customerId]);await requireMeasuredWorkMcpCoverage(db,current,proofs);});}catch(error){concurrentFailure=error;}
    const failureMessages=(error:unknown):string[]=>error instanceof AggregateError?[error.message,...error.errors.flatMap(failureMessages)]:error instanceof Error?[error.message]:[];
    expect(failureMessages(concurrentFailure)).toContain('Measured work MCP category changed');expect((await owner.query('SELECT internal_generation FROM customer_profile_state WHERE customer_id=$1',[customerId])).rows[0].internal_generation).toBe(originalGeneration);
    expect((await owner.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id JOIN mcp_connections mc ON mc.id=a.record_id WHERE a.mcp_probe_connection AND (a.revoked_at IS NULL OR s.revoked_at IS NULL OR mc.revoked_at IS NULL OR mc.credential_hash IS NOT NULL)')).rowCount).toBe(0);
    phase='final-scope-replay';await withLockedWorkRecoveryDecision(input,async(db,current)=>{
     await expect(verifyWorkRecoveryService(db,current,{maintenance:[],mcp:proofs,conversations},passwords,args.journalDirectory,input.signal)).rejects.toThrow('Finite actual work maintenance');
     const service=await verifyWorkRecoveryService(db,current,{maintenance,mcp:hostedBranches,canonicalMcp:canonical,conversations},passwords,args.journalDirectory,input.signal,retained);expect(service).toMatchObject({requiredScopeHealthy:true,privateConversationAuthorizationVerified:true,restorationReady:false});expect(await requireVerifiedWorkRecoveryService(db,current,service)).toBe(service);await expect(requireVerifiedWorkRecoveryService(db,current,{...service})).rejects.toThrow('Actual unchanged');
     await db.query('SAVEPOINT service_state_drift');try{await db.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customerId]);await expect(requireVerifiedWorkRecoveryService(db,current,service)).rejects.toThrow('Actual unchanged');}finally{await db.query('ROLLBACK TO SAVEPOINT service_state_drift');await db.query('RELEASE SAVEPOINT service_state_drift');}
     expect(await requireVerifiedWorkRecoveryService(db,current,service)).toBe(service);await db.query('SELECT pg_sleep(6)');await db.query('SELECT pg_sleep(6)');
    });
    phase='network-tamper';corrupt=true;await expect(measureWorkMcpCategory(args)).rejects.toThrow('HTTP and canonical projections differ');
    // A later category failure rejects the whole window after an earlier actual
    // measurement; no partial results escape, and outer cleanup retires both.
    uncorruptedIdentities=1;await expect(measureWorkMcpCategoryWindow({...args,selections:[args.selection,{...args.selection,category:'plans'}]})).rejects.toThrow('HTTP and canonical projections differ');corrupt=false;
    expect((await owner.query('SELECT 1 FROM operations_recovery_http_reads WHERE revoked_at IS NULL')).rowCount).toBe(0);
    phase='producer';const {measureWorkCronAdmission}=await import('../../../lib/server/operations/work-cron-admission'),{produceWorkRecoveryVerification,resumeCommittedWorkRecoveryVerification}=await import('../../../lib/server/operations/work-recovery-verification');
    const journal=await PilotHostHttpJournal.create(join(dirname(input.sourceFile),'producer-http-journal'),{contract:'pilot-host-http-journal-plan-v1',id:randomUUID(),projectId:'prj_recovery',teamId:'team_recovery',sourceCommit:state.commit,maximumRequests:20,maximumCostMicroUsd:100000,expiresAt:new Date(Date.now()+3600000).toISOString(),authorityReference:'Controlled owned producer authority',previousJournalDigests:['b'.repeat(64)],historicalStrictFailureRetained:true,unknownCostHoldsRetained:true,automaticRetries:false}),effects={cron:await measureWorkCronAdmission({target:input,token,cronSecret:secret,protectionBypass:key}),oldHttp:await measureWorkOldHttpAdmission({target:input,token,approvedHosts:['recovery.vercel.app'],journal}),native:await measureWorkManagedTerminalInventory({target:input,token,retained}),sandbox:await measureWorkSandboxTerminalInventory({target:input,token,retained})};
    const produced=await produceWorkRecoveryVerification({target:input,integrity:physical.proof,integrityMaterial:physical.material,retained,denialHistory,service:{maintenance,mcp:hostedBranches,canonicalMcp:canonical,conversations},effects,passwords,journalDirectory:args.journalDirectory});expect(produced).toMatchObject({resumed:false,serviceOpened:false,restorationReady:false});expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_verifications')).rows[0].n).toBe(1);
    const probesBefore=(await owner.query('SELECT count(*)::int AS n FROM operations_recovery_http_reads')).rows[0].n;expect(await resumeCommittedWorkRecoveryVerification(input,physical.material)).toMatchObject({verificationId:produced.verificationId,resumed:true});expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_http_reads')).rows[0].n).toBe(probesBefore);
    await expect(measureWorkMcpCategory(args)).rejects.toThrow('Committed recovery verification requires read-only');expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_http_reads')).rows[0].n).toBe(probesBefore);
    await owner.query('BEGIN');await owner.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customerId]);await owner.query('COMMIT');await expect(resumeCommittedWorkRecoveryVerification(input,physical.material)).rejects.toThrow('Existing recovery verification is stale or changed');
    phase='explicit-fresh-attempt';const {transitionRecoveryControl}=await import('../../../lib/server/operations/control'),next=await transitionRecoveryControl(owner,{environmentId:input.scope.environmentId,recoveryId:input.scope.recoveryId,expectedRevision:input.scope.controlRevision,operationId:randomUUID(),mode:'locked',restartVerification:true});
    const retry={...input,scope:{...input.scope,controlRevision:next.revision},deadline:Date.now()+170000},retryRoot=join(dirname(input.sourceFile),'fresh-attempt');await mkdir(retryRoot,{mode:0o700});
    const retryPhysical=await controlledPhysicalIntegrity(retry,'composition-integrity-fresh');
    await withRetainedDenialFixture(owner,retry.scope.environmentId,retryRoot,{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async freshRetained=>{
     const {pilotWorkRecoveryVerify}=await import('../../../scripts/pilot-work-recovery-verify'),candidateFile=join(retryRoot,'candidate.json'),runtimeFile=join(retryRoot,'runtime-private.json'),credentialsFile=join(retryRoot,'credentials-private.json'),configurationFile=join(retryRoot,'configuration-private.json');
     for(const [path,value] of [[candidateFile,retryPhysical.material.candidate],[runtimeFile,{connection:retry.runtimeConnection}],[credentialsFile,{token,cronSecret:secret,protectionBypass:key,oidcToken:retryPhysical.material.oidcToken,passwords}]] as const)await writeFile(path,JSON.stringify(value),{mode:0o600,flag:'wx'});
     // Real separate source database: provider/DNS/key placement alone are
     // controlled. Refresh must cold-retain actual original-source SQL bytes.
     const execute=promisify(execFile),cloneName='turas_original_'+randomUUID().replaceAll('-',''),dump='/tmp/'+cloneName+'.dump',actualSource=new URL(requireOwnedPilotDatabase(process.env,true));actualSource.pathname='/'+cloneName;
     const label=(await execute('docker',['inspect','--format','{{index .Config.Labels "turas.016.owner"}}',state.container])).stdout.trim();
     if(label!==state.containerOwner)throw Error('Exact owned original-copy container required');
     await owner.query('CREATE DATABASE "'+cloneName+'"');
     try{
      await execute('docker',['exec',state.container,'pg_dump','--username=postgres','--dbname='+new URL(requireOwnedPilotDatabase(process.env,true)).pathname.slice(1),'--format=custom','--file='+dump],{timeout:30000});
      await execute('docker',['exec',state.container,'pg_restore','--username=postgres','--dbname='+cloneName,'--exit-on-error',dump],{timeout:30000});
      const descriptor=JSON.parse(await readFile(retry.sourceFile,'utf8')),selectedSource=new URL(descriptor.databaseUrl);selectedSource.hostname='original.fixture.neon.tech';selectedSource.pathname='/'+cloneName;state.connections.set(selectedSource.href,actualSource.href);
      const denialSourceFile=join(retryRoot,'original-source.json');await writeFile(denialSourceFile,JSON.stringify({...descriptor,databaseUrl:selectedSource.href}),{mode:0o600,flag:'wx'});state.allowCapture=true;
     const configuration={contract:'pilot-work-recovery-verification-input-v2',sourceFile:retry.sourceFile,hostedScope:retry.hostedScope,scope:retry.scope,runtimeFile,credentialsFile,candidateFile,bundle:retryPhysical.material.bundle,keyFile:retryPhysical.material.keyFile,assetRoot:retryPhysical.material.assetRoot,storeId:retryPhysical.material.storeId,denialSourceFile,denialReceipt:join(retryRoot,'retained-receipt-private.json'),denialDestination:join(retryRoot,'retained-destination-private.json'),backupCapturedAt:freshRetained.backupCapturedAt,hostJournalDirectory:join(dirname(input.sourceFile),'producer-http-journal'),approvedHosts:['recovery.vercel.app'],output:join(retryRoot,'cli-verification')};await writeFile(configurationFile,JSON.stringify(configuration),{mode:0o600,flag:'wx'});
     const fresh=await pilotWorkRecoveryVerify(['--verify-work-recovery','--configuration',configurationFile]);
     const beforeResume=(await owner.query('SELECT count(*)::int AS n FROM operations_recovery_http_reads')).rows[0].n,resumeConfiguration=join(retryRoot,'resume-configuration-private.json');await writeFile(resumeConfiguration,JSON.stringify({...configuration,output:join(retryRoot,'cli-resume')}),{mode:0o600,flag:'wx'});expect(await pilotWorkRecoveryVerify(['--verify-work-recovery','--configuration',resumeConfiguration])).toMatchObject({verificationId:fresh.verificationId,resumed:true});expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_http_reads')).rows[0].n).toBe(beforeResume);
     expect(fresh).toMatchObject({resumed:false,serviceOpened:false});expect(fresh.verificationId).not.toBe(produced.verificationId);expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_verifications')).rows[0].n).toBe(2);
     const {resolveRecoveryQuarantines}=await import('../../../lib/server/operations/recovery-resolution');await resolveRecoveryQuarantines(owner,{...retry.scope,verificationId:fresh.verificationId});expect(await transitionRecoveryControl(owner,{environmentId:retry.scope.environmentId,recoveryId:retry.scope.recoveryId,expectedRevision:retry.scope.controlRevision,operationId:randomUUID(),mode:'open',verifiedBundleDigest:fresh.bundleDigest})).toMatchObject({mode:'open'});
     }finally{state.allowCapture=false;await execute('docker',['exec',state.container,'rm','-f',dump],{timeout:10000});await owner.query('DROP DATABASE "'+cloneName+'" WITH(FORCE)');}
    });


   }finally{transport.mockRestore();}
   expect((await owner.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id JOIN mcp_connections mc ON mc.id=a.record_id WHERE a.mcp_probe_connection AND (a.revoked_at IS NULL OR s.revoked_at IS NULL OR mc.revoked_at IS NULL OR mc.credential_hash IS NOT NULL)')).rowCount).toBe(0);
  });}finally{state.retainedKey=null;if(previousCron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previousCron;await owner.end();}
 },async owner=>{const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');workspaceId=f.actor.workspaceId;customerId=f.customerId;for(let i=0;i<6;i++)await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary',workspaceId);const organization=randomUUID(),partnerMembership=randomUUID();await owner.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic MCP category partner')",[organization,workspaceId]);await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,'internal','member',NULL),($4,$5,$3,'partner','member',$6)",[randomUUID(),DEMO_IDS.panel,workspaceId,partnerMembership,DEMO_IDS.partner,organization]);await owner.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),partnerMembership,workspaceId,customerId,DEMO_IDS.mcteer]);const {issueSession,getCurrentSession,sessionCookieName}=await import('../../../lib/server/auth/sessions');
  for(const username of ['mcteer','panel','partner'] as const){const member=(await owner.query('SELECT id,kind,role FROM memberships WHERE workspace_id=$1 AND principal_id=$2',[workspaceId,DEMO_IDS[username]])).rows[0],session=await issueSession({principalId:DEMO_IDS[username],loginName:username,displayName:username,membershipId:member.id,workspaceId,kind:member.kind,role:member.role}),actor=(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+'='+session.token}})))!;conversationIds.push((await createOwnedConversation(actor,{customerId,requestKey:randomUUID()},owner as unknown as PoolClient)).conversation.id);}
  await owner.query('UPDATE workspaces SET active=false WHERE id<>$1',[workspaceId]);},'production',450000).catch(error=>{throw new Error('Work MCP category regression failed during '+phase+': '+(error instanceof Error?error.message:'unknown'),{cause:error});});
},420000);

it('cancels a pending owner transaction when a single read deadline ends and preserves independent cleanup',async()=>fixture(async input=>{
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{const row=(await owner.query('SELECT id,display_name FROM customer_references ORDER BY id LIMIT 1')).rows[0];
  const start=Date.now();await expect(withLockedWorkRecoveryDecision(input,async(db,target)=>{await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Must roll back timed-out read']);await withWorkRecoveryReadDeadline(db,target,AbortSignal.timeout(50),()=>db.query('SELECT pg_sleep(3)'));})).rejects.toThrow();
  expect(Date.now()-start).toBeLessThan(2500);expect((await owner.query('SELECT display_name FROM customer_references WHERE id=$1',[row.id])).rows[0].display_name).toBe(row.display_name);
 }finally{await owner.end();}
}),210000);

it('authenticates real work integrity bytes and rejects forged changed-object archive and grant proofs',async()=>fixture(async input=>{
 const {captureOwnedRecoveryCandidate}=await import('../../../lib/server/operations/capture-candidate');
 const {verifyNativePostgresClient}=await import('../../../lib/server/operations/native-postgres');
 const {LocalPrivateObjects}=await import('../../../lib/server/storage/local-objects');
 const {activeObjectNamespaces}=await import('../../../lib/server/storage/inventory');
 const {objectKey,environmentObjectId}=await import('../../../lib/server/storage/private-objects');
 const {decryptRecoveryFile,encryptRecoveryFile}=await import('../../../lib/server/operations/backup-crypto');
 const {packBackupArchive,unpackBackupArchive}=await import('../../../lib/server/operations/backup-archive');
 const {workCaptureCandidateSchema}=await import('../../../lib/contracts/pilot-capture');
 const {recoveryDigest}=await import('../../../lib/contracts/pilot-recovery');
 const root=dirname(input.sourceFile),sourceRoot=join(root,'originals'),workflowRoot=join(root,'empty-workflow'),keys=join(root,'keys'),rebound=join(root,'rebound'),key=randomBytes(32),signal=input.signal;
 for(const directory of [sourceRoot,workflowRoot,keys,rebound])await mkdir(directory,{mode:0o700});const keyFile=join(keys,'key');await writeFile(keyFile,key,{mode:0o600});
 const store=new LocalPrivateObjects(sourceRoot,input.scope.environmentId,10485760);
 for(const namespace of activeObjectNamespaces){await mkdir(join(sourceRoot,'e_'+environmentObjectId(input.scope.environmentId),namespace),{recursive:true,mode:0o700});const bytes=Buffer.from('Controlled integrity original '+namespace),digest=createHash('sha256').update(bytes).digest('hex'),id=namespace.startsWith('artifact')?digest:randomUUID(),name=objectKey(input.scope.environmentId,namespace,id);await store.put(name,(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});state.blobObjects.set(name,bytes);}
 try{
  const owned=await captureOwnedRecoveryCandidate({...input.scope,sourceRoot,workflowRoot,keyFile,keyReference:'synthetic-work-key',keyVersion:'1',output:join(root,'capture')},signal);
  const archive=join(root,'original.archive');await decryptRecoveryFile(join(root,'capture/candidate.encrypted'),archive,key,owned.encryptedBundle.headerDigest,signal);
  const unpacked=join(root,'unpacked'),header=await unpackBackupArchive({archive,target:unpacked,expectedHeaderDigest:owned.encryptedBundle.headerDigest,environmentId:input.scope.environmentId,checkpointId:owned.id,signal});
  const assetRoot=resolve('infra/pilot/native-postgres/linux-amd64'),native=await verifyNativePostgresClient(assetRoot),configurationDigest=recoveryDigest({environmentId:input.scope.environmentId,databaseName:owned.sourceDatabaseName,sourceProjectId:input.hostedScope.projectId,storeId:'syntheticStore',backend:'private-blob',workflow:'managed-workflow',clientManifestDigest:native.manifestDigest});
  // Repack the actual owned SQL/object bytes with authenticated controlled work
  // provenance. Cloud SDK transport alone is controlled; no hosted claim.
  const nextArchive=join(rebound,'candidate.archive'),packed=await packBackupArchive({header:{...header,provenance:{...header.provenance,configurationDigest}},files:new Map(header.entries.map(entry=>[entry.name,join(unpacked,entry.name)])),output:nextArchive,signal}),bundle=join(rebound,'candidate.encrypted'),encrypted=await encryptRecoveryFile(nextArchive,bundle,key,packed.headerDigest,signal);
  const {providerCalls:ignored,...common}=owned;
  const candidate=workCaptureCandidateSchema.parse({...common,configurationDigest,contract:'pilot-work-capture-candidate-v1',workflow:{inventoryDigest:recoveryDigest([]),fileCount:0,entries:[],backend:'managed-workflow',capability:'interrupted-reconciliation',runtimeStoppedVerified:false,resumptionVerified:false,reconciliationVerified:false},encryptedBundle:{headerDigest:packed.headerDigest,...encrypted},modelCalls:0,mailCalls:0});
  process.env.VERCEL_BLOB_RETRIES='0';const args={target:input,candidate,bundle,keyFile,assetRoot,storeId:'syntheticStore',oidcToken:'synthetic.oidc.identity'};
  await expect(measureWorkTargetIntegrity({...args,candidate:{...candidate,encryptedBundle:{...candidate.encryptedBundle,sizeBytes:67108865}}})).rejects.toThrow('capture allowance');
  await expect(measureWorkTargetIntegrity({...args,oidcToken:''})).rejects.toThrow();
  const proof=await measureWorkTargetIntegrity(args);expect(proof).toMatchObject({objectCount:activeObjectNamespaces.length,acceptedContentDigest:candidate.acceptedContentDigest,restorationReady:false});
  const blobToken='vercel_blob_rw_syntheticStore_SYNTHETICFIXTUREONLY';await expect(measureWorkTargetIntegrity({...args,blobToken})).rejects.toThrow('Exactly one');await expect(measureWorkTargetIntegrity({...args,oidcToken:undefined,blobToken:'vercel_blob_rw_foreignStore_SYNTHETICFIXTUREONLY'})).rejects.toThrow('identity differs');const tokenProof=await measureWorkTargetIntegrity({...args,oidcToken:undefined,blobToken});expect(tokenProof).toMatchObject({objectCount:activeObjectNamespaces.length,acceptedContentDigest:candidate.acceptedContentDigest,restorationReady:false});expect(JSON.stringify(tokenProof)).not.toContain(blobToken);await withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(await requireMeasuredWorkTargetIntegrity(db,target,tokenProof,signal)).toBe(tokenProof);});
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(await requireMeasuredWorkTargetIntegrity(db,target,proof,signal)).toBe(proof);await expect(requireMeasuredWorkTargetIntegrity(db,target,{...proof},signal)).rejects.toThrow('Genuine current');});
  await expect(measureWorkTargetIntegrity({...args,storeId:'differentStore'})).rejects.toThrow('binding differs');
  const first=[...state.blobObjects][0];state.blobObjects.set(first[0],Buffer.from('Changed original'));await expect(withLockedWorkRecoveryDecision(input,(db,target)=>requireMeasuredWorkTargetIntegrity(db,target,proof,signal))).rejects.toThrow();state.blobObjects.set(...first);
  const original=await readFile(bundle),changed=Buffer.from(original);changed[changed.length-1]^=1;await writeFile(bundle,changed,{mode:0o600});await expect(withLockedWorkRecoveryDecision(input,(db,target)=>requireMeasuredWorkTargetIntegrity(db,target,proof,signal))).rejects.toThrow('digest differs');await writeFile(bundle,original,{mode:0o600});
  await writeFile(keyFile,randomBytes(32),{mode:0o600});await expect(withLockedWorkRecoveryDecision(input,(db,target)=>requireMeasuredWorkTargetIntegrity(db,target,proof,signal))).rejects.toThrow();await writeFile(keyFile,key,{mode:0o600});
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();try{expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');expect((await owner.query('SELECT count(*)::int AS count FROM operations_recovery_verifications')).rows[0].count).toBe(0);await owner.query('ALTER ROLE turas_runtime_016 CONNECTION LIMIT 9');await expect(withLockedWorkRecoveryDecision(input,(db,target)=>requireMeasuredWorkTargetIntegrity(db,target,proof,signal))).rejects.toThrow('grant binding changed');}finally{await owner.end();}
 }finally{key.fill(0);state.blobObjects.clear();}
}),210000);

it('rechecks exhaustive native provider and deployment inventories without claiming old-host or effect closure',async()=>fixture(async input=>{
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 let mode:'normal'|'active'|'omitted'|'deployment'|'project'|'alias'='normal',writes=0;
 try{
  await owner.query("INSERT INTO conversations(id,environment_id,workspace_id,customer_id,owner_principal_id,creation_operation_id,binding_state,title,eve_session_id) VALUES($1,$2,$3,$4,$5,$6,'bound','Controlled native inventory','wrun_original')",[randomUUID(),input.scope.environmentId,DEMO_IDS.workspace,DEMO_IDS.sharedCustomer,DEMO_IDS.mcteer,randomUUID()]);
  const runs=[{runId:'wrun_original',deploymentId:'dpl_old',workflowName:'workflow//eve//workflowEntry',status:'completed'},{runId:'wrun_provider_only',deploymentId:'dpl_old',workflowName:'workflow//eve//turnWorkflow',status:'cancelled'}];
  const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
   const request=new Request(raw,options),url=new URL(request.url),headers=request.headers;
   if(url.origin!=='https://api.vercel.com'||headers.get('authorization')!=='Bearer controlled-provider-token'||headers.get('x-vercel-project-id')!=='prj_recovery'||headers.get('x-vercel-team-id')!=='team_recovery')throw Error('Exact controlled provider binding required');
   if(request.method!=='GET'){writes++;throw Error('Managed measurement must remain read only');}
   if(url.pathname==='/v9/projects/prj_recovery')return Response.json({id:mode==='project'?'prj_foreign':'prj_recovery',accountId:'team_recovery'});
   if(url.pathname==='/v6/deployments'){expect(headers.has('x-vercel-environment')).toBe(false);expect(url.searchParams.has('target')).toBe(false);return Response.json({deployments:['dpl_recovery','dpl_old'].map((id,index)=>({uid:id,projectId:'prj_recovery',created:1000+index,url:mode==='deployment'&&index===1?'changed.vercel.app':id.replace('_','-')+'.vercel.app',target:index===0?null:'production',readyState:'READY',meta:{githubCommitSha:'a'.repeat(40)}})),pagination:{next:null}});}
   if(url.pathname==='/v4/aliases'){expect(headers.has('x-vercel-environment')).toBe(false);return Response.json({aliases:[{uid:'alias_original',alias:mode==='alias'?'changed.example.com':'current.example.com',created:'2026-10-19',createdAt:1000,updatedAt:1000,creator:{},deletedAt:null,deploymentId:'dpl_recovery',deployment:{id:'dpl_recovery',url:'dpl-recovery.vercel.app'},projectId:'prj_recovery',redirect:null,redirectStatusCode:null}],pagination:{count:1,next:null,prev:null}});}
   expect(headers.get('x-vercel-environment')).toBe('preview');
   const rows=runs.filter(row=>mode!=='omitted'||row.runId!=='wrun_original').map(row=>({...row,status:mode==='active'&&row.runId==='wrun_original'?'running':row.status}));
   if(url.pathname==='/v1/workflow/v2/runs'){expect(url.searchParams.get('remoteRefBehavior')).toBe('lazy');return Response.json({data:rows,cursor:null,hasMore:false});}
   const found=rows.find(row=>url.pathname==='/v1/workflow/v2/runs/'+row.runId);if(found)return Response.json(found);throw Error('Controlled provider route unavailable');
  });
  try{
   await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   const args={target:input,token:'controlled-provider-token',retained};
   await expect(measureWorkManagedTerminalInventory({...args,retained:{...retained}})).rejects.toThrow();
   const proof=await measureWorkManagedTerminalInventory(args);expect(proof).toMatchObject({enumeratedRuns:2,providerOnlyRuns:1,deployments:2,enumeratedInventoryTerminalVerified:true,oldDeploymentsClosed:false,paidEffectsReconciled:false,restorationReady:false});
   await withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(await requireMeasuredWorkManagedTerminalInventory(db,target,proof,input.signal)).toBe(proof);await expect(requireMeasuredWorkManagedTerminalInventory(db,target,{...proof},input.signal)).rejects.toThrow('Genuine fresh');});
   for(const change of ['active','omitted','deployment','project','alias'] as const){mode=change;await expect(withLockedWorkRecoveryDecision(input,(db,target)=>requireMeasuredWorkManagedTerminalInventory(db,target,proof,input.signal))).rejects.toThrow();}mode='normal';
   await owner.query("DELETE FROM conversations WHERE eve_session_id='wrun_original'");
   const missingCurrent=await measureWorkManagedTerminalInventory(args);expect(missingCurrent.providerOnlyRuns).toBe(1);
   mode='omitted';await expect(measureWorkManagedTerminalInventory(args)).rejects.toThrow('missing from provider inventory');mode='normal';
   });
   expect(writes).toBe(0);expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');expect((await owner.query('SELECT count(*)::int AS count FROM operations_recovery_verifications')).rows[0].count).toBe(0);
  }finally{transport.mockRestore();}
 }finally{await owner.end();}
}),210000);

it('repeats real-target old HTTP admission under owner fences and one exact cumulative journal without unlocking',async()=>fixture(async input=>{
 const key='controlled_current_automation_key',host='recovery.vercel.app',root=dirname(input.sourceFile),approvedHosts=[host,'production.vercel.app'];let hostRequests=0,writes=0;
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
  const request=new Request(raw,options),url=new URL(request.url);if(request.method!=='GET'){writes++;throw Error('Read-only HTTP component required');}
  if(url.origin==='https://api.vercel.com'){
   expect(request.headers.get('authorization')).toBe('Bearer controlled-provider-token');
   if(url.pathname.startsWith('/v9/projects/'))return Response.json({id:'prj_recovery',accountId:'team_recovery',targets:{production:{id:'dpl_production'}},protectionBypass:{[key]:{scope:'automation-bypass',isEnvVar:false,note:'Controlled current key',createdAt:1000,createdBy:'operator'}}});
   if(url.pathname.startsWith('/v13/deployments/')){const identity=decodeURIComponent(url.pathname.split('/').at(-1)!),production=identity==='dpl_production'||identity==='production.vercel.app';return Response.json({id:production?'dpl_production':'dpl_recovery',url:production?'production.vercel.app':host,projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:production?'production':null,meta:{githubCommitSha:state.commit}});}
   if(url.pathname==='/v6/deployments')return Response.json({deployments:[['dpl_recovery',host],['dpl_production','production.vercel.app'],['dpl_old','old.vercel.app']].map(([uid,url])=>({uid,url,projectId:'prj_recovery',created:1000,target:uid==='dpl_recovery'?null:'production',readyState:'READY'})),pagination:{next:null}});
   if(url.pathname==='/v4/aliases')return Response.json({aliases:[{uid:'alias_old',alias:'old.example.com',created:'2026-10-19',createdAt:1000,updatedAt:1000,creator:{},deletedAt:null,deploymentId:'dpl_old',deployment:{id:'dpl_old',url:'old.vercel.app'},projectId:'prj_recovery',redirect:null,redirectStatusCode:null}],pagination:{count:1,next:null,prev:null}});
   if(url.pathname==='/v1/security/firewall/config/active')return Response.json({firewallEnabled:true,crs:{general:{active:false,action:'log'}},updatedAt:'2026-10-19T00:00:00Z',projectKey:'prj_recovery#active',id:'config_original',ips:[],changes:[],version:1,ownerId:'team_recovery',rules:[{id:'rule_original',name:'Current hosts',description:'Exact controlled fence',active:true,valid:true,validationErrors:null,conditionGroup:[{conditions:[{type:'host',op:'ninc',value:approvedHosts}]}],action:{mitigate:{action:'deny'}}}]});
   if(url.pathname==='/v1/security/firewall/bypass/rules')return Response.json({error:{code:'forbidden',message:'Conditional bypass is unavailable for this team.'}},{status:403});
   if(url.pathname==='/v1/security/firewall/bypass')return Response.json({result:[]});throw Error('Unexpected controlled provider route');
  }
  hostRequests++;const original=url.origin+'/api/auth/session',header=request.headers.has('x-vercel-protection-bypass'),query=url.searchParams.has('x-vercel-protection-bypass'),cookie=request.headers.has('cookie');
  if(!header&&!query&&!cookie)return new Response(null,{status:302,headers:{location:'https://vercel.com/sso-api?url='+encodeURIComponent(original)}});
  if(request.headers.has('x-vercel-set-bypass-cookie'))return new Response(null,{status:307,headers:{location:original,'set-cookie':'_vercel_jwt=controlled_provider_issued_cookie; Path=/; Secure; HttpOnly; SameSite=Lax'}});
  if(url.hostname===host)return Response.json({error:{code:'authentication_required'}},{status:401,headers:{'x-turas-code-version':state.commit}});
  return new Response('Controlled edge deny',{status:403,headers:{'x-vercel-mitigated':'deny'}});
 });
 try{
  const plan={contract:'pilot-host-http-journal-plan-v1',id:randomUUID(),projectId:'prj_recovery',teamId:'team_recovery',sourceCommit:state.commit,maximumRequests:30,maximumCostMicroUsd:2000000,expiresAt:new Date(Date.now()+3600000).toISOString(),authorityReference:'Controlled owned finite authority',previousJournalDigests:['b'.repeat(64)],historicalStrictFailureRetained:true,unknownCostHoldsRetained:true,automaticRetries:false};
  const wrong=await PilotHostHttpJournal.create(join(root,'wrong-http-journal'),{...plan,projectId:'prj_foreign'});await expect(measureWorkOldHttpAdmission({target:input,token:'controlled-provider-token',approvedHosts,journal:wrong})).rejects.toThrow('exact-scope');expect(hostRequests).toBe(0);
  const insufficient=await PilotHostHttpJournal.create(join(root,'insufficient-http-journal'),{...plan,maximumRequests:29});await expect(measureWorkOldHttpAdmission({target:input,token:'controlled-provider-token',approvedHosts,journal:insufficient})).rejects.toThrow('cumulative journal');expect(hostRequests).toBe(0);
  const journal=await PilotHostHttpJournal.create(join(root,'http-journal'),plan),proof=await measureWorkOldHttpAdmission({target:input,token:'controlled-provider-token',approvedHosts,journal});expect(proof).toMatchObject({oldHosts:2,phaseRequests:15,cumulativeRequests:15,initialCurrentHttpCensusMeasured:true,repeatedCurrentHttpAdmissionVerified:false,restorationReady:false});
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{await expect(requireMeasuredWorkOldHttpAdmission(db,target,{...proof},input.signal)).rejects.toThrow('Genuine fresh');const current=await requireMeasuredWorkOldHttpAdmission(db,target,proof,input.signal);expect(current).toMatchObject({oldHosts:2,cumulativeRequests:30,repeatedCurrentHttpAdmissionVerified:true,cronAdmissionClosed:false,workflowClosureVerified:false,requiredScopeHealthy:false,restorationReady:false});});
  expect(hostRequests).toBe(30);expect(writes).toBe(0);expect(journal.status()).toMatchObject({reserved:30,observed:30,pending:0,remaining:0});await expect(withLockedWorkRecoveryDecision(input,(db,target)=>requireMeasuredWorkOldHttpAdmission(db,target,proof,input.signal))).rejects.toThrow('cumulative journal');expect(hostRequests).toBe(30);
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();try{expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');expect((await owner.query('SELECT count(*)::int AS count FROM operations_recovery_verifications')).rows[0].count).toBe(0);}finally{await owner.end();}
 }finally{transport.mockRestore();}
}),210000);


it('audits installed immutable holds and effect admission guards and refuses disabled altered or writable enforcement',async()=>fixture(async input=>{
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{
  const inspect=()=>withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryEffectGuards(db,target));
  expect(await inspect()).toMatchObject({guards:14,installedEffectGuardsVerified:true,heldAccountingVerified:false,providerExecutionClosed:false,restorationReady:false});
  await owner.query('ALTER TABLE operations_recovery_model_holds DISABLE TRIGGER recovery_model_hold_immutable');
  try{await expect(inspect()).rejects.toThrow('Installed recovery effect enforcement differs');}finally{await owner.query('ALTER TABLE operations_recovery_model_holds ENABLE TRIGGER recovery_model_hold_immutable');}
  const original=(await owner.query("SELECT pg_get_functiondef('public.turas_recovery_paid_release_guard()'::regprocedure) AS sql")).rows[0].sql;
  await owner.query('CREATE OR REPLACE FUNCTION turas_recovery_paid_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$');
  try{await expect(inspect()).rejects.toThrow('Installed recovery effect enforcement differs');}finally{await owner.query(original);}
  await owner.query('GRANT UPDATE(ceiling_tokens) ON operations_recovery_model_holds TO turas_runtime');
  try{await expect(inspect()).rejects.toThrow('Runtime recovery accounting authority differs');}finally{await owner.query('REVOKE UPDATE(ceiling_tokens) ON operations_recovery_model_holds FROM turas_runtime');}
  const originalOutput=(await owner.query("SELECT pg_get_functiondef('public.turas_ordinary_output_used(uuid)'::regprocedure) AS sql")).rows[0].sql;
  await owner.query('CREATE OR REPLACE FUNCTION turas_ordinary_output_used(conversation uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT 0::bigint $$');
  try{await expect(inspect()).rejects.toThrow('Installed ordinary held accounting function differs');}finally{await owner.query(originalOutput);}
  await owner.query('GRANT INSERT ON operations_cost_reconciliations TO turas_runtime_016');
  try{await expect(inspect()).rejects.toThrow('Runtime recovery accounting authority differs');}finally{await owner.query('REVOKE INSERT ON operations_cost_reconciliations FROM turas_runtime_016');}
  expect(await inspect()).toMatchObject({installedEffectGuardsVerified:true,restorationReady:false});
  expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
  expect(Number((await owner.query('SELECT count(*) FROM operations_recovery_verifications')).rows[0].count)).toBe(0);
 }finally{await owner.end();}
}),210000);


it('audits genuine retained and current typed model holds without settling unknowns or reopening budgets',async()=>{
 let operation='',budget='',conversationId='',baselineOnly='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);
   const inspectDispatch=()=>withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryDispatchState(db,target));
   expect(await inspectDispatch()).toMatchObject({currentDatabaseDispatchClosed:true,providerExecutionClosed:false,restorationReady:false});
   await owner.query("INSERT INTO watchdog_jobs(attempt_id,deadline_at,state,lease_owner,lease_expires_at,next_attempt_at) SELECT id,deadline_at,'leased','controlled-unretired-lease',clock_timestamp()+interval '20 seconds',clock_timestamp() FROM response_attempts WHERE conversation_id=$1",[conversationId]);
   try{await expect(inspectDispatch()).rejects.toThrow('Recovery database effect remains dispatchable: watchdogs');}finally{await owner.query('DELETE FROM watchdog_jobs WHERE attempt_id IN(SELECT id FROM response_attempts WHERE conversation_id=$1)',[conversationId]);}

   const hostedJob=randomUUID();await owner.query('ALTER TABLE operations_hosted_jobs DISABLE TRIGGER hosted_job_admission');
   try{await owner.query(`INSERT INTO operations_hosted_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,code_version,lease_id,lease_expires_at,creation_tag,image_digest,state,deadline_at,input_digest,input_bytes,budget_reservation_id)
    VALUES($1,$2,'artifact',$3,1,repeat('a',64),repeat('a',40),$4,clock_timestamp()+interval '20 seconds',$5,repeat('a',64),'admitted',clock_timestamp()+interval '1 minute',repeat('a',64),16,$6)`,[hostedJob,input.scope.environmentId,randomUUID(),randomUUID(),randomUUID(),randomUUID()]);}finally{await owner.query('ALTER TABLE operations_hosted_jobs ENABLE TRIGGER hosted_job_admission');}
   try{await expect(inspectDispatch()).rejects.toThrow('Recovery database effect remains dispatchable: hosted-jobs');}finally{await owner.query('DELETE FROM operations_hosted_jobs WHERE id=$1',[hostedJob]);}
   const inspect=()=>withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryModelHolds(db,target,retained));
   expect(await inspect()).toMatchObject({operations:258,holds:258,typedModelAccountingVerified:true,allPaidEffectsVerified:false,providerExecutionClosed:false,restorationReady:false});
   await withLockedWorkRecoveryDecision(input,async(db,target)=>{await expect(auditRecoveryModelHolds(db,target,{...retained})).rejects.toThrow('Actual independently retained');});
   await owner.query('ALTER TABLE operations_recovery_model_holds DISABLE TRIGGER recovery_model_hold_immutable');
   await owner.query('UPDATE operations_recovery_model_holds SET ceiling_micro_usd=1 WHERE operation_id=$1',[operation]);
   await owner.query('ALTER TABLE operations_recovery_model_holds ENABLE TRIGGER recovery_model_hold_immutable');
   try{await expect(inspect()).rejects.toThrow('Original typed model hold missing or changed');}finally{await owner.query('ALTER TABLE operations_recovery_model_holds DISABLE TRIGGER recovery_model_hold_immutable');await owner.query('UPDATE operations_recovery_model_holds SET ceiling_micro_usd=200000 WHERE operation_id=$1',[operation]);await owner.query('ALTER TABLE operations_recovery_model_holds ENABLE TRIGGER recovery_model_hold_immutable');}
   await owner.query(`INSERT INTO operations_recovery_model_observations(environment_id,operation_kind,operation_id,observed_evidence_digest,observed_captured_at,evidence_kind,ceiling_tokens,ceiling_micro_usd,actual_tokens,actual_micro_usd,settled_at,snapshot_digest,source_captured_at,recovery_id,control_revision,observed_digest_kind)
    SELECT environment_id,operation_kind,operation_id,repeat('e',64),observed_captured_at,evidence_kind,ceiling_tokens,ceiling_micro_usd,9000,NULL,clock_timestamp(),snapshot_digest,source_captured_at,recovery_id,control_revision,observed_digest_kind FROM operations_recovery_model_observations WHERE operation_kind='ordinary_tokens' LIMIT 1`);
   try{await expect(inspect()).rejects.toThrow('Known higher model exposure is not held');}finally{await owner.query('ALTER TABLE operations_recovery_model_observations DISABLE TRIGGER recovery_model_observation_immutable');await owner.query("DELETE FROM operations_recovery_model_observations WHERE observed_evidence_digest=repeat('e',64)");await owner.query('ALTER TABLE operations_recovery_model_observations ENABLE TRIGGER recovery_model_observation_immutable');}
   await owner.query('ALTER TABLE parity_evaluation_budgets DISABLE TRIGGER recovery_parity_budget_guard');await owner.query('ALTER TABLE parity_evaluation_budgets DISABLE TRIGGER recovered_request_replay');
   await owner.query('UPDATE parity_evaluation_budgets SET reserved_micro_usd=200000 WHERE id=$1',[budget]);
   await owner.query('ALTER TABLE parity_evaluation_budgets ENABLE TRIGGER recovery_parity_budget_guard');await owner.query('ALTER TABLE parity_evaluation_budgets ENABLE TRIGGER recovered_request_replay');
   try{await expect(inspect()).rejects.toThrow('original reservation floor differs');}finally{await owner.query('ALTER TABLE parity_evaluation_budgets DISABLE TRIGGER recovered_request_replay');await owner.query('UPDATE parity_evaluation_budgets SET reserved_micro_usd=500000 WHERE id=$1',[budget]);await owner.query('ALTER TABLE parity_evaluation_budgets ENABLE TRIGGER recovered_request_replay');}
   await owner.query('ALTER TABLE ordinary_conversation_allowances DISABLE TRIGGER ordinary_allowance_immutable');await owner.query('ALTER TABLE ordinary_conversation_allowances DISABLE TRIGGER recovered_request_replay');
   await owner.query('UPDATE ordinary_conversation_allowances SET baseline_output_tokens=0 WHERE conversation_id=$1',[baselineOnly]);
   await owner.query('ALTER TABLE ordinary_conversation_allowances ENABLE TRIGGER ordinary_allowance_immutable');await owner.query('ALTER TABLE ordinary_conversation_allowances ENABLE TRIGGER recovered_request_replay');
   try{await expect(inspect()).rejects.toThrow('Retained ordinary conversation baseline missing or changed');}finally{await owner.query('ALTER TABLE ordinary_conversation_allowances DISABLE TRIGGER ordinary_allowance_immutable');await owner.query('ALTER TABLE ordinary_conversation_allowances DISABLE TRIGGER recovered_request_replay');await owner.query('UPDATE ordinary_conversation_allowances SET baseline_output_tokens=3000 WHERE conversation_id=$1',[baselineOnly]);await owner.query('ALTER TABLE ordinary_conversation_allowances ENABLE TRIGGER ordinary_allowance_immutable');await owner.query('ALTER TABLE ordinary_conversation_allowances ENABLE TRIGGER recovered_request_replay');}
   expect(await inspect()).toMatchObject({typedModelAccountingVerified:true});
   expect((await owner.query('SELECT actual_micro_usd,settled_at FROM parity_evaluation_operations WHERE id=$1',[operation])).rows[0]).toEqual({actual_micro_usd:null,settled_at:null});
   expect((await owner.query('SELECT reserved_micro_usd,state FROM parity_evaluation_budgets WHERE id=$1',[budget])).rows[0]).toEqual({reserved_micro_usd:'500000',state:'closed'});
   expect((await owner.query('SELECT turas_ordinary_output_used($1) AS used',[conversationId])).rows[0].used).toBe('13192');
  });}finally{await owner.end();}
 },async owner=>{
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary'),created=await createOwnedConversation(f.actor,{requestKey:randomUUID(),title:'Controlled original recovery accounting'});conversationId=created.conversation.id;const message=randomUUID(),attempt=randomUUID();operation=randomUUID();budget=randomUUID();
  await owner.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,repeat('a',64),'Synthetic accounting')",[message,conversationId,randomUUID()]);
  await owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('a',64),'admitted','running',clock_timestamp()+interval '5 minutes')",[attempt,conversationId,message]);
  baselineOnly=(await createOwnedConversation(f.actor,{requestKey:randomUUID(),title:'Controlled baseline-only recovery accounting'})).conversation.id;
  await owner.query('INSERT INTO ordinary_conversation_allowances(conversation_id,baseline_output_tokens) VALUES($1,3000)',[baselineOnly]);
  await owner.query('INSERT INTO ordinary_conversation_allowances(conversation_id,baseline_output_tokens) VALUES($1,5000)',[conversationId]);
  await owner.query('INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens) VALUES($1,$2,$3,8192)',[randomUUID(),conversationId,attempt]);
  await owner.query("INSERT INTO parity_evaluation_budgets(id,environment_id,workspace_id,owner_principal_id,cap_micro_usd,reserved_micro_usd,pricing,expires_at) VALUES($1,$2,$3,$4,1000000,500000,'{}',clock_timestamp()+interval '1 hour')",[budget,(await owner.query('SELECT environment_id FROM turas_environment')).rows[0].environment_id,f.actor.workspaceId,f.actor.principalId]);
  await owner.query("INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd) VALUES($1,$2,'synthetic-no-provider',200000)",[operation,budget]);
  await owner.query("INSERT INTO parity_evaluation_operations(id,budget_id,provider,ceiling_micro_usd) SELECT gen_random_uuid(),$1,'synthetic-no-provider',1 FROM generate_series(1,256)",[budget]);
 });
},210000);


it('retains original operational service cost ceilings unknown holds and provider job identities',async()=>{
 let budget='',reservation='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);const inspect=()=>withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryServiceCosts(db,target,retained));
   expect(await inspect()).toMatchObject({budgets:1,reservations:2,receipts:1,originalServiceCostAccountingVerified:true,providerExecutionClosed:false,allPaidEffectsVerified:false,restorationReady:false});
   await owner.query('ALTER TABLE operations_cost_reservations DISABLE TRIGGER cost_reservation_fence');
   await owner.query('UPDATE operations_cost_reservations SET upper_bound_micro_usd=1 WHERE id=$1',[reservation]);
   await owner.query('ALTER TABLE operations_cost_reservations ENABLE TRIGGER cost_reservation_fence');
   try{await expect(inspect()).rejects.toThrow('Original service reservation exposure or provider identity differs');}finally{await owner.query('ALTER TABLE operations_cost_reservations DISABLE TRIGGER cost_reservation_fence');await owner.query('UPDATE operations_cost_reservations SET upper_bound_micro_usd=200000 WHERE id=$1',[reservation]);await owner.query('ALTER TABLE operations_cost_reservations ENABLE TRIGGER cost_reservation_fence');}
   expect(await inspect()).toMatchObject({originalServiceCostAccountingVerified:true});
   expect((await owner.query('SELECT state,upper_bound_micro_usd,charged_micro_usd FROM operations_cost_reservations WHERE id=$1',[reservation])).rows[0]).toEqual({state:'unknown',upper_bound_micro_usd:'200000',charged_micro_usd:null});
   expect((await owner.query('SELECT state FROM operations_cost_budgets WHERE id=$1',[budget])).rows[0].state).toBe('revoked');
  });}finally{await owner.end();}
 },async owner=>{
  budget=randomUUID();reservation=randomUUID();const environmentId=(await owner.query('SELECT environment_id FROM turas_environment')).rows[0].environment_id;
  await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',repeat('a',64),repeat('b',64),repeat('c',64),1000000,clock_timestamp()+interval '1 hour')",[budget,environmentId]);
  await owner.query("INSERT INTO operations_cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd) VALUES($1,$2,repeat('d',64),200000)",[reservation,budget]);
  await owner.query("UPDATE operations_cost_reservations SET state='dispatched',job_id=$2,dispatched_at=clock_timestamp() WHERE id=$1",[reservation,randomUUID()]);

  const settled=randomUUID();await owner.query("INSERT INTO operations_cost_reservations(id,budget_id,operation_digest,upper_bound_micro_usd) VALUES($1,$2,repeat('e',64),200000)",[settled,budget]);
  await owner.query("UPDATE operations_cost_reservations SET state='dispatched',job_id=$2,dispatched_at=clock_timestamp() WHERE id=$1",[settled,randomUUID()]);
  await owner.query("INSERT INTO operations_cost_reconciliations(reservation_id,request_digest,charge_evidence_digest,operator_review_digest,charged_micro_usd,charge_kind) VALUES($1,repeat('a',64),repeat('b',64),repeat('c',64),150000,'actual')",[settled]);
  await owner.query("UPDATE operations_cost_reservations SET state='settled',charged_micro_usd=150000,charge_kind='actual' WHERE id=$1",[settled]);
  await owner.query("UPDATE operations_cost_reservations SET state='unknown' WHERE id=$1",[reservation]);

 });
},210000);


it('retains genuine original learning reservations and rejects missing unknown cost holds',async()=>{
 let reservation='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);const inspect=()=>withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryLearningCosts(db,target,retained));
   expect(await inspect()).toMatchObject({budgets:1,unknownReservationsHeld:1,originalLearningCostAccountingVerified:true,providerExecutionClosed:false,allPaidEffectsVerified:false,restorationReady:false});
   const original=(await owner.query('SELECT to_jsonb(h) AS value FROM operations_recovery_paid_holds h WHERE reservation_id=$1',[reservation])).rows[0].value;
   await owner.query('ALTER TABLE operations_recovery_paid_holds DISABLE TRIGGER recovery_paid_hold_immutable');await owner.query('DELETE FROM operations_recovery_paid_holds WHERE reservation_id=$1',[reservation]);await owner.query('ALTER TABLE operations_recovery_paid_holds ENABLE TRIGGER recovery_paid_hold_immutable');
   try{await expect(inspect()).rejects.toThrow('Original unknown learning reservation lacks immutable hold');}finally{await owner.query('INSERT INTO operations_recovery_paid_holds SELECT * FROM jsonb_populate_record(NULL::operations_recovery_paid_holds,$1::jsonb)',[JSON.stringify(original)]);}
   expect(await inspect()).toMatchObject({originalLearningCostAccountingVerified:true});
   expect(Number((await owner.query('SELECT count(*) FROM learning_budget_settlements WHERE reservation_id=$1',[reservation])).rows[0].count)).toBe(0);
   expect(Number((await owner.query('SELECT count(*) FROM learning_reservation_releases WHERE reservation_id=$1',[reservation])).rows[0].count)).toBe(0);
  });}finally{await owner.end();}
 },async owner=>{
  const {learningNativeFixture}=await import('../../fixtures/learning/native'),{admitGovernedStaffingModelStep}=await import('../../../lib/server/staffing/native-admission');
  const f=await learningNativeFixture(owner as unknown as PoolClient);await admitGovernedStaffingModelStep(f.principal,f.identity);
  reservation=(await owner.query('SELECT id FROM learning_budget_reservations WHERE attempt_id=$1',[f.meta.id])).rows[0].id;
 });
},210000);


it('fences original native business identities after missing rows while allowing distinct messages and owner cleanup',async()=>{
 let conversationId='',message='',attempt='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:input.runtimeConnection});await owner.connect();await runtime.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);
   await owner.query('GRANT TRUNCATE ON operations_replay_fences TO turas_runtime_016');
   try{await expect(withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveredRequestFencesInTransaction(db,retained.snapshot,{...input.scope,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt}))).rejects.toThrow('Runtime permanent request fence authority differs');}finally{await owner.query('REVOKE TRUNCATE ON operations_replay_fences FROM turas_runtime_016');}
   const legacy=structuredClone(retained.snapshot),entry=legacy.tables.find(table=>table.name==='response_attempts')!;entry.replayKeyColumns=[['id']];for(const row of entry.rows)row.replayKeys=row.replayKeys!.filter(key=>JSON.stringify(key.columns)===JSON.stringify(['id']));
   const {recoveryDigest}=await import('../../../lib/contracts/pilot-recovery'),{snapshotDigest:_digest,currentAuthorityVerified:_authority,replayReconciled:_replay,restorationReady:_ready,...content}=legacy;legacy.snapshotDigest=recoveryDigest(content);
   await expect(withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveredRequestFencesInTransaction(db,legacy,{...input.scope,snapshotDigest:legacy.snapshotDigest,backupCapturedAt:retained.backupCapturedAt}))).rejects.toThrow('Complete actual business replay indexes required');
   await owner.query("UPDATE watchdog_jobs SET state='needs_attention',lease_owner=NULL,lease_expires_at=NULL WHERE attempt_id=$1",[attempt]);
   await expect(runtime.query("UPDATE watchdog_jobs SET state='leased',lease_owner='stale-worker',lease_expires_at=clock_timestamp()+interval '10 seconds' WHERE attempt_id=$1",[attempt])).rejects.toThrow('Recovered permanent request cannot be repeated');
   const {auditRecoveryNativeSendIdentities}=await import('../../../lib/server/operations/recovery-native-send-identities');
   expect(await withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryNativeSendIdentities(db,target,retained))).toMatchObject({currentRows:1,retainedOnlyRows:0,originalNativeSendIdentitiesPreserved:true,unknownDeliveryOrChargeSettled:false});
   const historicalRoot=join(dirname(input.sourceFile),'historical-native-metadata');await mkdir(historicalRoot,{mode:0o700});
   try{await withRetainedDenialFixture(owner,input.scope.environmentId,historicalRoot,{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async historical=>{
    await expect(withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryNativeSendIdentities(db,target,historical))).rejects.toThrow('Complete original native/send identity metadata required');
   },snapshot=>{for(const row of snapshot.tables.find(table=>table.name==='response_attempts')!.rows)delete row.status.input_digest;});}finally{await rm(historicalRoot,{recursive:true,force:true});}
   await owner.query('DELETE FROM watchdog_jobs WHERE attempt_id=$1',[attempt]);await owner.query('DELETE FROM response_attempts WHERE id=$1',[attempt]);
   expect(await withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryNativeSendIdentities(db,target,retained))).toMatchObject({currentRows:0,retainedOnlyRows:1,originalNativeSendIdentitiesPreserved:true});
   await expect(owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('a',64),'prepared','pending',clock_timestamp()+interval '1 minute')",[randomUUID(),conversationId,message])).rejects.toThrow('Recovered permanent request cannot be repeated');
   const freshMessage=randomUUID();await owner.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,repeat('b',64),'Distinct authorized synthetic message')",[freshMessage,conversationId,randomUUID()]);
   await owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('b',64),'rejected','failed',clock_timestamp()+interval '1 minute')",[randomUUID(),conversationId,freshMessage]);
   const proof=await withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveredRequestFencesInTransaction(db,retained.snapshot,{...input.scope,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt}));
   expect(proof).toMatchObject({permanentRequestFencesVerified:true,providerCalls:0,restorationReady:false});
   expect(Number((await owner.query('SELECT count(*) FROM response_attempts WHERE message_id=$1',[message])).rows[0].count)).toBe(0);
  });}finally{await runtime.end();await owner.end();}
 },async owner=>{
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');conversationId=(await createOwnedConversation(f.actor,{requestKey:randomUUID(),title:'Controlled original native identity'})).conversation.id;message=randomUUID();attempt=randomUUID();
  await owner.query("INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,repeat('a',64),'Original synthetic message')",[message,conversationId,randomUUID()]);
  await owner.query("INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state,deadline_at) VALUES($1,$2,$3,repeat('a',64),'admitted','running',clock_timestamp()+interval '1 minute')",[attempt,conversationId,message]);
  await owner.query("INSERT INTO watchdog_jobs(attempt_id,deadline_at,state,next_attempt_at) SELECT id,deadline_at,'pending',clock_timestamp() FROM response_attempts WHERE id=$1",[attempt]);
 });
},210000);


it('fences an original publication recipient after outbox loss despite fresh delivery and provider keys',async()=>{
 let delivery='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);
   const original=(await owner.query('SELECT to_jsonb(d) AS value FROM report_deliveries d WHERE id=$1',[delivery])).rows[0].value;
   const {auditRecoveryNativeSendIdentities}=await import('../../../lib/server/operations/recovery-native-send-identities');
   const identities=()=>withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryNativeSendIdentities(db,target,retained));
   expect((await identities()).currentRows).toBeGreaterThanOrEqual(1);
   await owner.query('ALTER TABLE report_deliveries DISABLE TRIGGER report_delivery_identity');
   try{await owner.query('UPDATE report_deliveries SET provider_key=$2 WHERE id=$1',[delivery,randomUUID()]);await expect(identities()).rejects.toThrow('Original native/send provider or business identity changed');}
   finally{await owner.query('UPDATE report_deliveries SET provider_key=$2 WHERE id=$1',[delivery,original.provider_key]);await owner.query('ALTER TABLE report_deliveries ENABLE TRIGGER report_delivery_identity');}
   expect(original.state).toBe('uncertain');await owner.query('DELETE FROM report_delivery_payloads WHERE delivery_id=$1',[delivery]);
   await owner.query('ALTER TABLE report_deliveries DISABLE TRIGGER report_delivery_identity');await owner.query('DELETE FROM report_deliveries WHERE id=$1',[delivery]);await owner.query('ALTER TABLE report_deliveries ENABLE TRIGGER report_delivery_identity');
   expect((await identities()).retainedOnlyRows).toBeGreaterThanOrEqual(1);
   const replacement={...original,id:randomUUID(),provider_key:randomUUID()};
   await expect(owner.query('INSERT INTO report_deliveries SELECT * FROM jsonb_populate_record(NULL::report_deliveries,$1::jsonb)',[JSON.stringify(replacement)])).rejects.toThrow('Recovered permanent request cannot be repeated');
   const proof=await withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveredRequestFencesInTransaction(db,retained.snapshot,{...input.scope,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt}));
   expect(proof).toMatchObject({permanentRequestFencesVerified:true,providerCalls:0,restorationReady:false});
   expect(Number((await owner.query('SELECT count(*) FROM report_deliveries WHERE publication_id=$1 AND recipient_identity=$2',[original.publication_id,original.recipient_identity])).rows[0].count)).toBe(0);
  });}finally{await owner.end();}
 },async owner=>{
  const {publishedReportFixture}=await import('../../fixtures/reports/published'),{reportTransaction}=await import('../../../lib/server/reports/commands');
  const {verifyConfiguredReportSender,registerVerifiedReportSender}=await import('../../../lib/server/reports/senders'),{createReportRecipientPolicy,createReportPolicyPreview,decideReportPolicy}=await import('../../../lib/server/reports/recipient-policy');
  const {previewReportSend,submitReportSendDecision}=await import('../../../lib/server/reports/service');
  Object.assign(process.env,{TURAS_REPORT_SENDER_ADDRESS:'recovery@example.invalid',TURAS_REPORT_SENDER_ID:randomUUID(),TURAS_REPORT_SENDER_DOMAIN_ID:randomUUID(),RESEND_API_KEY:'synthetic-provider-test-only',TURAS_REPORT_RECIPIENT_HMAC_KEY_ID:'synthetic',TURAS_REPORT_RECIPIENT_HMAC_KEYS:JSON.stringify({synthetic:Buffer.alloc(32,7).toString('base64')})});
  const f=await publishedReportFixture(),sender=await verifyConfiguredReportSender(async()=>new Response(JSON.stringify({id:process.env.TURAS_REPORT_SENDER_DOMAIN_ID,name:'example.invalid',status:'verified',capabilities:{sending:'enabled'},open_tracking:false,click_tracking:false})));
  await reportTransaction(db=>registerVerifiedReportSender(db,f.reviewer.workspaceId,sender));
  const policy=await reportTransaction(db=>createReportRecipientPolicy(db,f.reviewer,f.customerId,{selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[f.engagementId],workloadIds:[],includeCustomerLevel:true},senderId:sender.id,recipients:[{address:'original@example.invalid',entitlementRationale:'Explicit synthetic recovery recipient'}]}));
  const review=await reportTransaction(db=>createReportPolicyPreview(db,f.reviewer,policy.policyId,'approve',1));await reportTransaction(db=>decideReportPolicy(db,f.reviewer,policy.policyId,{action:'approve',expectedVersion:1,requestKey:randomUUID(),rationale:'Approve synthetic original recipient',previewId:review.previewId,previewDigest:review.previewDigest}));
  const command={action:'send' as const,policyId:policy.policyId,expectedVersion:f.published.version,expectedPolicyVersion:2},preview=await previewReportSend(f.reviewer,f.published.publicationId,command);
  await submitReportSendDecision(f.reviewer,f.published.publicationId,{...command,requestKey:randomUUID(),rationale:'Authorize synthetic outbox only without sending',previewId:preview.previewId,previewDigest:preview.previewDigest});
  delivery=(await owner.query('SELECT id FROM report_deliveries WHERE publication_id=$1',[f.published.publicationId])).rows[0].id;
 });
},210000);


it('repeats actual Sandbox SDK metadata without resume and includes retained missing provider references',async()=>{
 let job='',retiredJob='',creation='',environment='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();let mode='terminal',sandboxCalls=0;const methods:string[]=[];
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await owner.query('DELETE FROM operations_hosted_jobs WHERE id=$1',[retiredJob]);
   const at=Date.now()-10000,tags={turas_job:job,turas_creation:creation,turas_environment:createHash('sha256').update(environment).digest('hex')};
   const rows=[{name:'provider_a',persistent:false,createdAt:at,updatedAt:at,currentSessionId:'session_a',status:'stopped',tags},{name:'provider_only',persistent:false,createdAt:at,updatedAt:at,currentSessionId:'session_only',status:'stopped',tags:{}}];
   const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
    const url=new URL(typeof raw==='string'?raw:raw instanceof URL?raw.href:raw.url);methods.push(options?.method??'GET');
    if(url.hostname==='api.vercel.com'&&url.pathname==='/v9/projects/prj_recovery')return Response.json({id:'prj_recovery',accountId:'team_recovery'});
    if(url.origin!=='https://vercel.com'||options?.method!=='GET'||new Headers(options.headers).get('authorization')!=='Bearer synthetic-control-token')throw Error('Controlled SDK left fixed read scope');sandboxCalls++;
    if(url.pathname==='/api/v2/sandboxes'){
     if(mode==='failure')return Response.json({error:{code:'unavailable'}},{status:503});
     const cursor=url.searchParams.get('cursor'),selected=cursor?[rows[1]]:[rows[0]];return Response.json({sandboxes:selected.map(row=>({...row,status:mode==='active'?'running':row.status})),pagination:{count:1,next:cursor?(mode==='cycle'?'next':null):'next'}});
    }
    expect(url.searchParams.get('resume')).toBe('false');if(url.pathname.endsWith('/provider_retired'))return Response.json({error:{code:'not_found'}},{status:404});
    const row=rows.find(item=>url.pathname.endsWith('/'+item.name));if(!row)throw Error('Controlled unknown resource');
    return Response.json({resumed:mode==='resumed',sandbox:row,session:{id:row.currentSessionId,memory:1024,vcpus:1,region:'iad1',timeout:300000,status:row.status,requestedAt:at,createdAt:at,cwd:'/',updatedAt:at},routes:[]});
   });
   try{
    const proof=await measureWorkSandboxTerminalInventory({target:input,token:'synthetic-control-token',retained});expect(proof).toMatchObject({resources:2,retiredReferences:1,wholeProjectSandboxTerminalVerified:true,sandboxResumptionAdmissionClosed:false,paidEffectsReconciled:false,restorationReady:false});
    await withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(await requireMeasuredWorkSandboxTerminalInventory(db,target,proof,input.signal)).toBe(proof);await expect(requireMeasuredWorkSandboxTerminalInventory(db,target,{...proof},input.signal)).rejects.toThrow('Genuine fresh exact');});
    mode='active';await expect(measureWorkSandboxTerminalInventory({target:input,token:'synthetic-control-token',retained})).rejects.toThrow('active execution');
    mode='cycle';await expect(measureWorkSandboxTerminalInventory({target:input,token:'synthetic-control-token',retained})).rejects.toThrow('Complete bounded Sandbox page');
    mode='resumed';await expect(measureWorkSandboxTerminalInventory({target:input,token:'synthetic-control-token',retained})).rejects.toThrow('Sandbox metadata read failed');
    mode='failure';const before=sandboxCalls;await expect(measureWorkSandboxTerminalInventory({target:input,token:'synthetic-control-token',retained})).rejects.toThrow('Sandbox metadata read failed');expect(sandboxCalls-before).toBe(1);
    expect(methods.every(method=>method==='GET')).toBe(true);
   }finally{transport.mockRestore();}
  });}finally{await owner.end();}
 },async owner=>{
  environment=(await owner.query('SELECT environment_id FROM turas_environment')).rows[0].environment_id;job=randomUUID();retiredJob=randomUUID();creation=randomUUID();
  for(const [id,tag,provider] of [[job,creation,'provider_a'],[retiredJob,randomUUID(),'provider_retired']]){
   await owner.query(`INSERT INTO operations_hosted_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,code_version,lease_id,lease_expires_at,creation_tag,image_digest,state,deadline_at,input_digest,input_bytes,budget_reservation_id)
    VALUES($1,$2,'artifact',$3,1,repeat('a',64),repeat('a',40),$4,clock_timestamp()+interval '20 seconds',$5,repeat('a',64),'admitted',clock_timestamp()+interval '1 minute',repeat('a',64),16,$6)`,[id,environment,randomUUID(),randomUUID(),tag,randomUUID()]);
   await owner.query("UPDATE operations_hosted_jobs SET state='starting',started_at=clock_timestamp() WHERE id=$1",[id]);await owner.query("UPDATE operations_hosted_jobs SET state='running',provider_id=$2 WHERE id=$1",[id,provider]);
  }
 });
},210000);


it('retires prepared plan drafting before reopening without changing original identities or dispatching work',async()=>{
 let attempt='';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   const original=(await owner.query('SELECT request_key,request_digest,conversation_id,steps_admitted FROM plan_drafting_attempts WHERE id=$1',[attempt])).rows[0];
   expect(await quarantineRestoredAuthority(owner,input.scope,retained)).toMatchObject({newlyInterruptedPlanDrafts:1});
   expect((await owner.query('SELECT request_key,request_digest,conversation_id,steps_admitted FROM plan_drafting_attempts WHERE id=$1',[attempt])).rows[0]).toEqual(original);
   expect((await owner.query('SELECT state,safe_error_code FROM plan_drafting_attempts WHERE id=$1',[attempt])).rows[0]).toEqual({state:'unconfirmed',safe_error_code:'recovery_current_proof_unavailable'});
   expect(await quarantineRestoredAuthority(owner,input.scope,retained)).toMatchObject({newlyInterruptedPlanDrafts:0});
   expect(await withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryDispatchState(db,target))).toMatchObject({currentDatabaseDispatchClosed:true,providerExecutionClosed:false,restorationReady:false});
   expect(Number((await owner.query('SELECT count(*) FROM response_attempts')).rows[0].count)).toBe(0);
  });}finally{await owner.end();}
 },async owner=>{
  const {submitPlanCommand}=await import('../../../lib/server/plans/commands'),{startPlanDraft}=await import('../../../lib/server/plans/drafting'),{syntheticPlanContent}=await import('../../fixtures/plans/seed');
  const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary'),content=syntheticPlanContent();content.assertions=[];content.sourceDependencies=[];
  await owner.query('BEGIN');try{const created=await submitPlanCommand(f.actor,{action:'create',requestKey:'plan_'+randomUUID(),workspaceId:f.actor.workspaceId,customerId:f.customerId,workloadId:null,audience:'delivery',ownerMembershipId:f.actor.membershipId,content},owner as unknown as PoolClient);
  attempt=(await startPlanDraft(f.actor,{requestKey:randomUUID(),planId:created.planId,baseRevisionId:created.revisionId,expectedAggregateVersion:created.aggregateVersion,instructions:'Controlled synthetic plan draft without any model dispatch'},owner as unknown as PoolClient)).attemptId;await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
 });
},210000);


it('rejects unaccounted current root model steps before provider selection while preserving legacy model selection',async()=>{
 const {default:agent}=await import('../../../agent/agent'),resolveModel=(agent.model as unknown as {events:{'step.started':(event:unknown,context:unknown)=>Promise<unknown>}}).events['step.started'];
 const resolve=()=>resolveModel({data:{turnId:'synthetic-unbound-turn',stepIndex:0}},{session:{id:'wrun_synthetic_unbound',auth:{current:null}}});
 await fixture(async input=>{
  await withLockedWorkRecoveryTarget(input,async(_db,target)=>{await expect(withTargetRuntime(input,target,resolve)).rejects.toMatchObject({code:'recovery_locked',status:503});});
 },async owner=>{
  await expect(resolve()).rejects.toMatchObject({status:404});
  await owner.query('UPDATE turas_environment SET schema_version=77');
  try{expect(await resolve()).toBe('spacexai/grok-4.7');}
  finally{await owner.query('UPDATE turas_environment SET schema_version=79');}
 });
},210000);

it('reads private conversations through genuine recovery actors while denying cross-owner and copied capabilities',async()=>{
 const conversations=new Map<string,string[]>();
 const {getOwnedConversation}=await import('../../../lib/server/conversations/repository');
 const {withAuthenticatedWorkRecoveryRead,withAuthenticatedWorkParticipantRead}=await import('../../../lib/server/operations/authenticated-recovery-read');
 await fixture(async input=>{
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{
   const client=db as unknown as PoolClient;
   for(const username of ['mcteer','panel','partner'] as const){
    const request={...input.scope,workspaceId:DEMO_IDS.workspace,deadline:Math.min(target.deadline,Date.now()+59000),password:process.env[username==='mcteer'?'TURAS_DEMO_PASSWORD':username==='panel'?'PANEL_PASSWORD':'PARTNER_PASSWORD']!};
    let retired:import('../../../lib/server/auth/sessions').CurrentSession|undefined;
    const read=async(actor:import('../../../lib/server/auth/sessions').CurrentSession)=>{
     retired=actor;
     for(const id of conversations.get(username)!){
      expect((await getOwnedConversation(actor,id,client)).id).toBe(id);
      await expect(getOwnedConversation({...actor},id,client)).rejects.toMatchObject({code:'recovery_locked'});
     }
     if(username==='partner'){
      await db.query('SAVEPOINT conversation_grant_denial');
      try{
       await db.query("UPDATE customer_grants SET state='revoked' WHERE membership_id=$1 AND customer_id=$2",[actor.membershipId,DEMO_IDS.sharedCustomer]);
       await expect(getOwnedConversation(actor,conversations.get(username)![1],client)).rejects.toMatchObject({status:404});
      }finally{await db.query('ROLLBACK TO SAVEPOINT conversation_grant_denial');await db.query('RELEASE SAVEPOINT conversation_grant_denial');}
     }
     for(const [other,ids] of conversations)if(other!==username)for(const id of ids)await expect(getOwnedConversation(actor,id,client)).rejects.toMatchObject({status:404});
    };
    if(username==='mcteer')await withAuthenticatedWorkRecoveryRead(db,target,request,dirname(input.sourceFile),read);
    else await withAuthenticatedWorkParticipantRead(db,target,{...request,username},dirname(input.sourceFile),read);
    await expect(getOwnedConversation(retired!,conversations.get(username)![0],client)).rejects.toMatchObject({code:'recovery_locked'});
    expect((await db.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1',[retired!.sessionId])).rows[0].retired).toBe(true);
   }
   const {auditRecoveryConversationReads}=await import('../../../lib/server/operations/recovery-conversation-reads');
   expect(await auditRecoveryConversationReads(db,target,{mcteer:process.env.TURAS_DEMO_PASSWORD!,panel:process.env.PANEL_PASSWORD!,partner:process.env.PARTNER_PASSWORD!},dirname(input.sourceFile))).toMatchObject({conversations:6,ownReads:6,foreignDenials:12,unavailableOwners:0,probeRetirementVerified:true,authenticatedHttpVerified:false,requiredScopeHealthy:false});
   await db.query('SAVEPOINT canonical_conversation_grant_audit');
   try{
    await db.query("UPDATE customer_grants SET state='revoked' WHERE membership_id=$1 AND customer_id=$2",[DEMO_IDS.partnerMembership,DEMO_IDS.sharedCustomer]);
    expect(await auditRecoveryConversationReads(db,target,{mcteer:process.env.TURAS_DEMO_PASSWORD!,panel:process.env.PANEL_PASSWORD!,partner:process.env.PARTNER_PASSWORD!},dirname(input.sourceFile))).toMatchObject({conversations:6,ownReads:5,restrictedOwnerDenials:1,foreignDenials:12,unavailableOwners:0,probeRetirementVerified:true});
   }finally{await db.query('ROLLBACK TO SAVEPOINT canonical_conversation_grant_audit');await db.query('RELEASE SAVEPOINT canonical_conversation_grant_audit');}
   expect((await db.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
  });
 },async owner=>{
  const {issueSession,getCurrentSession,sessionCookieName}=await import('../../../lib/server/auth/sessions');
  for(const username of ['mcteer','panel','partner'] as const){
   const membershipId=DEMO_IDS[username==='mcteer'?'mcteerMembership':username==='panel'?'panelMembership':'partnerMembership'];
   const member=(await owner.query('SELECT kind,role FROM memberships WHERE id=$1',[membershipId])).rows[0];
   const session=await issueSession({principalId:DEMO_IDS[username],loginName:username,displayName:username,membershipId,workspaceId:DEMO_IDS.workspace,kind:member.kind,role:member.role});
   const actor=(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+'='+session.token}})))!;
   const ids=[];
   for(const customerId of [null,DEMO_IDS.sharedCustomer]){
    const created=await createOwnedConversation(actor,{customerId,requestKey:randomUUID()},owner as unknown as PoolClient);ids.push(created.conversation.id);
    expect((await getOwnedConversation(actor,created.conversation.id)).id).toBe(created.conversation.id);
   }
   conversations.set(username,ids);
  }
 });
},210000);

it('serves exact private conversation recovery HTTP for each real role and refuses changed ownership grants and exhausted credentials',async()=>{
 const records=new Map<string,{id:string;customerId:string|null}>();
 await fixture(async input=>{
  const {issueWorkRecoveryHttpRead,issueWorkParticipantRecoveryHttpRead,retireOwnedRecoveryHttpRead}=await import('../../../lib/server/operations/recovery-http-read-issuer');
  const {GET,HEAD}=await import('../../../app/api/operations/recovery-read/[admissionId]/conversation/route');
  const {sessionCookieName}=await import('../../../lib/server/auth/sessions');
  const {getServerConfig}=await import('../../../lib/server/config');
  await withLockedWorkRecoveryTarget(input,async(db,target)=>{
   for(const username of ['mcteer','panel','partner'] as const){
    const record=records.get(username)!,request={...input.scope,workspaceId:DEMO_IDS.workspace,customerId:record.customerId,deadline:Math.min(target.deadline,Date.now()+59000),password:process.env[username==='mcteer'?'TURAS_DEMO_PASSWORD':username==='panel'?'PANEL_PASSWORD':'PARTNER_PASSWORD']!,maximumRequests:2,deploymentId:target.deploymentId,readKind:'conversation' as const,recordId:record.id};
    await db.query('BEGIN');let admission;
    try{admission=username==='mcteer'?await issueWorkRecoveryHttpRead(db,target,request,dirname(input.sourceFile)):await issueWorkParticipantRecoveryHttpRead(db,target,{...request,username},dirname(input.sourceFile));await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}
    const path='/api/operations/recovery-read/'+admission.id+'/conversation',headers={host:new URL(target.origin).host,cookie:sessionCookieName({...getServerConfig(),TURAS_APP_ORIGIN:target.origin})+'='+admission.actor.token,'x-turas-recovery-read':admission.secret};
    const read=(suffix='',extra:Record<string,string>={})=>withTargetRuntime(input,target,()=>GET(new Request(target.origin+path+suffix,{headers:{...headers,...extra}}),{params:Promise.resolve({admissionId:admission.id})}));
    try{
     expect((await read('',{'x-turas-recovery-read':'x'.repeat(43)})).status).toBe(403);
     expect((await read('?record='+randomUUID())).status).toBe(403);
     expect((await HEAD()).status).toBe(403);
     const response=await read();expect(response.status).toBe(200);expect((await response.json()).data).toMatchObject({id:record.id,ownerPrincipalId:DEMO_IDS[username]});
     if(username==='partner'){
      await db.query("UPDATE customer_grants SET state='revoked' WHERE membership_id=$1 AND customer_id=$2",[admission.actor.membershipId,record.customerId]);
      expect((await read()).status).toBe(404);
      await db.query("UPDATE customer_grants SET state='active' WHERE membership_id=$1 AND customer_id=$2",[admission.actor.membershipId,record.customerId]);
     }else expect((await read()).status).toBe(200);
     expect((await read()).status).toBe(429);
    }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,admission.id);}
    expect((await read()).status).toBe(403);
    expect((await db.query('SELECT revoked_at IS NOT NULL AS retired FROM login_sessions WHERE id=$1',[admission.actor.sessionId])).rows[0].retired).toBe(true);
   }
   // Even the owner cannot issue a private reference for another principal.
   const foreign=records.get('panel')!;await db.query('BEGIN');
   try{await expect(issueWorkRecoveryHttpRead(db,target,{...input.scope,workspaceId:DEMO_IDS.workspace,customerId:foreign.customerId,deadline:Math.min(target.deadline,Date.now()+59000),password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:1,deploymentId:target.deploymentId,readKind:'conversation',recordId:foreign.id},dirname(input.sourceFile))).rejects.toThrow('private recovery conversation binding');}
   finally{await db.query('ROLLBACK');}
   const {measureWorkConversationHttpBatch,requireMeasuredWorkConversationHttpCoverage,requireCurrentWorkConversationHttpCoverage}=await import('../../../lib/server/operations/work-conversation-http');
   const {GET:ordinaryRead}=await import('../../../app/api/conversations/[id]/route');
   let corrupt=false;
   const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
    const incoming=new Request(raw,options),url=new URL(incoming.url),requestHeaders=new Headers(incoming.headers);requestHeaders.set('host',url.host);
    if(url.origin!==target.origin||incoming.method!=='GET')throw Error('Controlled conversation HTTP left exact target');
    const request=new Request(incoming,{headers:requestHeaders});
    if(url.pathname.startsWith('/api/conversations/'))return withTargetRuntime(input,target,()=>ordinaryRead(request,{params:Promise.resolve({id:url.pathname.split('/').at(-1)!})}));
    const id=url.pathname.split('/')[4];
    const response=await withTargetRuntime(input,target,()=>GET(request,{params:Promise.resolve({admissionId:id})}));
    if(corrupt&&response.status===200){const body=await response.json();body.data.title='Controlled changed projection';return Response.json(body,{headers:response.headers});}return response;
   });
   try{
    const args={target:input,recordIds:[...records.values()].map(record=>record.id),passwords:{mcteer:process.env.TURAS_DEMO_PASSWORD!,panel:process.env.PANEL_PASSWORD!,partner:process.env.PARTNER_PASSWORD!},journalDirectory:dirname(input.sourceFile)};
    const proof=await measureWorkConversationHttpBatch(args);expect(proof).toMatchObject({privateConversationHttpVerified:true,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false});expect(proof.observations).toHaveLength(3);expect(proof.observations.every(row=>row.status===200)).toBe(true);
    await withLockedWorkRecoveryDecision(input,async(owner,current)=>{
     expect(await requireMeasuredWorkConversationHttpCoverage(owner,current,[proof])).toMatchObject({conversations:3,privateConversationHttpVerified:true,requiredScopeHealthy:false});
     const {auditRecoveryConversationReads}=await import('../../../lib/server/operations/recovery-conversation-reads');
     const canonical=await auditRecoveryConversationReads(owner,current,args.passwords,args.journalDirectory);
     expect(await requireCurrentWorkConversationHttpCoverage(owner,current,[proof],canonical)).toMatchObject({conversations:3,currentCanonicalAuthorizationVerified:true,requiredScopeHealthy:false});
     await expect(requireCurrentWorkConversationHttpCoverage(owner,current,[proof],{...canonical})).rejects.toThrow('Genuine current');
     await owner.query('SAVEPOINT canonical_conversation_state_drift');
     try{await owner.query('UPDATE memberships SET active=false WHERE id=$1',[DEMO_IDS.panelMembership]);await expect(requireCurrentWorkConversationHttpCoverage(owner,current,[proof],canonical)).rejects.toThrow('authorization state changed');}
     finally{await owner.query('ROLLBACK TO SAVEPOINT canonical_conversation_state_drift');await owner.query('RELEASE SAVEPOINT canonical_conversation_state_drift');}


     await expect(requireMeasuredWorkConversationHttpCoverage(owner,current,[{...proof}])).rejects.toThrow('Genuine fresh');
     await expect(requireMeasuredWorkConversationHttpCoverage(owner,current,[proof,proof])).rejects.toThrow('Complete unique');
     await expect(requireMeasuredWorkConversationHttpCoverage(owner,current,[])).rejects.toThrow('Complete private');
    });
    corrupt=true;await expect(measureWorkConversationHttpBatch(args)).rejects.toThrow('canonical projection differs');corrupt=false;
   }finally{transport.mockRestore();}
   expect((await db.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
  });
 },async owner=>{
  const {issueSession,getCurrentSession,sessionCookieName}=await import('../../../lib/server/auth/sessions');
  for(const username of ['mcteer','panel','partner'] as const){
   const membershipId=DEMO_IDS[username==='mcteer'?'mcteerMembership':username==='panel'?'panelMembership':'partnerMembership'],member=(await owner.query('SELECT kind,role FROM memberships WHERE id=$1',[membershipId])).rows[0];
   const session=await issueSession({principalId:DEMO_IDS[username],loginName:username,displayName:username,membershipId,workspaceId:DEMO_IDS.workspace,kind:member.kind,role:member.role});
   const actor=(await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+'='+session.token}})))!,customerId=username==='panel'?null:DEMO_IDS.sharedCustomer;
   const created=await createOwnedConversation(actor,{customerId,requestKey:randomUUID()},owner as unknown as PoolClient);records.set(username,{id:created.conversation.id,customerId});
  }
 });
},210000);

it('binds an unrelated released Production pool with durable owner nonces and refuses override URLs replayed phases and false routing',async()=>{
 const {withPilotEnvironment}=await import('../../../scripts/pilot-environment');
 const {measureWorkLegacyProductionPool,requireMeasuredWorkLegacyProductionPool,retireOriginalWorkLegacyProductionNonce}=await import('../../../lib/server/operations/work-legacy-production-pool');
 const {hashSessionToken}=await import('../../../lib/server/auth/sessions');
 const {readdir}=await import('node:fs/promises');
 await withPilotEnvironment(async peerEnvironment=>{
  const peerConnection=requireOwnedPilotDatabase(process.env,true),peer=new Client({connectionString:peerConnection});await peer.connect();
  try{await fixture(async input=>{
   const root=dirname(input.sourceFile),peerUrl=new URL(peerConnection);peerUrl.hostname='production.fixture.neon.tech';peerUrl.port='';peerUrl.search='?sslmode=verify-full';state.connections.set(peerUrl.href,peerConnection);
   const sourceFile=join(root,'peer-source-private.json'),source={contract:'pilot-database-safety-source-v1',projectId:'prj_recovery',environmentId:peerEnvironment.environmentId,target:'production',schemaVersion:77,connectionBinding:'protected-operator-connection',databaseUrl:peerUrl.href};await writeFile(sourceFile,JSON.stringify(source),{mode:0o600});
   let mode:'normal'|'wrong-routing'|'changed-response'|'changed-cron'='normal',calls=0;const legacy='f8d196fad60a96698656188074d0abe668bc7991';
   const targetOwner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await targetOwner.connect();
   const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
    calls++;const request=new Request(raw,options),url=new URL(request.url);if(request.method!=='GET')throw Error('Peer metadata and auth GETs only');
    if(url.origin==='https://api.vercel.com'){
     if(request.headers.get('authorization')!=='Bearer controlled-peer-token')throw Error('Exact controlled peer operator required');
     if(url.pathname==='/v9/projects/prj_recovery')return Response.json({id:'prj_recovery',accountId:'team_recovery',targets:{production:{id:'dpl_production'}},crons:{deploymentId:'dpl_production',enabledAt:1000,disabledAt:null,updatedAt:1000,definitions:[{host:'production.vercel.app',path:'/api/internal/research-maintenance',schedule:'17 3 * * *'},{host:'production.vercel.app',path:'/eve/v1/turas/watchdog',schedule:mode==='changed-cron'?'*/2 * * * *':'* * * * *'}]},protectionBypass:{controlled_peer_key:{scope:'automation-bypass',createdAt:1000,createdBy:'operator'}}});
     if(url.pathname==='/v13/deployments/dpl_production')return Response.json({id:'dpl_production',projectId:'prj_recovery',ownerId:'team_recovery',target:'production',readyState:'READY',url:'production.vercel.app',meta:{githubCommitSha:legacy}});
     throw Error('Unexpected peer metadata route');
    }
    if(url.origin!=='https://production.vercel.app'||url.pathname!=='/api/auth/session'||url.search||request.headers.get('x-vercel-protection-bypass')!=='controlled_peer_key')throw Error('Exact immutable peer auth GET required');
    const nonce=request.headers.get('cookie')?.match(/^__Host-turas_session=([A-Za-z0-9_-]{43})$/)?.[1];if(!nonce)throw Error('Controlled normal secure cookie required');
    const owner=mode==='wrong-routing'?targetOwner:peer;
    // Actual independent077 database and released auth projection. Only its
    // cloud transport is controlled; this is not hosted peer acceptance.
    const row=(await owner.query(`SELECT s.expires_at,p.id AS principal_id,p.login_name,p.display_name,m.id AS membership_id,m.workspace_id,m.kind,m.role
     FROM login_sessions s JOIN principals p ON p.id=s.principal_id JOIN memberships m ON m.principal_id=p.id JOIN workspaces w ON w.id=m.workspace_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND p.active AND m.active AND w.active ORDER BY m.id LIMIT 1`,[hashSessionToken(nonce)])).rows[0];
    if(!row)return Response.json({error:{code:'authentication_required'}},{status:401,headers:{'cache-control':'private, no-store'}});
    return Response.json({data:{principal:{id:row.principal_id,loginName:row.login_name,displayName:row.display_name},workspace:{id:mode==='changed-response'?randomUUID():row.workspace_id},membership:{id:row.membership_id,kind:row.kind,role:row.role},expiresAt:row.expires_at.toISOString(),csrfToken:'a'.repeat(64)}},{headers:{'cache-control':'private, no-store'}});
   });
   try{
    const args={target:input,productionSourceFile:sourceFile,token:'controlled-peer-token',journalDirectory:root};
    for(const parameter of ['statement_timeout','query_timeout','connectionTimeoutMillis','options','host']){
     const unsafe=new URL(peerUrl);unsafe.searchParams.set(parameter,parameter==='host'?'foreign.example.com':'0');const file=join(root,'unsafe-'+parameter+'.json');await writeFile(file,JSON.stringify({...source,databaseUrl:unsafe.href}),{mode:0o600});const count=calls;
     await expect(measureWorkLegacyProductionPool({...args,productionSourceFile:file})).rejects.toThrow();expect(calls).toBe(count);
    }
    const duplicate=new URL(peerUrl);duplicate.searchParams.append('sslmode','verify-full');const duplicateFile=join(root,'duplicate-ssl.json');await writeFile(duplicateFile,JSON.stringify({...source,databaseUrl:duplicate.href}),{mode:0o600});const beforeInvalid=calls;await expect(measureWorkLegacyProductionPool({...args,productionSourceFile:duplicateFile})).rejects.toThrow();expect(calls).toBe(beforeInvalid);
    const beforeSyncFailure=calls;state.directorySyncFailurePath=root;
    try{await expect(measureWorkLegacyProductionPool({...args,journalDirectory:join(root,'sync-failure')})).rejects.toThrow('parent namespace sync failure');expect(calls).toBe(beforeSyncFailure);expect((await peer.query('SELECT count(*)::int AS active FROM login_sessions WHERE revoked_at IS NULL')).rows[0].active).toBe(0);}
    finally{state.directorySyncFailurePath=null;}
    const proof=await measureWorkLegacyProductionPool(args);expect(proof).toMatchObject({ownerIssuedNonceRetired:true,legacyProductionRuntimePoolExcluded:true,reviewedPeerCronRuntimeExcluded:true,passwordAuthenticationVerified:false,allProviderIngressClosed:false,restorationReady:false,apiCalls:4,httpCalls:3});
    const initialCalls=calls;await expect(measureWorkLegacyProductionPool(args)).rejects.toThrow();expect(calls).toBe(initialCalls);
    await withLockedWorkRecoveryDecision(input,async(db,target)=>{
     const count=calls;await expect(requireMeasuredWorkLegacyProductionPool(db,target,{...proof},input.signal)).rejects.toThrow('Genuine fresh');expect(calls).toBe(count);
     expect(await requireMeasuredWorkLegacyProductionPool(db,target,proof,input.signal)).toBe(proof);const repeated=calls;await expect(requireMeasuredWorkLegacyProductionPool(db,target,proof,input.signal)).rejects.toThrow();expect(calls).toBe(repeated);
    });
    const journal=join(root,(await readdir(root)).find(name=>name.startsWith('peer-pool-'))!);
    expect(await retireOriginalWorkLegacyProductionNonce(journal,'initial')).toMatchObject({retired:true,newNonceIssued:false,requestEnvelopeReset:false});
    const original=JSON.parse(await readFile(join(journal,'initial-credentials-private.json'),'utf8'));await peer.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[original.id]);expect(await retireOriginalWorkLegacyProductionNonce(journal,'initial')).toMatchObject({retired:true,newNonceIssued:false});
    for(const scenario of ['wrong-routing','changed-response','changed-cron'] as const){mode=scenario;await expect(measureWorkLegacyProductionPool({...args,journalDirectory:join(root,scenario)})).rejects.toThrow();}mode='normal';
    expect((await peer.query('SELECT count(*)::int AS active FROM login_sessions WHERE revoked_at IS NULL')).rows[0].active).toBe(0);
    expect((await targetOwner.query('SELECT count(*)::int AS probes FROM login_sessions WHERE principal_id=$1 AND revoked_at IS NULL',[DEMO_IDS.mcteer])).rows[0].probes).toBe(0);
    expect((await targetOwner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
   }finally{transport.mockRestore();await targetOwner.end();}
  });}finally{await peer.end();}
 },{postgresMajor:18,priorSchema:77,deadlineMs:240000});
},270000);


it('measures authenticated positive cron refusal under the real owner decision and rejects copied reused and false response proofs',async()=>{for(const environment of ['preview','production'] as const)await fixture(async input=>{
 const {measureWorkCronAdmission,requireMeasuredWorkCronAdmission}=await import('../../../lib/server/operations/work-cron-admission');
 const {GET:researchMaintenance}=await import('../../../app/api/internal/research-maintenance/route');
 const {authorizeHeavyDispatch,assertHostedDispatchReady}=await import('../../../lib/server/operations/dispatch');
 const {failure,success}=await import('../../../lib/contracts/http');
 const secret=randomBytes(32).toString('base64url'),prior=process.env.CRON_SECRET;process.env.CRON_SECRET=secret;
 let calls=0,metadataCalls=0,corrupt=false,changedCron=false;
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
  const request=new Request(url,options),address=new URL(request.url);
  if(address.origin==='https://api.vercel.com'){
   metadataCalls++;if(address.pathname==='/v9/projects/prj_recovery')return Response.json({id:'prj_recovery',accountId:'team_recovery',targets:{production:{id:'dpl_recovery'}},crons:{deploymentId:'dpl_recovery',definitions:[['/eve/v1/turas/watchdog','* * * * *'],['/api/internal/research-maintenance',changedCron?'* * * * *':'17 3 * * *'],['/eve/v1/turas/jobs','* * * * *']].map(([path,schedule])=>({path,schedule,host:'recovery.vercel.app'}))}});
   if(address.pathname==='/v13/deployments/dpl_recovery')return Response.json({id:'dpl_recovery',projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:'production',url:'recovery.vercel.app',meta:{githubCommitSha:state.commit}});throw Error('Unexpected cron metadata path');
  }
  if(address.origin!==input.hostedScope.origin||!['/api/internal/research-maintenance','/eve/v1/turas/jobs'].includes(address.pathname))throw Error('Controlled cron transport left target');calls++;
  const response=await withTargetRuntime(input,{origin:input.hostedScope.origin,deploymentId:input.hostedScope.deploymentId,sourceCommit:input.hostedScope.sourceCommit} as Parameters<typeof withTargetRuntime>[1],async()=>{
   if(address.pathname==='/api/internal/research-maintenance')return researchMaintenance(request);
   try{authorizeHeavyDispatch(request);await assertHostedDispatchReady();return success({status:'accepted'});}catch(error){return failure(error);}
  });
  if(corrupt&&response.status===503)return Response.json({error:{code:'fabricated'}},{status:503,headers:response.headers});return response;
 });
 try{
  const args={target:input,token:'controlled-platform-token',cronSecret:secret,protectionBypass:'controlled-current-bypass-key'},proof=await measureWorkCronAdmission(args);expect(calls).toBe(4);expect(proof).toMatchObject({currentPositiveCronAdmissionClosed:true,legacyProductionPeerProofRequired:environment==='preview',watchdogCleanupStopped:false,restorationReady:false});
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{await expect(requireMeasuredWorkCronAdmission(db,target,{...proof},input.signal)).rejects.toThrow('Genuine fresh unused');expect(calls).toBe(4);expect(await requireMeasuredWorkCronAdmission(db,target,proof,input.signal)).toBe(proof);expect(calls).toBe(8);await expect(requireMeasuredWorkCronAdmission(db,target,proof,input.signal)).rejects.toThrow('Genuine fresh unused');expect(calls).toBe(8);});
  expect(metadataCalls).toBe(environment==='production'?8:0);
  if(environment==='production'){changedCron=true;await expect(measureWorkCronAdmission(args)).rejects.toThrow('Exact current Production cron deployment required');changedCron=false;expect(calls).toBe(8);}
  corrupt=true;await expect(measureWorkCronAdmission(args)).rejects.toThrow('Actual authenticated locked cron admission unverified');
 }finally{transport.mockRestore();if(prior===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prior;}
},undefined,environment);},210000);


it('preserves original provider journals including unknown embedding quota and rejects altered usage missing rows and copied retained authority',async()=>fixture(async input=>{
 const {auditRecoveryProviderJournals}=await import('../../../lib/server/operations/recovery-provider-journal-audit');
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{
  let historyMutation:'none'|'missing'|'changed'|'reordered'|'key-digest'='none';const id=randomUUID();await owner.query("INSERT INTO retrieval_embedding_operations(id,environment_id,operation_kind,operation_key,state,embedding_contract,model_id,dimensions,input_characters,dispatched_at) VALUES($1::uuid,$2,'query',$1::text,'dispatched','embedding-v1','openai/text-embedding-3-small',1536,100,clock_timestamp())",[id,input.scope.environmentId]);
  await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async (retained,refreshHistory)=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);
   await withLockedWorkRecoveryDecision(input,async(db,target)=>{
    const proof=await auditRecoveryProviderJournals(db,target,retained);expect(proof).toMatchObject({originalProviderJournalsPreserved:true,unknownOutcomesSettled:false,providerExecutionClosed:false,restorationReady:false});expect(proof.rows).toBeGreaterThanOrEqual(1);expect(retained.snapshot.tables.some(table=>table.name==='staffing_model_step_usage_receipts')).toBe(true);
    await expect(auditRecoveryProviderJournals(db,target,{...retained})).rejects.toThrow();
    for(const sql of ["UPDATE retrieval_embedding_operations SET input_characters=1 WHERE id=$1","UPDATE retrieval_embedding_operations SET state='succeeded',completed_at=clock_timestamp() WHERE id=$1","DELETE FROM retrieval_embedding_operations WHERE id=$1"]){
     await db.query('SAVEPOINT original_provider_journal');await db.query(sql,[id]);await expect(auditRecoveryProviderJournals(db,target,retained)).rejects.toThrow(/original provider|Original provider/);await db.query('ROLLBACK TO SAVEPOINT original_provider_journal');await db.query('RELEASE SAVEPOINT original_provider_journal');
    }
    expect((await db.query('SELECT state,input_characters FROM retrieval_embedding_operations WHERE id=$1',[id])).rows).toEqual([{state:'dispatched',input_characters:100}]);
    expect((await db.query('SELECT count(*)::int AS n FROM plan_model_step_receipts')).rows[0].n).toBeGreaterThanOrEqual(1);
   });
   const historyBaseline=await refreshHistory(),history=beginRetainedWorkDenialHistory(historyBaseline),historyCurrent=await refreshHistory();let advanced=advanceRetainedWorkDenialHistory(history,historyCurrent);
   historyMutation='reordered';const reordered=await refreshHistory();advanced=advanceRetainedWorkDenialHistory(advanced,reordered);expect(requireRetainedWorkDenialHistory(advanced,reordered,input.scope.environmentId).current).toBe(reordered);
   historyMutation='key-digest';const keyChanged=await refreshHistory();expect(()=>advanceRetainedWorkDenialHistory(advanced,keyChanged)).toThrow('Original retained history identity or replay key');
   historyMutation='missing';const missingHistory=await refreshHistory();expect(()=>advanceRetainedWorkDenialHistory(advanced,missingHistory)).toThrow('Original retained history identity');expect(requireRetainedWorkDenialHistory(advanced,reordered,input.scope.environmentId).current).toBe(reordered);
   historyMutation='changed';const changedHistory=await refreshHistory();expect(()=>advanceRetainedWorkDenialHistory(advanced,changedHistory)).toThrow('Original retained effect or accounting row changed');historyMutation='none';
   for(const table of ['plan_model_step_receipts','staffing_model_step_usage_receipts']){
    await owner.query('ALTER TABLE '+table+' RENAME TO '+table+'_missing');
    try{await expect(withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryProviderJournals(db,target,retained))).rejects.toThrow('Complete original provider journal table inventory differs');}
    finally{await owner.query('ALTER TABLE '+table+'_missing RENAME TO '+table);}
   }
  },snapshot=>{if(historyMutation==='none')return;if(historyMutation==='reordered'){for(const table of snapshot.tables){table.replayKeyColumns?.reverse();for(const row of table.rows)row.replayKeys?.reverse();}return;}const table=snapshot.tables.find(table=>table.name==='retrieval_embedding_operations')!;if(historyMutation==='key-digest'){const row=table.rows.find(row=>row.identity.id===id)!;row.replayKeys![0].digest='0'.repeat(64);return;}if(historyMutation==='missing')table.rows=table.rows.filter(row=>row.identity.id!==id);else{const row=table.rows.find(row=>row.identity.id===id)!;row.rowDigest='0'.repeat(64);}});
 }finally{await owner.end();}
},async owner=>{
 const {submitPlanCommand}=await import('../../../lib/server/plans/commands'),{startPlanDraft}=await import('../../../lib/server/plans/drafting'),{syntheticPlanContent}=await import('../../fixtures/plans/seed');
 const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary'),content=syntheticPlanContent();content.assertions=[];content.sourceDependencies=[];
 await owner.query('BEGIN');try{const created=await submitPlanCommand(f.actor,{action:'create',requestKey:'plan_'+randomUUID(),workspaceId:f.actor.workspaceId,customerId:f.customerId,workloadId:null,audience:'delivery',ownerMembershipId:f.actor.membershipId,content},owner as unknown as PoolClient);
 const attempt=(await startPlanDraft(f.actor,{requestKey:randomUUID(),planId:created.planId,baseRevisionId:created.revisionId,expectedAggregateVersion:created.aggregateVersion,instructions:'Synthetic journal preservation without dispatch'},owner as unknown as PoolClient)).attemptId;
 await owner.query("INSERT INTO plan_model_step_receipts(attempt_id,turn_id,step_index,operation_id,provider_state) VALUES($1,'synthetic-retained-turn',0,$2,'admitted')",[attempt,randomUUID()]);await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
}),210000);

it('composes genuine current ingress terminal providers and original held effects on one unchanged owner transaction',async()=>fixture(async input=>{
 const {measureWorkCronAdmission}=await import('../../../lib/server/operations/work-cron-admission');
 const {verifyWorkRecoveryEffects,requireVerifiedWorkRecoveryEffects}=await import('../../../lib/server/operations/work-recovery-effects');
 const {GET:researchMaintenance}=await import('../../../app/api/internal/research-maintenance/route');
 const {authorizeHeavyDispatch,assertHostedDispatchReady}=await import('../../../lib/server/operations/dispatch');
 const {failure,success}=await import('../../../lib/contracts/http');
 const key='controlled_effects_automation_key',host='recovery.vercel.app',token='controlled-effects-token',secret=randomBytes(32).toString('base64url'),previous=process.env.CRON_SECRET;process.env.CRON_SECRET=secret;
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();let writes=0;
 const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(raw,options)=>{
  const request=new Request(raw,options),url=new URL(request.url);if(request.method!=='GET'){writes++;throw Error('Effects measurement attempted provider mutation');}
  if(url.origin==='https://api.vercel.com'){
   if(url.pathname==='/v9/projects/prj_recovery')return Response.json({id:'prj_recovery',accountId:'team_recovery',targets:{production:{id:'dpl_recovery'}},protectionBypass:{[key]:{scope:'automation-bypass',isEnvVar:false,note:'Controlled current key',createdAt:1000,createdBy:'operator'}},crons:{deploymentId:'dpl_recovery',definitions:[['/eve/v1/turas/watchdog','* * * * *'],['/api/internal/research-maintenance','17 3 * * *'],['/eve/v1/turas/jobs','* * * * *']].map(([path,schedule])=>({path,schedule,host}))}});
   if(url.pathname.startsWith('/v13/deployments/'))return Response.json({id:'dpl_recovery',url:host,projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:'production',meta:{githubCommitSha:state.commit}});
   if(url.pathname==='/v6/deployments')return Response.json({deployments:[{uid:'dpl_recovery',url:host,projectId:'prj_recovery',created:1000,target:'production',readyState:'READY'}],pagination:{next:null}});
   if(url.pathname==='/v4/aliases')return Response.json({aliases:[],pagination:{count:0,next:null,prev:null}});
   if(url.pathname==='/v1/workflow/v2/runs')return Response.json({data:[],cursor:null,hasMore:false});
   if(url.pathname==='/v1/security/firewall/config/active')return Response.json({firewallEnabled:true,crs:{general:{active:false,action:'log'}},updatedAt:'2026-10-19T00:00:00Z',projectKey:'prj_recovery#active',id:'config_effects',ips:[],changes:[],version:1,ownerId:'team_recovery',rules:[{id:'rule_effects',name:'Current host',description:'Controlled fence',active:true,valid:true,validationErrors:null,conditionGroup:[{conditions:[{type:'host',op:'ninc',value:[host]}]}],action:{mitigate:{action:'deny'}}}]});
   if(url.pathname==='/v1/security/firewall/bypass/rules')return Response.json({error:{code:'forbidden',message:'Conditional bypass is unavailable for this team.'}},{status:403});
   if(url.pathname==='/v1/security/firewall/bypass')return Response.json({result:[]});throw Error('Unexpected effects platform route');
  }
  if(url.origin==='https://vercel.com'&&url.pathname==='/api/v2/sandboxes')return Response.json({sandboxes:[],pagination:{count:0,next:null}});
  if(url.hostname!==host)throw Error('Effects app request left exact host');
  if(['/api/internal/research-maintenance','/eve/v1/turas/jobs'].includes(url.pathname))return withTargetRuntime(input,{origin:input.hostedScope.origin,deploymentId:input.hostedScope.deploymentId,sourceCommit:input.hostedScope.sourceCommit} as Parameters<typeof withTargetRuntime>[1],async()=>{
   if(url.pathname==='/api/internal/research-maintenance')return researchMaintenance(request);try{authorizeHeavyDispatch(request);await assertHostedDispatchReady();return success({status:'accepted'});}catch(error){return failure(error);}
  });
  if(url.pathname!=='/api/auth/session')throw Error('Effects app requested normal work');
  const original=url.origin+'/api/auth/session',header=request.headers.has('x-vercel-protection-bypass'),query=url.searchParams.has('x-vercel-protection-bypass'),cookie=request.headers.has('cookie');
  if(!header&&!query&&!cookie)return new Response(null,{status:302,headers:{location:'https://vercel.com/sso-api?url='+encodeURIComponent(original)}});
  if(request.headers.has('x-vercel-set-bypass-cookie'))return new Response(null,{status:307,headers:{location:original,'set-cookie':'_vercel_jwt=controlled_effects_cookie; Path=/; Secure; HttpOnly; SameSite=Lax'}});
  return Response.json({error:{code:'authentication_required'}},{status:401,headers:{'x-turas-code-version':state.commit}});
 });
 try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
  await quarantineRestoredAuthority(owner,input.scope,retained);
  const cron=await measureWorkCronAdmission({target:input,token,cronSecret:secret,protectionBypass:key});
  const journal=await PilotHostHttpJournal.create(join(dirname(input.sourceFile),'effects-http-journal'),{contract:'pilot-host-http-journal-plan-v1',id:randomUUID(),projectId:'prj_recovery',teamId:'team_recovery',sourceCommit:state.commit,maximumRequests:10,maximumCostMicroUsd:100000,expiresAt:new Date(Date.now()+3600000).toISOString(),authorityReference:'Controlled owned effects authority',previousJournalDigests:['b'.repeat(64)],historicalStrictFailureRetained:true,unknownCostHoldsRetained:true,automaticRetries:false});
  const oldHttp=await measureWorkOldHttpAdmission({target:input,token,approvedHosts:[host],journal}),native=await measureWorkManagedTerminalInventory({target:input,token,retained}),sandbox=await measureWorkSandboxTerminalInventory({target:input,token,retained});
  let retainedProof:Awaited<ReturnType<typeof verifyWorkRecoveryEffects>>|undefined;
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{
   await expect(verifyWorkRecoveryEffects(db,target,retained,{cron:{...cron},oldHttp,native,sandbox},input.signal,beginRetainedWorkDenialHistory(retained))).rejects.toThrow('Genuine fresh unused');
   const proof=await verifyWorkRecoveryEffects(db,target,retained,{cron,oldHttp,native,sandbox},input.signal,beginRetainedWorkDenialHistory(retained));retainedProof=proof;expect(proof).toMatchObject({terminalProviderInventoriesVerified:true,originalFinancialAccountingPreserved:true,permanentRequestFencesVerified:true,unknownEffectsSettled:false,requiredScopeHealthy:false,restorationReady:false});
   expect(await requireVerifiedWorkRecoveryEffects(db,target,proof)).toBe(proof);await expect(requireVerifiedWorkRecoveryEffects(db,target,{...proof})).rejects.toThrow('Actual unchanged');
   await db.query('SAVEPOINT effects_state');await db.query("UPDATE customer_references SET display_name='Changed effects state' WHERE id=$1",[DEMO_IDS.sharedCustomer]);await expect(requireVerifiedWorkRecoveryEffects(db,target,proof)).rejects.toThrow('Actual unchanged');await db.query('ROLLBACK TO SAVEPOINT effects_state');await db.query('RELEASE SAVEPOINT effects_state');expect(await requireVerifiedWorkRecoveryEffects(db,target,proof)).toBe(proof);
  });
  await withLockedWorkRecoveryDecision(input,async(db,target)=>{await expect(requireVerifiedWorkRecoveryEffects(db,target,retainedProof!)).rejects.toThrow('Actual unchanged');});
  expect(writes).toBe(0);expect(journal.status()).toMatchObject({reserved:10,observed:10,pending:0,remaining:0});expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_verifications')).rows[0].n).toBe(0);
 });}finally{transport.mockRestore();if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;await owner.end();}
},undefined,'production'),210000);

it('fences recovered processing business intents after row loss while permitting new jobs with actual finite cost admission',async()=>{
 let hosted='',local='',domain='';
 await fixture(async input=>{
  const {reserveServiceCost,serviceBudgetAuthority}=await import('../../../lib/server/operations/cost');
  const {admitHostedJob,cancelHostedJob}=await import('../../../lib/server/operations/hosted-jobs');
  const {admitLocalJob}=await import('../../../lib/server/operations/local-jobs');
  const {currentRecoveryStateDigest}=await import('../../../lib/server/operations/recovery-state');
  const {resolveRecoveryQuarantines}=await import('../../../lib/server/operations/recovery-resolution');
  const {transitionRecoveryControl}=await import('../../../lib/server/operations/control');
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:input.runtimeConnection});await owner.connect();await runtime.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);
   const {auditRecoveryResumptionAdmission}=await import('../../../lib/server/operations/recovery-resumption-admission'),{fenceCurrentRecoveryJobs}=await import('../../../lib/server/operations/recovery-current-job-fences');
   await expect(withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveryResumptionAdmission(db,target,retained))).rejects.toThrow('Current original positive job lacks permanent admission fence');
   await withLockedWorkRecoveryDecision(input,async(db,target)=>{await fenceCurrentRecoveryJobs(db,target,retained);expect(await auditRecoveryResumptionAdmission(db,target,retained)).toMatchObject({applicationResumptionAdmissionVerified:true,providerCredentialsRevoked:false});});

   expect(await withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveredRequestFencesInTransaction(db,retained.snapshot,{...input.scope,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt}))).toMatchObject({permanentRequestFencesVerified:true});
   const snapshot=structuredClone(retained.snapshot),table=snapshot.tables.find(value=>value.name==='operations_hosted_jobs')!,key=['domain_job_id','domain_kind','environment_id'];table.replayKeyColumns=table.replayKeyColumns!.filter(value=>JSON.stringify(value)!==JSON.stringify(key));for(const row of table.rows)row.replayKeys=row.replayKeys!.filter(value=>JSON.stringify(value.columns)!==JSON.stringify(key));
   const {recoveryDigest}=await import('../../../lib/contracts/pilot-recovery'),{snapshotDigest:_digest,currentAuthorityVerified:_authority,replayReconciled:_replay,restorationReady:_ready,...content}=snapshot;snapshot.snapshotDigest=recoveryDigest(content);
   await expect(withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveredRequestFencesInTransaction(db,snapshot,{...input.scope,snapshotDigest:snapshot.snapshotDigest,backupCapturedAt:retained.backupCapturedAt}))).rejects.toThrow('Complete authored recovery job business keys required');
   await owner.query('DELETE FROM operations_hosted_jobs WHERE id=$1',[hosted]);await owner.query('DELETE FROM operations_local_jobs WHERE id=$1',[local]);
   const insertHosted=(db:Client,selected=domain)=>db.query("INSERT INTO operations_hosted_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,code_version,lease_id,lease_expires_at,creation_tag,image_digest,state,deadline_at,input_digest,input_bytes,budget_reservation_id) VALUES($1,$2,'artifact',$3,1,repeat('a',64),repeat('a',40),$4,clock_timestamp()+interval '20 seconds',$5,repeat('a',64),'admitted',clock_timestamp()+interval '1 minute',repeat('a',64),16,$6)",[randomUUID(),input.scope.environmentId,selected,randomUUID(),randomUUID(),randomUUID()]);
   await expect(insertHosted(runtime)).rejects.toThrow();await expect(insertHosted(owner)).rejects.toThrow();
   // Controlled SQL verification exercises the owned reopen fence only. It is
   // not hosted service/provider proof and is never used by a release command.
   await owner.query('BEGIN');const stateDigest=await currentRecoveryStateDigest(owner);await owner.query('COMMIT');const verification=randomUUID(),bundle='f'.repeat(64);
   await owner.query(`INSERT INTO operations_recovery_verifications(id,environment_id,recovery_id,control_revision,bundle_digest,ledger_digest,objects_digest,current_state_digest,denial_digest,replay_digest,workflow_digest,scope_digest,required_scope_healthy,integrity_verified,denial_verified,replay_verified,workflow_verified) VALUES($1,$2,$3,$4,$5,$5,$5,$6,$5,$5,$5,$5,true,true,true,true,true)`,[verification,input.scope.environmentId,input.scope.recoveryId,input.scope.controlRevision,bundle,stateDigest]);
   await resolveRecoveryQuarantines(owner,{...input.scope,verificationId:verification});await transitionRecoveryControl(owner,{environmentId:input.scope.environmentId,recoveryId:input.scope.recoveryId,expectedRevision:input.scope.controlRevision,operationId:randomUUID(),mode:'open',verifiedBundleDigest:bundle});
   await expect(insertHosted(runtime)).rejects.toThrow('Recovered permanent request cannot be repeated');await expect(insertHosted(owner)).rejects.toThrow('Recovered permanent request cannot be repeated');
   const localInput={id:randomUUID(),domainKind:'artifact',domainJobId:domain,sourceGeneration:1,sourceDigest:'a'.repeat(64),imageDigest:'a'.repeat(64),deadlineAt:new Date(Date.now()+30000).toISOString()};
   await expect(admitLocalJob(runtime as unknown as PoolClient,localInput,async()=>true)).rejects.toThrow('Recovered permanent request cannot be repeated');
   const budgetId=randomUUID(),digest='d'.repeat(64);await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$3,$3,1000,clock_timestamp()+interval '1 hour')",[budgetId,input.scope.environmentId,digest]);
   const binding={budgetId,environmentId:input.scope.environmentId,category:'sandbox' as const,scopeDigest:digest,pricingDigest:digest,operationDigest:'e'.repeat(64)},budget=serviceBudgetAuthority(binding);
   await runtime.query('BEGIN');try{const reservationId=await reserveServiceCost(runtime as unknown as PoolClient,binding,100),handle=await admitHostedJob(runtime as unknown as PoolClient,{environmentId:input.scope.environmentId,domainKind:'artifact',domainJobId:randomUUID(),sourceGeneration:1,sourceDigest:digest,imageDigest:digest,inputDigest:digest,inputBytes:16,deadlineAt:new Date(Date.now()+30000).toISOString(),reservationId},budget,async()=>true);await cancelHostedJob(runtime as unknown as PoolClient,handle,budget);await runtime.query('COMMIT');}catch(error){await runtime.query('ROLLBACK');throw error;}
   const freshLocal=await admitLocalJob(runtime as unknown as PoolClient,{...localInput,id:randomUUID(),domainJobId:randomUUID()},async()=>true);await owner.query("UPDATE operations_local_jobs SET state='failed',finished_at=clock_timestamp() WHERE id=$1",[freshLocal.id]);
  },snapshot=>{const table=snapshot.tables.find(table=>table.name==='operations_local_jobs')!;table.rows=table.rows.filter(row=>row.identity.id!==local);});}finally{await runtime.end();await owner.end();}
 },async owner=>{
  domain=randomUUID();hosted=randomUUID();local=randomUUID();const environmentId=(await owner.query('SELECT environment_id FROM turas_environment')).rows[0].environment_id;
  await owner.query("INSERT INTO operations_hosted_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,code_version,lease_id,lease_expires_at,creation_tag,image_digest,state,deadline_at,input_digest,input_bytes,budget_reservation_id) VALUES($1,$2,'artifact',$3,1,repeat('a',64),repeat('a',40),$4,clock_timestamp()+interval '20 seconds',$5,repeat('a',64),'admitted',clock_timestamp()+interval '1 minute',repeat('a',64),16,$6)",[hosted,environmentId,domain,randomUUID(),randomUUID(),randomUUID()]);await owner.query("UPDATE operations_hosted_jobs SET state='failed',finished_at=clock_timestamp() WHERE id=$1",[hosted]);
  await owner.query("INSERT INTO operations_local_jobs(id,environment_id,domain_kind,domain_job_id,source_generation,source_digest,image_digest,lease_id,deadline_at,lease_expires_at,state) VALUES($1,$2,'artifact',$3,1,repeat('a',64),repeat('a',64),$4,clock_timestamp()+interval '30 seconds',clock_timestamp()+interval '29 seconds','running')",[local,environmentId,domain,randomUUID()]);await owner.query("UPDATE operations_local_jobs SET state='failed',finished_at=clock_timestamp() WHERE id=$1",[local]);
 });
},210000);

it('fences original artifact processing beneath replacement job IDs while leaving denial-only cleanup unfenced',async()=>{
 let runId='',cleanupId='';
 await fixture(async input=>{
  const {currentRecoveryStateDigest}=await import('../../../lib/server/operations/recovery-state');
  const {resolveRecoveryQuarantines}=await import('../../../lib/server/operations/recovery-resolution');
  const {transitionRecoveryControl}=await import('../../../lib/server/operations/control');
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:input.runtimeConnection});await owner.connect();await runtime.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   expect(retained.snapshot.tables.find(table=>table.name==='report_jobs')!.rows.some(row=>row.identity.id===cleanupId)).toBe(false);
   await quarantineRestoredAuthority(owner,input.scope,retained);expect((await owner.query('SELECT state,safe_error_code,attempt_number FROM artifact_extraction_runs WHERE id=$1',[runId])).rows[0]).toEqual({state:'failed',safe_error_code:'recovery_current_proof_unavailable',attempt_number:1});expect((await owner.query('SELECT state FROM report_jobs WHERE id=$1',[cleanupId])).rows[0].state).toBe('queued');
   const original=(await owner.query('SELECT to_jsonb(r) AS value FROM artifact_extraction_runs r WHERE id=$1',[runId])).rows[0].value;
   await owner.query('DELETE FROM artifact_extraction_runs WHERE id=$1',[runId]);
   const snapshot=structuredClone(retained.snapshot),gap=snapshot.tables.find(table=>table.name==='gap_report_jobs')!,columns=['environment_id','input_digest','report_id'];expect(gap.rows).toHaveLength(0);gap.replayKeyColumns=gap.replayKeyColumns!.filter(key=>JSON.stringify(key)!==JSON.stringify(columns));
   const {recoveryDigest}=await import('../../../lib/contracts/pilot-recovery'),{snapshotDigest:_digest,currentAuthorityVerified:_authority,replayReconciled:_replay,restorationReady:_ready,...content}=snapshot;snapshot.snapshotDigest=recoveryDigest(content);
   await expect(withLockedWorkRecoveryDecision(input,(db,target)=>auditRecoveredRequestFencesInTransaction(db,snapshot,{...input.scope,snapshotDigest:snapshot.snapshotDigest,backupCapturedAt:retained.backupCapturedAt}))).rejects.toThrow('Complete authored recovery job business keys required');
   // Synthetic SQL proof is only an owned reopen fixture, never release evidence.
   await owner.query('BEGIN');const digest=await currentRecoveryStateDigest(owner);await owner.query('COMMIT');const verification=randomUUID(),bundle='f'.repeat(64);
   await owner.query(`INSERT INTO operations_recovery_verifications(id,environment_id,recovery_id,control_revision,bundle_digest,ledger_digest,objects_digest,current_state_digest,denial_digest,replay_digest,workflow_digest,scope_digest,required_scope_healthy,integrity_verified,denial_verified,replay_verified,workflow_verified) VALUES($1,$2,$3,$4,$5,$5,$5,$6,$5,$5,$5,$5,true,true,true,true,true)`,[verification,input.scope.environmentId,input.scope.recoveryId,input.scope.controlRevision,bundle,digest]);await resolveRecoveryQuarantines(owner,{...input.scope,verificationId:verification});await transitionRecoveryControl(owner,{environmentId:input.scope.environmentId,recoveryId:input.scope.recoveryId,expectedRevision:input.scope.controlRevision,operationId:randomUUID(),mode:'open',verifiedBundleDigest:bundle});
   const replacement={...original,id:randomUUID(),state:'queued',attempt_number:2,safe_error_code:null};
   await expect(runtime.query('INSERT INTO artifact_extraction_runs SELECT * FROM jsonb_populate_record(NULL::artifact_extraction_runs,$1::jsonb)',[JSON.stringify(replacement)])).rejects.toThrow('Recovered permanent request cannot be repeated');
   await expect(owner.query('INSERT INTO artifact_extraction_runs SELECT * FROM jsonb_populate_record(NULL::artifact_extraction_runs,$1::jsonb)',[JSON.stringify(replacement)])).rejects.toThrow('Recovered permanent request cannot be repeated');
   await runtime.query("UPDATE report_jobs SET state='completed' WHERE id=$1",[cleanupId]);expect((await owner.query('SELECT state FROM report_jobs WHERE id=$1',[cleanupId])).rows[0].state).toBe('completed');
   await withTargetRuntime(input,{origin:input.hostedScope.origin,deploymentId:input.hostedScope.deploymentId,sourceCommit:input.hostedScope.sourceCommit} as Parameters<typeof withTargetRuntime>[1],async()=>{
const {createArtifactDatabaseFixture}=await import('../../fixtures/artifact-database'),f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');await owner.query('BEGIN');const fresh=await createArtifactDatabaseFixture(owner as unknown as PoolClient,f.actor,f.customerId);await owner.query('COMMIT');expect(fresh.versionId).not.toBe(original.version_id);expect((await owner.query('SELECT state FROM artifact_extraction_runs WHERE id=$1',[fresh.runId])).rows[0].state).toBe('queued');await owner.query("UPDATE artifact_extraction_runs SET state='failed',safe_error_code='synthetic_cleanup' WHERE id=$1",[fresh.runId]);
   });
  });}finally{await runtime.end();await owner.end();}
 },async owner=>{
  const {createArtifactDatabaseFixture}=await import('../../fixtures/artifact-database'),f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');await owner.query('BEGIN');runId=(await createArtifactDatabaseFixture(owner as unknown as PoolClient,f.actor,f.customerId)).runId;await owner.query('COMMIT');cleanupId=randomUUID();await owner.query("INSERT INTO report_jobs(id,environment_id,workspace_id,customer_id,kind,input,input_digest,owner_membership_id) VALUES($1,$2,$3,$4,'cleanup','{}',repeat('b',64),$5)",[cleanupId,process.env.TURAS_ENVIRONMENT_ID,f.actor.workspaceId,f.customerId,f.actor.membershipId]);
 });
},210000);

it('walks all1479 canonical selections with paginated bounded customer credentials and retires every original probe',async()=>{
 await fixture(async input=>{
  input={...input,signal:AbortSignal.timeout(280000),deadline:Date.now()+270000};
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   const {measureWorkMcpCanonicalScope}=await import('../../../lib/server/operations/work-mcp-branch-verification');
   const proof=await measureWorkMcpCanonicalScope({target:input,passwords:{mcteer:process.env.TURAS_DEMO_PASSWORD!,panel:process.env.PANEL_PASSWORD!,partner:process.env.PARTNER_PASSWORD!},retained,journalDirectory:dirname(input.sourceFile)});
   expect(proof.requiredSelections).toBe(1479);expect(proof.hostedSdkVerified).toBe(false);expect(proof.representatives.length).toBeGreaterThan(0);
   const {readdir}=await import('node:fs/promises'),names=await readdir(dirname(input.sourceFile)),intents=names.filter(name=>/^probe-.*-intent\.json$/.test(name)),retirements=names.filter(name=>/^probe-.*-retired\.json$/.test(name));
   expect(intents).toHaveLength(9);expect(retirements).toHaveLength(9);
   const scopes=await Promise.all(intents.map(async name=>JSON.parse(await readFile(join(dirname(input.sourceFile),name),'utf8'))));
   expect(Math.max(...scopes.map(row=>row.mcp.customerIds.length))).toBe(60);
   for(const row of scopes)expect(Date.parse(row.mcp.expiresAt)-Date.parse(row.recordedAt)).toBeLessThanOrEqual(59000);
   expect((await owner.query('SELECT 1 FROM login_sessions WHERE revoked_at IS NULL LIMIT 1')).rowCount).toBe(0);
   expect((await owner.query('SELECT 1 FROM mcp_connections WHERE revoked_at IS NULL OR credential_hash IS NOT NULL LIMIT 1')).rowCount).toBe(0);
  });}finally{await owner.end();}
 },async owner=>{
  const existing=(await owner.query('SELECT id,workspace_id,synthetic FROM customer_references')).rows;
  if(existing.some(row=>row.workspace_id!==DEMO_IDS.workspace||!row.synthetic)||existing.length>184)throw Error('Exact owned synthetic cohort required');
  const ids=Array.from({length:184-existing.length},()=>randomUUID());await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) SELECT id,$2,'Synthetic bounded census',true FROM unnest($1::uuid[]) id",[ids,DEMO_IDS.workspace]);
 });
},300000);
