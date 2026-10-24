import {pilotHostedScopeSchema} from '../lib/contracts/pilot-hosted';
import {managedOperationsSessionSchema,verifyManagedRuntimeBinding} from './pilot-managed-runtime-binding';
import {Client} from 'pg';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {databaseSafetyCaptureSourceSchema,verifyDatabaseSafetySourceBinding} from './pilot-database-safety-copy';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {readManagedWorkflowOperatorToken} from './pilot-managed-workflow-inspect';
import {bindManagedRunProvider} from '../lib/server/operations/managed-workflow-provider';
import {managedInventoryClosurePlanSchema,closeManagedRunInventory} from '../lib/server/operations/managed-workflow-inventory-close';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';

/** Fixed inventory only. Does not discover-and-cancel new identities on drift,
 * retry uncertain cancellations, update credentials or open service. */
export async function pilotManagedWorkflowInventoryClose(args:string[]){
 const allowed=new Set(['source','destination','input','auth-file','runtime-scope','session-file','output']),values:Record<string,string>={};
 if(args[0]!=='--close-managed-inventory'||args.length!==15)throw Error('Explicit finite managed inventory closure required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid managed inventory closure inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete managed inventory closure scope required');
 const privateJson=async(file:string)=>{const path=resolve(file);return readEvidence(dirname(path),basename(path));};
 const target=databaseSafetyCaptureSourceSchema.parse(await privateJson(values.source)),destination=neonArchiveDestinationSchema.parse(await privateJson(values.destination)),plan=managedInventoryClosurePlanSchema.parse(await privateJson(values.input)),runtimeScope=pilotHostedScopeSchema.parse(await privateJson(values['runtime-scope'])),session=managedOperationsSessionSchema.parse(await privateJson(values['session-file']));
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),root=resolve(values.output),id=randomUUID(),host=(url:string)=>new URL(url).hostname.replace('-pooler.','.');
 if(target.schemaVersion!==79||target.projectId!==plan.projectId||target.projectId!==destination.sourceProjectId||target.environmentId!==plan.environmentId||target.target!==plan.target||destination.teamId!==plan.teamId||host(target.databaseUrl)===host(destination.databaseUrl)||!root.startsWith(resolve('local-artifacts/016')+'/'))throw Error('Exact locked source and distinct managed closure archive required');
 if((['sourceCommit','sourceDigest','catalogDigest'] as const).some(key=>source[key]!==plan[key])||execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trim())throw Error('Exact committed managed closure source required');
 if(runtimeScope.projectId!==plan.projectId||runtimeScope.teamId!==plan.teamId||runtimeScope.target!==plan.target||runtimeScope.environmentMarker!==plan.environmentId||(['sourceCommit','sourceDigest','catalogDigest'] as const).some(key=>runtimeScope[key]!==source[key]))throw Error('Exact deployed runtime closure scope required');
 const remaining=Date.parse(plan.expiresAt)-Date.now();if(remaining<=0||remaining>900000)throw Error('Fresh at-most-fifteen-minute closure scope required');
 await createEvidenceDirectory(root);
 return withRecoveryCancellation(remaining,async signal=>{
  let stage='platform_binding',cancelAttempts=0;const batches:{index:number;name:string;digest:string}[]=[];
  const primary=new Client({connectionString:target.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:5000}),archive=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:5000});
  try{
   const sourceBinding=await verifyDatabaseSafetySourceBinding(target,plan.teamId,signal),archiveBinding=await verifyWorkNeonDestination(destination,signal);
   const token=await readManagedWorkflowOperatorToken(values['auth-file']),provider=await bindManagedRunProvider({projectId:plan.projectId,teamId:plan.teamId,target:plan.target,token},signal);
   const runtimeBinding=()=>verifyManagedRuntimeBinding({scope:runtimeScope,session,sourceConnection:target.databaseUrl,recoveryId:plan.recoveryId,controlRevision:plan.controlRevision,token,signal});
   const runtimeBindingBefore=await runtimeBinding();
   await primary.connect();await archive.connect();stage='inventory_closure';
   const unchanged=async()=>{signal.throwIfAborted();if(JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Managed closure source changed');await runtimeBinding();};
   const result=await closeManagedRunInventory({source:primary,archive,installationId:destination.installationId,plan,signal,provider:{list:cursor=>provider.list(cursor),read:runId=>provider.read(runId),cancel:runId=>{cancelAttempts++;return provider.cancel(runId);}},beforeBatch:unchanged,onBatch:async(index,result)=>{const name=`batch-${index}.json`,digest=await writeEvidence(root,name,{...source,index,...result,recordedAt:new Date().toISOString()});batches.push({index,name,digest});}});
   stage='final_binding';await unchanged();
   if(JSON.stringify(await verifyDatabaseSafetySourceBinding(target,plan.teamId,signal))!==JSON.stringify(sourceBinding)||JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(archiveBinding))throw Error('Managed closure platform binding changed');
   const receipt={id,...result,sourceBinding,archiveBinding,runtimeBindingBefore,runtimeBindingAfter:await runtimeBinding(),batchEvidence:batches,cancelAttempts,modelCalls:0,primaryApplicationRecordsChanged:false};await writeEvidence(root,'closure.json',receipt);return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,stage,cancelAttempts,batchEvidence:batches,safeFailure:'incomplete_managed_inventory_closure',independentIntentsRetained:true,automaticCancellationRetryAllowed:false,oldDeploymentsClosed:false,allProviderRunsClosed:false,restorationReady:false});throw error;}
  finally{await archive.end();await primary.end();}
 });
}
