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
import {measureWorkMcpCategoryBatch,measureWorkMcpCategory,requireMeasuredWorkMcpCategory,deriveWorkMcpScopeInTransaction,requireMeasuredWorkMcpCoverage} from '../../../lib/server/operations/work-mcp-verification';
import {withRetainedDenialFixture} from '../../fixtures/pilot/retained-denials';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
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
import {withWorkRecoveryReadDeadline,withLockedWorkRecoveryDecision,withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection} from '../../../lib/server/operations/locked-work-recovery-target';
const state=vi.hoisted(()=>({connections:new Map<string,string>(),blobObjects:new Map<string,Uint8Array>(),retainedKey:null as Uint8Array|null,platformChanged:false,sourceChanged:false,dirty:false,cleanupUnavailable:false,commit:'a'.repeat(40),digest:'b'.repeat(64),catalog:'c'.repeat(64)}));
// Actual owned PostgreSQL; only cloud transport/DNS and source attribution are
// controlled. These checks do not establish hosted platform acceptance.
vi.mock('pg',async original=>{const actual=await original<typeof import('pg')>();return {...actual,Client:class extends actual.Client{constructor(config?:import('pg').ClientConfig){if(state.cleanupUnavailable&&config?.connectionString?.includes('fixture.neon.tech'))throw Error('Controlled cleanup connection unavailable');super(config?.connectionString&&state.connections.has(config.connectionString)?{...config,connectionString:state.connections.get(config.connectionString)}:config);}}};});
vi.mock('../../../lib/server/operations/database-binding',async original=>{const actual=await original<typeof import('../../../lib/server/operations/database-binding')>();return {...actual,databaseTargetDigest:(connection:string,environmentId:string,name?:string)=>actual.databaseTargetDigest(state.connections.get(connection)??connection,environmentId,name)};});
vi.mock('../../../scripts/pilot-source',()=>({pilotSource:async()=>({sourceCommit:state.sourceChanged?'d'.repeat(40):state.commit,sourceDigest:state.digest,catalogDigest:state.catalog})}));
vi.mock('../../../scripts/pilot-database-safety-copy',async original=>{const actual=await original<typeof import('../../../scripts/pilot-database-safety-copy')>();return {...actual,verifyDatabaseSafetySourceBinding:async()=>({platformConnectionBindingVerified:true}),readWorkRecoveryKey:async()=>{if(!state.retainedKey)throw Error('Controlled archive key absent');return Buffer.from(state.retainedKey);}};});
vi.mock('../../../scripts/pilot-neon-archive',async original=>{const actual=await original<typeof import('../../../scripts/pilot-neon-archive')>();return {...actual,verifyWorkNeonDestination:async()=>({controlledProviderIdentity:true})};});
vi.mock('node:child_process',async original=>{const actual=await original<typeof import('node:child_process')>(),{promisify}=await import('node:util');const execute=((...args:unknown[])=>Reflect.apply(actual.execFile,actual,args)) as typeof actual.execFile;Object.defineProperty(execute,promisify.custom,{value:async(command:string,args:string[],options:unknown)=>{if(command==='git'&&args[0]==='status')return {stdout:state.dirty?' M authored-source.ts':'',stderr:''};if(command!=='vercel')return (promisify(actual.execFile) as Function)(command,args,options);return {stdout:JSON.stringify({id:state.platformChanged?'dpl_changed':'dpl_recovery',projectId:'prj_recovery',ownerId:'team_recovery',readyState:'READY',target:null,meta:{githubCommitSha:state.commit}}),stderr:''};}});return {...actual,execFile:execute};});
vi.mock('@vercel/blob',async original=>({...await original<typeof import('@vercel/blob')>(),
 get:async(key:string,options:Record<string,unknown>)=>{if(options.storeId!=='syntheticStore'||options.oidcToken!=='synthetic.oidc.identity'||'token' in options)throw Error('Exact controlled OIDC store binding required');const bytes=state.blobObjects.get(key);return bytes?{statusCode:200,blob:{pathname:key,size:bytes.length},stream:new ReadableStream({start(controller){controller.enqueue(Uint8Array.from(bytes));controller.close();}})}:null;},
 list:async(options:Record<string,unknown>)=>{if(options.storeId!=='syntheticStore'||options.oidcToken!=='synthetic.oidc.identity'||'token' in options)throw Error('Exact controlled OIDC store binding required');const rows=[...state.blobObjects].filter(([key])=>key.startsWith(String(options.prefix))).map(([pathname,bytes])=>({pathname,size:bytes.length,uploadedAt:new Date('2026-01-01T00:00:00Z')}));if(rows.length>Number(options.limit))throw Error('Controlled fixture page overflow');return {blobs:rows,hasMore:false};},
}));
vi.mock('../../../lib/server/operations/managed-edge-transport',()=>({managedEdgeRead:async(input:{host:string;headers:Record<string,string>;query?:string;signal:AbortSignal})=>{input.signal.throwIfAborted();const response=await fetch('https://'+input.host+'/api/auth/session'+(input.query??''),{method:'GET',headers:input.headers,redirect:'manual',signal:input.signal});return {status:response.status,headers:response.headers,body:Buffer.from(await response.arrayBuffer())};},pinManagedControlEdge:()=>Object.freeze({contract:'controlled-edge-pin'})}));
async function fixture(run:(input:Parameters<typeof withLockedWorkRecoveryTarget>[0])=>Promise<void>,beforeLock?:(owner:Client)=>Promise<void>){
 state.blobObjects.clear();state.connections.clear();state.platformChanged=false;state.sourceChanged=false;state.dirty=false;state.cleanupUnavailable=false;
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
   await run({sourceFile,scope,runtimeConnection:runtimeUrl.href,signal:AbortSignal.timeout(150000),deadline:Date.now()+140000,hostedScope:{contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_recovery',teamId:'team_recovery',deploymentId:'dpl_recovery',origin:'https://recovery.vercel.app',environmentMarker:environmentId,workspaceId:randomUUID(),target:'preview',sourceCommit:state.commit,sourceDigest:state.digest,catalogDigest:state.catalog}});
  }finally{await rm(root,{recursive:true,force:true});state.connections.clear();state.platformChanged=false;state.sourceChanged=false;state.dirty=false;state.cleanupUnavailable=false;}
 });
}
async function withTargetRuntime<T>(input:Parameters<typeof withLockedWorkRecoveryTarget>[0],target:Parameters<typeof requireLockedWorkRecoveryConnection>[1],run:()=>Promise<T>){
 const keys=['DATABASE_URL','TURAS_APP_ORIGIN','VERCEL_DEPLOYMENT_ID','VERCEL_GIT_COMMIT_SHA','TURAS_CODE_VERSION'] as const,prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 await closeRuntimePool();try{process.env.DATABASE_URL=state.connections.get(input.runtimeConnection)!;process.env.TURAS_APP_ORIGIN=target.origin;process.env.VERCEL_DEPLOYMENT_ID=target.deploymentId;process.env.VERCEL_GIT_COMMIT_SHA=target.sourceCommit;process.env.TURAS_CODE_VERSION=target.sourceCommit;return await run();}
 finally{await closeRuntimePool();for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
}
it('commits a pending recovery decision only after live checks and rolls back drift cancellation and callback commit attempts',async()=>fixture(async input=>{
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{
  const row=(await owner.query('SELECT id,display_name FROM customer_references ORDER BY id LIMIT 1')).rows[0];expect(row).toBeTruthy();
  const read=async()=>(await owner.query('SELECT display_name FROM customer_references WHERE id=$1',[row.id])).rows[0].display_name;
  await expect(withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(Object.keys(db)).toEqual(['query']);await requireLockedWorkRecoveryConnection(db,target,input.scope);await db.query('UPDATE customer_references SET display_name=$2 WHERE id=$1',[row.id,'Committed measured decision']);expect(await read()).toBe(row.display_name);return 'committed';})).resolves.toBe('committed');expect(await read()).toBe('Committed measured decision');
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
 }finally{await owner.end();}
}),210000);

