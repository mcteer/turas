import {learnPublicEvidence} from '../../lib/server/research/specialists/research-cache/public-learning';
import {signCheckedPublicPage,publicDigest} from '../../lib/server/research/public-dossier';
import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {query} from '../../lib/server/db/client';
import {researchIdentity} from '../../lib/server/research/specialists/identity';
import {prepareResearch,loadSessionResearchRequest,finishResearchRequest,finishPracticeResearch} from '../../lib/server/research/specialists/research-cache/requests';
import {loadResearchContext,finalizeResearchContext} from '../../lib/server/research/specialists/solution-research/context';
import {bindCustomerUpdate} from '../../lib/server/research/specialists/solution-research/customer-update';
import {signCustomerUpdate} from '../../lib/server/research/specialists/solution-research/customer-update-receipt';
import {signResearch} from '../../lib/server/research/specialists/solution-research/receipt';
import {storeCustomerUpdateArtifact,storeResearchArtifact} from '../../lib/server/research/specialists/solution-research/artifacts';
import {recordVercelPracticeRun} from '../../lib/server/research/specialists/research-cache/practice-library';
import {researchPassages} from '../../lib/server/research/specialists/solution-research/source-integrity';
import {registerSpecialistSources} from '../../lib/server/research/specialists/discussions';
import {createHash} from 'node:crypto';
import {brief,sources} from './legacy-solution-research';
import type {SpecialistKind} from '../../lib/contracts/specialist-discussions';
type CurrentPrincipal=NonNullable<Parameters<typeof researchIdentity>[0]>;
function owned(){
 if(process.env.TURAS_SPECIALIST_CONTINUITY_FIXTURE!=='1'||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||!/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL!).pathname))throw Error('Owned unpaid specialist fixture required');
}
const usage={inputTokens:11,outputTokens:7};
export function specialistContinuityRoot(principal:CurrentPrincipal|null,parentSessionId:string){
 owned();
 return mockModel({provider:'owned-specialist-continuity',modelId:'anthropic/claude-sonnet-5.5',respond:async({toolResults})=>{
  const identity=await researchIdentity(principal),attempt=identity.responseAttemptId!;
  const row=(await query(`SELECT m.text,c.customer_id FROM response_attempts a JOIN submitted_messages m ON m.id=a.message_id JOIN conversations c ON c.id=a.conversation_id WHERE a.id=$1`,[attempt])).rows[0];
  if(['Parallel continuity Stop','Global continuity Stop'].includes(row.text)){
   const kinds=['customer-update','best-practices'] as const;
   if((await query('SELECT 1 FROM specialist_assignments WHERE attempt_id=$1 LIMIT 1',[attempt])).rowCount)return {text:'The native task results govern completion.',usage};
   if(kinds.every(kind=>toolResults.some(result=>result.id==='parallel-'+kind+'-'+attempt)))return {text:'The native task results govern completion.',usage};
   for(const kind of kinds){
    const admission=await prepareResearch(identity,{accountId:row.customer_id,kind,workload:row.text==='Global continuity Stop'?'global continuity':'parallel continuity',question:row.text},new AbortController().signal,false,parentSessionId);
    if(!['research','working'].includes(admission.status))throw Error('Parallel reservation unavailable');
   }
   return {toolCalls:kinds.map(kind=>({id:'parallel-'+kind+'-'+attempt,name:kind==='customer-update'?'customer-recon':'vercel-best-practices',input:{message:row.text}})),usage};
  }
  const match=/^Continuity (customer-update|solution|best-practices) (\d+)(?: race)?$/.exec(row.text);
  if(!match)throw Error('Synthetic specialist command required');
  const kind=match[1] as SpecialistKind,tool={'customer-update':'customer-recon',solution:'implementation-research','best-practices':'vercel-best-practices'}[kind];
  const callId='specialist-'+attempt;
  const delivered=(await query('SELECT a.id,a.state,a.result_reference FROM specialist_assignments a JOIN specialist_discussions d ON d.id=a.discussion_id WHERE a.attempt_id=$1 AND d.kind=$2 LIMIT 1',[attempt,kind])).rows[0];
  if(delivered){
   if(kind==='best-practices'&&delivered.state==='completed'){
    const readId='practice-brief-'+attempt,loaded=toolResults.find(result=>result.id===readId);
    if(!loaded)return {toolCalls:[{id:readId,name:'get_vercel_practice_brief',input:{reference:delivered.result_reference.reference}}],usage};
    const output=typeof loaded.output==='string'?JSON.parse(loaded.output):loaded.output;
    if(loaded.isError||output?.status!=='available'||output.result?.status!=='incomplete'||!output.result.brief.practices.length||!output.result.sources.length)throw Error('Native stored practice brief was not loaded with gaps and sources');
    await query('INSERT INTO specialist_continuity_read_results(assignment_id) VALUES($1) ON CONFLICT DO NOTHING',[delivered.id]);
    return {text:'Checked practice: '+output.result.brief.practices[0].practice+' '+output.result.sources[0].url+' Remaining gap: '+output.result.brief.gaps[0],usage};
   }
   return {text:'Specialist assignment delivered.',usage};
  }
  if(toolResults.some(result=>result.id===callId))return {text:'Specialist assignment delivered.',usage};
  const context=await loadResearchContext(identity,row.customer_id,new AbortController().signal);
  let reconReference;
  if(kind==='solution'){
   const bound=bindCustomerUpdate({accountId:row.customer_id,question:'Synthetic continuity context',findings:[],conflicts:[],unknowns:['Synthetic fixture does not assert customer observations.']},[]);
   reconReference=await storeCustomerUpdateArtifact(signCustomerUpdate({userId:identity.userId,environmentId:identity.environmentId,workspaceId:identity.workspaceId,issuedAt:new Date().toISOString(),context,...bound}),identity,new AbortController().signal);
  }
  const admission=await prepareResearch(identity,{accountId:row.customer_id,kind,workload:'continuity workload',question:row.text,...(kind==='solution'?{proposal:'A synthetic bounded continuity exercise.'}:{})},new AbortController().signal,false,parentSessionId,reconReference);
  if(admission.status!=='research'&&admission.status!=='working')throw Error('Synthetic reservation unavailable');
  const existing=(await query(`SELECT native_task_id FROM specialist_discussions WHERE parent_session_id=$1 AND kind=$2 AND state='open'`,[parentSessionId,kind])).rows[0];
  return {toolCalls:[{id:callId,name:tool,input:{message:row.text,...(existing?.native_task_id?{taskId:existing.native_task_id}:{})}}],usage};
 }});
}
export function specialistContinuityWorker(principal:CurrentPrincipal|null,parentSessionId:string,workerSessionId:string,kind:SpecialistKind){
 owned();
 let activeSignal:AbortSignal|undefined;
 const model=mockModel({provider:'owned-specialist-continuity',modelId:'openai/gpt-5.6-terra',respond:async({tools})=>{
  const signal=activeSignal??new AbortController().signal;
  const identity=await researchIdentity(principal,{parentSessionId,workerSessionId,kind});
  const assignment=(await query(`SELECT a.*,d.customer_id FROM specialist_assignments a JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.child_session_id=$1 AND a.attempt_id=$2 AND a.state='working'`,[workerSessionId,identity.responseAttemptId])).rows[0];
  if(!assignment)throw Error('Owned active assignment required');
  const request=await loadSessionResearchRequest(identity,parentSessionId,workerSessionId,assignment.customer_id,kind,signal);
  if(['Parallel continuity Stop','Global continuity Stop'].includes(request.scope.question)||request.scope.question.endsWith(' race')){
   await query('INSERT INTO specialist_continuity_started(assignment_id,worker_id) VALUES($1,$2)',[assignment.id,workerSessionId]);
   while(!(await query('SELECT 1 FROM specialist_continuity_release WHERE assignment_id=$1',[assignment.id])).rowCount){signal.throwIfAborted();await new Promise(done=>setTimeout(done,100));}
  }
  const context=await loadResearchContext(identity,assignment.customer_id,signal);
  const tracked=[];
  const fixtureSources=kind==='customer-update'?sources.map((source,index)=>index===0?{...source,url:source.url+'?owned_customer='+assignment.customer_id,excerpt:`${context.name} uses Vercel for a synthetic public documentation workload. This is owned fixture content, never a live customer claim.`}:source):sources;
  for(const original of fixtureSources){
   const snapshotId=createHash('sha256').update(identity.workspaceId+original.url).digest('hex');
   const now=new Date(),refreshAfter=new Date(now.getTime()+3600000);
   await query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after,index_state,check_receipt)
    VALUES($1,$2,$3,$3,$4,$3,$5,false,$6,$7,'ready',$8) ON CONFLICT DO NOTHING`,[identity.environmentId,identity.workspaceId,snapshotId,original.url,JSON.stringify(original),now,refreshAfter,kind==='customer-update'?JSON.stringify(signCheckedPublicPage({url:original.url,title:original.title,text:original.excerpt,bodyDigest:publicDigest(original.excerpt),normalizedDigest:publicDigest(original.excerpt),retrievedAt:now.toISOString(),publishedAt:null,discoveryPurpose:'specialist_public_source'})):null]);
   const stored=(await query('SELECT checked_at,refresh_after FROM turas_evidence_snapshots WHERE environment_id=$1 AND workspace_id=$2 AND id=$3',[identity.environmentId,identity.workspaceId,snapshotId])).rows[0];
   if(kind==='customer-update')await query(`INSERT INTO turas_evidence_accounts(environment_id,workspace_id,owner_user_id,account_id,workload,snapshot_id,visibility)
    VALUES($1,$2,$3,$4,'',$5,'public') ON CONFLICT DO NOTHING`,[identity.environmentId,identity.workspaceId,identity.userId,assignment.customer_id,snapshotId]);
   tracked.push({...original,retrievedAt:stored.checked_at.toISOString(),cache:{snapshotId,checkedAt:stored.checked_at.toISOString(),refreshAfter:stored.refresh_after.toISOString()}});
  }
  await registerSpecialistSources(identity,tracked.map(source=>source.cache));
  let reference;
  if(kind==='best-practices'){
   reference=await recordVercelPracticeRun(identity,'Synthetic product','Synthetic continuity exercise',{summary:'Synthetic data for native continuity verification.',practices:[{practice:'Verify the isolated fixture deployment before continuing.',rationale:'The retained checked source supports this bounded exercise.',sourceIds:[tracked[0].id],caveat:'Synthetic fixture guidance is not a Production recommendation.'}],gaps:['Synthetic fixture; no live research.']},tracked.map(source=>source.url),signal);
   await finishPracticeResearch(identity,request.ticket,1,signal,reference);
  }else{
   const base={userId:identity.userId,environmentId:identity.environmentId,workspaceId:identity.workspaceId,issuedAt:new Date().toISOString(),context};
   let receipt=kind==='customer-update'?signCustomerUpdate({...base,...bindCustomerUpdate({accountId:assignment.customer_id,question:request.scope.question,findings:[{claim:'The synthetic source supports a limited test claim.',scope:'Synthetic continuity exercise',sourceId:tracked[0].id,passageId:researchPassages(tracked[0])[0].id,publisherType:'vercel' as const}],conflicts:[],unknowns:['Synthetic fixture; no live research.']},tracked)}):signResearch({...base,brief:{...brief,accountId:assignment.customer_id},sources:tracked,blockers:['Synthetic fixture; no live research.']});
   if(kind==='customer-update'){
    const customerReceipt=receipt as ReturnType<typeof signCustomerUpdate>;
    await learnPublicEvidence(identity,customerReceipt.payload.update,tracked,signal);
    receipt=signCustomerUpdate({...customerReceipt.payload,context:await finalizeResearchContext(identity,context,signal)});
   }
   reference=kind==='customer-update'?await storeCustomerUpdateArtifact(receipt as Parameters<typeof storeCustomerUpdateArtifact>[0],identity,signal):await storeResearchArtifact(receipt as Parameters<typeof storeResearchArtifact>[0],identity,signal);
   await finishResearchRequest(identity,request.ticket,receipt,signal);
  }
  await query('INSERT INTO specialist_continuity_calls(assignment_id,worker_id) VALUES($1,$2)',[assignment.id,workerSessionId]);
  const reply=tools.find(tool=>tool.name==='eve__reply');
  if(!reply)throw Error('Native structured reply tool missing');
  return {toolCalls:[{name:reply.name,input:{kind,status:'incomplete',reference,reason:'Synthetic continuity fixture; no live research.'}}],usage};
 }});
 if(typeof model==='string')throw Error('Fixture provider unavailable');
 return wrapLanguageModel({model,middleware:{async transformParams({params}){activeSignal=params.abortSignal;return params;},async wrapGenerate({doGenerate}){const result=await doGenerate();return {...result,providerMetadata:{gateway:{cost:'0.0001'}}};},async wrapStream({doStream}){const result=await doStream();return {...result,stream:result.stream.pipeThrough(new TransformStream({transform(part,controller){controller.enqueue(part.type==='finish'?{...part,providerMetadata:{gateway:{cost:'0.0001'}}}:part);}}))};}}});
}
