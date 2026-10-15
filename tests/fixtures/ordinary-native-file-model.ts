import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {createHash,randomUUID} from 'node:crypto';
import {query} from '../../lib/server/db/client';
import {assertDeterministicTestMode} from './runtime';
export function createOrdinaryNativeFileFixtureModel(attemptId:string){
 assertDeterministicTestMode();
 if(process.env.TURAS_ORDINARY_NATIVE_FILE_FIXTURE!=='1'||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||!/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL!).pathname))throw Error('Owned unpaid native-file fixture required');
 const model=mockModel({provider:'owned-native-file-fixture',modelId:'spacexai/grok-4.7',respond:async({toolResults,lastUserMessage})=>{
  if(process.env.TURAS_ORDINARY_NATIVE_FILE_STEERING_FIXTURE==='1'&&!lastUserMessage?.includes('Correct this using'))await new Promise(resolve=>setTimeout(resolve,4000));
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
  const files=params.prompt.flatMap(message=>typeof message.content==='string'?[]:message.content.filter(part=>part.type==='file'));
  if(files.length<1||files.length>2)throw Error('The provider did not receive actual files');
  const names=(params.tools??[]).map(tool=>tool.name);
  for(const name of ['resolve_customer_account','get_customer_evidence','prepare_customer_research','customer-recon','vercel-best-practices','implementation-research','evaluate_solution_research'])if(!names.includes(name))throw Error('Required ordinary research tool unavailable: '+name);
  const fileData=files.at(-1)!.data;
  if(fileData.type!=='data')throw Error('Provider did not receive inline native file data');
  const bytes=typeof fileData.data==='string'?Buffer.from(fileData.data,'base64'):Buffer.from(fileData.data);
  await query('INSERT INTO ordinary_native_file_fixture_calls(id,attempt_id,bytes_digest,tool_names) VALUES($1,$2,$3,$4)',[randomUUID(),attemptId,createHash('sha256').update(bytes).digest('hex'),(params.tools??[]).map(tool=>tool.name)]);
  return params;
 }}});
}
