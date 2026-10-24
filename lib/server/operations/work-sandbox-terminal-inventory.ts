import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {Sandbox,APIError} from '@vercel/sandbox';
import type {Client} from 'pg';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {withLockedWorkRecoveryDecision,requireLockedWorkRecoveryConnection,isWorkRecoveryDecisionClient,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {currentRecoveryStateDigest} from './recovery-state';
import {bindManagedRunProvider} from './managed-workflow-provider';
const nameSchema=z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
type Resource={name:string;status:string;persistent:boolean;createdAt:number;currentSessionId:string;tags:Record<string,string>};
const terminal=new Set(['stopped','failed','aborted']);
const measured=new WeakMap<object,{token:string;environment:'preview'|'production';retained:RetainedWorkDenials}>();
const targetDigest=(target:LockedWorkRecoveryTarget)=>{const {deadline,contract,...identity}=target;return recoveryDigest(identity);};
/** SDK transport pinned to metadata GETs. A repeated URL cannot trigger an
 * automatic network retry; mutation, resume and credential-refresh drift fail. */
function transport(target:LockedWorkRecoveryTarget,token:string,parent:AbortSignal){
 const controller=new AbortController(),signal=AbortSignal.any([parent,controller.signal]),seen=new Set<string>();let bytes=0;
 const read:typeof fetch=async(raw,options)=>{
  try{
   signal.throwIfAborted();const url=new URL(typeof raw==='string'?raw:raw instanceof URL?raw.href:raw.url),headers=new Headers(options?.headers);
   if(url.origin!=='https://vercel.com'||url.username||url.password||url.hash||options?.method!=='GET'||options.body!==undefined||headers.get('authorization')!=='Bearer '+token||url.searchParams.getAll('teamId').length!==1||url.searchParams.get('teamId')!==target.teamId)throw Error('Fixed Sandbox metadata request required');
   const list=url.pathname==='/api/v2/sandboxes',allowed=list?['teamId','project','limit','sortBy','sortOrder','cursor']:['teamId','projectId','resume'];
   if([...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1)||seen.has(url.href))throw Error('Sandbox metadata scope or repeated request differs');
   if(list){if(url.searchParams.get('project')!==target.projectId||url.searchParams.get('limit')!=='50'||url.searchParams.get('sortBy')!=='createdAt'||url.searchParams.get('sortOrder')!=='asc'||(url.searchParams.get('cursor')?.length??0)>8192)throw Error('Complete Sandbox project traversal required');}
   else if(!/^\/api\/v2\/sandboxes\/[A-Za-z0-9_-]{1,256}$/.test(url.pathname)||url.searchParams.get('projectId')!==target.projectId||url.searchParams.get('resume')!=='false')throw Error('Non-resuming Sandbox read required');
   seen.add(url.href);const bounded=AbortSignal.any([signal,AbortSignal.timeout(10000)]),response=await fetch(url,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},redirect:'error',cache:'no-store',signal:bounded});
   if(![200,404].includes(response.status)||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??'')){await response.body?.cancel();throw Error('Sandbox metadata unavailable');}
   const reader=response.body?.getReader();if(!reader)throw Error('Sandbox metadata body absent');const chunks:Uint8Array[]=[];let requestBytes=0;
   try{for(;;){bounded.throwIfAborted();const part=await reader.read();if(part.done)break;requestBytes+=part.value.length;bytes+=part.value.length;if(requestBytes>1048576||bytes>8388608)throw Error('Sandbox metadata byte bound exceeded');chunks.push(part.value);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const body=Buffer.concat(chunks);if(!list&&response.status===200&&JSON.parse(body.toString()).resumed===true)throw Error('Sandbox unexpectedly resumed');
   return new Response(body,{status:response.status,headers:{'content-type':'application/json'}});
  }catch{controller.abort();throw new DOMException('Sandbox metadata read failed','AbortError');}
 };
 return {fetch:read,signal};
}
async function inspect(db:Client,target:LockedWorkRecoveryTarget,token:string,environment:'preview'|'production',retained:RetainedWorkDenials,parent:AbortSignal){
 if(!isWorkRecoveryDecisionClient(db)||target.deadline<=Date.now())throw Error('Genuine current Sandbox owner decision required');
 const signal=AbortSignal.any([parent,AbortSignal.timeout(target.deadline-Date.now())]),scope={environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision},observedAt=new Date().toISOString();
 await requireLockedWorkRecoveryConnection(db,target,scope);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[target.environmentId]);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[target.environmentId]);await currentRecoveryStateDigest(db);
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId);
 const credentials={token,projectId:target.projectId,teamId:target.teamId},providerScope={...credentials,target:environment};await bindManagedRunProvider(providerScope,signal);
 const currentJobs=(await db.query('SELECT id,creation_tag,provider_id FROM operations_hosted_jobs WHERE environment_id=$1 ORDER BY id LIMIT 10001',[target.environmentId])).rows;
 if(currentJobs.length>10000)throw Error('Sandbox application inventory bound exceeded');
 const jobMap=new Map(currentJobs.map(row=>[String(row.id),{id:String(row.id),creation_tag:z.uuid().parse(row.creation_tag),provider_id:row.provider_id===null?null:nameSchema.parse(row.provider_id)}]));
 for(const row of source.snapshot.tables.find(table=>table.name==='operations_hosted_jobs')!.rows){
  const original={id:z.uuid().parse(row.identity.id),creation_tag:z.uuid().parse(row.status.creation_tag),provider_id:row.status.provider_id==null?null:nameSchema.parse(row.status.provider_id)},current=jobMap.get(original.id);
  if(current&&(current.creation_tag!==original.creation_tag||current.provider_id!==null&&current.provider_id!==original.provider_id))throw Error('Original retained Sandbox binding differs');jobMap.set(original.id,original);
 }
 const jobs=[...jobMap.values()].sort((a,b)=>a.id.localeCompare(b.id));if(jobs.length>10000)throw Error('Complete original Sandbox binding bound exceeded');
 async function traverse(){
  const io=transport(target,token,signal),rows:Resource[]=[],names=new Set<string>(),cursors=new Set<string>();let pages=0;
  const list=await Sandbox.list({...credentials,...io,limit:50,sortBy:'createdAt',sortOrder:'asc'});
  for await(const page of list.pages()){
   io.signal.throwIfAborted();if(++pages>100||page.sandboxes.length>50||page.pagination.count!==page.sandboxes.length||page.pagination.next!==null&&(cursors.has(page.pagination.next)||page.pagination.next.length<1||page.pagination.next.length>8192))throw Error('Complete bounded Sandbox page required');
   if(pages===100&&page.pagination.next!==null)throw Error('Sandbox page bound exceeded before next request');
   if(page.pagination.next!==null)cursors.add(page.pagination.next);
   for(const item of page.sandboxes){
    const name=nameSchema.parse(item.name);if(names.has(name)||names.size>=10000||!terminal.has(item.status))throw Error('Sandbox inventory duplicate overflow or active execution');names.add(name);
    const actual=await Sandbox.get({...credentials,...io,name,resume:false});
    if(actual.name!==name||!terminal.has(actual.status)||actual.status!==item.status||actual.persistent!==item.persistent||actual.createdAt.getTime()!==item.createdAt||recoveryDigest(actual.tags??{})!==recoveryDigest(item.tags??{}))throw Error('Sandbox terminal readback changed');
    rows.push({name,status:item.status,persistent:item.persistent,createdAt:item.createdAt,currentSessionId:item.currentSessionId,tags:item.tags??{}});
   }
  }
  const absent=[];
  for(const job of jobs){
   const existing=rows.find(row=>row.name===job.provider_id);
   if(existing){if(existing.tags.turas_job!==job.id||existing.tags.turas_creation!==job.creation_tag||existing.tags.turas_environment!==createHash('sha256').update(target.environmentId).digest('hex'))throw Error('Sandbox original job binding differs');}
   else if(job.provider_id){const name=nameSchema.parse(job.provider_id);try{await Sandbox.get({...credentials,...io,name,resume:false});throw Error('Referenced Sandbox missing from complete inventory');}catch(error){if(!(error instanceof APIError)||error.response.status!==404||(error.json as {error?:{code?:string}}|undefined)?.error?.code!=='not_found')throw Error('Actual referenced Sandbox retirement unavailable');absent.push({jobId:job.id,providerId:name,providerNotFound:true});}}
  }
  io.signal.throwIfAborted();return {inventoryDigest:recoveryDigest(rows.sort((a,b)=>a.name.localeCompare(b.name))),retiredDigest:recoveryDigest(absent),resources:rows.length,retiredReferences:absent.length};
 }
 const before=await traverse(),after=await traverse();if(recoveryDigest(before)!==recoveryDigest(after))throw Error('Sandbox terminal inventories changed');await bindManagedRunProvider(providerScope,signal);requireAuthenticatedRetainedDenials(retained,target.environmentId);signal.throwIfAborted();
 return {...after,jobsDigest:recoveryDigest(jobs),observedAt};
}
export async function measureWorkSandboxTerminalInventory(input:{target:LockedWorkRecoveryInput;token:string;retained:RetainedWorkDenials}){
 const token=z.string().min(1).max(8192).parse(input.token),environment=input.target.hostedScope.target;
 const result=await withLockedWorkRecoveryDecision(input.target,async(db,target)=>({targetDigest:targetDigest(target),...await inspect(db,target,token,environment,input.retained,input.target.signal)}));
 const proof=Object.freeze({contract:'pilot-work-sandbox-terminal-inventory-v1' as const,...result,wholeProjectSandboxTerminalVerified:true as const,otherEnvironmentExclusionsApplied:false as const,sandboxResumptionAdmissionClosed:false as const,paidEffectsReconciled:false as const,restorationReady:false as const});measured.set(proof,{token,environment,retained:input.retained});return proof;
}
export async function requireMeasuredWorkSandboxTerminalInventory(db:Client,target:LockedWorkRecoveryTarget,proof:Awaited<ReturnType<typeof measureWorkSandboxTerminalInventory>>,signal:AbortSignal){
 const actual=measured.get(proof),age=Date.now()-Date.parse(proof.observedAt);if(!actual||proof.targetDigest!==targetDigest(target)||!Number.isFinite(age)||age<0||age>300000)throw Error('Genuine fresh exact Sandbox measurement required');
 const current=await inspect(db,target,actual.token,actual.environment,actual.retained,signal);for(const key of ['inventoryDigest','retiredDigest','resources','retiredReferences','jobsDigest'] as const)if(current[key]!==proof[key])throw Error('Measured Sandbox terminal state changed');return proof;
}
