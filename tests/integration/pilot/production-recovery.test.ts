import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {runProductionRecoveryMcpJourney,assertRecoveryMcpProjection,compareRecoveryMcpPages} from '../../../scripts/production-recovery-mcp';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {createProfileTestSession} from '../../fixtures/profiles';
import {csrfTokenForSession} from '../../../lib/server/auth/csrf';
import {sessionCookieName,issueSession} from '../../../lib/server/auth/sessions';
import {postMcpManagement,reconcileMcpManagement} from '../../../lib/server/mcp/http-management';
import {handleMcpRequest} from '../../../lib/server/mcp/transport';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {materializeCurrentProjection} from '../../../lib/server/retrieval/projections';
import {mcpAcceptedPlan} from '../../fixtures/mcp/plans';
import {mcpPublishedReport} from '../../fixtures/mcp/reports';

it('compares actual SDK empty and populated primary reads with governed baselines and revokes every probe',async()=>{
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),reader=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await reader.connect();
  const previous=process.env.TURAS_APP_ORIGIN;process.env.TURAS_APP_ORIGIN='https://recovery.example.test';
  try{
   const actor=await createProfileTestSession(owner as unknown as PoolClient,'mcteer'),emptyId=randomUUID();
   await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Owned empty recovery customer',true)",[emptyId,DEMO_IDS.workspace]);
   await owner.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[emptyId,DEMO_IDS.workspace]);
   const issued=await issueSession(actor);const headers=new Headers({origin:process.env.TURAS_APP_ORIGIN,cookie:sessionCookieName()+'='+issued.token,'content-type':'application/json','x-csrf-token':csrfTokenForSession(issued.token)});
   const scope={contract:'pilot-hosted-scope-v1' as const,runId:randomUUID(),projectId:'prj_owned',teamId:'team_owned',deploymentId:'dpl_owned',origin:process.env.TURAS_APP_ORIGIN,environmentMarker:environment.environmentId,workspaceId:DEMO_IDS.workspace,target:'production' as const,sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)};
   const transport:typeof fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),h=new Headers(init?.headers);h.set('host',url.host);const request=new Request(url,{...init,headers:h});
    if(url.pathname==='/api/mcp/v1')return handleMcpRequest(request);
    if(url.pathname==='/api/mcp/connections')return postMcpManagement(request);
    const revoke=/^\/api\/mcp\/connections\/([a-f0-9-]+)\/revoke$/.exec(url.pathname);if(revoke)return postMcpManagement(request,revoke[1]);
    const reconcile=/^\/api\/mcp\/connections\/requests\/([a-f0-9-]+)$/.exec(url.pathname);if(reconcile)return reconcileMcpManagement(request,reconcile[1]);
    throw Error('No external transport allowed');
   };
   const run=(customerId:string,selectedTransport=transport)=>runProductionRecoveryMcpJourney({scope,db:reader,headers,customerId,deniedCustomerId:DEMO_IDS.deniedCustomer,signal:AbortSignal.timeout(60000),transport:selectedTransport});
   const empty=await run(emptyId);expect(empty.credentialRevoked).toBe(true);expect(empty.cases.map(row=>row.id)).toEqual(expect.arrayContaining(['profile-facts-governed-empty','evidence-governed-empty','knowledge-governed-empty','plan-governed-empty','report-governed-empty','denied-customer','revoked-credential']));
   const fixture=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary',DEMO_IDS.workspace);
   await materializeCurrentProjection(owner as unknown as PoolClient,'accepted_profile',fixture.originalRevisionId,'delivery');await mcpAcceptedPlan(fixture.actor,fixture.actor,fixture.customerId);await mcpPublishedReport(owner as unknown as PoolClient,fixture.actor,fixture.customerId);
   const populated=await run(fixture.customerId);expect(populated.cases.map(row=>row.id)).toEqual(expect.arrayContaining(['profile-facts-positive','evidence-positive','knowledge-positive','plan-positive','report-positive','revoked-credential']));
   const wrongEmpty:typeof fetch=async(input,init)=>{
    const response=await transport(input,init);const body=typeof init?.body==='string'?JSON.parse(init.body):null;
    if(body?.method==='tools/call'&&body.params?.name==='turas_plans_list_v1'){
     const payload=await response.json(),output={...payload.result.structuredContent,status:'empty',data:{items:[]},nextCursor:null};payload.result.structuredContent=output;payload.result.content=[{type:'text',text:JSON.stringify(output)}];return Response.json(payload,{status:response.status,headers:response.headers});
    }return response;
   };
   await expect(run(fixture.customerId,wrongEmpty)).rejects.toThrow('Recovery SDK differs from governed domain baseline');
   expect((await owner.query('SELECT count(*)::int AS n FROM mcp_connections WHERE revoked_at IS NULL')).rows[0].n).toBe(0);
  }finally{if(previous===undefined)delete process.env.TURAS_APP_ORIGIN;else process.env.TURAS_APP_ORIGIN=previous;await reader.end();await owner.end();}
 },{postgresMajor:18,deadlineMs:240000});
},270000);

