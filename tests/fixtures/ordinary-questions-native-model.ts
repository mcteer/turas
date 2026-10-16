import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {randomUUID} from 'node:crypto';
import {query} from '../../lib/server/db/client';
import {assertDeterministicTestMode} from './runtime';
export function createOrdinaryQuestionsNativeModel(attemptId:string){
 assertDeterministicTestMode();
 if(process.env.TURAS_ORDINARY_QUESTION_FIXTURE!=='1'||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||!/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL!).pathname))throw Error('Owned unpaid question fixture required');
 const model=mockModel({provider:'owned-native-question',modelId:'spacexai/grok-4.7',respond:async({messages,toolResults})=>{
  const original=(await query('SELECT m.text FROM response_attempts a JOIN submitted_messages m ON m.id=a.message_id WHERE a.id=$1',[attemptId])).rows[0]?.text;
  const prompts=['Request a basic question.','Request a durable question.','Request a dismissible question.','Complete this unrelated follow-up.'];
  if(!prompts.includes(original)||!messages.some(message=>message.role==='user'&&message.text.includes(original)))throw Error('Actual synthetic question delivery missing');
  if(original==='Complete this unrelated follow-up.')return {text:'Unrelated follow-up completed.',usage:{inputTokens:11,outputTokens:7}};
  const durable=original==='Request a durable question.',name=durable?'owned_durable_question':original==='Request a dismissible question.'?'owned_dismissible_question':'ask_question',id='question-'+attemptId;
  const result=toolResults.find(result=>result.name===name&&result.id===id);
  if(!result)return {toolCalls:[{id,name,input:name!=='ask_question'?{}:{question:'Which display should this answer use?',options:[{label:'Desktop',description:'Use a wide display.'},{label:'Mobile',description:'Use a narrow display.'}]}}],usage:{inputTokens:11,outputTokens:7}};
  if(result.isError)throw Error('Actual asking tool failed');
  let value:unknown=result.output;for(let index=0;index<5;index++){if(typeof value==='string'){try{value=JSON.parse(value);continue;}catch{break;}}if(value&&typeof value==='object'&&'value' in value){value=value.value;continue;}break;}
  if(!value||typeof value!=='object'||!('status' in value))throw Error('Asking tool result unavailable');
  if(value.status==='dismissed')return {text:'Question dismissed.',usage:{inputTokens:11,outputTokens:7}};
  const answer='answer' in value?value.answer:'optionId' in value?value.optionId:undefined;
  if(value.status!=='answered'||answer!=='Desktop')throw Error('Original asking tool did not return the exact selected answer');
  return {text:'Question answered: Desktop.',usage:{inputTokens:11,outputTokens:7}};
 }});
 if(typeof model==='string')throw Error('Question fixture model unavailable');
 return wrapLanguageModel({model,middleware:{async transformParams({params}){await query('INSERT INTO ordinary_question_native_calls(id,attempt_id) VALUES($1,$2)',[randomUUID(),attemptId]);return params;}}});
}
