import {z} from 'zod';
import {pilotHostedScopeSchema,verifyHostedDeployment,hostedDeploymentLookupPath,type PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {operationalDatabaseBindingSchema,databaseTargetDigest} from '../lib/server/operations/database-binding';
import {boundedHostedJson} from './pilot-hosted-http';

export const managedOperationsSessionSchema=z.strictObject({contract:z.literal('pilot-hosted-operations-session-v1'),origin:z.url().refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&url.origin===value&&!url.username&&!url.password;}catch{return false;}}),cookie:z.string().regex(/^__Host-turas_session=[A-Za-z0-9_-]{43}$/),protectionBypass:z.string().min(1).max(8192).optional()});
/** Real platform alias/deployment checks precede sending the scoped cookie.
 * Only the authenticated canonical-admin status route can produce the runtime
 * observation; a supplied fingerprint/healthy JSON is never an input proof. */
export async function verifyManagedRuntimeBinding(input:{scope:PilotHostedScope;session:z.infer<typeof managedOperationsSessionSchema>;sourceConnection:string;recoveryId:string;controlRevision:number;token:string;signal:AbortSignal;transport?:typeof fetch}){
 const scope=pilotHostedScopeSchema.parse(input.scope),session=managedOperationsSessionSchema.parse(input.session),transport=input.transport??fetch;
 z.uuid().parse(input.recoveryId);z.number().int().positive().parse(input.controlRevision);z.string().min(1).max(8192).parse(input.token);
 if(scope.origin!==session.origin)throw Error('Exact operations session origin required');
 const apiHeaders=new Headers({authorization:'Bearer '+input.token});
 async function get(url:string,headers:Headers){
  input.signal.throwIfAborted();const response=await transport(url,{method:'GET',headers,redirect:'error',cache:'no-store',signal:AbortSignal.any([input.signal,AbortSignal.timeout(15000)])});
  if(response.status!==200){await response.body?.cancel();throw Error('Runtime binding response unavailable');}
  return {body:await boundedHostedJson(response),version:response.headers.get('x-turas-code-version')};
 }
 const endpoint='https://api.vercel.com'+hostedDeploymentLookupPath(scope);
 const deployment=verifyHostedDeployment((await get(endpoint,apiHeaders)).body,scope);
 if(JSON.stringify(verifyHostedDeployment((await get('https://api.vercel.com'+hostedDeploymentLookupPath(scope,true),apiHeaders)).body,scope))!==JSON.stringify(deployment))throw Error('Runtime binding alias differs');
 const headers=new Headers({cookie:session.cookie});if(session.protectionBypass)headers.set('x-vercel-protection-bypass',session.protectionBypass);
 const response=await get(scope.origin+'/api/operations/status',headers);
 if(response.version!==scope.sourceCommit)throw Error('Runtime binding response version differs');
 const observed=operationalDatabaseBindingSchema.parse(z.object({data:z.object({connectionBinding:z.unknown()})}).parse(response.body).data.connectionBinding),now=Date.now();
 if(observed.codeVersion!==scope.sourceCommit||observed.environmentId!==scope.environmentMarker||observed.databaseBindingDigest!==databaseTargetDigest(input.sourceConnection,scope.environmentMarker)||observed.mode!=='locked'||observed.controlRevision!==input.controlRevision||observed.recoveryId!==input.recoveryId||!observed.effectiveRuntimeRole||!observed.directRuntimeLogin||Date.parse(observed.measuredAt)<now-60000||Date.parse(observed.measuredAt)>now+30000)throw Error('Authenticated runtime database or recovery binding differs');
 return {contract:'pilot-authenticated-runtime-database-binding-v1' as const,deployment,observation:observed,authenticatedStatusVerified:true as const,serviceOpened:false as const,restorationReady:false as const};
}
