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
