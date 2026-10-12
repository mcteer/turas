import {Client} from 'pg';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {databaseSafetySourceSchema,verifyDatabaseSafetySourceBinding} from './pilot-database-safety-copy';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {recoveryDigest} from '../lib/contracts/pilot-recovery';

const nativeId=z.string().regex(/^wrun_[A-Za-z0-9_-]{1,240}$/);
const runMetadata=z.object({runId:nativeId,status:z.enum(['pending','running','completed','failed','cancelled']),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),createdAt:z.iso.datetime({offset:true}),updatedAt:z.iso.datetime({offset:true}).optional()});
export async function readManagedWorkflowOperatorToken(file:string){
 const target=resolve(file),parent=await lstat(dirname(target));
 if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==process.getuid?.()||(parent.mode&0o022)||await realpath(target)!==target)throw Error('Protected direct authentication required');
 const handle=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const info=await handle.stat();if(!info.isFile()||info.nlink!==1||info.uid!==process.getuid?.()||(info.mode&0o777)!==0o600||info.size>65536)throw Error('Protected authentication file required');
  const value=JSON.parse(await handle.readFile('utf8'));if(typeof value.token!=='string'||!value.token||value.token.length>8192)throw Error('Authentication unavailable');return value.token as string;
 }finally{await handle.close();}
}
/** Operator-only metadata inspection. Never reads message/input/output bodies,
 * posts to a workflow, resumes a turn, retires credentials or grants readiness. */
export async function pilotManagedWorkflowInspect(args:string[]){
 const allowed=new Set(['source','team','auth-file','output']),values:Record<string,string>={};
 if(args.length!==9||args[0]!=='--inspect-managed-workflow')throw Error('Explicit native inspection inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid native inspection inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size||!/^team_[A-Za-z0-9]+$/.test(values.team))throw Error('Complete work native inspection scope required');
 const sourceFile=resolve(values.source),scope=databaseSafetySourceSchema.parse(await readEvidence(dirname(sourceFile),basename(sourceFile)));
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),root=resolve(values.output),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(300000,async signal=>{
  try{
   const binding=await verifyDatabaseSafetySourceBinding(scope,values.team,signal),token=await readManagedWorkflowOperatorToken(values['auth-file']);
   const headers={Authorization:'Bearer '+token,'x-vercel-project-id':scope.projectId,'x-vercel-team-id':values.team,'x-vercel-environment':'production'};
   async function metadataGet(path:string){
    signal.throwIfAborted();const response=await fetch('https://api.vercel.com'+path,{headers,redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
    if(response.status===404){await response.body?.cancel();return null;}if(!response.ok){await response.body?.cancel();throw Error('Workflow provider metadata unavailable');}
    const reader=response.body?.getReader();if(!reader)throw Error('Provider metadata body unavailable');const chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>1048576)throw Error('Provider metadata exceeds bound');chunks.push(next.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}
    finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
   }
   const project=z.object({id:z.string(),accountId:z.string()}).parse(await metadataGet('/v9/projects/'+scope.projectId+'?teamId='+values.team));
   if(project.id!==scope.projectId||project.accountId!==values.team)throw Error('Provider work project differs');
   async function applicationInventory(){
    const db=new Client({connectionString:scope.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:5000});await db.connect();
    try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL transaction_timeout='20s'");
     const marker=(await db.query("SELECT environment_id,schema_version,transaction_timestamp() AS captured_at,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_environment'::regclass)) AS owner FROM turas_environment")).rows;
     if(marker.length!==1||marker[0].environment_id!==scope.environmentId||Number(marker[0].schema_version)!==scope.schemaVersion||marker[0].owner!==true)throw Error('Actual owner native source differs');
     const conversations=(await db.query('SELECT id,workspace_id,owner_principal_id,binding_state,eve_session_id,context_generation FROM conversations WHERE environment_id=$1 ORDER BY id LIMIT 1001',[scope.environmentId])).rows;
     const attempts=(await db.query('SELECT a.id,a.conversation_id,a.dispatch_state,a.response_state,a.native_turn_id,a.native_delivery_id FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id WHERE c.environment_id=$1 ORDER BY a.id LIMIT 1001',[scope.environmentId])).rows;
     if(conversations.length>1000||attempts.length>1000)throw Error('Native source inventory exceeds bound');await db.query('COMMIT');return {conversations,attempts,capturedAt:marker[0].captured_at.toISOString()};
    }finally{await db.query('ROLLBACK').catch(()=>undefined);await db.end();}
   }
   const inventory=await applicationInventory(),runs=[];
   for(const conversation of inventory.conversations){
    signal.throwIfAborted();
    if(conversation.eve_session_id===null){runs.push({conversationId:conversation.id,bindingState:conversation.binding_state,providerState:'unbound'});continue;}
    const runId=nativeId.parse(conversation.eve_session_id),raw=await metadataGet('/v1/workflow/v2/runs/'+encodeURIComponent(runId)+'?remoteRefBehavior=lazy&teamId='+values.team);
    if(raw===null){runs.push({conversationId:conversation.id,bindingState:conversation.binding_state,runId,providerState:'unavailable'});continue;}
    const metadata=runMetadata.parse(raw);if(metadata.runId!==runId)throw Error('Provider native run identity differs');
    runs.push({conversationId:conversation.id,bindingState:conversation.binding_state,...metadata,providerState:metadata.status});
   }
   const after=await applicationInventory();
   if(recoveryDigest({conversations:inventory.conversations,attempts:inventory.attempts})!==recoveryDigest({conversations:after.conversations,attempts:after.attempts})||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Native source or protected checkout changed');
   const counts:Record<string,number>={};for(const run of runs)counts[run.providerState]=(counts[run.providerState]??0)+1;
   const receipt={contract:'pilot-managed-workflow-inspection-v1',id,...source,projectId:scope.projectId,teamId:values.team,environmentId:scope.environmentId,sourceSchema:scope.schemaVersion,sourceConnectionBinding:scope.connectionBinding,...binding,capturedAt:inventory.capturedAt,completedAt:new Date().toISOString(),conversations:inventory.conversations,attempts:inventory.attempts,runs,providerStates:counts,applicationBindingsUnchanged:true,readOnly:true,providerWrites:0,modelCalls:0,workflowCheckpointVerified:false,workflowResumed:false,currentAuthorityVerified:false,restorationReady:false};
   await writeEvidence(root,'inspection.json',receipt);console.info(JSON.stringify({readOnly:true,conversationCount:runs.length,attemptCount:inventory.attempts.length,providerStates:counts,providerWrites:0,restorationReady:false}));return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',safeFailure:'managed_workflow_inspection_incomplete',readOnly:true,providerWrites:0,restorationReady:false});throw error;}
 });
}
