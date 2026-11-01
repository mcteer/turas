import {fileURLToPath as retiredFilePath} from 'node:url';
import {resolve as retiredResolve} from 'node:path';
// Historical private-pilot fixture module; standalone programme CLI retired.
import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {createHash} from 'node:crypto';
import {createGateway} from 'ai';
import {Client} from 'pg';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {z} from 'zod';
import {setTimeout as delay} from 'node:timers/promises';
import {pilotHostedScopeSchema,type PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {lockHostedRootAccounting,settleLockedHostedRoot} from '../lib/server/conversations/hosted-root-settlement';

const dispatchSchema=z.strictObject({contract:z.literal('pilot-root-dispatch-v2'),model:z.enum(['spacexai/grok-4.7','anthropic/claude-sonnet-5.5']),
 attemptId:z.uuid(),nativeSessionId:z.string().min(1).max(256),turnId:z.string().min(1).max(256),
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),
 projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),target:z.enum(['preview','production']),providerPath:z.enum(['generate','stream'])});
const tokens=z.number().int().min(0).max(1000000),dollars=z.number().finite().nonnegative();
const generationSchema=z.object({id:z.string().regex(/^gen_[A-Za-z0-9_-]{1,240}$/),model:z.enum(['spacexai/grok-4.7','xai/grok-4.7','anthropic/claude-sonnet-5.5']),
 totalCost:dollars,usage:dollars,upstreamInferenceCost:dollars,isByok:z.literal(false),
 createdAt:z.iso.datetime({offset:true}),streamed:z.boolean(),finishReason:z.enum(['stop','length','cancelled','canceled','abort','error','content-filter','tool-calls']),
 promptTokens:tokens,completionTokens:tokens,reasoningTokens:tokens,cachedTokens:tokens,cacheCreationTokens:tokens,
 billableWebSearchCalls:z.literal(0),latency:z.number().finite().min(0).max(3600000),generationTime:z.number().finite().min(0).max(3600000),providerName:z.string().min(1).max(128)})
 // Accounting returns xai's provider identifier; keep it raw and require its
 // exact provider. New dispatches select Sonnet; old identities remain immutable.
 .refine(value=>value.model!=='xai/grok-4.7'||value.providerName==='xai',{path:['model'],message:'Exact xai accounting provider required'});
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Accounting can lag a just-cancelled stream. Re-read only the same immutable
 * generation, within 20 seconds and ten attempts, spaced two seconds apart.
 * This covers the provider's documented asynchronous ingestion window.
 * https://vercel.com/docs/ai-gateway/observability-and-spend/usage
 * No model request is retried.
 * Invalid success bodies and authentication/other client errors fail directly. */
export async function fetchPilotGatewayGeneration(request:Request,signal:AbortSignal,transport:typeof fetch=fetch,onExtraRead:()=>void=()=>{},wait:(ms:number,signal:AbortSignal)=>Promise<void>=(ms,signal)=>delay(ms,undefined,{signal})){
 const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!=='https://ai-gateway.vercel.sh'||url.pathname!=='/v1/generation'||[...url.searchParams].length!==1||!/^gen_[A-Za-z0-9_-]{1,240}$/.test(url.searchParams.get('id')??''))throw Error('Fixed generation lookup only');
 const whole=AbortSignal.any([signal,request.signal,AbortSignal.timeout(20000)]);
 for(let attempt=0;attempt<10;attempt++){
  whole.throwIfAborted();
  const attemptSignal=AbortSignal.any([whole,AbortSignal.timeout(5000)]);
  let response:Response;
  try{if(attempt)onExtraRead();response=await transport(request.clone(),{redirect:'error',cache:'no-store',signal:attemptSignal});}
  catch(error){if(whole.aborted||attempt===9||!['TimeoutError','AbortError','TypeError'].includes((error as Error)?.name))throw error;await wait(2000,whole);continue;}
  if([404,408,429,500,502,503,504].includes(response.status)&&attempt<9){await response.body?.cancel();await wait(2000,whole);continue;}
  const reader=response.body?.getReader();if(!reader)throw Error('Actual generation lookup body required');
  const abortBody=()=>{void reader.cancel(attemptSignal.reason).catch(()=>{});};
  attemptSignal.addEventListener('abort',abortBody,{once:true});if(attemptSignal.aborted)abortBody();
  const parts:Uint8Array[]=[];let size=0;
  try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>1048576)throw Error('Generation lookup exceeds bound');parts.push(next.value);}attemptSignal.throwIfAborted();}
  finally{attemptSignal.removeEventListener('abort',abortBody);await reader.cancel().catch(()=>{});reader.releaseLock();}
  return new Response(Buffer.concat(parts),{status:response.status,headers:response.headers});
 }
 throw Error('Bounded generation lookup incomplete');
}

