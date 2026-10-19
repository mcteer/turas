import {reportsDeliveryFixture,addReviewedReportActivity} from '../../fixtures/reports/delivery';
import {pilotLoadReportFixture} from '../../fixtures/pilot/load-delivery';
import {materializeCurrentProjection} from '../../../lib/server/retrieval/projections';
import {it,expect} from 'vitest';
import {Client, type PoolClient} from 'pg';
import {Client as McpClient,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {randomUUID,randomBytes} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {mcpProtocolVersion,mcpToolOutputs} from '../../../lib/contracts/mcp';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {retireOwnedLegacyRuntime} from '../../../lib/server/operations/runtime-retirement';
import {issueOwnedRecoveryHttpRead,retireOwnedRecoveryHttpRead} from '../../../lib/server/operations/recovery-http-read-issuer';
import {sessionCookie} from '../../../lib/server/auth/sessions';
it('serves actual SDK maintenance HTTP through the restricted runtime while ordinary MCP and retired credentials stay denied',async()=>{
 const renderer=process.env.TURAS_PILOT_RENDERER_IMAGE;
 await withPilotEnvironment(async env=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  let admission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;const connectionIds:string[]=[];
  const newClient=()=>new McpClient({name:'synthetic-maintenance-http',version:'1.0.0'},{versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});let client=newClient();
  try{
   process.env.TURAS_REPORTS_ENABLED='true';process.env.TURAS_PILOT_RENDERER_IMAGE=renderer;
   const baseline=await reportsDeliveryFixture(),activity=await addReviewedReportActivity(baseline,{narrative:'Controlled normally reviewed MCP recovery fixture.'});
   const delivery={plan:{created:baseline.created,content:baseline.content,decision:baseline.decision},engagementId:baseline.engagementId,baselineId:baseline.baselineId,activity};
   const reports=await pilotLoadReportFixture(owner as unknown as PoolClient,{actors:[baseline.reviewer,baseline.author],customers:[{id:baseline.customerId}]},delivery,env.signal);
   const fixture=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary',baseline.author.workspaceId);
   await materializeCurrentProjection(owner as unknown as PoolClient,'accepted_profile',fixture.originalRevisionId,'internal');
   const connection=await createMcpConnection(fixture.actor,{requestKey:randomUUID(),name:'Synthetic recovery HTTP',categories:['profiles','evidence','knowledge','plans','reports'],customerIds:[fixture.customerId,baseline.customerId],lifetimeDays:1});
   if(!connection.secretAvailable)throw Error('Fresh synthetic MCP bearer required');connectionIds.push(connection.connection.id);
   const other=await createMcpConnection(fixture.actor,{requestKey:randomUUID(),name:'Synthetic distinct recovery connection',categories:['knowledge'],customerIds:[],lifetimeDays:1});if(!other.secretAvailable)throw Error('Fresh second synthetic bearer required');connectionIds.push(other.connection.id);
   const locked=await lockAuthorityTarget(owner,env.environmentId),scope={environmentId:env.environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision},password=randomBytes(32).toString('base64url'),runtime=new URL(process.env.DATABASE_URL!);
   await closeRuntimePool();await retireOwnedLegacyRuntime(owner,{...scope,password});runtime.username='turas_runtime_016';runtime.password=password;process.env.DATABASE_URL=runtime.href;
   await env.startProduction();
   const warm=await fetch(env.origin+'/api/operations/recovery-read/'+randomUUID()+'/mcp',{signal:env.signal});expect(warm.status).toBe(403);await warm.body?.cancel();
   await owner.query('BEGIN');try{admission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:fixture.actor.workspaceId,customerId:null,password:process.env.TURAS_DEMO_PASSWORD!,deadline:Date.now()+59000,maximumRequests:10,deploymentId:null,readKind:'mcp',recordId:connection.connection.id});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
   let path=env.origin+'/api/operations/recovery-read/'+admission.id+'/mcp',headers={authorization:'Bearer '+connection.credential,cookie:sessionCookie(admission.actor.token,admission.actor.expiresAt).split(';')[0],'x-turas-recovery-read':admission.secret};
   const raw=async(url:string,extra:Record<string,string>={})=>fetch(url,{method:'POST',headers:{...headers,...extra,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'turas_identity_v1',arguments:{}}}),signal:AbortSignal.any([env.signal,AbortSignal.timeout(10000)])});
   for(const changed of [{cookie:'turas_session='+randomBytes(32).toString('base64url')},{'x-turas-recovery-read':randomBytes(32).toString('base64url')},{origin:'https://foreign.invalid'},{authorization:'Bearer '+other.credential}] as Record<string,string>[]){const denied=await raw(path,changed);expect(denied.status).toBe(403);await denied.body?.cancel();}
   const ordinary=await raw(env.origin+'/api/mcp/v1');expect(ordinary.status).toBe(503);await ordinary.body?.cancel();

   let lastFailure:{status:number;applicationCode:string|null;protocolCode:number|null}|undefined;
   const sdkFetch:typeof fetch=async(url,options)=>{
    const address=new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url);if(address.href!==path)throw Error('SDK left fixed recovery endpoint');
    const response=await fetch(url,{...options,redirect:'manual',cache:'no-store'});if(response.headers.get('x-turas-code-version')!==process.env.TURAS_CODE_VERSION){await response.body?.cancel();throw Error('Actual maintenance HTTP code version differs');}
    if(!response.ok){const error=await response.clone().json().catch(()=>({}));lastFailure={status:response.status,applicationCode:typeof error.error?.code==='string'&&/^[a-z_]{1,64}$/.test(error.error.code)?error.error.code:null,protocolCode:Number.isInteger(error.error?.code)?error.error.code:null};}return response;
   };
   try{await client.connect(new StreamableHTTPClientTransport(new URL(path),{fetch:sdkFetch,requestInit:{headers},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{signal:env.signal,timeout:10000});}catch{throw Error('Controlled SDK HTTP negotiation failure '+JSON.stringify(lastFailure??{status:null}));}
   const identity=mcpToolOutputs.turas_identity_v1.parse((await client.callTool({name:'turas_identity_v1',arguments:{}},{signal:env.signal,timeout:10000})).structuredContent);expect(identity.status).toBe('available');if(identity.status==='available')expect(identity.data.workspaceId).toBe(fixture.actor.workspaceId);
   const profile=mcpToolOutputs.turas_profile_read_v1.parse((await client.callTool({name:'turas_profile_read_v1',arguments:{customerId:fixture.customerId,section:'facts',limit:20}},{signal:env.signal,timeout:10000})).structuredContent);expect(profile.status).toBe('available');if(profile.status==='available')expect(profile.data.items.some(row=>row.id===fixture.originalRevisionId)).toBe(true);
   const evidence=mcpToolOutputs.turas_evidence_list_v1.parse((await client.callTool({name:'turas_evidence_list_v1',arguments:{customerId:fixture.customerId,limit:20}},{signal:env.signal,timeout:10000})).structuredContent);
   expect(evidence.status).toBe('available');if(evidence.status!=='available')throw Error('Actual recovery evidence unavailable');const original=evidence.data.items.find(row=>row.revisionId===fixture.originalRevisionId);if(!original)throw Error('Actual recovery evidence identity differs');
   const passage=mcpToolOutputs.turas_evidence_read_v1.parse((await client.callTool({name:'turas_evidence_read_v1',arguments:{customerId:fixture.customerId,revisionId:original.revisionId,passageId:original.passageId}},{signal:env.signal,timeout:10000})).structuredContent);expect(passage.status).toBe('available');if(passage.status!=='available')throw Error('Actual recovery passage unavailable');
   const citation=mcpToolOutputs.turas_citation_resolve_v1.parse((await client.callTool({name:'turas_citation_resolve_v1',arguments:{citationHandle:passage.data.citationHandle}},{signal:env.signal,timeout:10000})).structuredContent);expect(citation.status).toBe('available');
   const knowledge=mcpToolOutputs.turas_knowledge_read_v1.parse((await client.callTool({name:'turas_knowledge_read_v1',arguments:{publicationId:fixture.publicationId,expectedRevisionId:fixture.revisionId}},{signal:env.signal,timeout:10000})).structuredContent);expect(knowledge.status).toBe('available');
   // Retire the original probe before issuing a distinct finite admission.
   await client.close();await retireOwnedRecoveryHttpRead(owner as unknown as PoolClient,admission.id);
   await owner.query('BEGIN');try{admission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:fixture.actor.workspaceId,customerId:null,password:process.env.TURAS_DEMO_PASSWORD!,deadline:Date.now()+59000,maximumRequests:10,deploymentId:null,readKind:'mcp',recordId:connection.connection.id});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
   path=env.origin+'/api/operations/recovery-read/'+admission.id+'/mcp';headers={authorization:'Bearer '+connection.credential,cookie:sessionCookie(admission.actor.token,admission.actor.expiresAt).split(';')[0],'x-turas-recovery-read':admission.secret};client=newClient();
   await client.connect(new StreamableHTTPClientTransport(new URL(path),{fetch:sdkFetch,requestInit:{headers},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{signal:env.signal,timeout:10000});
   const plan=mcpToolOutputs.turas_plan_read_v1.parse((await client.callTool({name:'turas_plan_read_v1',arguments:{customerId:baseline.customerId,planId:baseline.created.planId,expectedRevisionId:baseline.created.revisionId}},{signal:env.signal,timeout:10000})).structuredContent);expect(plan.status).toBe('available');
   const report=mcpToolOutputs.turas_report_read_v1.parse((await client.callTool({name:'turas_report_read_v1',arguments:{customerId:baseline.customerId,reportId:reports.reports[0].reportId,expectedRevisionId:reports.reports[0].revisionId}},{signal:env.signal,timeout:10000})).structuredContent);expect(report.status).toBe('available');
   // Synthetic deny-only current state, with the projection worker stopped.
   await owner.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=(SELECT record_id FROM profile_revisions WHERE id=$1)',[fixture.originalRevisionId]);
   const withdrawn=mcpToolOutputs.turas_citation_resolve_v1.parse((await client.callTool({name:'turas_citation_resolve_v1',arguments:{citationHandle:passage.data.citationHandle}},{signal:env.signal,timeout:10000})).structuredContent);expect(withdrawn.status).toBe('unavailable');
   await owner.query('UPDATE mcp_connections SET revoked_at=clock_timestamp(),revoker_membership_id=membership_id,credential_hash=NULL WHERE id=$1',[connection.connection.id]);await expect(client.callTool({name:'turas_identity_v1',arguments:{}},{signal:env.signal,timeout:10000})).rejects.toThrow();
   await retireOwnedRecoveryHttpRead(owner as unknown as PoolClient,admission.id);const retired=await raw(path);expect(retired.status).toBe(403);await retired.body?.cancel();
   expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');expect((await owner.query('SELECT used_requests FROM operations_recovery_http_reads WHERE id=$1',[admission.id])).rows[0].used_requests).toBeGreaterThan(0);
  }finally{try{await client.close();}finally{try{if(admission)await retireOwnedRecoveryHttpRead(owner as unknown as PoolClient,admission.id);if(connectionIds.length)await owner.query('UPDATE mcp_connections SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoker_membership_id=COALESCE(revoker_membership_id,membership_id),credential_hash=NULL WHERE id=ANY($1::uuid[])',[connectionIds]);}finally{await closeRuntimePool();await owner.end();}}}
 },{postgresMajor:18,deadlineMs:440000});
},450000);
