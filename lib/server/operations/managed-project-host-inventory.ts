import {z} from 'zod';
import {bindManagedRunProvider} from './managed-workflow-provider';
import {inventoryManagedDeployments} from './managed-deployment-inventory';
import {inventoryManagedAliases} from './managed-alias-inventory';
import {deriveWorkHostInventory} from './work-host-inventory';
const scopeSchema=z.strictObject({projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),token:z.string().min(1).max(8192),target:z.enum(['preview','production'])});
const actualInventories=new WeakMap<object,{startedAt:number;projectId:string;teamId:string}>();
/** Fixed actual complete metadata reads. Secret-bearing HTTP probes may consume
 * only hostnames from this privately registered project-wide inventory. */
export async function readManagedProjectHostInventory(raw:z.infer<typeof scopeSchema>,parentSignal:AbortSignal){
 const scope=scopeSchema.parse(raw),startedAt=Date.now(),processObservationStart=performance.now(),signal=AbortSignal.any([parentSignal,AbortSignal.timeout(300000)]);
 const provider=await bindManagedRunProvider(scope,signal);
 const deployments=await inventoryManagedDeployments({projectId:scope.projectId,teamId:scope.teamId,cutoff:startedAt,maximumDeployments:10000,maximumPages:100,referencedDeploymentIds:[],list:provider.listProjectDeployments,signal});
 const aliases=await inventoryManagedAliases({projectId:scope.projectId,teamId:scope.teamId,cutoff:startedAt,list:provider.listProjectAliases,signal});
 const inventory=deriveWorkHostInventory({deployments:deployments.rows.map(row=>({id:row.id,url:row.url})),aliases:aliases.rows,maximumHosts:20000});
 // Revalidate actual ownership after the complete bounded traversal. Host and
 // policy drift across services still need the final compound repeat.
 await bindManagedRunProvider(scope,signal);signal.throwIfAborted();if(Date.now()<startedAt||Date.now()-startedAt>300000)throw Error('Original host inventory measurement deadline ended');
 const proof=Object.freeze({...inventory,projectId:scope.projectId,teamId:scope.teamId,deploymentInventoryDigest:deployments.inventoryDigest,aliasInventoryDigest:aliases.inventoryDigest,asOf:new Date(startedAt).toISOString(),processObservationStart,providerReadVerified:true as const,rows:Object.freeze(inventory.rows.map(row=>Object.freeze({...row,sources:Object.freeze(row.sources)})))});
 actualInventories.set(proof,{startedAt,projectId:scope.projectId,teamId:scope.teamId});return proof;
}
export function requireManagedProjectHostInventory(proof:Awaited<ReturnType<typeof readManagedProjectHostInventory>>,scope:{projectId:string;teamId:string}){
 const actual=actualInventories.get(proof),age=actual?Date.now()-actual.startedAt:Infinity;
 if(!actual||age<0||age>300000||scope.projectId!==actual.projectId||scope.teamId!==actual.teamId)throw Error('Genuine fresh complete project host inventory required');return proof;
}
