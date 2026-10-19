import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {hostedLearningBindingSchema,hostedLearningDispatchSchema,type HostedLearningBinding} from '../lib/contracts/pilot-hosted-learning';
import {learningArmOutputSchema} from '../lib/contracts/learning';
import {learningEvaluationPrompt} from '../lib/server/learning/evaluation-context';
import {assertLearningPrice,learningStepCeiling} from '../lib/server/learning/pricing';
import {learningHash} from '../lib/server/learning/repository';
import {pilotHostedRequest} from './pilot-hosted-request';
import {boundedHostedJson} from './pilot-hosted-http';
import {platformDeployment} from './pilot-hosted';
import {QualityBudgetLedger} from './pilot-quality-budget-ledger';
import {admitHostedLearningDispatch} from './pilot-hosted-learning-admission';
import {reconcileHostedLearningDispatch} from './pilot-hosted-learning-reconcile';
import {writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {operationalDatabaseBindingSchema,databaseTargetDigest} from '../lib/server/operations/database-binding';
const data=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
const evaluation=z.object({id:z.uuid(),version:z.number().int().positive(),state:z.string(),bodyAvailable:z.boolean(),catalogDigest:z.string(),currentCatalogDigest:z.string(),budget:z.object({unknownReservations:z.number().int().nonnegative(),state:z.string()}),cases:z.array(z.object({arms:z.array(z.object({state:z.string()}))})).length(8)}).passthrough();
async function pause(signal:AbortSignal){signal.throwIfAborted();await new Promise<void>((done,reject)=>{const abort=()=>{clearTimeout(timer);reject(signal.reason);},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);done();},2000);signal.addEventListener('abort',abort,{once:true});});}
/** Capture one fresh complete fixed 16-arm batch. No filters, paid retries,
 * synthetic output, fabricated score or automatic publication are accepted.
 * Durable cleanup and exact retirement receipts are required before return. */
const boundedOwners=new WeakSet<Client>();
/** Startup server timeout also bounds locks. Client timeout is longer than the
 * server's statement bound; no abandoned query is raced against later cleanup. */
export function createHostedLearningOwnerClient(connectionString:string){
 const url=new URL(connectionString);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||url.searchParams.get('sslmode')!=='verify-full')throw Error('Explicit direct Neon verify-full learning owner required');
 // pg merges parsed URL options after explicit constructor settings. Only
 // these transport options are permitted, so the URL cannot remove deadlines.
 if(url.hash||[...url.searchParams.keys()].some(key=>!['sslmode','channel_binding'].includes(key))
  ||url.searchParams.getAll('sslmode').length!==1||url.searchParams.getAll('channel_binding').length>1
  ||(url.searchParams.has('channel_binding')&&url.searchParams.get('channel_binding')!=='require'))throw Error('Learning owner URL cannot override bounded connection settings');
 const db=new Client({connectionString,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000});boundedOwners.add(db);return db;
}
type AuthorityInput={scope:PilotHostedScope;db:Client;headers:Headers;binding:HostedLearningBinding;ledger:QualityBudgetLedger;signal:AbortSignal};
/** Actual platform, serving source, target connection and original ledger checks
 * run before activation/revision writes as well as before capture. */
