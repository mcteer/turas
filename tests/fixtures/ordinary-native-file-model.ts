import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {createHash,randomUUID} from 'node:crypto';
import {query} from '../../lib/server/db/client';
import {assertDeterministicTestMode} from './runtime';
export function createOrdinaryNativeFileFixtureModel(attemptId:string){
 assertDeterministicTestMode();
 if(process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE!=='1'||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||!/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL!).pathname))throw Error('Owned unpaid native-file fixture required');
 let generationSignal:AbortSignal|undefined;
 const model=mockModel({provider:'owned-native-file-fixture',modelId:'spacexai/grok-4.7',respond:async({toolResults,lastUserMessage,messages})=>{
  if(process.env.TURAS_ORDINARY_NATIVE_FILE_STEERING_FIXTURE==='1'&&!lastUserMessage?.includes('Correct this using')){
   const signal=generationSignal;if(!signal)throw Error('Steering fixture has no generation signal');
   await new Promise<void>((resolve,reject)=>{const finish=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{signal.removeEventListener('abort',finish);reject(Error('Steering fixture did not receive a correction'));},30000);signal.addEventListener('abort',finish,{once:true});if(signal.aborted)finish();});
  }
  if(process.env.TURAS_ORDINARY_MEMORY_FIXTURE==='1'&&lastUserMessage==='Recall the saved preference.'){
   if(!JSON.stringify(messages).includes('# Persistent memories for file')||!JSON.stringify(messages).includes('The caller prefers concise answers.'))throw Error('Preference was not recalled into the fresh conversation');
   const removed=toolResults.find(result=>result.name==='file__remove_memory');
   if(!removed)return {toolCalls:[{name:'file__remove_memory',input:{index:0}}],usage:{inputTokens:11,outputTokens:7}};
   if(removed.isError)throw Error('Preference removal failed');
   return {text:'Stored preference recalled and removed.',usage:{inputTokens:11,outputTokens:7}};
  }
  if(process.env.TURAS_ORDINARY_MEMORY_FIXTURE==='1'&&lastUserMessage==='Check for a stored preference.'){
   if(JSON.stringify(messages).includes('The caller prefers concise answers.'))throw Error('Stored preference crossed a caller boundary or survived removal');
   return {text:'No stored preference is visible.',usage:{inputTokens:11,outputTokens:7}};
  }
  if(process.env.TURAS_ORDINARY_MEMORY_FIXTURE==='1'){
   const saved=toolResults.find(result=>result.name==='file__save_memory');
   if(!saved)return {toolCalls:[{name:'file__save_memory',input:{text:'The caller prefers concise answers.'}}],usage:{inputTokens:11,outputTokens:7}};
   if(saved.isError)throw Error('Actual personal preference save failed');
  }
  const resolved=toolResults.find(result=>result.name==='resolve_customer_account');
  if(!resolved)return {toolCalls:[{name:'resolve_customer_account',input:{name:'Native file fixture customer'}}],usage:{inputTokens:11,outputTokens:7}};
  if(resolved.isError)throw Error('Actual customer resolution failed');
  let value:unknown=resolved.output;
  for(let i=0;i<5;i++){if(typeof value==='string'){try{value=JSON.parse(value);continue;}catch{break;}}if(value&&typeof value==='object'&&'value' in value){value=value.value;continue;}break;}
  if(!value||typeof value!=='object'||!('status' in value)||value.status!=='resolved'||!('account' in value)||!value.account||typeof value.account!=='object'||!('id' in value.account)||typeof value.account.id!=='string')throw Error('Native customer resolver did not return a canonical account');
  await query('INSERT INTO ordinary_native_file_fixture_resolutions(attempt_id,customer_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[attemptId,value.account.id]);
  return {text:'Native file bytes received.',usage:{inputTokens:11,outputTokens:7}};
 }});
 if(typeof model==='string')throw Error('Fixture model unavailable');
 return wrapLanguageModel({model,middleware:{async transformParams({params}){
  generationSignal=params.abortSignal;
  const files=params.prompt.flatMap(message=>typeof message.content==='string'?[]:message.content.filter(part=>part.type==='file'));
  if(process.env.TURAS_ORDINARY_MEMORY_FIXTURE==='1'?files.length>2:files.length<1||files.length>2)throw Error('The provider did not receive actual files');
  const names=(params.tools??[]).map(tool=>tool.name);
  for(const name of ['resolve_customer_account','get_customer_evidence','prepare_customer_research','customer-recon','vercel-best-practices','implementation-research','evaluate_solution_research','file__save_memory','file__remove_memory'])if(!names.includes(name))throw Error('Required ordinary research tool unavailable: '+name);
  const fileData=files.at(-1)?.data;
  if(fileData&&fileData.type!=='data')throw Error('Provider did not receive inline native file data');
  const bytes=!fileData?Buffer.alloc(0):typeof fileData.data==='string'?Buffer.from(fileData.data,'base64'):Buffer.from(fileData.data);
  await query('INSERT INTO ordinary_native_file_fixture_calls(id,attempt_id,bytes_digest,tool_names) VALUES($1,$2,$3,$4)',[randomUUID(),attemptId,createHash('sha256').update(bytes).digest('hex'),(params.tools??[]).map(tool=>tool.name)]);
  return params;
 }}});
}
