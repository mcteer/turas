import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {boundedHostedJson} from './pilot-hosted-http';

/** An independently bound primary session reads only to prove pilot exclusion.
 * Its sole POSTs are login/logout. No primary customer record is mutated. */
export async function runHostedPrimaryExclusion(input:{scope:PilotHostedScope;db:Client;gapIds:readonly string[];reportId:string;query:string;signal:AbortSignal;transport?:typeof fetch;env?:NodeJS.ProcessEnv}){
 const {scope,db,signal}=input,transport=input.transport??fetch,env=input.env??process.env;
 const gaps=z.array(z.uuid()).min(1).max(5).parse(input.gapIds),reportId=z.uuid().parse(input.reportId),query=z.string().regex(/^[a-f0-9]{8}$/).parse(input.query);
 if(new Set(gaps).size!==gaps.length||!env.TURAS_PILOT_HOSTED_ADMIN_PASSWORD)throw Error('Exact primary read probe and credential required');
 const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
 if(marker.length!==1||marker[0].environment_id!==scope.environmentMarker||Number(marker[0].schema_version)!==CURRENT_SCHEMA_VERSION)throw Error('Exact primary probe database required');
 const rows=(await db.query(`SELECT w.id AS workspace_id,m.id AS membership_id,m.principal_id FROM workspaces w
  JOIN memberships m ON m.workspace_id=w.id AND m.active AND m.kind='internal' AND m.role='admin'
  JOIN principals p ON p.id=m.principal_id AND p.active AND p.login_name='mcteer'
  WHERE w.active AND w.classification='primary'`)).rows;
 if(rows.length!==1||rows[0].workspace_id===scope.workspaceId)throw Error('Exact separate primary membership required');const expected=rows[0];
 const origin=new URL(scope.origin).origin,headers=new Headers({origin,'content-type':'application/json'});
 if(env.TURAS_PILOT_HOSTED_BYPASS_SECRET)headers.set('x-vercel-protection-bypass',env.TURAS_PILOT_HOSTED_BYPASS_SECRET);
 const session=z.object({data:z.object({principal:z.object({id:z.uuid(),loginName:z.literal('mcteer')}),workspace:z.object({id:z.uuid(),classification:z.literal('primary')}),membership:z.object({id:z.uuid(),kind:z.literal('internal'),role:z.literal('admin')}),csrfToken:z.string().regex(/^[a-f0-9]{64}$/)})});
 let token:string|undefined,csrf:string|undefined,revoked=false;
 async function call(path:string,method:'GET'|'POST',body?:unknown,cleanup=false){
  if(!cleanup)signal.throwIfAborted();const response=await transport(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',cache:'no-store',signal:cleanup?AbortSignal.timeout(5000):AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(path!=='/api/auth/login'&&response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Primary probe release differs');}return response;
 }
 const tokenHash=()=>createHash('sha256').update(token!).digest('hex');
 function bound(value:z.infer<typeof session>['data']){if(value.principal.id!==expected.principal_id||value.workspace.id!==expected.workspace_id||value.membership.id!==expected.membership_id)throw Error('Primary probe session scope differs');return value;}
 try{
  const login=await call('/api/auth/login','POST',{username:'mcteer',password:env.TURAS_PILOT_HOSTED_ADMIN_PASSWORD,workspace:'primary'});
  if(login.status!==200){await login.body?.cancel();throw Error('Primary probe login failed');}
  const name=new URL(origin).protocol==='https:'?'__Host-turas_session':'turas_session';
  const cookies=login.headers.getSetCookie().filter(value=>value.startsWith(name+'='));
  const cookie=cookies.length===1?cookies[0]:'';token=new RegExp('^'+name+'=([A-Za-z0-9_-]{43});').exec(cookie)?.[1];
  if(token)headers.set('cookie',name+'='+token);
  if(!token||!/(?:^|;)\s*HttpOnly(?:;|$)/i.test(cookie)||/(?:^|;)\s*Domain=/i.test(cookie)||new URL(origin).protocol==='https:'&&!/(?:^|;)\s*Secure(?:;|$)/i.test(cookie))throw Error('Primary probe cookie differs');
  csrf=z.object({data:z.object({csrfToken:z.string().regex(/^[a-f0-9]{64}$/)})}).parse(await boundedHostedJson(login)).data.csrfToken;headers.set('x-csrf-token',csrf);
  if(login.headers.get('x-turas-code-version')!==scope.sourceCommit)throw Error('Primary probe login release differs');
  const current=await call('/api/auth/session','GET');if(current.status!==200)throw Error('Actual primary probe session unavailable');const actual=bound(session.parse(await boundedHostedJson(current)).data);if(actual.csrfToken!==csrf)throw Error('Primary probe CSRF differs');
  const persisted=(await db.query('SELECT principal_id,membership_id,workspace_id,revoked_at FROM login_sessions WHERE token_hash=$1',[tokenHash()])).rows[0];
  if(!persisted||persisted.principal_id!==expected.principal_id||persisted.membership_id!==expected.membership_id||persisted.workspace_id!==expected.workspace_id||persisted.revoked_at!==null)throw Error('Actual primary probe database session differs');
  for(const path of [...gaps.map(id=>'/api/product-gaps/'+id),'/api/product-gaps/reports/'+reportId]){const response=await call(path,'GET');await response.body?.cancel();if(response.status!==404)throw Error('Pilot record entered primary reads');}
  const listing=await call('/api/product-gaps?query='+query+'&limit=25','GET');if(listing.status!==200)throw Error('Primary scoped registry read failed');
  const list=z.object({data:z.object({contractVersion:z.literal('product-gaps-v1'),items:z.array(z.unknown()).length(0),nextCursor:z.null()})}).parse(await boundedHostedJson(listing));void list;
 }finally{
  if(token&&!csrf){const response=await call('/api/auth/session','GET',undefined,true);if(response.status!==200)throw Error('Exact primary cleanup session unavailable');csrf=bound(session.parse(await boundedHostedJson(response)).data).csrfToken;headers.set('x-csrf-token',csrf);}
  if(token&&csrf){const response=await call('/api/auth/logout','POST',undefined,true);await response.body?.cancel();const row=(await db.query('SELECT revoked_at FROM login_sessions WHERE token_hash=$1',[tokenHash()])).rows[0];if(response.status!==200||!row?.revoked_at)throw Error('Exact primary probe session cleanup unverified');revoked=true;}
 }
 if(!revoked)throw Error('Primary probe cleanup incomplete');
 return {contract:'pilot-hosted-primary-exclusion-v1',directDenials:gaps.length+1,registryEmpty:true,sessionRevoked:true,primaryCustomerWrites:0,providerCalls:0,fullHostedCatalogVerified:false};
}
