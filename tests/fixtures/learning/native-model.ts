import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {randomUUID} from 'node:crypto';
import {query} from '../../../lib/server/db/client';
import {requireOwnedLearningDatabase} from '../../../scripts/learning-environment';
import {learningHash} from '../../../lib/server/learning/repository';
import {learningNativeDraftOutput} from './native';
function fixture(){requireOwnedLearningDatabase(process.env);if(process.env.TURAS_LEARNING_NATIVE_FIXTURE_READY!=='1'||process.env.TURAS_TEST_MODEL_MODE!=='deterministic')throw Error('Owned learning native fixture required');}
export function createLearningNativeFixtureModel(principal:unknown,identity:{nativeSessionId:string;responseAttemptId:string;turnId:string;stepIndex:number}){
 fixture();if(!principal)throw Error('Owned native identity required');let mode='normal',purpose='';
 const model=mockModel({provider:'turas-owned-learning-fixture',modelId:'spacexai/grok-4.7',respond:async({tools,toolResults})=>{
  const row=(await query(`SELECT a.purpose,coalesce(f.mode,'normal') AS mode FROM learning_attempts a LEFT JOIN learning_native_fixture_modes f ON f.customer_id=a.customer_id WHERE a.response_attempt_id=$1`,[identity.responseAttemptId])).rows[0];if(!row)throw Error('Learning fixture binding required');purpose=row.purpose;mode=row.mode;
  const expected=purpose==='draft'?['learning_summary','learning_evidence','load_skill']:[];
  if(JSON.stringify(tools.map(t=>t.name).sort())!==JSON.stringify(expected.sort()))throw Error('Learning native tool catalog mismatch');
  if(toolResults.some(t=>t.isError))throw Error('Learning synthetic read denied');
  const usage={inputTokens:11,outputTokens:mode==='overrun'?9000:7};
  if(mode==='forbidden')return {toolCalls:[{name:'propose_customer_context',input:{}}],usage};
  if(mode==='malformed')return {text:JSON.stringify({contractVersion:'learning-v1',proposal:{}}),usage};
  if(purpose==='draft'&&identity.stepIndex===0&&mode==='all_reads')return {toolCalls:[{name:'learning_summary',input:{}},{name:'learning_evidence',input:{sourceKeys:['original-1']}},{name:'load_skill',input:{skill:'governed-learning'}}],usage};
  if(purpose==='draft'&&identity.stepIndex===0)return {toolCalls:[{name:'learning_summary',input:{}}],usage};
  return {text:JSON.stringify(purpose==='draft'?learningNativeDraftOutput():{kind:'abstain',text:'Synthetic fixed-case abstention',citationKeys:[],unknowns:['Applicability remains unknown']}),usage};
 }});
 if(typeof model==='string')throw Error('Learning fixture model unavailable');
 const metadata=():Record<string,Record<string,string>>=>mode==='unknown'?{}:{gateway:{cost:'0.001',generationId:`synthetic-native-${identity.responseAttemptId}-${identity.stepIndex}`}};
 return wrapLanguageModel({model,middleware:{transformParams:async({params,type})=>{
  fixture();const context=(await query("SELECT p.content->'snapshot'->>'question' AS question FROM learning_attempts a JOIN learning_attempt_payloads p ON p.attempt_id=a.id AND p.kind='context' WHERE a.response_attempt_id=$1",[identity.responseAttemptId])).rows[0];if(context?.question&&!JSON.stringify(params.prompt).includes(context.question))throw Error('Selected private question was not injected into the provider prompt');if(params.maxOutputTokens!==4096||Buffer.byteLength(JSON.stringify(params.prompt))>24576)throw Error('Learning native bounds mismatch');
  await query('INSERT INTO learning_native_fixture_calls(id,response_attempt_id,step_index,provider_path,max_output_tokens,tools,prompt_digest) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),identity.responseAttemptId,identity.stepIndex,type,params.maxOutputTokens,JSON.stringify(params.tools?.map(t=>t.type==='function'?t.name:t.type)??[]),learningHash(params.prompt)]);return params;
 },wrapGenerate:async({doGenerate})=>{const result=await doGenerate();return {...result,providerMetadata:metadata()};},wrapStream:async({doStream})=>{const result=await doStream();return {...result,stream:result.stream.pipeThrough(new TransformStream({transform(chunk,controller){controller.enqueue(chunk.type==='finish'?{...chunk,providerMetadata:metadata()}:chunk);}}))};}}});
}
