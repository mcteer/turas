import {beforeAll,afterAll,it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {openOwnedPilotSuite,requireOwnedPilotDatabase} from '../../fixtures/pilot/environment';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {materializeCurrentProjection} from '../../../lib/server/retrieval/projections';
import {mcpAcceptedPlan} from '../../fixtures/mcp/plans';
import {mcpPublishedReport} from '../../fixtures/mcp/reports';
import {csrfTokenForSession} from '../../../lib/server/auth/csrf';
import {sessionCookieName} from '../../../lib/server/auth/sessions';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {runHostedMcpJourney} from '../../../scripts/pilot-hosted-mcp';
import {runHostedProfileReviewJourney} from '../../../scripts/pilot-hosted-profile';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
let owned:Awaited<ReturnType<typeof openOwnedPilotSuite>>,owner:Client,runtime:Client,scope:PilotHostedScope,headers:Headers,customerId:string,deniedCustomerId:string,revisionId:string;
// Real owned HTTP/pinned SDK transport with controlled read-state fixtures.
// It proves the driver, not hosted deployment or J006/J009/J014 publication acceptance.
beforeAll(async()=>{
 owned=await openOwnedPilotSuite({postgresMajor:18,deadlineMs:360000});
 owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});runtime=new Client({connectionString:requireOwnedPilotDatabase()});await owner.connect();await runtime.connect();
 const fixture=await pilotPublishedKnowledgeFixture(owner as unknown as PoolClient,'primary');customerId=fixture.customerId;revisionId=fixture.originalRevisionId;
 await materializeCurrentProjection(owner as unknown as PoolClient,'accepted_profile',revisionId,'delivery');
 await mcpAcceptedPlan(fixture.actor,fixture.actor,customerId);await mcpPublishedReport(owner as unknown as PoolClient,fixture.actor,customerId);
 deniedCustomerId=randomUUID();await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic denied SDK customer',true)",[deniedCustomerId,fixture.actor.workspaceId]);
 headers=new Headers({cookie:sessionCookieName()+'='+fixture.actor.token,origin:owned.environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(fixture.actor.token)});
 scope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:owned.environment.origin,environmentMarker:owned.environment.environmentId,workspaceId:fixture.actor.workspaceId,target:'production',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)};
 await closeRuntimePool();await owned.environment.startProduction();
},240000);
afterAll(async()=>{await runtime?.end();await owner?.end();await owned?.close();});
const input=()=>({scope,db:runtime,headers,customerId,deniedCustomerId,signal:owned.environment.signal});
const active=async()=>Number((await owner.query('SELECT count(*)::int AS n FROM mcp_connections WHERE workspace_id=$1 AND revoked_at IS NULL',[scope.workspaceId])).rows[0].n);
it('executes every category and citation through the actual pinned SDK and revokes its credential',async()=>{
 const result=await runHostedMcpJourney(input());expect(result).toMatchObject({journey:'J015',passedCases:12,credentialRevoked:true,providerCalls:0,domainAcceptedStateWrites:0});expect(new Set(result.cases.map(row=>row.id)).size).toBe(12);expect(await active()).toBe(0);
 expect(JSON.stringify(result)).not.toContain('tmcp.');expect(JSON.stringify(result)).not.toContain('Synthetic observed');
},60000);
it('fails on withdrawn current evidence and still cleans its exact credential',async()=>{
 await owner.query('UPDATE profile_records SET current_accepted_revision_id=NULL WHERE current_accepted_revision_id=$1',[revisionId]);
 try{await expect(runHostedMcpJourney(input())).rejects.toThrow('Accepted SDK profile required');expect(await active()).toBe(0);}finally{await owner.query('UPDATE profile_records SET current_accepted_revision_id=$1 WHERE id=(SELECT record_id FROM profile_revisions WHERE id=$1)',[revisionId]);}
},60000);
it('reconciles and revokes a created credential when its creation body is damaged',async()=>{
 const damaged:typeof fetch=async(url,options)=>{const response=await fetch(url,options);if(new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url).pathname==='/api/mcp/connections'&&options?.method==='POST'&&response.status===201){await response.body?.cancel();return new Response('{',{status:201,headers:response.headers});}return response;};
 await expect(runHostedMcpJourney({...input(),transport:damaged})).rejects.toThrow();expect(await active()).toBe(0);
 expect(Number((await owner.query('SELECT count(*)::int AS n FROM mcp_connections WHERE workspace_id=$1',[scope.workspaceId])).rows[0].n)).toBe(3);
},60000);
it('reviews, corrects and retracts a synthetic profile through ordinary HTTP commands',async()=>{
 const result=await runHostedProfileReviewJourney(input());expect(result).toMatchObject({journey:'J003',passedCases:4,normalProfileCommands:5,providerCalls:0,syntheticOnly:true,fullLinkedJourneyVerified:false});
 expect(Number((await owner.query("SELECT count(*)::int AS n FROM profile_records WHERE customer_id=$1 AND canonical_key LIKE 'pilot-review-%' AND current_accepted_revision_id IS NOT NULL",[customerId])).rows[0].n)).toBe(0);
},60000);
it('uses the original command receipt after an uncertain mutation response without repeating the mutation',async()=>{
 let posts=0,receipts=0;const damaged:typeof fetch=async(url,options)=>{
  const path=new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url).pathname;
  const response=await fetch(url,options);
  if(path.endsWith('/commands')&&options?.method==='POST'){posts++;if(posts===1){await response.body?.cancel();return new Response('{',{status:response.status,headers:response.headers});}}
  if(/\/commands\/[a-f0-9-]+$/.test(path))receipts++;return response;
 };
 await expect(runHostedProfileReviewJourney({...input(),transport:damaged})).resolves.toMatchObject({passedCases:4});expect(posts).toBe(5);expect(receipts).toBe(1);
},60000);
it('rejects a customer outside the fixed synthetic workspace before any HTTP dispatch',async()=>{
 let calls=0;const denied:typeof fetch=async()=>{calls++;throw Error('Unexpected dispatch');};
 await expect(runHostedProfileReviewJourney({...input(),customerId:randomUUID(),transport:denied})).rejects.toThrow('Exact synthetic profile scope required');expect(calls).toBe(0);
});
it('withholds a normally revoked partner customer from an existing actual SDK connection and retires its credential',async()=>{
 const {issueSession}=await import('../../../lib/server/auth/sessions'),{DEMO_IDS}=await import('../../../lib/server/bootstrap-ids'),organizationId=randomUUID(),membershipId=randomUUID();
 await owner.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic SDK grant boundary')",[organizationId,scope.workspaceId]);
 await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,'partner','member',$4)",[membershipId,DEMO_IDS.partner,scope.workspaceId,organizationId]);
 await owner.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),membershipId,scope.workspaceId,customerId,DEMO_IDS.mcteer]);
 const {getCurrentSession}=await import('../../../lib/server/auth/sessions');const admin=await getCurrentSession(new Request(scope.origin,{headers}));if(!admin)throw Error('Current owned report author required');await mcpPublishedReport(owner as unknown as PoolClient,admin,customerId);
 const issued=await issueSession({principalId:DEMO_IDS.partner,loginName:'partner',displayName:'Synthetic partner',membershipId,workspaceId:scope.workspaceId,kind:'partner',role:'member'}),partnerHeaders=new Headers({cookie:sessionCookieName()+'='+issued.token,origin:scope.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(issued.token)});
 const result=await runHostedMcpJourney({...input(),headers:partnerHeaders,grantBoundary:async()=>{const response=await fetch(scope.origin+'/api/admin/grants/'+membershipId+'/'+customerId,{method:'PUT',headers,body:JSON.stringify({state:'revoked',expectedRevision:1,requestKey:randomUUID()}),redirect:'manual',signal:owned.environment.signal});expect(response.status).toBe(200);expect(response.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);expect(await response.json()).toMatchObject({data:{state:'revoked',revision:2}});}});
 expect(result.passedCases).toBe(15);expect(result.cases.map(row=>row.id)).toEqual(expect.arrayContaining(['identity-after-grant-revocation','customer-list-after-grant-revocation','profile-denied-after-grant-revocation','revoked-credential']));expect(result.credentialRevoked).toBe(true);expect(await active()).toBe(0);expect((await owner.query('SELECT state,revision FROM customer_grants WHERE membership_id=$1 AND customer_id=$2',[membershipId,customerId])).rows[0]).toMatchObject({state:'revoked',revision:'2'});
},60000);
