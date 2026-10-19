import {measureWorkMcpCategoryBatch,measureWorkMcpCategory,requireMeasuredWorkMcpCategory,deriveWorkMcpScopeInTransaction,requireMeasuredWorkMcpCoverage} from '../../../lib/server/operations/work-mcp-verification';
import {withRetainedDenialFixture} from '../../fixtures/pilot/retained-denials';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
import {POST as maintenanceMcp} from '../../../app/api/operations/recovery-read/[admissionId]/mcp/route';
import {handleMcpRequest} from '../../../lib/server/mcp/transport';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {it,expect,vi} from 'vitest';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {Client,type PoolClient} from 'pg';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {withAuthorityEnvironment,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withWorkRecoveryReadDeadline,withLockedWorkRecoveryDecision,withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection} from '../../../lib/server/operations/locked-work-recovery-target';
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
