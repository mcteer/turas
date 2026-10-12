import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import type {Client as Database} from 'pg';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {mcpProtocolVersion,mcpCreateReplySchema,mcpConnectionMetadataSchema,mcpToolOutputs} from '../lib/contracts/mcp';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
/** Trusted role callback after actual cookie/membership/database binding.
 * Fixed normal management writes only; no model, mail, accepted-state writes,
 * paid retries, customer content captures or credential persistence. */
export async function runHostedMcpJourney(input:{scope:PilotHostedScope;db:Database;headers:Headers;customerId:string;deniedCustomerId:string;signal:AbortSignal;transport?:typeof fetch}){
 const {scope,db,headers,customerId,deniedCustomerId,signal}=input,transport=input.transport??fetch,origin=new URL(scope.origin).origin;
 const rows=(await db.query('SELECT id,synthetic FROM customer_references WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[scope.workspaceId,[customerId,deniedCustomerId]])).rows;
 if(rows.length!==2||rows.some(row=>!row.synthetic))throw Error('Exact positive and denied synthetic MCP customer scope required');
 const requestKey=randomUUID(),cases:string[]=[];let connectionId:string|undefined,credential:string|undefined,client:Client|undefined,revoked=false;
 async function json(response:Response){
  if(!response.body||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('Bounded hosted JSON required');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)throw Error('Hosted response exceeds metadata bound');chunks.push(part.value);}return JSON.parse(Buffer.concat(chunks).toString());}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 }
 async function management(path:string,method:'GET'|'POST',body?:unknown,cleanup=false){
  const response=await transport(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',cache:'no-store',signal:cleanup?AbortSignal.timeout(5000):AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  if(response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Hosted MCP management release differs');}
  if(!response.ok){await response.body?.cancel();throw Error('Hosted MCP management unavailable');}return json(response);
 }
 let lastStatus:number|undefined;
 const sdkFetch:typeof fetch=async(url,options)=>{
  const target=new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url);
  if(target.origin!==origin||target.pathname!=='/api/mcp/v1'||target.search||target.hash)throw Error('SDK transport left exact MCP scope');
  const response=await transport(target,{...options,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});lastStatus=response.status;
  if(response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('SDK release differs');}
  if(!response.body)return response;
  const reader=response.body.getReader();let size=0;
  return new Response(new ReadableStream({async pull(controller){try{const chunk=await reader.read();if(chunk.done){controller.close();reader.releaseLock();return;}size+=chunk.value.length;if(size>1048576)throw Error('SDK response exceeds bound');controller.enqueue(chunk.value);}catch(error){await reader.cancel().catch(()=>undefined);controller.error(error);}},async cancel(){await reader.cancel().catch(()=>undefined);}}),{status:response.status,statusText:response.statusText,headers:response.headers});
 };
 try{
  const created=z.object({data:mcpCreateReplySchema}).parse(await management('/api/mcp/connections','POST',{requestKey,name:'Synthetic hosted pilot validation',categories:['profiles','evidence','knowledge','plans','reports'],customerIds:[customerId],lifetimeDays:1})).data;
  connectionId=created.connection.id;if(!created.secretAvailable)throw Error('Fresh personal connection required');credential=created.credential;
  client=new Client({name:'turas-hosted-pilot-consumer',version:'1.0.0'},{versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});
  const sdkHeaders=new Headers({authorization:'Bearer '+credential});const bypass=headers.get('x-vercel-protection-bypass');if(bypass)sdkHeaders.set('x-vercel-protection-bypass',bypass);
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp/v1',origin),{fetch:sdkFetch,requestInit:{headers:sdkHeaders,redirect:'manual'},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{signal,timeout:10000});
  const call=async(name:keyof typeof mcpToolOutputs,args:Record<string,unknown>)=>{
   signal.throwIfAborted();const result=await client!.callTool({name,arguments:args},{signal,timeout:10000});if(result.isError)throw Error('Required SDK tool unavailable');return result.structuredContent;
  };
  const tools=await client.listTools({}, {signal,timeout:10000});if(tools.tools.length!==Object.keys(mcpToolOutputs).length||Object.keys(mcpToolOutputs).some(name=>!tools.tools.some(tool=>tool.name===name)))throw Error('Exact read-only tool catalog required');cases.push('tool-catalog');
  const identity=mcpToolOutputs.turas_identity_v1.parse(await call('turas_identity_v1',{}));if(identity.status!=='available'||identity.data.workspaceId!==scope.workspaceId||identity.data.categories.length!==5)throw Error('SDK identity differs');cases.push('identity');
  const customers=mcpToolOutputs.turas_customers_list_v1.parse(await call('turas_customers_list_v1',{limit:20}));if(customers.status!=='available'||customers.data.items.length!==1||customers.data.items[0].customerId!==customerId)throw Error('SDK customer ceiling differs');cases.push('customers');
  const profile=mcpToolOutputs.turas_profile_read_v1.parse(await call('turas_profile_read_v1',{customerId,section:'facts',limit:20}));if(profile.status!=='available'||profile.data.customerId!==customerId||!profile.data.items.length)throw Error('Accepted SDK profile required');cases.push('profile');
  const listing=mcpToolOutputs.turas_evidence_list_v1.parse(await call('turas_evidence_list_v1',{customerId,limit:20}));if(listing.status!=='available'||!listing.data.items.length)throw Error('Current SDK evidence required');const selected=listing.data.items[0];
  const evidence=mcpToolOutputs.turas_evidence_read_v1.parse(await call('turas_evidence_read_v1',{customerId,revisionId:selected.revisionId,passageId:selected.passageId}));if(evidence.status!=='available'||evidence.data.revisionId!==selected.revisionId||evidence.data.passageId!==selected.passageId)throw Error('Evidence identity differs');cases.push('evidence');
  const citation=mcpToolOutputs.turas_citation_resolve_v1.parse(await call('turas_citation_resolve_v1',{citationHandle:evidence.data.citationHandle}));if(citation.status!=='available'||!('passageId'in citation.data)||citation.data.passageId!==selected.passageId||citation.data.text!==evidence.data.text)throw Error('Current citation differs');cases.push('evidence-citation');
  const shared=mcpToolOutputs.turas_knowledge_list_v1.parse(await call('turas_knowledge_list_v1',{limit:20}));if(shared.status!=='available'||!shared.data.items.length)throw Error('Reviewed knowledge required');const publication=shared.data.items[0];
  const knowledge=mcpToolOutputs.turas_knowledge_read_v1.parse(await call('turas_knowledge_read_v1',{publicationId:publication.publicationId}));if(knowledge.status!=='available'||knowledge.data.publicationId!==publication.publicationId)throw Error('Knowledge identity differs');cases.push('knowledge');
  const sharedCitation=mcpToolOutputs.turas_citation_resolve_v1.parse(await call('turas_citation_resolve_v1',{citationHandle:knowledge.data.citationHandle}));if(sharedCitation.status!=='available'||!('publicationId'in sharedCitation.data)||sharedCitation.data.publicationId!==publication.publicationId)throw Error('Knowledge citation differs');cases.push('knowledge-citation');
  const plans=mcpToolOutputs.turas_plans_list_v1.parse(await call('turas_plans_list_v1',{customerId,limit:20}));if(plans.status!=='available'||!plans.data.items.length)throw Error('Accepted plan required');
  const plan=mcpToolOutputs.turas_plan_read_v1.parse(await call('turas_plan_read_v1',{customerId,planId:plans.data.items[0].planId}));if(plan.status!=='available'||plan.data.customerId!==customerId||plan.data.planId!==plans.data.items[0].planId)throw Error('Plan identity differs');cases.push('plan');
  const reports=mcpToolOutputs.turas_reports_list_v1.parse(await call('turas_reports_list_v1',{customerId,limit:20}));if(reports.status!=='available'||!reports.data.items.length)throw Error('Published report required');
  const report=mcpToolOutputs.turas_report_read_v1.parse(await call('turas_report_read_v1',{customerId,reportId:reports.data.items[0].reportId}));if(report.status!=='available'||report.data.customerId!==customerId||report.data.publicationId!==reports.data.items[0].publicationId)throw Error('Report identity differs');cases.push('report');
  const denied=await client.callTool({name:'turas_profile_read_v1',arguments:{customerId:deniedCustomerId,section:'facts'}},{signal,timeout:10000});if(!denied.isError||denied.structuredContent!==undefined)throw Error('Foreign SDK scope was disclosed');cases.push('denied-customer');
  await management('/api/mcp/connections/'+connectionId+'/revoke','POST',{requestKey:randomUUID(),expectedConnectionId:connectionId});revoked=true;
  lastStatus=undefined;let deniedAfterRevoke=false;try{await client.callTool({name:'turas_identity_v1',arguments:{}},{signal,timeout:10000});}catch{deniedAfterRevoke=lastStatus===401;}if(!deniedAfterRevoke)throw Error('SDK revocation denial unverified');cases.push('revoked-credential');
 }finally{
  try{
   if(!connectionId){const reconciled=z.object({data:z.object({confirmed:z.boolean(),connection:mcpConnectionMetadataSchema.nullable(),secretAvailable:z.literal(false)})}).parse(await management('/api/mcp/connections/requests/'+requestKey,'GET',undefined,true)).data;if(reconciled.confirmed&&reconciled.connection)connectionId=reconciled.connection.id;}
   if(connectionId&&!revoked)await management('/api/mcp/connections/'+connectionId+'/revoke','POST',{requestKey:randomUUID(),expectedConnectionId:connectionId},true);
   if(connectionId){const row=(await db.query('SELECT workspace_id,revoked_at FROM mcp_connections WHERE id=$1',[connectionId])).rows[0];if(row?.workspace_id!==scope.workspaceId||!row.revoked_at)throw Error('Exact SDK credential cleanup unverified');}
  }finally{credential=undefined;await client?.close();}
 }
 return {contract:'pilot-hosted-sdk-journey-v1',journey:'J015',cases:cases.map(id=>({id,state:'pass' as const})),passedCases:cases.length,credentialRevoked:true,providerCalls:0,domainAcceptedStateWrites:0};
}
