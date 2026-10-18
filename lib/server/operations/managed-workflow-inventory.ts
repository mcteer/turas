import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
const runId=z.string().regex(/^wrun_[A-Za-z0-9_-]{1,240}$/);
export const managedRunMetadataSchema=z.object({runId,deploymentId:z.string().max(256).regex(/^dpl_[A-Za-z0-9]+$/),workflowName:z.string().min(1).max(512),status:z.enum(['pending','running','completed','failed','cancelled'])});
export const managedRunPageSchema=z.object({data:z.array(managedRunMetadataSchema).max(100),cursor:z.string().min(1).max(8192).nullable(),hasMore:z.boolean()});
/** Stable identity only: cancellation may change status, never run/deployment/name. */
export function managedRunIdentityDigest(runs:unknown){
 const rows=z.array(managedRunMetadataSchema).max(10000).parse(runs);
 if(new Set(rows.map(row=>row.runId)).size!==rows.length)throw Error('Unique managed run identities required');
 return recoveryDigest(rows.map(({runId,deploymentId,workflowName})=>({runId,deploymentId,workflowName})).sort((a,b)=>a.runId<b.runId?-1:a.runId>b.runId?1:0));
}
const limits=z.strictObject({maxRuns:z.number().int().min(1).max(10000),maxPages:z.number().int().min(1).max(200),expectedRunIds:z.array(runId).max(10000)});
/** Two complete unfiltered lazy-metadata traversals. This detects omitted
 * application bindings, cursor cycles, duplicate IDs, overflow and inventory
 * drift. It does not establish a provider snapshot, retired deployments,
 * terminal closure, effects reconciliation or supported native resumption. */
export async function inventoryManagedRuns(input:{list:(cursor:string|null)=>Promise<unknown>;signal:AbortSignal;maxRuns:number;maxPages:number;expectedRunIds:string[]}){
 const scope=limits.parse({maxRuns:input.maxRuns,maxPages:input.maxPages,expectedRunIds:input.expectedRunIds});
 if(new Set(scope.expectedRunIds).size!==scope.expectedRunIds.length)throw Error('Unique managed application bindings required');
 async function traverse(){
  const rows=new Map<string,z.infer<typeof managedRunMetadataSchema>>(),cursors=new Set<string>();let cursor:string|null=null,pages=0,metadataBytes=0;
  for(;;){
   input.signal.throwIfAborted();if(pages>=scope.maxPages)throw Error('Managed inventory page bound exceeded');
   const page=managedRunPageSchema.parse(await input.list(cursor));input.signal.throwIfAborted();pages++;
   for(const row of page.data){metadataBytes+=Buffer.byteLength(JSON.stringify(row));if(metadataBytes>4194304)throw Error('Managed inventory metadata byte bound exceeded');if(rows.has(row.runId))throw Error('Duplicate managed inventory run');rows.set(row.runId,row);if(rows.size>scope.maxRuns)throw Error('Managed inventory run bound exceeded');}
   if(!page.hasMore)break;
   if(!page.data.length||page.cursor===null||cursors.has(page.cursor))throw Error('Managed inventory cursor did not advance');
   cursors.add(page.cursor);cursor=page.cursor;
  }
  return {pages,runs:[...rows.values()].sort((a,b)=>a.runId<b.runId?-1:a.runId>b.runId?1:0)};
 }
 const before=await traverse(),after=await traverse();
 if(recoveryDigest(before.runs)!==recoveryDigest(after.runs))throw Error('Managed inventory changed between traversals');
 const known=new Set(after.runs.map(row=>row.runId)),expected=new Set(scope.expectedRunIds);
 if(scope.expectedRunIds.some(id=>!known.has(id)))throw Error('Managed application binding missing from provider inventory');
 const providerOnlyRunIds=after.runs.filter(row=>!expected.has(row.runId)).map(row=>row.runId);
 return {contract:'pilot-managed-inventory-v1' as const,capturedAt:new Date().toISOString(),runs:after.runs,inventoryDigest:recoveryDigest(after.runs),identityDigest:managedRunIdentityDigest(after.runs),pages:[before.pages,after.pages],expectedApplicationBindings:expected.size,providerOnlyRunIds,
  repeatedTraversalVerified:true as const,providerSnapshotVerified:false as const,oldDeploymentsClosed:false as const,allProviderRunsClosed:false as const,paidEffectsReconciled:false as const,workflowResumed:false as const,restorationReady:false as const};
}
