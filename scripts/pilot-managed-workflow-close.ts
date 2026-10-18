import {Client} from 'pg';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {databaseSafetySourceSchema,verifyDatabaseSafetySourceBinding} from './pilot-database-safety-copy';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {readManagedWorkflowOperatorToken} from './pilot-managed-workflow-inspect';
import {bindingSchema} from '../lib/server/operations/managed-workflow-closure';
import {bindManagedRunProvider} from '../lib/server/operations/managed-workflow-provider';
import {closeManagedRunBatch} from '../lib/server/operations/managed-workflow-batch';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
export const managedClosureInputSchema=z.strictObject({contract:z.literal('pilot-managed-workflow-closure-input-v1'),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),catalogDigest:z.string().regex(/^[a-f0-9]{64}$/),capturedAt:z.iso.datetime({offset:true}),bindings:z.array(bindingSchema).min(1).max(50)});

/** Explicit exact-run cleanup only. No schema installation, credential update,
 * native resumption, model dispatch, deployment removal, or service unlock. */
export async function pilotManagedWorkflowClose(args=process.argv.slice(2)){
 const allowed=new Set(['source','destination','input','auth-file','output']),values:Record<string,string>={};
 if(args.length!==11||args[0]!=='--close-managed-workflows')throw Error('Explicit bounded managed closure inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid managed closure inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete managed closure scope required');
 const protectedJson=async(file:string)=>{const path=resolve(file);return readEvidence(dirname(path),basename(path));};
 const target=databaseSafetySourceSchema.parse(await protectedJson(values.source)),destination=neonArchiveDestinationSchema.parse(await protectedJson(values.destination)),input=managedClosureInputSchema.parse(await protectedJson(values.input));
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),first=input.bindings[0],root=resolve(values.output),id=randomUUID();
 const host=(url:string)=>new URL(url).hostname.replace('-pooler.','.');
 if(target.schemaVersion!==79||target.projectId!==destination.sourceProjectId||target.projectId!==first.projectId||target.environmentId!==first.environmentId||destination.teamId!==first.teamId||host(target.databaseUrl)===host(destination.databaseUrl)||!root.startsWith(resolve('local-artifacts/016')+'/'))throw Error('Distinct work archive and current exact locked source required');
 if(input.sourceCommit!==source.sourceCommit||input.sourceDigest!==source.sourceDigest||input.catalogDigest!==source.catalogDigest||Date.parse(input.capturedAt)>Date.now()||Date.now()-Date.parse(input.capturedAt)>300000||new Set(input.bindings.map(row=>row.runId)).size!==input.bindings.length||input.bindings.some(row=>row.environmentId!==first.environmentId||row.recoveryId!==first.recoveryId||row.controlRevision!==first.controlRevision||row.projectId!==first.projectId||row.teamId!==first.teamId))throw Error('Fresh exact source and unique closure batch required');
 await createEvidenceDirectory(root);
 return withRecoveryCancellation(300000,async signal=>{
  let stage='platform_binding',cancelAttempts=0;
  try{
   const sourceBinding=await verifyDatabaseSafetySourceBinding(target,destination.teamId,signal),archiveBinding=await verifyWorkNeonDestination(destination,signal);
   const token=await readManagedWorkflowOperatorToken(values['auth-file']),provider=await bindManagedRunProvider({projectId:target.projectId,teamId:destination.teamId,token},signal);
   const primary=new Client({connectionString:target.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:5000}),archive=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:5000});
   let result:Awaited<ReturnType<typeof closeManagedRunBatch>>;
   try{
    await primary.connect();await archive.connect();stage='locked_native_closure';
    result=await closeManagedRunBatch({source:primary,archive,installationId:destination.installationId,bindings:input.bindings,sourceVersion:source,signal,provider:{read:runId=>provider.read(runId),cancel:runId=>{cancelAttempts++;return provider.cancel(runId);}}});
   }finally{await archive.end();await primary.end();}
   stage='final_binding';
   if(JSON.stringify(await verifyDatabaseSafetySourceBinding(target,destination.teamId,signal))!==JSON.stringify(sourceBinding)||JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(archiveBinding)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Managed closure binding or protected checkout changed');
   const receipt={id,...source,...result,projectId:target.projectId,teamId:destination.teamId,environmentId:target.environmentId,recoveryId:first.recoveryId,controlRevision:first.controlRevision,sourceBinding,archiveBinding,completedAt:new Date().toISOString(),cancelAttempts,modelDispatches:0,primaryApplicationRecordsChanged:false};
   await writeEvidence(root,'closure.json',receipt);
   console.info(JSON.stringify({requestedRuns:result.requestedRuns,verifiedTerminalRuns:result.verifiedTerminalRuns,batchTerminalVerified:result.batchTerminalVerified,cancelAttempts,allProviderRunsClosed:false,paidEffectsReconciled:false,restorationReady:false}));
   if(!result.batchTerminalVerified)process.exitCode=1;return receipt;
  }catch{
   await writeEvidence(root,'failure.json',{id,...source,stage,cancelAttempts,state:'fail',safeFailure:'managed_closure_incomplete',independentIntentsRetained:true,automaticCancellationRetryAllowed:false,allProviderRunsClosed:false,paidEffectsReconciled:false,restorationReady:false});
   throw Error('Managed closure incomplete; retain the recovery lock and reconcile existing independent intents without retrying cancellation');
  }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotManagedWorkflowClose().catch(()=>{console.error('Managed closure incomplete; no recovery readiness established.');process.exitCode=1;});
