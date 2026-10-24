import {isIP} from 'node:net';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
/** Normalize only DNS host spelling/default HTTPS ports. Never accept a URL,
 * wildcard, credentials, path or nonstandard port as an inventory hostname. */
export function canonicalManagedHost(raw:string){
 if(typeof raw!=='string'||raw!==raw.trim()||raw.length>260||/[\s/\\?#@]/.test(raw)||raw.endsWith(':'))throw Error('Exact managed DNS host required');
 const url=new URL('https://'+raw),host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||isIP(host)||host.length>253||!host.includes('.')||host.split('.').some(label=>!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw Error('Exact managed DNS host required');
 return host;
}
const id=z.string().min(1).max(256),deploymentId=z.string().regex(/^dpl_[A-Za-z0-9]+$/),time=z.number().int().nonnegative().safe();
const alias=z.strictObject({alias:z.string().min(1).max(260),created:z.string().max(64),createdAt:time,creator:z.unknown(),deletedAt:time.nullable(),deployment:z.strictObject({id:deploymentId,url:z.string().max(260)}).nullable(),deploymentId:deploymentId.nullable(),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),redirect:z.string().max(2048).nullable(),redirectStatusCode:z.number().int().min(300).max(399).nullable(),uid:id,updatedAt:time});
export const managedAliasPageSchema=z.strictObject({aliases:z.array(alias).max(100),pagination:z.strictObject({count:z.number().int().nonnegative().max(100),next:time.nullable(),prev:time.nullable()})});
type Row={id:string;host:string;deploymentId:string|null;deploymentHost:string|null;createdAt:number;updatedAt:number;deletedAt:number|null;redirect:string|null;redirectStatusCode:number|null};
/** Two complete project-wide traversals, with no domain/branch/target filters.
 * Metadata only: no hostname receives credentials and no closure is granted. */
export async function inventoryManagedAliases(input:{projectId:string;teamId:string;cutoff:number;list:(until:number)=>Promise<unknown>;signal:AbortSignal}){
 z.string().regex(/^prj_[A-Za-z0-9]+$/).parse(input.projectId);z.string().regex(/^team_[A-Za-z0-9]+$/).parse(input.teamId);time.parse(input.cutoff);
 async function traverse(){
  const ids=new Set<string>(),hosts=new Set<string>(),cursors=new Set<number>(),rows:Row[]=[];let until=input.cutoff,pages=0,bytes=0;
  for(;;){
   input.signal.throwIfAborted();if(pages>=100)throw Error('Alias inventory page bound exceeded');
   const page=managedAliasPageSchema.parse(await input.list(until));input.signal.throwIfAborted();pages++;
   if(page.pagination.count!==page.aliases.length)throw Error('Alias inventory page count differs');
   for(const raw of page.aliases){
    const host=canonicalManagedHost(raw.alias);
    if(raw.projectId!==input.projectId||raw.createdAt>until||raw.createdAt>input.cutoff||raw.updatedAt<raw.createdAt||raw.deployment?.id!==undefined&&raw.deployment.id!==raw.deploymentId||ids.has(raw.uid)||hosts.has(host))throw Error('Alias inventory identity or scope differs');
    const row={id:raw.uid,host,deploymentId:raw.deploymentId,deploymentHost:raw.deployment?canonicalManagedHost(raw.deployment.url):null,createdAt:raw.createdAt,updatedAt:raw.updatedAt,deletedAt:raw.deletedAt,redirect:raw.redirect,redirectStatusCode:raw.redirectStatusCode};
    bytes+=Buffer.byteLength(JSON.stringify(row));if(bytes>4194304||rows.length>=10000)throw Error('Alias inventory exceeds bound');ids.add(row.id);hosts.add(host);rows.push(row);
   }
   const next=page.pagination.next;if(next===null)break;
   if(!page.aliases.length||next>=until||cursors.has(next))throw Error('Alias inventory cursor did not advance');cursors.add(next);until=next;
  }
  rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);return {rows,pages};
 }
 const first=await traverse(),second=await traverse();if(recoveryDigest(first.rows)!==recoveryDigest(second.rows))throw Error('Alias inventory changed between traversals');
 return {contract:'pilot-managed-alias-inventory-v1' as const,projectId:input.projectId,teamId:input.teamId,asOf:new Date(input.cutoff).toISOString(),rows:second.rows,pages:[first.pages,second.pages],inventoryDigest:recoveryDigest(second.rows),repeatedTraversalVerified:true as const,oldHostsClosed:false as const,providerWrites:0,restorationReady:false as const};
}
