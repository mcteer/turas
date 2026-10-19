import type {Client} from 'pg';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {withLockedWorkRecoveryDecision,requireLockedWorkRecoveryConnection,isWorkRecoveryDecisionClient,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {bindManagedRunProvider} from './managed-workflow-provider';
import {inventoryManagedRuns} from './managed-workflow-inventory';
import {inventoryManagedDeployments} from './managed-deployment-inventory';
import {inventoryManagedAliases} from './managed-alias-inventory';
import {deriveWorkHostInventory} from './work-host-inventory';
import {bindingSchema} from './managed-workflow-closure';
import {currentRecoveryStateDigest} from './recovery-state';
const tokenSchema=z.string().min(1).max(8192);
type Input={target:LockedWorkRecoveryInput;token:string};
export type WorkManagedTerminalInventory=Readonly<{contract:'pilot-work-managed-terminal-inventory-v1';targetDigest:string;applicationBindingsDigest:string;runInventoryDigest:string;deploymentInventoryDigest:string;aliasInventoryDigest:string;hostInventoryDigest:string;hosts:number;enumeratedRuns:number;providerOnlyRuns:number;deployments:number;measuredAt:string;enumeratedInventoryTerminalVerified:true;oldDeploymentsClosed:false;paidEffectsReconciled:false;restorationReady:false}>;
const measured=new WeakMap<object,{token:string;target:'preview'|'production'}>();
const scope=(target:LockedWorkRecoveryTarget)=>({environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
const targetDigest=(target:LockedWorkRecoveryTarget)=>recoveryDigest({...scope(target),projectId:target.projectId,teamId:target.teamId,sourceCommit:target.sourceCommit,sourceDigest:target.sourceDigest,catalogDigest:target.catalogDigest,origin:target.origin,deploymentId:target.deploymentId,databaseBindingDigest:target.databaseBindingDigest});
async function inspect(db:Client,target:LockedWorkRecoveryTarget,token:string,environment:'preview'|'production',signal:AbortSignal){
 if(target.deadline<=Date.now())throw Error('Current finite managed verification required');
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(target.deadline-Date.now())]);bounded.throwIfAborted();
 await requireLockedWorkRecoveryConnection(db,target,scope(target));
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);await currentRecoveryStateDigest(db);
 const rows=(await db.query('SELECT id,eve_session_id FROM conversations WHERE environment_id=$1 AND eve_session_id IS NOT NULL ORDER BY id LIMIT 10001',[target.environmentId])).rows;
 if(rows.length>10000)throw Error('Managed application binding bound exceeded');
 // Bind the actual provider internally. No caller list/read implementation or
 // metadata receipt can manufacture a genuine terminal measurement.
 const provider=await bindManagedRunProvider({projectId:target.projectId,teamId:target.teamId,target:environment,token},bounded);
 const inventory=await inventoryManagedRuns({list:provider.list,signal:bounded,maxRuns:10000,maxPages:200,expectedRunIds:[...new Set(rows.map(row=>String(row.eve_session_id)))]});
 for(const run of inventory.runs){
  bindingSchema.parse({...scope(target),projectId:target.projectId,teamId:target.teamId,runId:run.runId,deploymentId:run.deploymentId,workflowName:run.workflowName});
  if(!['completed','failed','cancelled'].includes(run.status))throw Error('Managed native inventory remains active');
  const current=await provider.read(run.runId);
  if(recoveryDigest(current)!==recoveryDigest(run))throw Error('Managed terminal provider read changed');
 }
 const deployments=await inventoryManagedDeployments({projectId:target.projectId,teamId:target.teamId,cutoff:Date.now(),maximumDeployments:10000,maximumPages:100,referencedDeploymentIds:[...new Set([target.deploymentId,...inventory.runs.map(run=>run.deploymentId)])],list:provider.listProjectDeployments,signal:bounded});
 if(deployments.unlistedReferencedDeploymentIds.length)throw Error('Referenced managed deployment requires separate retirement proof');
 const aliases=await inventoryManagedAliases({projectId:target.projectId,teamId:target.teamId,cutoff:Date.now(),list:provider.listProjectAliases,signal:bounded});
 const hosts=deriveWorkHostInventory({deployments:deployments.rows.map(row=>({id:row.id,url:row.url})),aliases:aliases.rows,maximumHosts:20000});
 const after=await inventoryManagedRuns({list:provider.list,signal:bounded,maxRuns:10000,maxPages:200,expectedRunIds:rows.map(row=>String(row.eve_session_id))});
 if(after.inventoryDigest!==inventory.inventoryDigest)throw Error('Managed inventory changed during deployment census');
 bounded.throwIfAborted();return {applicationBindingsDigest:recoveryDigest(rows),runInventoryDigest:after.inventoryDigest,deploymentInventoryDigest:deployments.inventoryDigest,aliasInventoryDigest:aliases.inventoryDigest,hostInventoryDigest:hosts.inventoryDigest,hosts:hosts.rows.length,enumeratedRuns:after.runs.length,providerOnlyRuns:after.providerOnlyRunIds.length,deployments:deployments.rows.length};
}
/** Actual complete provider/application metadata and terminal reads. This is a
 * component only: old HTTP/cron admission and effects still need their proofs. */
export async function measureWorkManagedTerminalInventory(input:Input){
 const token=tokenSchema.parse(input.token),environment=input.target.hostedScope.target;
 const proof=await withLockedWorkRecoveryDecision(input.target,async(db,target)=>Object.freeze({contract:'pilot-work-managed-terminal-inventory-v1' as const,targetDigest:targetDigest(target),...await inspect(db,target,token,environment,input.target.signal),measuredAt:new Date().toISOString(),enumeratedInventoryTerminalVerified:true as const,oldDeploymentsClosed:false as const,paidEffectsReconciled:false as const,restorationReady:false as const}));
 measured.set(proof,{token,target:environment});return proof;
}
/** Repeat actual complete inventories/readbacks inside the final genuine owner
 * decision; a JSON copy or changed original identity cannot be consumed. */
export async function requireMeasuredWorkManagedTerminalInventory(db:Client,target:LockedWorkRecoveryTarget,proof:WorkManagedTerminalInventory,signal:AbortSignal){
 const actual=measured.get(proof),age=Date.now()-Date.parse(proof.measuredAt);
 if(!actual||!isWorkRecoveryDecisionClient(db)||targetDigest(target)!==proof.targetDigest||!Number.isFinite(age)||age<0||age>300000)throw Error('Genuine fresh managed terminal inventory required');
 const current=await inspect(db,target,actual.token,actual.target,signal);
 for(const key of ['applicationBindingsDigest','runInventoryDigest','deploymentInventoryDigest','aliasInventoryDigest','hostInventoryDigest','hosts','enumeratedRuns','providerOnlyRuns','deployments'] as const)if(current[key]!==proof[key])throw Error('Measured managed terminal inventory changed');
 return proof;
}