/** Fixed read-only provider transport. No model, alternate origin or
 * caller-supplied capture can manufacture accounting provenance. */
export async function lookupPilotGatewayGeneration(id:string,signal:AbortSignal,onExtraRead:()=>void=()=>{}){
 const key=process.env.AI_GATEWAY_API_KEY;if(!key)throw Error('Explicit Gateway lookup credential required');
 const gateway=createGateway({apiKey:key,baseURL:'https://ai-gateway.vercel.sh/v1/ai',fetch:async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(request.method!=='GET'||url.origin!=='https://ai-gateway.vercel.sh'||url.pathname!=='/v1/generation'||url.searchParams.get('id')!==id||[...url.searchParams].length!==1)throw Error('Fixed generation lookup only');
  return fetchPilotGatewayGeneration(request,signal,fetch,onExtraRead);
 }});
 return generationSchema.parse(await gateway.getGenerationInfo({id}));
}
async function readOperation(db:Client,scope:PilotHostedScope,id:string){
 const row=(await db.query(`SELECT o.*,b.environment_id,b.workspace_id,b.owner_principal_id,b.cap_micro_usd,
  b.reserved_micro_usd,b.state AS budget_state,i.provider_key,c.eve_session_id,c.owner_principal_id AS actual_owner,c.workspace_id AS actual_workspace,
  a.id AS actual_attempt,e.schema_version,
  current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='parity_evaluation_budgets'::regclass)) AS owner
  FROM parity_evaluation_operations o JOIN parity_evaluation_budgets b ON b.id=o.budget_id
  JOIN operations_hosted_root_provider_identities i ON i.operation_id=o.id AND i.identity_kind='gateway_generation'
  JOIN response_attempts a ON a.id=(o.provider::jsonb->>'attemptId')::uuid
  JOIN conversations c ON c.id=a.conversation_id JOIN turas_environment e ON e.environment_id=b.environment_id
  WHERE o.id=$1`,[id])).rows[0];
 if(!row||row.owner!==true||row.schema_version!==CURRENT_SCHEMA_VERSION||row.environment_id!==scope.environmentMarker
  ||row.workspace_id!==scope.workspaceId||row.actual_workspace!==scope.workspaceId||row.owner_principal_id!==row.actual_owner
  ||BigInt(row.cap_micro_usd)>2500000n)throw Error('Exact original owner model accounting required');
 const dispatch=dispatchSchema.parse(JSON.parse(row.provider));
 if(dispatch.sourceCommit!==scope.sourceCommit||dispatch.deploymentId!==scope.deploymentId||dispatch.projectId!==scope.projectId
  ||dispatch.target!==scope.target||dispatch.nativeSessionId!==row.eve_session_id||dispatch.attemptId!==row.actual_attempt
  ||!/^gen_[A-Za-z0-9_-]{1,240}$/.test(row.provider_key))throw Error('Original native provider identity differs');
 return {row,dispatch};
}
/** Actual owner lookup and immutable receipt commit with058 settlement. An
 * expired approval remains expired. Recovered/closed scopes retain their full
 * ceiling and never reopen; no missing receipt is estimated to zero. */
