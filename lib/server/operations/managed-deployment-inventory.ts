import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';

const deploymentId=z.string().max(256).regex(/^dpl_[A-Za-z0-9]+$/);
const rowSchema=z.object({
 uid:deploymentId.optional(),id:deploymentId.optional(),projectId:z.string().optional(),
 created:z.unknown().optional(),createdAt:z.unknown().optional(),
 url:z.string().max(253).regex(/^[A-Za-z0-9.-]+\.vercel\.app$/),
 target:z.enum(['production','preview','staging']).nullable().optional(),
 readyState:z.enum(['QUEUED','BUILDING','READY','ERROR','CANCELED','INITIALIZING']),
 meta:z.object({githubCommitSha:z.string().regex(/^[a-f0-9]{40}$/).nullable().optional()}).nullable().optional(),
}).refine(row=>!!(row.uid||row.id)&&!(row.uid&&row.id&&row.uid!==row.id),'Exact deployment identity required');
export const managedDeploymentPageSchema=z.object({deployments:z.array(rowSchema).max(100),
 pagination:z.object({next:z.number().int().nonnegative().nullable()})});
const scopeSchema=z.strictObject({projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),
 teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),cutoff:z.number().int().nonnegative().max(8640000000000000),
 maximumDeployments:z.number().int().min(1).max(10000),maximumPages:z.number().int().min(1).max(100),
 referencedDeploymentIds:z.array(deploymentId).max(10000)});

/** Complete project metadata at a fixed cutoff, deliberately without a target,
 * state, branch or run-binding filter. This is not a retirement capability: old
 * deployments, aliases, credentials and active workflows still require fencing. */
export async function inventoryManagedDeployments(input:z.infer<typeof scopeSchema>&{
 list:(until:number)=>Promise<unknown>;signal:AbortSignal;
}){
 const scope=scopeSchema.parse({projectId:input.projectId,teamId:input.teamId,cutoff:input.cutoff,
  maximumDeployments:input.maximumDeployments,maximumPages:input.maximumPages,
  referencedDeploymentIds:input.referencedDeploymentIds});
 if(new Set(scope.referencedDeploymentIds).size!==scope.referencedDeploymentIds.length)throw Error('Unique referenced deployments required');
 async function traverse(){
  let until=scope.cutoff,pages=0,bytes=0;const ids=new Set<string>(),cursors=new Set<number>();
  const rows:Array<{id:string;created:number;url:string;target:'production'|'preview'|'staging'|null;readyState:z.infer<typeof rowSchema>['readyState'];commit:string|null}>=[];
  for(;;){
   input.signal.throwIfAborted();if(pages>=scope.maximumPages)throw Error('Deployment inventory page bound exceeded');
   const page=managedDeploymentPageSchema.parse(await input.list(until));input.signal.throwIfAborted();pages++;
   for(const raw of page.deployments){
    const id=raw.uid??raw.id!,created=z.number().int().nonnegative().safe().parse(raw.created??raw.createdAt);
    if(ids.has(id))throw Error('Duplicate deployment inventory identity');
    if(raw.projectId!==undefined&&raw.projectId!==scope.projectId||created>scope.cutoff||created>until)throw Error('Deployment inventory scope differs');
    const row={id,created,url:raw.url,target:raw.target??null,readyState:raw.readyState,commit:raw.meta?.githubCommitSha??null};
    bytes+=Buffer.byteLength(JSON.stringify(row));if(bytes>4194304)throw Error('Deployment inventory metadata byte bound exceeded');
    ids.add(id);rows.push(row);if(rows.length>scope.maximumDeployments)throw Error('Deployment inventory count bound exceeded');
   }
   const next=page.pagination.next;if(next===null)break;
   if(!page.deployments.length||next>=until||cursors.has(next))throw Error('Deployment inventory cursor did not advance');
   cursors.add(next);until=next;
  }
  rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);return {rows,pages};
 }
 const first=await traverse(),second=await traverse();
 if(recoveryDigest(first.rows)!==recoveryDigest(second.rows))throw Error('Deployment inventory changed between traversals');
 const known=new Set(second.rows.map(row=>row.id));
 return {contract:'pilot-managed-deployment-inventory-v1' as const,projectId:scope.projectId,teamId:scope.teamId,
  asOf:new Date(scope.cutoff).toISOString(),rows:second.rows,pages:[first.pages,second.pages],
  inventoryDigest:recoveryDigest(second.rows),identityDigest:recoveryDigest(second.rows.map(row=>row.id)),
  unlistedReferencedDeploymentIds:scope.referencedDeploymentIds.filter(id=>!known.has(id)).sort(),
  repeatedTraversalVerified:true as const,providerSnapshotVerified:false as const,allProjectTargetsRequested:true as const,
  deploymentProtectionVerified:false as const,oldDeploymentsClosed:false as const,retirementAuthorized:false as const,
  providerWrites:0,restorationReady:false as const};
}
