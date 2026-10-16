import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {createHash,randomUUID} from 'node:crypto';
import {query} from '../../lib/server/db/client';
import {assertDeterministicTestMode} from './runtime';
export function createOrdinaryNativeFileFixtureModel(attemptId:string){
 assertDeterministicTestMode();
 if(process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE!=='1'||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||!/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL!).pathname))throw Error('Owned unpaid native-file fixture required');
 let generationSignal:AbortSignal|undefined;
 const model=mockModel({provider:'owned-native-file-fixture',modelId:'spacexai/grok-4.7',respond:async({toolResults,lastUserMessage:runtimeLastUserMessage,messages})=>{
  // Provider middleware may append an attributed file/context packet. Match
  // the actual synthetic user delivery rather than mistaking that packet for
  // a correction, memory request or checklist action.
  const prompts=new Set(['Please inspect this native file.','Correct this using the attached file.','Remember that I prefer concise answers.',
   'Recall the saved preference.','Check for a stored preference.','Read the private checklist after reconnect.','Check private checklist isolation.',
   'Inspect the previously attached file after reload.','Fail this native file turn explicitly.','Recover after the failed native file turn.']);
  const texts=messages.flatMap(message=>message.role==='user'?message.text.split('\n').map(text=>text.trim()):[]);
  const lastUserMessage=texts.flatMap(text=>[...prompts].filter(prompt=>text.includes(prompt))).at(-1)??[...prompts].find(prompt=>runtimeLastUserMessage?.includes(prompt))??runtimeLastUserMessage;
  console.info(JSON.stringify({kind:'owned_native_file_prompt',user:prompts.has(lastUserMessage??'')?lastUserMessage:'unmatched',tools:toolResults.map(result=>result.name)}));
  if(lastUserMessage==='Fail this native file turn explicitly.'){console.error(JSON.stringify({kind:'owned_native_file_provider_failure',attemptId}));throw Error('OWNED_NATIVE_FILE_PROVIDER_FAILURE');}
  if(process.env.TURAS_ORDINARY_TASK_STATE_FIXTURE==='1'){
   const read=lastUserMessage==='Read the private checklist after reconnect.',isolated=lastUserMessage==='Check private checklist isolation.';
   const callId=`checklist-${attemptId}-${read?'read':isolated?'isolated':'replace'}`;
   const tracked=toolResults.find(result=>result.name==='track_tasks'&&result.id===callId);
   if(!tracked)return {toolCalls:[{id:callId,name:'track_tasks',input:read||isolated?{action:'read'}:{action:'replace',expectedRevision:0,
    items:[{id:'source-review',text:'Inspect the exact supplied file.',status:'in_progress'}]}}],usage:{inputTokens:11,outputTokens:7}};
   if(tracked.isError)throw Error('Actual private checklist tool failed');
   let value:unknown=tracked.output;
   for(let index=0;index<5;index++){if(typeof value==='string'){try{value=JSON.parse(value);continue;}catch{break;}}if(value&&typeof value==='object'&&'value' in value){value=value.value;continue;}break;}
   if(!value||typeof value!=='object'||!('revision' in value)||!('items' in value)||!Array.isArray(value.items))throw Error('Private checklist did not return durable state');
   if(isolated){if(value.revision!==0||value.items.length)throw Error('Private checklist crossed conversations');return {text:'New conversation has no private checklist.',usage:{inputTokens:11,outputTokens:7}};}
   if(value.revision!==1||JSON.stringify(value.items)!==JSON.stringify([{id:'source-review',text:'Inspect the exact supplied file.',status:'in_progress'}]))throw Error('Private checklist changed across the native boundary');
   if(read)return {text:'Private checklist survived reconnect.',usage:{inputTokens:11,outputTokens:7}};
  }
  if(process.env.TURAS_ORDINARY_NATIVE_FILE_STEERING_FIXTURE==='1'&&lastUserMessage==='Please inspect this native file.'){
   const signal=generationSignal;if(!signal)throw Error('Steering fixture has no generation signal');
   await new Promise<void>((resolve,reject)=>{const finish=()=>{clearTimeout(timer);reject(new DOMException('Generation aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',finish);reject(Error('Steering fixture did not receive a correction'));},30000);signal.addEventListener('abort',finish,{once:true});if(signal.aborted)finish();});
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
  return {text:lastUserMessage==='Recover after the failed native file turn.'?'Native file recovery completed.':lastUserMessage==='Inspect the previously attached file after reload.'?'Previously attached file bytes received.':'Native file bytes received.',usage:{inputTokens:11,outputTokens:7}};
 }});
 if(typeof model==='string')throw Error('Fixture model unavailable');
 return wrapLanguageModel({model,middleware:{async transformParams({params}){
  generationSignal=params.abortSignal;
  const files=params.prompt.flatMap(message=>typeof message.content==='string'?[]:message.content.filter(part=>part.type==='file'));
  if(process.env.TURAS_ORDINARY_MEMORY_FIXTURE==='1'||process.env.TURAS_ORDINARY_TASK_STATE_FIXTURE==='1'?files.length>2:files.length<1||files.length>2){
   const shape=params.prompt.map(message=>({role:message.role,parts:typeof message.content==='string'?['string']:message.content.map(part=>part.type)}));
   const notes=params.prompt.flatMap(message=>typeof message.content==='string'?[]:message.content.flatMap(part=>part.type==='text'&&/attach|file|upload/i.test(part.text)&&part.text.length<1200?[part.text.slice(0,300)]:[]));
   console.info(JSON.stringify({kind:'owned_native_file_missing',shape,notes,files:files.map(file=>({filename:file.filename,mediaType:file.mediaType,dataType:file.data.type,sha256:file.data.type==='data'?createHash('sha256').update(typeof file.data.data==='string'?Buffer.from(file.data.data,'base64'):Buffer.from(file.data.data)).digest('hex'):null}))}));
   throw Error('The provider did not receive actual files');
  }
  const names=(params.tools??[]).map(tool=>tool.name);
  for(const name of ['resolve_customer_account','get_customer_evidence','prepare_customer_research','customer-recon','vercel-best-practices','implementation-research','evaluate_solution_research','file__save_memory','file__remove_memory',
   'get_adoption_patterns','get_learning_contribution','review_learning_contribution','search_solution_patterns','get_solution_knowledge','review_solution_pattern','review_solution_application','track_tasks'])if(!names.includes(name))throw Error('Required ordinary research tool unavailable: '+name);
  const fileData=files.at(-1)?.data;
  if(fileData&&fileData.type!=='data')throw Error('Provider did not receive inline native file data');
  const bytes=!fileData?Buffer.alloc(0):typeof fileData.data==='string'?Buffer.from(fileData.data,'base64'):Buffer.from(fileData.data);
  await query('INSERT INTO ordinary_native_file_fixture_calls(id,attempt_id,bytes_digest,tool_names) VALUES($1,$2,$3,$4)',[randomUUID(),attemptId,createHash('sha256').update(bytes).digest('hex'),(params.tools??[]).map(tool=>tool.name)]);
  return params;
 }}});
}
