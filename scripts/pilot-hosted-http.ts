import type {Client,QueryResultRow} from 'pg';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {assertPilotDatabaseOnConnection} from '../lib/server/db/readiness';
import {verifyHostedConfiguration,type HostedConfiguration} from '../lib/server/operations/hosted-configuration';
const roles=[{name:'internal-admin',login:'mcteer',kind:'internal',role:'admin',password:'TURAS_PILOT_HOSTED_ADMIN_PASSWORD'},
 {name:'internal-member',login:'panel',kind:'internal',role:'member',password:'TURAS_PILOT_HOSTED_MEMBER_PASSWORD'},
 {name:'assigned-partner',login:'partner',kind:'partner',role:'member',password:'TURAS_PILOT_HOSTED_PARTNER_PASSWORD'}] as const;
const sessionEnvelope=z.object({data:z.object({principal:z.object({id:z.uuid(),loginName:z.string()}),workspace:z.object({id:z.uuid(),classification:z.literal('synthetic_pilot')}),membership:z.object({id:z.uuid(),kind:z.string(),role:z.string()}),csrfToken:z.string().regex(/^[a-f0-9]{64}$/)})});
export async function boundedHostedJson(response:Response){
 if(!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')||!response.body)throw Error('Hosted JSON response unavailable');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1048576)throw Error('Hosted response exceeds private bound');chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}
 finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
/** Base role/read probes author no domain decisions or paid work. A trusted
 * fixed journey hook may use normally scoped management requests; the exact
 * role session is always revoked. Transport follows verified platform binding. */
export type HostedRoleProofHook=(context:{role:typeof roles[number]['name'];headers:Headers;customerIds:string[];allCustomerIds:string[];partnerCustomerIds:string[]})=>Promise<void>;
export async function runHostedReadChecks(scope:PilotHostedScope,db:Client,signal:AbortSignal,transport:typeof fetch=fetch,env:NodeJS.ProcessEnv=process.env,proveRole?:HostedRoleProofHook,expectedConfiguration?:HostedConfiguration,selectedRoles:readonly typeof roles[number]['name'][]=roles.map(row=>row.name)){
 if(!selectedRoles.length||new Set(selectedRoles).size!==selectedRoles.length||selectedRoles.some(name=>!roles.some(row=>row.name===name)))throw Error('Exact unique trusted role selection required');
 const checkedRoles=roles.filter(row=>selectedRoles.includes(row.name));
 if(roles.some(role=>!env[role.password]))throw Error('All explicit hosted role credentials required');
 await assertPilotDatabaseOnConnection(scope.environmentMarker,<Row extends QueryResultRow=QueryResultRow>(sql:string,values:readonly unknown[]=[])=>db.query<Row>(sql,[...values]));
 const workspace=(await db.query("SELECT classification,pilot_environment_id,active FROM workspaces WHERE id=$1",[scope.workspaceId])).rows[0];
 if(workspace?.classification!=='synthetic_pilot'||workspace.pilot_environment_id!==scope.environmentMarker||!workspace.active)throw Error('Exact synthetic read scope required');
 const customers=(await db.query('SELECT id,synthetic FROM customer_references WHERE workspace_id=$1 ORDER BY id LIMIT 21',[scope.workspaceId])).rows;
 if(customers.length<2||customers.length>20||customers.some(row=>row.synthetic!==true))throw Error('Bounded positive and denied synthetic customers required');
 const allIds=customers.map(row=>String(row.id));
 const members=(await db.query(`SELECT m.id,m.principal_id,m.kind,m.role,p.login_name FROM memberships m JOIN principals p ON p.id=m.principal_id AND p.active
  LEFT JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id WHERE m.workspace_id=$1 AND m.active AND p.login_name=ANY($2::text[]) AND (m.kind='internal' OR o.active)`,[scope.workspaceId,roles.map(role=>role.login)])).rows;
 if(members.length!==roles.length||roles.some(role=>!members.some(row=>row.login_name===role.login&&row.kind===role.kind&&row.role===role.role)))throw Error('All exact active pilot memberships required');
 const partner=members.find(row=>row.login_name==='partner')!;
 const assigned=(await db.query("SELECT customer_id FROM customer_grants WHERE workspace_id=$1 AND membership_id=$2 AND state='active' ORDER BY customer_id",[scope.workspaceId,partner.id])).rows.map(row=>String(row.customer_id));
 if(!assigned.length||assigned.length>=allIds.length||assigned.some(id=>!allIds.includes(id)))throw Error('Positive and denied partner scope required');
 const origin=new URL(scope.origin).origin,cases:{id:string;role:string;state:'pass';status:number}[]=[];
 async function call(path:string,method:'GET'|'POST',headers:Headers,body?:string,cleanup=false){
  if(!cleanup)signal.throwIfAborted();
  const requestSignal=cleanup?AbortSignal.timeout(5000):AbortSignal.any([signal,AbortSignal.timeout(10000)]);
  const response=await transport(origin+path,{method,headers,body,redirect:'manual',cache:'no-store',signal:requestSignal});
  if(!cleanup&&path!=='/api/auth/login'&&response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Hosted response release version differs');}
  return response;
 }
 for(const role of checkedRoles){
  signal.throwIfAborted();const expected=members.find(row=>row.login_name===role.login)!;
  const headers=new Headers({origin,'content-type':'application/json'});
  if(env.TURAS_PILOT_HOSTED_BYPASS_SECRET)headers.set('x-vercel-protection-bypass',env.TURAS_PILOT_HOSTED_BYPASS_SECRET);
  let token:string|undefined,csrf:string|undefined,revoked=false;
  try{
   const probe=await call('/api/auth/session','GET',headers);await probe.body?.cancel();if(probe.status!==401)throw Error('Unauthenticated hosted session boundary differs');
   const login=await call('/api/auth/login','POST',headers,JSON.stringify({username:role.login,password:env[role.password],workspace:'pilot'}));
   if(login.status!==200)throw Error('Hosted role login failed');
   const cookies=login.headers.getSetCookie().filter(value=>value.startsWith('__Host-turas_session='));
   const cookie=cookies.length===1?cookies[0]:'';
   token=/^__Host-turas_session=([A-Za-z0-9_-]{43});/.exec(cookie)?.[1];
   if(token)headers.set('cookie','__Host-turas_session='+token);
   if(!token||!/(?:^|;)\s*Secure(?:;|$)/i.test(cookie)||!/(?:^|;)\s*HttpOnly(?:;|$)/i.test(cookie)||/(?:^|;)\s*Domain=/i.test(cookie))throw Error('Hosted session cookie boundary differs');
   const body=z.object({data:z.object({csrfToken:z.string().regex(/^[a-f0-9]{64}$/)})}).parse(await boundedHostedJson(login));csrf=body.data.csrfToken;
   headers.set('cookie','__Host-turas_session='+token);headers.set('x-csrf-token',csrf);
   if(login.headers.get('x-turas-code-version')!==scope.sourceCommit)throw Error('Hosted response release version differs');
   const current=await call('/api/auth/session','GET',headers);if(current.status!==200)throw Error('Actual hosted session unavailable');
   const session=sessionEnvelope.parse(await boundedHostedJson(current)).data;
   if(session.principal.id!==expected.principal_id||session.principal.loginName!==role.login||session.workspace.id!==scope.workspaceId||session.membership.id!==expected.id||session.membership.kind!==role.kind||session.membership.role!==role.role||session.csrfToken!==csrf)throw Error('Actual hosted membership differs');
   const row=(await db.query('SELECT principal_id,membership_id,workspace_id,revoked_at FROM login_sessions WHERE token_hash=$1',[createHash('sha256').update(token).digest('hex')])).rows[0];
   if(!row||row.principal_id!==expected.principal_id||row.membership_id!==expected.id||row.workspace_id!==scope.workspaceId||row.revoked_at!==null)throw Error('Hosted session belongs to another database or scope');
   cases.push({id:'session-bound',role:role.name,state:'pass',status:200});
   const listing=await call('/api/customers?limit=25','GET',headers);if(listing.status!==200)throw Error('Hosted customer read failed');
   const list=z.object({data:z.object({items:z.array(z.object({id:z.uuid(),synthetic:z.literal(true)})).max(20),nextCursor:z.null()})}).parse(await boundedHostedJson(listing)).data;
   const ids=list.items.map(row=>row.id).sort(),expectedIds=[...(role.kind==='partner'?assigned:allIds)].sort();
   if(JSON.stringify(ids)!==JSON.stringify(expectedIds))throw Error('Hosted customer scope leaked or missed assigned records');
   cases.push({id:'positive-customer-scope',role:role.name,state:'pass',status:200});
   const status=await call('/api/operations/status','GET',headers),expectedStatus=role.role==='admin'?200:403;
   if(status.status!==expectedStatus)throw Error('Hosted operational authority differs');
   if(role.role==='admin'&&expectedConfiguration){
    const health=z.object({data:z.object({configuration:z.unknown()})}).parse(await boundedHostedJson(status));
    verifyHostedConfiguration(health.data.configuration,expectedConfiguration);
   }else await status.body?.cancel();
   cases.push({id:'operations-authority',role:role.name,state:'pass',status:expectedStatus});
   const gaps=await call('/api/product-gaps','GET',headers),expectedGaps=role.kind==='internal'?200:404;
   if(gaps.status!==expectedGaps)throw Error('Hosted Product Gaps read failed or disclosed partner content');
   if(role.kind==='internal'){const payload=z.object({data:z.object({contractVersion:z.literal('product-gaps-v1')})}).parse(await boundedHostedJson(gaps));void payload;}else await gaps.body?.cancel();
   cases.push({id:'product-gaps-read-boundary',role:role.name,state:'pass',status:expectedGaps});
   if(proveRole)await proveRole({role:role.name,headers:new Headers(headers),customerIds:expectedIds,allCustomerIds:allIds,partnerCustomerIds:[...assigned]});
  }finally{
   // A successful login can create a session before its body is damaged. Recover
   // only this cookie's CSRF through normal session admission, never log in again
   // or revoke arbitrary sessions through owner SQL. Cleanup survives cancellation.
   if(token&&!csrf){
    const current=await call('/api/auth/session','GET',headers,undefined,true);
    if(current.status!==200)throw Error('Exact hosted cleanup session unavailable');
    const session=sessionEnvelope.parse(await boundedHostedJson(current)).data;
    if(session.principal.id!==expected.principal_id||session.workspace.id!==scope.workspaceId||session.membership.id!==expected.id)throw Error('Exact hosted cleanup membership differs');
    csrf=session.csrfToken;headers.set('x-csrf-token',csrf);
   }
   if(token&&csrf){
    const response=await call('/api/auth/logout','POST',headers,undefined,true);await response.body?.cancel();
    const row=(await db.query('SELECT revoked_at FROM login_sessions WHERE token_hash=$1',[createHash('sha256').update(token).digest('hex')])).rows[0];
    if(response.status!==200||!row?.revoked_at)throw Error('Exact hosted test session cleanup unverified');revoked=true;
    if(response.headers.get('x-turas-code-version')!==scope.sourceCommit)throw Error('Hosted cleanup response release version differs');
   }
  }
  if(!revoked)throw Error('Hosted role cleanup incomplete');cases.push({id:'exact-session-revoked',role:role.name,state:'pass',status:200});
 }
 return {contract:'pilot-hosted-read-checks-v1' as const,cases,passedCases:cases.length,sessionsRevoked:checkedRoles.length,customerReferencesVerified:allIds.length,providerCalls:0,domainWritesPerformed:0,acceptedJourneysVerified:false,fullHostedCatalogVerified:false};
}