export async function reconcileHostedRootGeneration(input:{db:Client;scope:PilotHostedScope;operationId:string;signal:AbortSignal}){
 const {db,signal}=input,scope=pilotHostedScopeSchema.parse(input.scope),id=z.uuid().parse(input.operationId);
 signal.throwIfAborted();const original=await readOperation(db,scope,id);
 const existing=(await db.query('SELECT * FROM operations_hosted_root_generation_receipts WHERE operation_id=$1',[id])).rows[0];
 let providerReads=existing?0:1;
 const generation=existing?null:await lookupPilotGatewayGeneration(original.row.provider_key,signal,()=>{providerReads++;});
 if(generation&&((generation.model!==original.dispatch.model&&!(original.dispatch.model==='spacexai/grok-4.7'&&generation.model==='xai/grok-4.7'&&generation.providerName==='xai'))||generation.id!==original.row.provider_key||generation.streamed!==(original.dispatch.providerPath==='stream')
  ||generation.usage!==generation.totalCost||Date.parse(generation.createdAt)<original.row.created_at.getTime()-30000
  ||Date.parse(generation.createdAt)>original.row.created_at.getTime()+300000||Date.parse(generation.createdAt)>Date.now()+30000))throw Error('Exact terminal Gateway accounting unavailable');
 const actual=existing?Number(existing.actual_micro_usd):Math.ceil(generation!.totalCost*1000000);
 if(!Number.isSafeInteger(actual)||actual<0)throw Error('Finite actual charge required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL statement_timeout='5000ms'");await db.query("SET LOCAL transaction_timeout='15s'");
  const locked=await lockHostedRootAccounting(db,{id,budgetId:original.row.budget_id,amount:Number(original.row.ceiling_micro_usd)});
  const current=await readOperation(db,scope,id);
  if(current.row.provider_key!==original.row.provider_key||current.row.provider!==original.row.provider
   ||current.row.budget_id!==original.row.budget_id||current.row.ceiling_micro_usd!==original.row.ceiling_micro_usd)throw Error('Original model accounting changed');
  const receipt=(await db.query('SELECT * FROM operations_hosted_root_generation_receipts WHERE operation_id=$1',[id])).rows[0];
  if(receipt&&(receipt.provider_key!==current.row.provider_key||Number(receipt.actual_micro_usd)!==actual
   ||generation&&receipt.response_digest!==digest(generation)))throw Error('Original generation receipt differs');
  if(!receipt){
   if(!generation)throw Error('Original generation receipt missing');
   await db.query(`INSERT INTO operations_hosted_root_generation_receipts(operation_id,provider_key,actual_micro_usd,input_tokens,output_tokens,response_digest,provider_created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,generation.id,actual,generation.promptTokens,generation.completionTokens,digest(generation),generation.createdAt]);
  }
  const settlement=await settleLockedHostedRoot(db,locked,actual);
  signal.throwIfAborted();await db.query('COMMIT');
  return {contract:'pilot-hosted-root-generation-reconciliation-v1',operationId:id,budgetId:String(current.row.budget_id),generationId:String(current.row.provider_key),actualMicroUsd:actual,...settlement,alreadyRecorded:!!receipt,providerReads,modelCalls:0,approvalExtended:false,budgetReopened:false};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}
}

/** The original scope may predate this operator version. Reconciliation reads
 * that immutable original identity; it never sends against an old deployment. */
export async function pilotHostedRootReconcile(args=process.argv.slice(2)){
 if(args.length!==6||args[0]!=='--scope'||args[2]!=='--operation'||args[4]!=='--output')throw Error('Explicit original scope, operation and new output required');
 process.umask(0o077);
 if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8',timeout:10000,maxBuffer:1048576}).trim())throw Error('Committed clean operator source required');
 const path=resolve(args[1]),scope=pilotHostedScopeSchema.parse(await readEvidence(dirname(path),basename(path))),source=await pilotSource();
 const raw=process.env.TURAS_PILOT_HOSTED_OWNER_DATABASE_URL;if(!raw)throw Error('Explicit hosted owner connection required');
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||url.searchParams.get('sslmode')!=='verify-full')throw Error('Explicit direct Neon verify-full owner connection required');
 const root=resolve(args[5]);await createEvidenceDirectory(root);
 const db=new Client({connectionString:raw,connectionTimeoutMillis:5000,statement_timeout:5000});
 try{
  await db.connect();const receipt=await reconcileHostedRootGeneration({db,scope,operationId:args[3],signal:AbortSignal.timeout(30000)});
  await writeEvidence(root,'reconciliation.json',{...receipt,operatorSource:source,originalScope:scope,recordedAt:new Date().toISOString(),fullHostedCatalogVerified:false});
  if(!receipt.reconciliationSuccessful)process.exitCode=1;
  return receipt;
 }finally{await db.end();}
}

if(process.argv[1]&&retiredResolve(process.argv[1])===retiredFilePath(import.meta.url)){console.error('Private pilot command retired; historical fixtures are import-only.');process.exitCode=2;}