export async function assertHostedLearningCaptureAuthority(input:AuthorityInput){
 const {scope,db,signal,ledger}=input,binding=hostedLearningBindingSchema.parse(input.binding);
 if(!boundedOwners.has(db))throw Error('Bounded hosted learning owner connection required');
 if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8',timeout:10000,maxBuffer:1048576}).trim())throw Error('Committed clean capture operator required');
 const source=await pilotSource();if(source.sourceCommit!==scope.sourceCommit||source.sourceDigest!==scope.sourceDigest||source.catalogDigest!==scope.catalogDigest)throw Error('Exact committed capture operator source required');
 const request=pilotHostedRequest({scope,headers:input.headers,signal});
 if(binding.environmentMarker!==scope.environmentMarker||binding.workspaceId!==scope.workspaceId||binding.projectId!==scope.projectId||binding.target!==scope.target
  ||binding.sourceCommit!==scope.sourceCommit||binding.sourceDigest!==scope.sourceDigest||binding.catalogDigest!==scope.catalogDigest)throw Error('Exact source-bound hosted learning authority required');
 await platformDeployment(scope,false,signal);await platformDeployment(scope,true,signal);
 const diagnostic=z.object({learningAcceptanceConfiguration:hostedLearningBindingSchema,connectionBinding:operationalDatabaseBindingSchema}).parse(data(await request('/api/operations/status','GET')));
 if(JSON.stringify(diagnostic.learningAcceptanceConfiguration)!==JSON.stringify(binding))throw Error('Actual hosted original-journal binding differs');
 const rawOwner=process.env.TURAS_PILOT_HOSTED_OWNER_DATABASE_URL,rawRuntime=process.env.TURAS_PILOT_HOSTED_DATABASE_URL;
 if(!rawOwner||!rawRuntime||!process.env.AI_GATEWAY_API_KEY)throw Error('Explicit actual owner/runtime targets and Gateway lookup credential required');
 const ownerTarget=new URL(rawOwner),runtimeTarget=new URL(rawRuntime);
 for(const target of [ownerTarget,runtimeTarget])if(!['postgres:','postgresql:'].includes(target.protocol)||!target.hostname.endsWith('.neon.tech')||target.searchParams.get('sslmode')!=='verify-full')throw Error('Explicit Neon verify-full learning targets required');
 if(ownerTarget.hostname.includes('-pooler.'))throw Error('Direct owner learning connection required');
 const owner=(await db.query("SELECT current_database() AS database_name,session_user AS login,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_hosted_learning_admissions'::regclass)) AS owner")).rows[0];
 const actual=diagnostic.connectionBinding,digest=databaseTargetDigest(rawOwner,scope.environmentMarker,owner?.database_name);
 if(!owner?.owner||owner.login!==decodeURIComponent(ownerTarget.username)||digest!==databaseTargetDigest(rawRuntime,scope.environmentMarker)
  ||actual.databaseBindingDigest!==digest||actual.environmentId!==scope.environmentMarker||actual.codeVersion!==scope.sourceCommit
  ||actual.mode!=='open'||!actual.effectiveRuntimeRole||!actual.directRuntimeLogin||Date.now()-Date.parse(actual.measuredAt)>30000||Date.parse(actual.measuredAt)>Date.now())throw Error('Actual deployed learning runtime and owner database binding differs');
 const authority=await ledger.currentAuthority(),status=await ledger.status();
 if(authority.id!==binding.budgetId||authority.originalAuthorizationDigest!==binding.originalAuthorizationDigest||authority.capMicroUsd!==binding.capMicroUsd
  ||Date.parse(authority.expiresAt)<=Date.now()||Date.parse(authority.expiresAt)>Date.parse(binding.expiresAt)||status.admissionHeld)throw Error('Fresh unencumbered original quality journal required');
 return {request,status,source};
}
export async function captureHostedLearningEvaluation(input:AuthorityInput&{evaluationId:string;evidenceDirectory:string}){
 const {scope,db,signal,ledger}=input,binding=hostedLearningBindingSchema.parse(input.binding),id=z.uuid().parse(input.evaluationId);
 const {request,status,source}=await assertHostedLearningCaptureAuthority(input),arms:unknown[]=[],sessions:string[]=[];
 let view=evaluation.parse(data(await request('/api/learning/evaluations/'+id,'GET')));
 if(view.id!==id||view.state!=='prepared'||!view.bodyAvailable||view.cases.some(c=>c.arms.some(a=>a.state!=='missing'))||view.budget.unknownReservations||view.budget.state!=='open'||view.catalogDigest!==view.currentCatalogDigest)throw Error('Fresh complete current evaluation required; partial batches cannot resume');
 const budget=(await db.query(`SELECT q.* FROM learning_evaluations e JOIN learning_budget_accounts q ON q.id=e.budget_id WHERE e.id=$1 AND e.environment_id=$2 AND e.workspace_id=$3`,[id,scope.environmentMarker,scope.workspaceId])).rows[0];
 if(!budget)throw Error('Actual paired domain budget unavailable');
 const stepCeiling=learningStepCeiling(assertLearningPrice(budget.price_contract),4096).ceilingMicroUsd;
 if(learningHash(budget.price_contract)!==budget.price_digest||stepCeiling>BigInt(budget.limit_micro_usd)
  ||stepCeiling+BigInt(status.chargedMicroUsd)+BigInt(status.heldMicroUsd)>BigInt(status.capMicroUsd))throw Error('Original remaining journal and domain budget cannot cover the next full provider step');
 let receipt:Record<string,unknown>|undefined,operationFailure:unknown,prepareRequests=0;
 try{
 const journalAttemptId=await ledger.beginAttempt(source);
 for(let index=0;index<16;index++){
  signal.throwIfAborted();const label=String(index+1).padStart(2,'0'),caseId='E'+String(Math.floor(index/2)+1).padStart(2,'0'),purpose=index%2?'evaluation_candidate' as const:'evaluation_baseline' as const;
  let dispatch:string|undefined,native:string|undefined;const prepareRequestId=randomUUID();
  try{
   await platformDeployment(scope,false,signal);await platformDeployment(scope,true,signal);
   const currentStatus=await ledger.status();if(currentStatus.admissionHeld||BigInt(currentStatus.chargedMicroUsd)+stepCeiling>BigInt(currentStatus.capMicroUsd))throw Error('Original remaining budget cannot cover the next full provider step');
   await writeEvidence(input.evidenceDirectory,'learning-'+label+'-prepare-intent.json',{scope,evaluationId:id,caseId,purpose,requestId:prepareRequestId,expectedVersion:view.version,modelCalls:0});
   prepareRequests++;
   const prepared=z.object({targetId:z.uuid()}).parse(data(await request('/api/learning/evaluations/'+id+'/arms','POST',{contractVersion:'learning-v1',requestId:prepareRequestId,expectedVersion:view.version,rationale:'Original-journal admitted complete fixed hosted paired evaluation'})));
   const meta=(await db.query(`SELECT a.*,b.evaluation_id,b.case_id,b.purpose,q.price_contract,q.price_digest,c.creation_operation_id
    FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id JOIN learning_budget_accounts q ON q.id=a.budget_id JOIN conversations c ON c.id=a.conversation_id
    WHERE a.id=$1 AND a.environment_id=$2 AND a.workspace_id=$3`,[prepared.targetId,scope.environmentMarker,scope.workspaceId])).rows[0];
   if(!meta||meta.evaluation_id!==id||meta.case_id!==caseId||meta.purpose!==purpose||meta.state!=='prepared'||meta.response_attempt_id||Number(meta.model_steps)!==0)throw Error('Actual fresh ordered hosted arm differs');
   await writeEvidence(input.evidenceDirectory,'learning-'+label+'-bind-intent.json',{scope,evaluationId:id,learningAttemptId:meta.id,conversationId:meta.conversation_id,creationOperationId:meta.creation_operation_id,nativeRequestId:meta.native_request_id,caseId,purpose,prepareRequestId,modelCalls:0});
   // Register operational retirement before binding; this never changes output
   // eligibility or authorizes a provider call. Active attempts are not retired.
   await db.query("INSERT INTO learning_cleanup_jobs(id,environment_id,workspace_id,owner_kind,owner_id,due_at,next_attempt_at) VALUES($1,$2,$3,'attempt',$4,clock_timestamp()+interval '3 minutes',clock_timestamp()+interval '3 minutes') ON CONFLICT(environment_id,workspace_id,owner_kind,owner_id) DO NOTHING",[randomUUID(),scope.environmentMarker,scope.workspaceId,meta.id]);
   const headers=new Headers(input.headers);headers.set('x-turas-conversation-id',meta.conversation_id);
   async function nativeRequest(path:string,body:unknown,timeout:number){
    await request('/api/operations/status','GET');
    const response=await fetch(new URL(path,scope.origin),{method:'POST',headers,body:JSON.stringify(body),redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)])});
    if(!response.ok){await response.body?.cancel();throw Error('Exact hosted learning native request unavailable');}return response;
   }
   native=z.object({sessionId:z.string().min(1).max(256)}).parse(await boundedHostedJson(await nativeRequest('/eve/v1/session',{operationId:meta.creation_operation_id},20000))).sessionId;sessions.push(native);
   await writeEvidence(input.evidenceDirectory,'learning-'+label+'-native.json',{evaluationId:id,learningAttemptId:meta.id,conversationId:meta.conversation_id,nativeSessionId:native,nativeRequestId:meta.native_request_id,caseId,purpose,retirementVerified:false});
   const price=assertLearningPrice(meta.price_contract),ceiling=learningStepCeiling(price,4096);
   if(learningHash(price)!==meta.price_digest)throw Error('Actual frozen learning price differs');
   const hostedLearning=hostedLearningDispatchSchema.parse({contract:'pilot-hosted-learning-dispatch-v1',scope,evaluationId:id,learningAttemptId:meta.id,actorMembershipId:meta.actor_membership_id,caseId,purpose,nativeSessionId:native,nativeRequestId:meta.native_request_id,priceDigest:meta.price_digest});
   dispatch=await ledger.dispatch({modelId:'spacexai/grok-4.7',ceilingMicroUsd:Number(ceiling.ceilingMicroUsd),pricingDigest:meta.price_digest,hostedLearning},journalAttemptId);
   const admission=await admitHostedLearningDispatch({db,ledger,dispatchId:dispatch,binding,signal});
   await writeEvidence(input.evidenceDirectory,'learning-'+label+'-admission.json',{...admission,platformVerificationRequired:false,actualPlatformVerified:true,modelCalls:0});
   await writeEvidence(input.evidenceDirectory,'learning-'+label+'-send-intent.json',{scope,evaluationId:id,learningAttemptId:meta.id,conversationId:meta.conversation_id,nativeSessionId:native,nativeRequestId:meta.native_request_id,journalDispatchId:dispatch,caseId,purpose});
   headers.set('x-turas-request-key',meta.native_request_id);const started=Date.now(),deadline=started+120000;
   const response=await nativeRequest('/eve/v1/session/'+encodeURIComponent(native),{message:learningEvaluationPrompt},120000);
   const reader=response.body?.getReader();if(!reader)throw Error('Actual hosted learning stream required');const chunks:Uint8Array[]=[];let bytes=0;
   try{for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>2097152)throw Error('Hosted learning stream exceeds bound');chunks.push(chunk.value);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();await writeEvidence(input.evidenceDirectory,'learning-'+label+'-stream.json',{encoding:'base64',bytes,body:Buffer.concat(chunks).toString('base64')});}
   for(;;){view=evaluation.parse(data(await request('/api/learning/evaluations/'+id,'GET')));const current=view.cases[Math.floor(index/2)].arms[index%2];if(current.state==='completed')break;if(!['prepared','admitted','running'].includes(current.state)||Date.now()>=deadline)throw Error('Actual hosted paired arm incomplete; no paid retry');await pause(signal);}
   const capture=z.object({evaluationId:z.uuid(),caseId:z.string(),bodyAvailable:z.literal(true),arm:z.object({id:z.uuid(),state:z.literal('completed'),output:learningArmOutputSchema,outputDigest:z.string().regex(/^[a-f0-9]{64}$/),modelSteps:z.literal(1),nativeSessionId:z.string(),nativeRequestId:z.uuid()}).passthrough()}).parse(data(await request('/api/learning/evaluations/'+id+'/cases/'+caseId+'/arms/'+(index%2?'candidate':'baseline'),'GET')));
   if(capture.evaluationId!==id||capture.caseId!==caseId||capture.arm.id!==meta.id||capture.arm.nativeSessionId!==native||capture.arm.nativeRequestId!==meta.native_request_id||learningHash(capture.arm.output)!==capture.arm.outputDigest)throw Error('Actual exact native paired output differs');
   const accounting=await reconcileHostedLearningDispatch({db,ledger,dispatchId:dispatch,binding,signal});
   await writeEvidence(input.evidenceDirectory,'learning-'+label+'-capture.json',{capture,accounting,durationMs:Date.now()-started});
   if(!accounting.reconciliationSuccessful)throw Error('Original hosted learning accounting unresolved');
   arms.push({caseId,purpose,learningAttemptId:meta.id,journalDispatchId:dispatch,capture,accounting});
  }catch(error){
   const failures=[error];
   if(dispatch)try{await ledger.hold(dispatch,'provider_error');}catch(cause){failures.push(cause);}
   // Resolve only the original evaluation/request identities. Never repeat
   // prepare, native create or send to discover whether acknowledgement was lost.
   let retained:unknown=null;
   try{retained=(await db.query(`SELECT a.id,a.conversation_id,a.state,a.native_request_id,a.native_session_id,a.response_attempt_id,c.creation_operation_id,c.binding_state,c.eve_session_id,
    j.id AS cleanup_job_id,j.state AS cleanup_state FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
    LEFT JOIN learning_cleanup_jobs j ON j.owner_kind='attempt' AND j.owner_id=a.id AND j.environment_id=a.environment_id
    WHERE b.evaluation_id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 ORDER BY a.created_at,a.id LIMIT 17`,[id,scope.environmentMarker,scope.workspaceId])).rows;}catch(cause){failures.push(cause);}
   try{await writeEvidence(input.evidenceDirectory,'learning-'+label+'-incomplete.json',{scope,evaluationId:id,prepareRequestId,capturedArms:arms.length,journalDispatchId:dispatch??null,nativeSessionId:native??null,priorSessions:sessions,retained,complete:false,automaticPaidRetries:0,retirementVerified:false});}catch(cause){failures.push(cause);}
   throw failures.length===1?error:new AggregateError(failures,'Hosted learning stopped with retained accounting and cleanup obligations');
  }
 }
 view=evaluation.parse(data(await request('/api/learning/evaluations/'+id,'GET')));
 if(view.state!=='awaiting_review'||view.budget.unknownReservations||arms.length!==16)throw Error('Actual complete paired review state unavailable');
 receipt={contract:'pilot-hosted-learning-capture-v1',evaluationId:id,scope,arms,sessions,complete:true,automaticPaidRetries:0,independentlyReviewed:false,benefitVerified:false,retirementVerified:false};
 await writeEvidence(input.evidenceDirectory,'learning-review-required.json',{...receipt,evaluation:view});
 }catch(error){operationFailure=error;}
 const cleanupErrors:unknown[]=[];
 if(operationFailure)try{
  const cleanup=pilotHostedRequest({scope,headers:input.headers,signal:AbortSignal.timeout(15000)}),current=evaluation.parse(data(await cleanup('/api/learning/evaluations/'+id,'GET')));
  if(['prepared','running','unconfirmed'].includes(current.state)){
   const requestId=randomUUID();await writeEvidence(input.evidenceDirectory,'learning-cancel-intent.json',{scope,evaluationId:id,requestId,expectedVersion:current.version});
   await cleanup('/api/learning/evaluations/'+id+'/cancel','POST',{contractVersion:'learning-v1',requestId,expectedVersion:current.version,rationale:'Fence an incomplete fixed batch without repeating a model or native create request'});
  }
 }catch(error){cleanupErrors.push(error);}
 // Runs after every post-admission exit, including cancellation between arms
 // and final evidence errors. It has its own finite clock, never spending authority.
 let retirement:Awaited<ReturnType<typeof retireHostedLearningCapture>>|undefined;
 try{retirement=await retireHostedLearningCapture({scope,db,evaluationId:id,evidenceDirectory:input.evidenceDirectory,minimumAttempts:prepareRequests});}catch(error){cleanupErrors.push(error);}
 if(operationFailure||cleanupErrors.length)throw new AggregateError([...(operationFailure?[operationFailure]:[]),...cleanupErrors],'Hosted learning stopped; original accounting and native cleanup obligations retained');
 if(!receipt||!retirement?.retirementVerified)throw Error('Hosted learning retirement remains unresolved');
 return {...receipt,arms,sessions,retirementVerified:true};
}

