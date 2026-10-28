import {mockModel} from 'eve/evals';
import {wrapLanguageModel} from 'ai';
import {randomUUID,createHash} from 'node:crypto';
import {query} from '../../lib/server/db/client';
import {assertDeterministicTestMode} from './runtime';

function requireFixture(){
 assertDeterministicTestMode();
 const url=process.env.DATABASE_URL;
 if(!url||process.env.TURAS_ORDINARY_NATIVE_FIXTURE!=='1'||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||
  !process.env.TURAS_ENVIRONMENT_ID?.startsWith('test-')||process.env.TURAS_ENVIRONMENT_ID!==process.env.TURAS_TEST_ENVIRONMENT_ID||
  !/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(url).pathname))throw Error('Owned unpaid ordinary fixture required');
}
export function createOrdinaryNativeFixtureModel(attemptId:string){
 requireFixture();let signal:AbortSignal|undefined;
 const model=mockModel({provider:'turas-owned-ordinary-fixture',modelId:'anthropic/claude-sonnet-5.5',respond:async({lastUserMessage})=>{
  if(!lastUserMessage)throw Error('Owned fixture has no user message');
  if(lastUserMessage.startsWith('Hold this synthetic response')){
   const deadline=Date.now()+80000;
   while(Date.now()<deadline){signal?.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,50));}
   throw Error('Owned fixture was not interrupted');
  }
  if(lastUserMessage!=='Replace the first request with this correction.')throw Error('Owned fixture did not receive the correction');
  return {text:'Correction applied to the same response.',usage:{inputTokens:11,outputTokens:7}};
 }});
 if(typeof model==='string')throw Error('Fixture model unavailable');
 return wrapLanguageModel({model,middleware:{async transformParams({params,type}){
  requireFixture();signal=params.abortSignal;
  if(!signal)throw Error('Native fixture requires cancellation signal');
  await query(`INSERT INTO ordinary_native_fixture_calls(id,attempt_id,provider_path,prompt_digest)
   VALUES($1,$2,$3,$4)`,[randomUUID(),attemptId,type,createHash('sha256').update(JSON.stringify(params.prompt)).digest('hex')]);
  return params;
 }}});
}
