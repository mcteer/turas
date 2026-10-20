import type {Client,PoolClient} from 'pg';
import {issueWorkRecoveryHttpRead,issueWorkParticipantRecoveryHttpRead,retireOwnedRecoveryHttpRead} from './recovery-http-read-issuer';
import {currentRecoveryStateDigest} from './recovery-state';
import {Client as McpClient,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {z} from 'zod';
import {mcpCategorySchema,mcpToolOutputs,mcpToolInputs,mcpProtocolVersion,mcpLimits,type McpToolName} from '../../contracts/mcp';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {sessionCookie} from '../auth/sessions';
import {getServerConfig} from '../config';
import {withLockedWorkRecoveryTarget,requireLockedWorkRecoveryConnection,retireRegisteredWorkMcpProbe,remainingRegisteredWorkRecoveryProbes,withWorkRecoveryReadGroup,type LockedWorkRecoveryTarget,type LockedWorkRecoveryInput} from './locked-work-recovery-target';
import {issueWorkRecoveryMcpProbe} from './recovery-mcp-probe-issuer';
import {readWorkRecoveryMcpRequest} from './recovery-mcp-read';
import type {RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
const selection=z.strictObject({workspaceId:z.uuid(),username:z.enum(['mcteer','panel','partner']),category:mcpCategorySchema,customerId:z.uuid().nullable()}).refine(v=>v.category==='knowledge'?v.customerId===null:v.customerId!==null,'Exact category customer scope required');
type Selection=z.infer<typeof selection>;
type Input={target:LockedWorkRecoveryInput;selection:Selection;password:string;retained:RetainedWorkDenials;journalDirectory:string;protectionBypass?:string};
export type WorkMcpCategoryMeasurement=Readonly<{contract:'pilot-work-mcp-category-v1';selection:Readonly<Selection>;targetDigest:string;transcriptDigest:string;calls:number;completedAt:string;actualSdkVerified:true;categoryCoverageVerified:true;probeRetirementVerified:true;requiredScopeHealthy:false;restorationReady:false}>;
type Additional=Awaited<ReturnType<typeof issueWorkRecoveryHttpRead>>;
type Issued=Awaited<ReturnType<typeof issueWorkRecoveryMcpProbe>>;
const measured=new WeakMap<object,{transcript:readonly string[];issued:Issued;additional:readonly Additional[];password:string;retained:RetainedWorkDenials;journalDirectory:string}>();
const scope=(target:LockedWorkRecoveryTarget)=>({environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
const targetDigest=(target:LockedWorkRecoveryTarget)=>recoveryDigest({...scope(target),projectId:target.projectId,teamId:target.teamId,sourceCommit:target.sourceCommit,sourceDigest:target.sourceDigest,catalogDigest:target.catalogDigest,origin:target.origin,deploymentId:target.deploymentId,databaseBindingDigest:target.databaseBindingDigest});
async function transaction<T>(db:Client,run:()=>Promise<T>){await db.query('BEGIN ISOLATION LEVEL READ COMMITTED');try{const result=await run();await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK');throw error;}}
const object=(value:unknown)=>z.record(z.string(),z.unknown()).parse(value);
/** Only response-generated capabilities and the two rolling quality-clock fields
 * vary between identical canonical reads. No content, generation or acceptance
 * timestamp is removed. Citation capabilities are exercised separately below. */
function normalized(value:unknown,key='',root=true):unknown{
 if(Array.isArray(value))return value.map(item=>normalized(item,'',false));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([name])=>!(root&&name==='requestId')&&name!=='citationHandle'&&!(key==='quality'&&['asOf','validUntil'].includes(name))).map(([name,item])=>[name,name==='nextCursor'?item!==null:normalized(item,name,false)]));
 return value;
}
function projection(name:McpToolName,value:unknown){const result=object(normalized(value));if(name==='turas_identity_v1'){const {expiresAt:ignoredExpiry,...identity}=object(result.data);result.data=identity;}return result;}
function transcriptEntry(name:McpToolName,args:Record<string,unknown>,value:unknown){const {cursor:ignoredCursor,...record}=args;return recoveryDigest({name,args:normalized(record),output:projection(name,value)});}
function parse(name:McpToolName,raw:unknown){const result=object(mcpToolOutputs[name].parse(raw));if(!['available','empty'].includes(String(result.status)))throw Error('Required work MCP category unavailable');return result;}
type Pair={remote:Record<string,unknown>;canonical:Record<string,unknown>};
type Call=(name:McpToolName,remote:Record<string,unknown>,canonical?:Record<string,unknown>)=>Promise<Pair>;
/** Exhaust every current page and every returned record/citation. Every distinct admission keeps its original finite allowance and expiry.
 * Larger scopes fail explicitly at64toolcalls/seven additional admissions. */
async function walkCategory(selected:Selection,call:Call){
 const identity=await call('turas_identity_v1',{});if(object(identity.remote.data).kind!==(selected.username==='partner'?'partner':'internal')||object(identity.remote.data).workspaceId!==selected.workspaceId)throw Error('Work MCP participant differs');
 async function pages(name:McpToolName,args:Record<string,unknown>,visit:(remote:Record<string,unknown>,canonical:Record<string,unknown>)=>Promise<void>){
  let remote:unknown,canonical:unknown;const seen=new Set<string>();
  do{const pair=await call(name,{...args,...(remote?{cursor:remote}:{})},{...args,...(canonical?{cursor:canonical}:{})});
   if(pair.remote.status==='available'){const items=z.array(z.unknown()).parse(object(pair.remote.data).items),expected=z.array(z.unknown()).parse(object(pair.canonical.data).items);if(items.length!==expected.length)throw Error('Work MCP page differs');for(let i=0;i<items.length;i++)await visit(object(items[i]),object(expected[i]));}
   remote=pair.remote.nextCursor;canonical=pair.canonical.nextCursor;if(Boolean(remote)!==Boolean(canonical))throw Error('Work MCP page coverage differs');if(remote){const cursor=z.string().parse(remote);if(seen.has(cursor))throw Error('Work MCP cursor did not advance');seen.add(cursor);}
  }while(remote);
 }
 const customerId=selected.customerId;
 if(customerId){const pair=await call('turas_customers_list_v1',{limit:20});if(pair.remote.status!=='available'||pair.remote.nextCursor!==null||JSON.stringify(z.array(z.object({customerId:z.uuid()})).parse(object(pair.remote.data).items).map(item=>item.customerId))!==JSON.stringify([customerId]))throw Error('Work MCP customer ceiling differs');}
 if(selected.category==='profiles'){
  for(const section of ['summary','workloads','facts'])await pages('turas_profile_read_v1',{customerId,section,limit:20},async()=>{});
 }else if(selected.category==='evidence')await pages('turas_evidence_list_v1',{customerId,limit:20},async(remote,canonical)=>{
  const read=await call('turas_evidence_read_v1',{customerId,revisionId:remote.revisionId,passageId:remote.passageId});
  await call('turas_citation_resolve_v1',{citationHandle:object(read.remote.data).citationHandle},{citationHandle:object(read.canonical.data).citationHandle});
 });
 else if(selected.category==='knowledge')await pages('turas_knowledge_list_v1',{limit:20},async(remote,canonical)=>{
  const read=await call('turas_knowledge_read_v1',{publicationId:remote.publicationId,expectedRevisionId:remote.revisionId});
  await call('turas_citation_resolve_v1',{citationHandle:object(read.remote.data).citationHandle},{citationHandle:object(read.canonical.data).citationHandle});
 });
 else if(selected.category==='plans')await pages('turas_plans_list_v1',{customerId,limit:20},async remote=>{await call('turas_plan_read_v1',{customerId,planId:remote.planId,expectedRevisionId:remote.revisionId});});
 else await pages('turas_reports_list_v1',{customerId,limit:20},async remote=>{await call('turas_report_read_v1',{customerId,reportId:remote.reportId,expectedRevisionId:remote.revisionId});});
}
function sdkClient(){return new McpClient({name:'turas-recovery-verification',version:'1.0.0'},{versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});}
async function openCanonicalSdk(db:Client,target:LockedWorkRecoveryTarget,credential:string,ownTransactions:boolean){
 const sdk=sdkClient();const sdkFetch:typeof fetch=async(url,options)=>{
  const request=new Request(url,options);if(request.url!==target.origin+'/api/mcp/v1'||request.method!=='POST')throw Error('Fixed canonical work MCP transport required');const headers=new Headers(request.headers);headers.set('host',new URL(target.origin).host);
  const read=()=>readWorkRecoveryMcpRequest(db,target,new Request(request,{headers,signal:AbortSignal.any([request.signal,AbortSignal.timeout(Math.max(1,Math.min(10000,target.deadline-Date.now())))])}));
  return ownTransactions?transaction(db,read):read();
 };
 try{await sdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp/v1',target.origin),{fetch:sdkFetch,requestInit:{headers:{authorization:'Bearer '+credential}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{timeout:10000});return sdk;}catch(error){try{await sdk.close();}catch(retirement){throw new AggregateError([error,retirement],'Canonical work MCP connection and cleanup incomplete');}throw error;}
}
async function canonicalTool(sdk:McpClient,name:McpToolName,args:Record<string,unknown>){return parse(name,(await sdk.callTool({name,arguments:mcpToolInputs[name].parse(args)})).structuredContent);}
async function boundedResponse(response:Response,signal:AbortSignal){const reader=response.body?.getReader();if(!reader)throw Error('Work MCP response missing');let size=0;const chunks:Uint8Array[]=[];try{for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>mcpLimits.responseBytes)throw Error('Work MCP response exceeds contract');chunks.push(next.value);}}finally{await reader.cancel();reader.releaseLock();}return new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers});}
/** Real fixed-origin HTTP/SDK followed by a canonical governed comparison. The
 * exhaustive final replay independently binds every transcript to current state. No
 * injectable fetch/client, caller records, healthy flags or captured bearer. */
async function measureCategory(db:Client,target:LockedWorkRecoveryTarget,input:Input){
 const selected=selection.parse(input.selection);
  const deadline=Math.min(target.deadline,Date.now()+59000),signal=AbortSignal.any([input.target.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]);
  const issued=await transaction(db,()=>issueWorkRecoveryMcpProbe(db,target,{...scope(target),workspaceId:selected.workspaceId,username:selected.username,password:input.password,deadline,mcp:{categories:[selected.category],customerIds:selected.customerId?[selected.customerId]:[],expiresAt:new Date(deadline).toISOString(),retained:input.retained}},input.journalDirectory));
  const sdk=sdkClient();let canonicalSdk:McpClient|undefined;const transcript:string[]=[];const additional:Additional[]=[];let activeAdmission=issued.admission,admissionRequests=0,calls=0,failure:unknown;
  const admissionPath='/api/operations/recovery-read/'+issued.admission.id+'/mcp';
  async function denied(path:string,secret:string,statuses:readonly number[]){const headers=new Headers({'content-type':'application/json',authorization:'Bearer '+issued.credential,cookie:sessionCookie(issued.admission.actor.token,issued.admission.actor.expiresAt,{...getServerConfig(),TURAS_APP_ORIGIN:target.origin}).split(';')[0],'x-turas-recovery-read':secret});if(input.protectionBypass)headers.set('x-vercel-protection-bypass',input.protectionBypass);const response=await fetch(target.origin+path,{method:'POST',headers,body:'{}',redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});await response.body?.cancel();if(response.headers.get('x-turas-code-version')!==target.sourceCommit||!statuses.includes(response.status))throw Error('Work MCP required denial unverified');}

  try{
   await denied(admissionPath,issued.admission.secret+'invalid',[403]);await denied('/api/mcp/v1',issued.admission.secret,[401,403,503]);
   const sdkFetch:typeof fetch=async(url,options)=>{signal.throwIfAborted();const request=new Request(url,options);if(request.url!==target.origin+'/api/mcp/v1'||request.method!=='POST')throw Error('Fixed work MCP transport required');
    if(admissionRequests===10){if(additional.length>=7)throw Error('Work MCP distinct admission bound exceeded');const raw={...scope(target),workspaceId:selected.workspaceId,customerId:null,deadline,password:input.password,maximumRequests:10,deploymentId:target.deploymentId,readKind:'mcp' as const,recordId:issued.connection.id};const next=await transaction(db,()=>selected.username==='mcteer'?issueWorkRecoveryHttpRead(db,target,raw,input.journalDirectory):issueWorkParticipantRecoveryHttpRead(db,target,{...raw,username:selected.username},input.journalDirectory));additional.push(next);await transaction(db,()=>retireOwnedRecoveryHttpRead(db as unknown as PoolClient,activeAdmission.id));activeAdmission=next;admissionRequests=0;}
    admissionRequests++;const headers=new Headers(request.headers);headers.set('cookie',sessionCookie(activeAdmission.actor.token,activeAdmission.actor.expiresAt,{...getServerConfig(),TURAS_APP_ORIGIN:target.origin}).split(';')[0]);headers.set('x-turas-recovery-read',activeAdmission.secret);if(input.protectionBypass)headers.set('x-vercel-protection-bypass',input.protectionBypass);
    const response=await fetch(target.origin+'/api/operations/recovery-read/'+activeAdmission.id+'/mcp',{method:'POST',headers,body:await request.arrayBuffer(),redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,request.signal,AbortSignal.timeout(10000)])});if(response.headers.get('x-turas-code-version')!==target.sourceCommit){await response.body?.cancel();throw Error('Work MCP serving release differs');}return boundedResponse(response,signal);
   };
   await sdk.connect(new StreamableHTTPClientTransport(new URL('/api/mcp/v1',target.origin),{fetch:sdkFetch,requestInit:{headers:{authorization:'Bearer '+issued.credential}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{timeout:10000});
   canonicalSdk=await openCanonicalSdk(db,target,issued.credential,true);
   await walkCategory(selected,async(name,args,canonicalArgs=args)=>{
    if(++calls>64)throw Error('Work MCP complete category exceeds finite probe admission');signal.throwIfAborted();
    const remote=parse(name,(await sdk.callTool({name,arguments:mcpToolInputs[name].parse(args)})).structuredContent);
    const after=await canonicalTool(canonicalSdk!,name,canonicalArgs);
    const digest=recoveryDigest(projection(name,remote));if(digest!==recoveryDigest(projection(name,after)))throw Error('Work MCP HTTP and canonical projections differ');
    transcript.push(transcriptEntry(name,args,remote));return {remote,canonical:after};
   });
  }catch(error){failure=error;throw error;}finally{const errors:unknown[]=[];for(const client of [sdk,canonicalSdk])try{await client?.close();}catch(error){errors.push(error);}for(const admission of additional)try{await transaction(db,()=>retireOwnedRecoveryHttpRead(db as unknown as PoolClient,admission.id));}catch(error){errors.push(error);}try{await transaction(db,()=>retireRegisteredWorkMcpProbe(db,target,issued.probe));await denied(admissionPath,issued.admission.secret,[403]);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],'Work MCP read and retirement incomplete');}
  return {proof:Object.freeze({contract:'pilot-work-mcp-category-v1' as const,selection:Object.freeze(selected),targetDigest:targetDigest(target),transcriptDigest:recoveryDigest(transcript),calls,completedAt:new Date().toISOString(),actualSdkVerified:true as const,categoryCoverageVerified:true as const,probeRetirementVerified:true as const,requiredScopeHealthy:false as const,restorationReady:false as const}),transcript:Object.freeze(transcript),issued,additional:Object.freeze(additional)};
}
async function measureCategorySet(input:Omit<Input,'selection'>&{selections:readonly Selection[]},maximum:number,window:boolean){
 const selections=z.array(selection).min(1).max(maximum).parse(input.selections);z.string().min(1).max(4096).parse(input.password);if(input.protectionBypass!==undefined)z.string().min(1).max(8192).parse(input.protectionBypass);
 if(new Set(selections.map(value=>recoveryDigest(value))).size!==selections.length||selections.some(value=>value.username!==selections[0].username||value.workspaceId!==selections[0].workspaceId))throw Error('Unique same-participant work MCP batch required');
 const results=await withLockedWorkRecoveryTarget(input.target,async(db,target)=>{const results:Awaited<ReturnType<typeof measureCategory>>[]=[];for(const selected of selections){
  // One original plus seven additional admissions covers the unchanged64-call
  // category ceiling. Never reclaim retired intents or renew the shared target.
  if(window&&remainingRegisteredWorkRecoveryProbes(db,target)<8)break;
  results.push(await measureCategory(db,target,{...input,selection:selected}));
 }return results;});
 // A failed category or outer source/platform/cleanup check mints no proofs.
 for(const result of results)measured.set(result.proof,{transcript:result.transcript,issued:result.issued,additional:result.additional,password:input.password,retained:input.retained,journalDirectory:input.journalDirectory});return Object.freeze(results.map(result=>result.proof));
}
export async function measureWorkMcpCategoryBatch(input:Omit<Input,'selection'>&{selections:readonly Selection[]}){return measureCategorySet(input,4,false);}
/** Amortize owner binding without increasing any probe, call or time ceiling.
 * Return only completed selections after independent final cleanup succeeds. */
export async function measureWorkMcpCategoryWindow(input:Omit<Input,'selection'>&{selections:readonly Selection[]}){return measureCategorySet(input,32,true);}
export async function measureWorkMcpCategory(input:Input){return (await measureWorkMcpCategoryBatch({...input,selections:[input.selection]}))[0];}
async function requireAdditionalRetirement(db:Client,admissions:readonly Additional[]){for(const admission of admissions)if((await db.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.id=$1 AND s.id=$2 AND a.revoked_at IS NOT NULL AND s.revoked_at IS NOT NULL',[admission.id,admission.actor.sessionId])).rowCount!==1)throw Error('Measured work MCP additional admission retirement changed');}
/** Final in-transaction consumption repeats every canonical page/read/citation
 * with a new current authenticated probe, under ordered fences and table locks.
 * Retire it before returning so the producer can hash the final durable state. */
export async function requireMeasuredWorkMcpCategory(db:Client,target:LockedWorkRecoveryTarget,proof:WorkMcpCategoryMeasurement){
 const actual=measured.get(proof),age=Date.now()-Date.parse(proof.completedAt);if(!actual||targetDigest(target)!==proof.targetDigest||!Number.isFinite(age)||age<0||age>1800000||recoveryDigest(actual.transcript)!==proof.transcriptDigest)throw Error('Actual fresh work MCP category measurement required');
 await requireLockedWorkRecoveryConnection(db,target,scope(target));
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);
 // Retain all included table SHARE locks, then read current committed domain
 // state. No concurrent source, content or grant change can cross this decision.
 await currentRecoveryStateDigest(db);
 const old=actual.issued;
 if((await db.query(`SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id JOIN mcp_connections mc ON mc.id=a.record_id
  WHERE a.id=$1 AND s.id=$2 AND mc.id=$3 AND a.environment_id=$4 AND a.recovery_id=$5 AND a.control_revision=$6 AND a.mcp_probe_connection
   AND a.revoked_at IS NOT NULL AND s.revoked_at IS NOT NULL AND mc.revoked_at IS NOT NULL AND mc.credential_hash IS NULL`,[old.admission.id,old.admission.actor.sessionId,old.connection.id,target.environmentId,target.recoveryId,target.controlRevision])).rowCount!==1)throw Error('Measured work MCP probe retirement changed');await requireAdditionalRetirement(db,actual.additional);
 const deadline=Math.min(target.deadline,Date.now()+59000),selected=proof.selection;
 const issued=await issueWorkRecoveryMcpProbe(db,target,{...scope(target),workspaceId:selected.workspaceId,username:selected.username,password:actual.password,deadline,mcp:{categories:[selected.category],customerIds:selected.customerId?[selected.customerId]:[],expiresAt:new Date(deadline).toISOString(),retained:actual.retained}},actual.journalDirectory);
 let failure:unknown,canonicalSdk:McpClient|undefined;const transcript:string[]=[];
 try{canonicalSdk=await openCanonicalSdk(db,target,issued.credential,false);await walkCategory(selected,async(name,args,canonicalArgs=args)=>{if(transcript.length>=64)throw Error('Current work MCP category exceeds measured admission');const value=await canonicalTool(canonicalSdk!,name,canonicalArgs);transcript.push(transcriptEntry(name,args,value));return {remote:value,canonical:value};});
  if(transcript.length!==proof.calls||recoveryDigest(transcript)!==proof.transcriptDigest)throw Error('Measured work MCP category changed');
 }catch(error){failure=error;throw error;}finally{const errors:unknown[]=[];try{await canonicalSdk?.close();}catch(error){errors.push(error);}try{await retireRegisteredWorkMcpProbe(db,target,issued.probe);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],'Current work MCP measurement and retirement incomplete');}
 return proof;
}

/** Derive required current participant/category/customer scope before selecting
 * any caller measurements. Empty categories still require their measured read. */
export async function deriveWorkMcpScopeInTransaction(db:Client,target:LockedWorkRecoveryTarget){
 await requireLockedWorkRecoveryConnection(db,target,scope(target));
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);
 const members=(await db.query(`SELECT m.id,m.workspace_id,m.kind,p.login_name FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
  LEFT JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id
  WHERE m.active AND p.active AND w.active AND p.login_name IN('mcteer','panel','partner')
   AND (w.classification='primary' OR w.pilot_environment_id=$1) AND (m.kind='internal' OR o.active) ORDER BY m.workspace_id,p.login_name LIMIT 33`,[target.environmentId])).rows;
 if(!members.length||members.length>32)throw Error('Finite nonempty current work MCP participant inventory required');
 const required:Selection[]=[];
 for(const member of members){
  if((member.login_name==='partner')!==(member.kind==='partner'))throw Error('Work MCP participant role differs');
  const customers=(await db.query(`SELECT c.id FROM customer_references c WHERE c.workspace_id=$1 AND ($2='internal' OR EXISTS(SELECT 1 FROM customer_grants g WHERE g.workspace_id=c.workspace_id AND g.customer_id=c.id AND g.membership_id=$3 AND g.state='active')) ORDER BY c.id LIMIT 1025`,[member.workspace_id,member.kind,member.id])).rows;
  if(customers.length>1024)throw Error('Work MCP customer inventory exceeds bound');
  required.push(selection.parse({workspaceId:member.workspace_id,username:member.login_name,category:'knowledge',customerId:null}));
  for(const customer of customers)for(const category of ['profiles','evidence','plans','reports'])required.push(selection.parse({workspaceId:member.workspace_id,username:member.login_name,category,customerId:customer.id}));
  if(required.length>4096)throw Error('Work MCP category inventory exceeds bound');
 }
 return Object.freeze({contract:'pilot-work-mcp-required-scope-v1' as const,required:Object.freeze(required.map(value=>Object.freeze(value))),scopeDigest:recoveryDigest(required),requiredScopeHealthy:false as const,restorationReady:false as const});
}
/** Exact union rechecks current ledger scope and every original measurement under
 * the final transaction. Partial/duplicate/forged category lists fail closed. */
export async function requireMeasuredWorkMcpCoverage(db:Client,target:LockedWorkRecoveryTarget,proofs:readonly WorkMcpCategoryMeasurement[]){
 if(!Array.isArray(proofs)||!proofs.length||proofs.length>4096)throw Error('Finite genuine work MCP scope measurements required');
 const inventory=await deriveWorkMcpScopeInTransaction(db,target),expected=new Set(inventory.required.map(value=>recoveryDigest(value))),seen=new Set<string>();
 const groups=new Map<string,WorkMcpCategoryMeasurement[]>();
 for(const proof of proofs){const key=recoveryDigest(selection.parse(proof.selection));if(!expected.has(key)||seen.has(key))throw Error('Complete unique current work MCP scope coverage required');seen.add(key);const principal=recoveryDigest({workspaceId:proof.selection.workspaceId,username:proof.selection.username});const group=groups.get(principal)??[];group.push(proof);groups.set(principal,group);}
 if(seen.size!==expected.size)throw Error('Complete unique current work MCP scope coverage required');
 const chunks:{proofs:WorkMcpCategoryMeasurement[];customers:string[]}[]=[];
 for(const group of groups.values()){
  const customers=[...new Set(group.flatMap(proof=>proof.selection.customerId?[proof.selection.customerId]:[]))].sort();
  if(!customers.length)chunks.push({proofs:group,customers:[]});
  for(let offset=0;offset<customers.length;offset+=100){const selected=customers.slice(offset,offset+100);chunks.push({customers:selected,proofs:group.filter(proof=>proof.selection.customerId?selected.includes(proof.selection.customerId):offset===0)});}
 }
 if(chunks.length>32)throw Error('Work MCP participant chunks exceed final finite probe bound');
 await currentRecoveryStateDigest(db);
 for(const chunk of chunks){
  const first=measured.get(chunk.proofs[0]);if(!first)throw Error('Actual fresh work MCP category measurement required');if(Math.max(...chunk.proofs.map(proof=>Date.parse(proof.completedAt)))<Date.now()-300000)throw Error('Recent actual work MCP transport canary required for every participant chunk');
  for(const proof of chunk.proofs){const actual=measured.get(proof),age=Date.now()-Date.parse(proof.completedAt);if(!actual||actual.password!==first.password||actual.retained!==first.retained||targetDigest(target)!==proof.targetDigest||!Number.isFinite(age)||age<0||age>1800000||recoveryDigest(actual.transcript)!==proof.transcriptDigest)throw Error('Actual fresh coherent work MCP category measurements required');
   const old=actual.issued;if((await db.query(`SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id JOIN mcp_connections mc ON mc.id=a.record_id WHERE a.id=$1 AND s.id=$2 AND mc.id=$3 AND a.environment_id=$4 AND a.recovery_id=$5 AND a.control_revision=$6 AND a.mcp_probe_connection AND a.revoked_at IS NOT NULL AND s.revoked_at IS NOT NULL AND mc.revoked_at IS NOT NULL AND mc.credential_hash IS NULL`,[old.admission.id,old.admission.actor.sessionId,old.connection.id,target.environmentId,target.recoveryId,target.controlRevision])).rowCount!==1)throw Error('Measured work MCP probe retirement changed');await requireAdditionalRetirement(db,actual.additional);
  }
  const selected=chunk.proofs[0].selection,deadline=Math.min(target.deadline,Date.now()+59000),categories=chunk.customers.length?mcpCategorySchema.options:['knowledge' as const];
  const issued=await issueWorkRecoveryMcpProbe(db,target,{...scope(target),workspaceId:selected.workspaceId,username:selected.username,password:first.password,deadline,mcp:{categories:[...categories],customerIds:chunk.customers,expiresAt:new Date(deadline).toISOString(),retained:first.retained}},first.journalDirectory);
  let sdk:McpClient|undefined,failure:unknown;
  try{sdk=await openCanonicalSdk(db,target,issued.credential,false);
   // A broader current credential avoids one new identity per customer/category.
   // Exhaust its real customer census, then narrow only credential-ceiling DTOs
   // to the previously measured single-category/single-customer projection.
   const customers:Record<string,unknown>[]=[];let cursor:unknown,firstPage:Record<string,unknown>|undefined;const cursors=new Set<string>();
   if(chunk.customers.length)do{const page=await canonicalTool(sdk,'turas_customers_list_v1',{limit:20,...(cursor?{cursor}:{})});firstPage??=page;if(page.status==='available')customers.push(...z.array(z.unknown()).parse(object(page.data).items).map(object));cursor=page.nextCursor;if(cursor){const value=z.string().parse(cursor);if(cursors.has(value))throw Error('Current work MCP customer cursor did not advance');cursors.add(value);}if(customers.length>100||cursors.size>5)throw Error('Current work MCP customer census exceeds bound');}while(cursor);
   if(JSON.stringify(customers.map(customer=>z.uuid().parse(customer.customerId)).sort())!==JSON.stringify(chunk.customers))throw Error('Current work MCP customer census differs');
   const currentIdentity=await canonicalTool(sdk,'turas_identity_v1',{});const identityData=object(currentIdentity.data);
   if(identityData.kind!==(selected.username==='partner'?'partner':'internal')||identityData.workspaceId!==selected.workspaceId||JSON.stringify(identityData.categories)!==JSON.stringify(categories))throw Error('Current work MCP identity differs');
   for(let offset=0;offset<chunk.proofs.length;offset+=8)await withWorkRecoveryReadGroup(db,target,chunk.proofs.slice(offset,offset+8).map(proof=>async()=>{const transcript:string[]=[];
    await walkCategory(proof.selection,async(name,args,canonicalArgs=args)=>{if(transcript.length>=64)throw Error('Current work MCP category exceeds measured admission');let value:Record<string,unknown>;
     if(name==='turas_customers_list_v1'){const customer=customers.find(row=>row.customerId===proof.selection.customerId);if(!customer||!firstPage)throw Error('Current work MCP customer ceiling differs');value=parse(name,{...firstPage,status:'available',data:{items:[customer]},nextCursor:null});}
     else if(name==='turas_identity_v1')value=parse(name,{...currentIdentity,data:{...identityData,categories:[proof.selection.category]}});
     else value=await canonicalTool(sdk!,name,canonicalArgs);
     transcript.push(transcriptEntry(name,args,value));return {remote:value,canonical:value};
    });if(transcript.length!==proof.calls||recoveryDigest(transcript)!==proof.transcriptDigest)throw Error('Measured work MCP category changed');
   }));
  }catch(error){failure=error;throw error;}finally{const errors:unknown[]=[];try{await sdk?.close();}catch(error){errors.push(error);}try{await retireRegisteredWorkMcpProbe(db,target,issued.probe);}catch(error){errors.push(error);}if(errors.length)throw new AggregateError([...(failure?[failure]:[]),...errors],'Current work MCP scope and retirement incomplete');}
 }
 return Object.freeze({contract:'pilot-work-mcp-coverage-v1' as const,...scope(target),targetDigest:targetDigest(target),scopeDigest:inventory.scopeDigest,categoryMeasurements:proofs.length,currentCredentialChunks:chunks.length,actualSdkScopeCoverageVerified:true as const,probeRetirementVerified:true as const,requiredScopeHealthy:false as const,restorationReady:false as const});
}
