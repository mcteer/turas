import {recoveryDigest} from '../../contracts/pilot-recovery';
import {canonicalManagedHost} from './managed-alias-inventory';

type Deployment={id:string;url:string};
type Alias={id:string;host:string;deploymentId:string|null;deploymentHost:string|null;deletedAt:number|null;redirect:string|null;redirectStatusCode:number|null};
/** The host union includes every immutable deployment URL and every live alias.
 * An alias cannot silently disappear because its deployment is old or deleted.
 * Routing ambiguity blocks HTTP proof rather than narrowing its host census. */
export function deriveWorkHostInventory(input:{deployments:readonly Deployment[];aliases:readonly Alias[];maximumHosts:number}){
 if(!Number.isSafeInteger(input.maximumHosts)||input.maximumHosts<1||input.maximumHosts>20000)throw Error('Finite host census bound required');
 const deployments=new Map<string,string>(),hosts=new Map<string,{host:string;deploymentId:string;sources:string[]}>();
 const add=(host:string,deploymentId:string,source:string)=>{
  const previous=hosts.get(host);if(previous&&previous.deploymentId!==deploymentId)throw Error('Conflicting hostname deployment bindings');
  if(previous)previous.sources.push(source);else hosts.set(host,{host,deploymentId,sources:[source]});
  if(hosts.size>input.maximumHosts)throw Error('Host census bound exceeded');
 };
 for(const row of input.deployments){
  if(!/^dpl_[A-Za-z0-9]+$/.test(row.id)||deployments.has(row.id))throw Error('Exact unique deployment identity required');
  const host=canonicalManagedHost(row.url);deployments.set(row.id,host);add(host,row.id,'deployment:'+row.id);
 }
 const aliases=new Set<string>();
 for(const row of input.aliases){
  if(!row.id||aliases.has(row.id))throw Error('Exact unique alias identity required');aliases.add(row.id);
  if(row.deletedAt!==null)continue;
  if(row.redirect!==null||row.redirectStatusCode!==null||!row.deploymentId||!/^dpl_[A-Za-z0-9]+$/.test(row.deploymentId)||!row.deploymentHost)throw Error('Live alias routing requires exact deployment binding');
  const host=canonicalManagedHost(row.host),deploymentHost=canonicalManagedHost(row.deploymentHost),known=deployments.get(row.deploymentId);
  if(known!==undefined&&known!==deploymentHost)throw Error('Alias immutable deployment host differs');
  deployments.set(row.deploymentId,deploymentHost);
  // Preserve a live alias and its reported immutable host even when the current
  // deployment list omits that deployment. Separate retirement proof is needed.
  add(deploymentHost,row.deploymentId,'alias-deployment:'+row.id);add(host,row.deploymentId,'alias:'+row.id);
 }
 const rows=[...hosts.values()].map(row=>({...row,sources:row.sources.sort()})).sort((a,b)=>a.host.localeCompare(b.host,'en'));
 return {contract:'pilot-work-host-inventory-v1' as const,rows,inventoryDigest:recoveryDigest(rows),httpAdmissionClosed:false as const,restorationReady:false as const};
}
