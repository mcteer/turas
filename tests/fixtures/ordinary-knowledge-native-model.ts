import {query} from '../../lib/server/db/client';
import type {MockModelRequest} from 'eve/evals';
/** Only called inside the guarded owned unpaid operations fixture. */
export async function ordinaryKnowledgeNativeResponse(attemptId:string,request:MockModelRequest,key:string){
 if(!/^(include|publish|apply|revoke|withdraw)$/.test(key))throw Error('Unknown knowledge fixture');
 const row=(await query('SELECT * FROM ordinary_knowledge_native_cases WHERE key=$1',[key])).rows[0];if(!row)throw Error('Missing owned knowledge case');
 const usage={inputTokens:11,outputTokens:7};
 if(!request.toolResults.some(t=>t.name==='get_customer_journey'))return {toolCalls:[{id:`knowledge-${attemptId}-journey`,name:'get_customer_journey',input:{accountId:row.account_id}}],usage};
 if(!request.toolResults.some(t=>t.name===row.read_tool))return {toolCalls:[{id:`knowledge-${attemptId}-inspect`,name:row.read_tool,input:{accountId:row.account_id,...(row.read_tool==='get_learning_contribution'?{quarter:'2026-Q3'}:{})}}],usage};
 const result=request.toolResults.find(t=>t.name===row.write_tool);
 if(!result){
  const inspect=request.toolResults.find(t=>t.name===row.read_tool)!.output;const read=typeof inspect==='string'?JSON.parse(inspect):inspect;
  const command={...row.command};
  if(row.read_tool==='get_learning_contribution')command.expectedVersion=(read as {version:number|null}).version??0;
  if(row.write_tool==='review_solution_application')command.targetContextHash=(read as {knowledge:{targetContextHash:string}}).knowledge.targetContextHash;
  if(command.sourceRecordId&&!JSON.stringify(request.toolResults.find(t=>t.name==='get_customer_journey')!.output).includes(command.sourceRecordId))throw Error('Approved exact source was not read');
  return {toolCalls:[{id:`knowledge-${attemptId}-write`,name:row.write_tool,input:{accountId:row.account_id,command}}],usage};
 }
 const value=typeof result.output==='string'?JSON.parse(result.output):result.output;
 if(result.isError||(value as {status:string}).status!=='updated')throw Error('Actual governed knowledge write failed');
 return {text:`Knowledge native ${key} recorded.`,usage};
}