it('rejects omitted eligible data while allowing only opaque request and citation identities to differ',async()=>{
 const page=(id:string,cursor:string|null)=>({status:'available',data:{items:[{id}]},nextCursor:cursor});
 const expectedPages=new Map<string|undefined,unknown>([[undefined,page('first','expected-middle')],['expected-middle',page('middle','expected-last')],['expected-last',page('last',null)]]);
 const actualPages=new Map<string|undefined,unknown>([[undefined,page('first','served-skips-middle')],['served-skips-middle',page('last',null)]]);
 const visited:string[]=[];
 await expect(compareRecoveryMcpPages(async cursor=>expectedPages.get(cursor),async cursor=>actualPages.get(cursor),async item=>{visited.push(item.id);})).rejects.toThrow('governed domain baseline');
 expect(visited).toEqual(['first']);
 const correctPages=new Map<string|undefined,unknown>([[undefined,page('first','served-middle')],['served-middle',page('middle','served-last')],['served-last',page('last',null)]]);
 expect(await compareRecoveryMcpPages(async cursor=>expectedPages.get(cursor),async cursor=>correctPages.get(cursor),async()=>{})).toBe(3);
 const expected={status:'available',requestId:'one',data:{items:[{id:'record',value:'retained'}],citationHandle:'one'},nextCursor:'one'};
 expect(()=>assertRecoveryMcpProjection(expected,{...expected,requestId:'two',data:{...expected.data,citationHandle:'two'},nextCursor:'two'})).not.toThrow();
 expect(()=>assertRecoveryMcpProjection(expected,{status:'empty',data:{items:[]},nextCursor:null})).toThrow('governed domain baseline');
 expect(()=>assertRecoveryMcpProjection(expected,{...expected,data:{items:[{id:'record',value:'changed'}]}})).toThrow('governed domain baseline');
 expect(()=>assertRecoveryMcpProjection(expected,{...expected,nextCursor:null})).toThrow('governed domain baseline');
 const quality={R:4,F:4,D:4,C:4,Q:100,band:'high',freshness:'current',asOf:'2026-10-31T20:00:00.000Z',validUntil:'2026-11-01T20:00:00.000Z'};
 const later={...quality,asOf:'2026-10-31T20:00:00.050Z',validUntil:'2026-11-01T20:00:00.050Z'};
 expect(()=>assertRecoveryMcpProjection({quality},{quality:later})).not.toThrow();
 expect(()=>assertRecoveryMcpProjection({quality},{quality:{...later,Q:99}})).toThrow('governed domain baseline');
 expect(()=>assertRecoveryMcpProjection({quality},{quality:{...later,validUntil:'2026-11-02T20:00:00.050Z'}})).toThrow('governed domain baseline');
});