/** Enqueue existing operational cleanup only; no accepted data, attempt state,
 * original paid hold, provider identity or retry counter is rewritten. */
export async function retireHostedLearningCapture(input:{scope:PilotHostedScope;db:Client;evaluationId:string;evidenceDirectory:string;minimumAttempts:number}){
 const {scope,db}=input,id=z.uuid().parse(input.evaluationId),signal=AbortSignal.timeout(90000);
 if(!boundedOwners.has(db))throw Error('Bounded hosted learning owner connection required');
 let rows:Record<string,unknown>[]=[];
 try{
 await writeEvidence(input.evidenceDirectory,'learning-retirement-intent.json',{scope,evaluationId:id,modelCalls:0,automaticPaidRetries:0});
 await db.query(`INSERT INTO learning_cleanup_jobs(id,environment_id,workspace_id,owner_kind,owner_id,due_at,next_attempt_at)
  SELECT gen_random_uuid(),a.environment_id,a.workspace_id,'attempt',a.id,clock_timestamp(),clock_timestamp() FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id
  WHERE b.evaluation_id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 AND a.state IN('completed','failed','cancelled','unconfirmed','invalidated')
  ON CONFLICT(environment_id,workspace_id,owner_kind,owner_id) DO UPDATE SET due_at=least(learning_cleanup_jobs.due_at,excluded.due_at),
  next_attempt_at=CASE WHEN learning_cleanup_jobs.attempts=0 AND learning_cleanup_jobs.state='pending' THEN least(learning_cleanup_jobs.next_attempt_at,excluded.next_attempt_at) ELSE learning_cleanup_jobs.next_attempt_at END`,[id,scope.environmentMarker,scope.workspaceId]);
  for(;;){
   signal.throwIfAborted();
   rows=(await db.query(`SELECT a.id,a.conversation_id,a.state,a.native_session_id,c.eve_session_id,c.binding_state,c.creation_operation_id,
    j.id AS cleanup_job_id,j.state AS cleanup_state,r.native_session_id AS retired_native_session_id
    FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id JOIN conversations c ON c.id=a.conversation_id
    LEFT JOIN learning_cleanup_jobs j ON j.owner_kind='attempt' AND j.owner_id=a.id AND j.environment_id=a.environment_id
    LEFT JOIN learning_native_retirement_receipts r ON r.attempt_id=a.id
    WHERE b.evaluation_id=$1 AND a.environment_id=$2 AND a.workspace_id=$3 ORDER BY a.created_at,a.id LIMIT 17`,[id,scope.environmentMarker,scope.workspaceId])).rows;
   if(rows.length>16)throw Error('Hosted learning cleanup inventory exceeds fixed batch');
   if(rows.length>=input.minimumAttempts&&rows.every(row=>row.cleanup_state==='completed'&&(!row.native_session_id||row.native_session_id===row.eve_session_id)&&!['creating','reconciling'].includes(String(row.binding_state))
    &&(!(row.native_session_id??row.eve_session_id)||row.retired_native_session_id===(row.native_session_id??row.eve_session_id))))break;
   if(rows.some(row=>row.cleanup_state==='review_required'))throw Error('Original native cleanup requires review');await pause(signal);
  }
 }catch(error){try{await writeEvidence(input.evidenceDirectory,'learning-retirement-incomplete.json',{scope,evaluationId:id,minimumAttempts:input.minimumAttempts,rows,retirementVerified:false,modelCalls:0});}catch(cause){throw new AggregateError([error,cause],'Original learning retirement and evidence retention incomplete');}throw error;}
 const receipt={contract:'pilot-hosted-learning-retirement-v1',scope,evaluationId:id,rows,retirementVerified:true,modelCalls:0,automaticPaidRetries:0};
 await writeEvidence(input.evidenceDirectory,'learning-retirement.json',receipt);return receipt;
}

