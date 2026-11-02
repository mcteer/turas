import {ordinaryKnowledgeNativeResponse} from './ordinary-knowledge-native-model';
import {mockModel} from 'eve/evals';
import {query} from '../../lib/server/db/client';
import {assertDeterministicTestMode} from './runtime';
export function createOrdinaryOperationsNativeModel(attemptId:string,turnId:string,stepIndex:number){
 assertDeterministicTestMode();
 if(process.env.TURAS_OPERATIONS_NATIVE_FIXTURE!=='1'||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||!/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(new URL(process.env.DATABASE_URL!).pathname)||!process.env.TURAS_ENVIRONMENT_ID?.startsWith('test-')||process.env.TURAS_ENVIRONMENT_ID!==process.env.TURAS_TEST_ENVIRONMENT_ID||new URL(process.env.DATABASE_URL!).pathname!==new URL(process.env.TURAS_TEST_DATABASE_URL!).pathname)throw Error('Owned unpaid operations fixture required');
 return mockModel({provider:'turas-owned-operations-fixture',modelId:'anthropic/claude-sonnet-5.5',respond:async(request)=>{
  // Tool results include prior turns. Bind decisions to this actual submitted
  // attempt, so an older parked approval cannot select the intervening reply.
  const toolResults=request.toolResults.filter(result=>result.id.startsWith(`operations-${attemptId}-`));
  const original=(await query('SELECT m.text FROM response_attempts a JOIN submitted_messages m ON m.id=a.message_id WHERE a.id=$1',[attemptId])).rows[0]?.text;
  const knowledgeKey=request.messages.flatMap(message=>message.role==='user'?message.text.split('\n').map(text=>text.trim()):[]).map(text=>text.match(/^Knowledge native: ([a-z-]+)/)?.[1]).find(Boolean);if(knowledgeKey)return ordinaryKnowledgeNativeResponse(attemptId,request,knowledgeKey);
  if(original==='Intervening ordinary turn.'){
   if(!request.messages.some(message=>message.role==='user'&&message.text.includes(original)))throw Error('Actual intervening message missing');
   return {text:'Intervening ordinary turn completed.',usage:{inputTokens:11,outputTokens:7}};
  }
  const row=(await query('SELECT command,period FROM ordinary_operations_native_fixture LIMIT 1')).rows[0];if(!row)throw Error('Missing fixture');
  if(!toolResults.some(t=>t.name==='get_engagement_brief'))return {toolCalls:[{id:`operations-${attemptId}-brief`,name:'get_engagement_brief',input:{engagementId:row.command.engagementId,...row.period}}],usage:{inputTokens:11,outputTokens:7}};
  if(!toolResults.some(t=>t.name==='record_engagement_intervention')){
   if(toolResults.some(t=>t.isError))throw Error('Actual engagement brief failed');
   const raw=toolResults.find(t=>t.name==='get_engagement_brief')!.output;const brief=typeof raw==='string'?JSON.parse(raw):raw;
   const proposal=(brief as {proposals?:Array<{id:string;revisionId:string;version:number}>}).proposals?.find(p=>p.id===row.command.proposalId);
   if(!proposal||proposal.revisionId!==row.command.proposalRevisionId||proposal.version!==row.command.expectedVersion)throw Error('Canonical brief did not bind exact intervention');
   return {toolCalls:[{id:`operations-${attemptId}-decision`,name:'record_engagement_intervention',input:{...row.command,idempotencyKey:attemptId}}],usage:{inputTokens:11,outputTokens:7}};
  }
  const count=Number((await query('SELECT count(*) AS n FROM ordinary_intervention_authorizations WHERE attempt_id=$1',[attemptId])).rows[0].n);
  return {text:count?'Exact human intervention decision recorded.':'Exact human intervention decision denied.',usage:{inputTokens:11,outputTokens:7}};
 }});
}