it('measures exhaustive fresh work MCP category pages through SDK and rejects changed projections or forged measurements',async()=>{
 let workspaceId='',customerId='',phase='setup';
 await fixture(async input=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{await withRetainedDenialFixture(owner,input.scope.environmentId,dirname(input.sourceFile),{mapConnection:(selected,actual)=>state.connections.set(selected,actual),selectKey:key=>{state.retainedKey=key;}},async retained=>{
   await quarantineRestoredAuthority(owner,input.scope,retained);let selectedTarget:Parameters<typeof requireLockedWorkRecoveryConnection>[1]|undefined;
   await withLockedWorkRecoveryTarget(input,async(_db,target)=>{selectedTarget=target;});const target=selectedTarget!;let corrupt=false;
   const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async(url,options)=>{
    const incoming=new Request(url,options),address=new URL(incoming.url),headers=new Headers(incoming.headers);headers.set('host',address.host);if(address.origin!==target.origin||(!address.pathname.endsWith('/mcp')&&address.pathname!=='/api/mcp/v1'))throw Error('Controlled MCP category transport left target');
    if(address.pathname==='/api/mcp/v1')return withTargetRuntime(input,target,()=>handleMcpRequest(new Request(incoming,{headers})));
    const response=await withTargetRuntime(input,target,()=>maintenanceMcp(new Request(incoming,{headers}),{params:Promise.resolve({admissionId:address.pathname.split('/')[4]})}));
    if(corrupt&&response.status===200){const rpc=await response.json();if(rpc.result?.structuredContent?.data?.workspaceId)rpc.result.structuredContent.data.workspaceId=randomUUID();return Response.json(rpc,{headers:response.headers});}return response;
   });
   try{
    const args={target:input,selection:{workspaceId,username:'mcteer' as const,category:'profiles' as const,customerId},password:process.env.TURAS_DEMO_PASSWORD!,retained,journalDirectory:dirname(input.sourceFile)};
    phase='initial-category';const proof=await measureWorkMcpCategory(args);expect(proof).toMatchObject({calls:5,actualSdkVerified:true,categoryCoverageVerified:true,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false});
    await withLockedWorkRecoveryTarget(input,async(db,current)=>{await db.query('BEGIN');try{expect(await requireMeasuredWorkMcpCategory(db,current,proof)).toBe(proof);await expect(requireMeasuredWorkMcpCategory(db,current,{...proof})).rejects.toThrow('Actual fresh');const inventory=await deriveWorkMcpScopeInTransaction(db,current);expect(inventory.required).toContainEqual(proof.selection);await expect(requireMeasuredWorkMcpCoverage(db,current,[proof])).rejects.toThrow('Complete unique');await expect(requireMeasuredWorkMcpCoverage(db,current,[proof,proof])).rejects.toThrow('Complete unique');await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}});
    phase='negative-drift';const originalAdmission=(await owner.query('SELECT id FROM operations_recovery_http_reads WHERE workspace_id=$1 AND mcp_probe_connection ORDER BY created_at,id LIMIT 1',[workspaceId])).rows[0].id;
    for(const drift of ['content','membership','probe'] as const)await withLockedWorkRecoveryTarget(input,async(db,current)=>{await db.query('BEGIN');try{
     if(drift==='content')await db.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customerId]);
     if(drift==='membership')await db.query('UPDATE memberships SET active=false WHERE workspace_id=$1 AND principal_id=$2',[workspaceId,DEMO_IDS.mcteer]);
     if(drift==='probe')await db.query('UPDATE operations_recovery_http_reads SET revoked_at=NULL WHERE id=$1',[originalAdmission]);
     await expect(requireMeasuredWorkMcpCategory(db,current,proof)).rejects.toThrow(drift==='content'?'category changed':drift==='probe'?'probe retirement changed':/authentication unavailable|membership|participant/i);
    }finally{await db.query('ROLLBACK');}});
    phase='paginated-knowledge';const knowledge=await measureWorkMcpCategory({...args,selection:{...args.selection,category:'knowledge',customerId:null}});expect(knowledge.calls).toBe(12);
    expect((await owner.query('SELECT count(*)::int AS count FROM operations_recovery_http_reads a JOIN mcp_connections mc ON mc.id=a.record_id WHERE a.workspace_id=$1 AND a.read_kind=\'mcp\' AND NOT a.mcp_probe_connection AND a.expires_at=mc.expires_at AND a.revoked_at IS NOT NULL',[workspaceId])).rows[0].count).toBeGreaterThan(0);
    phase='current-scope';const needed=await withLockedWorkRecoveryTarget(input,async(db,current)=>{await db.query('BEGIN');try{const inventory=await deriveWorkMcpScopeInTransaction(db,current);await db.query('COMMIT');return inventory.required;}catch(error){await db.query('ROLLBACK');throw error;}});
    expect(new Set(needed.map(value=>value.username))).toEqual(new Set(['mcteer','panel','partner']));expect(needed.length).toBeGreaterThan(32);
    const proofs=[proof,knowledge],missing=needed.filter(selected=>!proofs.some(value=>JSON.stringify(value.selection)===JSON.stringify(selected)));while(missing.length){phase='remaining-categories-'+missing.length;const first=missing[0],batch=missing.filter(value=>value.workspaceId===first.workspaceId&&value.username===first.username).slice(0,4);const password=first.username==='mcteer'?process.env.TURAS_DEMO_PASSWORD!:first.username==='panel'?process.env.PANEL_PASSWORD!:process.env.PARTNER_PASSWORD!;proofs.push(...await measureWorkMcpCategoryBatch({...args,selections:batch,password}));for(const selected of batch)missing.splice(missing.indexOf(selected),1);}

    phase='final-scope-replay';await withLockedWorkRecoveryDecision(input,async(db,current)=>{const coverage=await requireMeasuredWorkMcpCoverage(db,current,proofs);expect(coverage).toMatchObject({categoryMeasurements:needed.length,actualSdkScopeCoverageVerified:true,probeRetirementVerified:true,requiredScopeHealthy:false,restorationReady:false});await db.query('SELECT pg_sleep(6)');await db.query('SELECT pg_sleep(6)');});
    phase='network-tamper';corrupt=true;await expect(measureWorkMcpCategory(args)).rejects.toThrow('HTTP and canonical projections differ');
   }finally{transport.mockRestore();}
   expect((await owner.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id JOIN mcp_connections mc ON mc.id=a.record_id WHERE a.mcp_probe_connection AND (a.revoked_at IS NULL OR s.revoked_at IS NULL OR mc.revoked_at IS NULL OR mc.credential_hash IS NOT NULL)')).rowCount).toBe(0);
  });}finally{state.retainedKey=null;await owner.end();}
 },async owner=>{const f=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');workspaceId=f.actor.workspaceId;customerId=f.customerId;for(let i=0;i<4;i++)await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary',workspaceId);const organization=randomUUID(),partnerMembership=randomUUID();await owner.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic MCP category partner')",[organization,workspaceId]);await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,'internal','member',NULL),($4,$5,$3,'partner','member',$6)",[randomUUID(),DEMO_IDS.panel,workspaceId,partnerMembership,DEMO_IDS.partner,organization]);await owner.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),partnerMembership,workspaceId,customerId,DEMO_IDS.mcteer]);await owner.query('UPDATE workspaces SET active=false WHERE id<>$1',[workspaceId]);}).catch(error=>{throw new Error('Work MCP category regression failed during '+phase,{cause:error});});
},210000);

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
   const proof=await measureWorkManagedTerminalInventory({target:input,token:'controlled-provider-token'});expect(proof).toMatchObject({enumeratedRuns:2,providerOnlyRuns:1,deployments:2,enumeratedInventoryTerminalVerified:true,oldDeploymentsClosed:false,paidEffectsReconciled:false,restorationReady:false});
   await withLockedWorkRecoveryDecision(input,async(db,target)=>{expect(await requireMeasuredWorkManagedTerminalInventory(db,target,proof,input.signal)).toBe(proof);await expect(requireMeasuredWorkManagedTerminalInventory(db,target,{...proof},input.signal)).rejects.toThrow('Genuine fresh');});
   for(const change of ['active','omitted','deployment','project','alias'] as const){mode=change;await expect(withLockedWorkRecoveryDecision(input,(db,target)=>requireMeasuredWorkManagedTerminalInventory(db,target,proof,input.signal))).rejects.toThrow();}mode='normal';
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
   expect(await inspect()).toMatchObject({operations:2,holds:2,typedModelAccountingVerified:true,allPaidEffectsVerified:false,providerExecutionClosed:false,restorationReady:false});
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
   await owner.query('DELETE FROM watchdog_jobs WHERE attempt_id=$1',[attempt]);await owner.query('DELETE FROM response_attempts WHERE id=$1',[attempt]);
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
   expect(original.state).toBe('uncertain');await owner.query('DELETE FROM report_delivery_payloads WHERE delivery_id=$1',[delivery]);
   await owner.query('ALTER TABLE report_deliveries DISABLE TRIGGER report_delivery_identity');await owner.query('DELETE FROM report_deliveries WHERE id=$1',[delivery]);await owner.query('ALTER TABLE report_deliveries ENABLE TRIGGER report_delivery_identity');
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
