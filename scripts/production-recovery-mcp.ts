import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import type {Client as Database,PoolClient} from 'pg';
import {authenticateMcpCredential} from '../lib/server/mcp/credentials';
import {projectMcpTool} from '../lib/server/mcp/projections';
import {readMcpProfile} from '../lib/server/mcp/profiles';
import {listMcpEvidence,readMcpEvidence,resolveMcpCitation} from '../lib/server/mcp/evidence';
import {listMcpKnowledge,readMcpKnowledge} from '../lib/server/mcp/knowledge';
import {listMcpPlans,readMcpPlan} from '../lib/server/mcp/plans';
import {listMcpReports,readMcpReport} from '../lib/server/mcp/reports';
import {mcpToolCategoryScopes} from '../lib/contracts/mcp';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {mcpProtocolVersion,mcpCreateReplySchema,mcpConnectionMetadataSchema,mcpToolOutputs,type McpCategory} from '../lib/contracts/mcp';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
/** Trusted role callback after actual cookie/membership/database binding.
 * Fixed normal management writes only; no model, mail, accepted-state writes,
 * paid retries, customer content captures or credential persistence. */
export async function runProductionRecoveryMcpJourney(input:{scope:PilotHostedScope;db:Database;headers:Headers;customerId:string;deniedCustomerId:string;signal:AbortSignal;transport?:typeof fetch;expectedEvidenceRevisionId?:string;expectedPublicationId?:string;expectedPlanId?:string;knowledgeOnly?:true}){
 const {scope,db,headers,customerId,deniedCustomerId,signal}=input,transport=input.transport??fetch,origin=new URL(scope.origin).origin;
 const rows=(await db.query('SELECT id,synthetic FROM customer_references WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[scope.workspaceId,[customerId,deniedCustomerId]])).rows;
 if(rows.length!==2||customerId===deniedCustomerId)throw Error('Exact distinct primary MCP customer scope required');
 const workspace=(await db.query("SELECT classification,active FROM workspaces WHERE id=$1",[scope.workspaceId])).rows[0];if(workspace?.classification!=='primary'||!workspace.active)throw Error('Active primary recovery workspace required');
 const categories:McpCategory[]=input.knowledgeOnly?['knowledge' as const]:['profiles' as const,'evidence' as const,'knowledge' as const,'plans' as const,'reports' as const];
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
  const created=z.object({data:mcpCreateReplySchema}).parse(await management('/api/mcp/connections','POST',{requestKey,name:'Production recovery read verification',categories,customerIds:input.knowledgeOnly?[]:[customerId],lifetimeDays:1})).data;
  connectionId=created.connection.id;if(!created.secretAvailable)throw Error('Fresh personal connection required');credential=created.credential;
  client=new Client({name:'turas-production-recovery-consumer',version:'1.0.0'},{versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});
  const sdkHeaders=new Headers({authorization:'Bearer '+credential});const bypass=headers.get('x-vercel-protection-bypass');if(bypass)sdkHeaders.set('x-vercel-protection-bypass',bypass);
  await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp/v1',origin),{fetch:sdkFetch,requestInit:{headers:sdkHeaders,redirect:'manual'},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}),{signal,timeout:10000});
  const call=async(name:keyof typeof mcpToolOutputs,args:Record<string,unknown>)=>{
   signal.throwIfAborted();const result=await client!.callTool({name,arguments:args},{signal,timeout:10000});if(result.isError)throw Error('Required SDK tool unavailable');return result.structuredContent;
  };
  const tools=await client.listTools({}, {signal,timeout:10000});const expectedTools=Object.keys(mcpToolOutputs).filter(name=>!mcpToolCategoryScopes[name as keyof typeof mcpToolOutputs].length||mcpToolCategoryScopes[name as keyof typeof mcpToolOutputs].some(category=>categories.includes(category)));if(tools.tools.length!==expectedTools.length||expectedTools.some(name=>!tools.tools.some(tool=>tool.name===name)))throw Error('Exact read-only tool catalog required');cases.push('tool-catalog');
  const identity=mcpToolOutputs.turas_identity_v1.parse(await call('turas_identity_v1',{}));if(identity.status!=='available'||identity.data.workspaceId!==scope.workspaceId||!isDeepStrictEqual([...identity.data.categories].sort(),[...categories].sort()))throw Error('SDK identity differs');cases.push('identity');
  if(!input.knowledgeOnly){const customers=mcpToolOutputs.turas_customers_list_v1.parse(await call('turas_customers_list_v1',{limit:20}));if(customers.status!=='available'||customers.data.items.length!==1||customers.data.items[0].customerId!==customerId)throw Error('SDK customer ceiling differs');cases.push('customers');}else cases.push('customer-tools-not-advertised');
  // Compare every observed page/read with the SAME credential's governed domain
  // projection. Empty is evidence only when that independent baseline is empty.
  const domainReaders={turas_profile_read_v1:readMcpProfile,turas_evidence_list_v1:listMcpEvidence,turas_evidence_read_v1:readMcpEvidence,turas_citation_resolve_v1:resolveMcpCitation,turas_knowledge_list_v1:listMcpKnowledge,turas_knowledge_read_v1:readMcpKnowledge,turas_plans_list_v1:listMcpPlans,turas_plan_read_v1:readMcpPlan,turas_reports_list_v1:listMcpReports,turas_report_read_v1:readMcpReport};
  const baseline=async(name:keyof typeof domainReaders,args:Record<string,unknown>)=>{
   await db.query('BEGIN');try{
    const connection=db as unknown as PoolClient,actor=await authenticateMcpCredential(connection,'Bearer '+credential);
    const category=mcpToolCategoryScopes[name].find(value=>actor.categories.includes(value));
    const projected=await projectMcpTool(connection,actor,name,category,typeof args.customerId==='string'?args.customerId:undefined,()=>domainReaders[name](connection,actor,args));
    const result=mcpToolOutputs[name].parse(projected.structuredContent);await db.query('COMMIT');return result;
   }catch(error){await db.query('ROLLBACK');throw error;}
  };
  const observed=async(name:keyof typeof domainReaders,args:Record<string,unknown>)=>{
   const expected=await baseline(name,args),actual=mcpToolOutputs[name].parse(await call(name,args));
   assertRecoveryMcpProjection(expected,actual);return actual;
  };
  const pages=async(name:keyof typeof domainReaders,args:Record<string,unknown>,label:string,visit:(item:any)=>Promise<void>)=>{
   const total=await compareRecoveryMcpPages(
    cursor=>baseline(name,{...args,limit:20,...(cursor?{cursor}:{})}),
    async cursor=>mcpToolOutputs[name].parse(await call(name,{...args,limit:20,...(cursor?{cursor}:{})})),visit);
   cases.push(label+(total?'-positive':'-governed-empty'));
  };
  if(!input.knowledgeOnly){for(const section of ['summary','workloads','facts'])await pages('turas_profile_read_v1',{customerId,section},'profile-'+section,async()=>{});
  await pages('turas_evidence_list_v1',{customerId},'evidence',async selected=>{
   const evidence=await observed('turas_evidence_read_v1',{customerId,revisionId:selected.revisionId,passageId:selected.passageId});
   if(evidence.status!=='available'||!evidence.data||!('citationHandle' in evidence.data))throw Error('Eligible recovery evidence unavailable');
   const citation=await observed('turas_citation_resolve_v1',{citationHandle:evidence.data.citationHandle});if(citation.status!=='available')throw Error('Current recovery citation unavailable');
  });
  }
  await pages('turas_knowledge_list_v1',{},'knowledge',async selected=>{
   const knowledge=await observed('turas_knowledge_read_v1',{publicationId:selected.publicationId});
   if(knowledge.status!=='available'||!knowledge.data||!('citationHandle' in knowledge.data))throw Error('Eligible recovery knowledge unavailable');
   const citation=await observed('turas_citation_resolve_v1',{citationHandle:knowledge.data.citationHandle});if(citation.status!=='available')throw Error('Recovery knowledge citation unavailable');
  });
  if(!input.knowledgeOnly){await pages('turas_plans_list_v1',{customerId},'plan',async selected=>{const result=await observed('turas_plan_read_v1',{customerId,planId:selected.planId});if(result.status!=='available')throw Error('Eligible recovery plan unavailable');});
  await pages('turas_reports_list_v1',{customerId},'report',async selected=>{const result=await observed('turas_report_read_v1',{customerId,reportId:selected.reportId});if(result.status!=='available')throw Error('Eligible recovery report unavailable');});
  const denied=await client.callTool({name:'turas_profile_read_v1',arguments:{customerId:deniedCustomerId,section:'facts'}},{signal,timeout:10000});const refusal=mcpToolOutputs.turas_profile_read_v1.parse(denied.structuredContent);if(denied.isError||refusal.status!=='unavailable'||refusal.reason!=='not_found'||refusal.data!==null||refusal.nextCursor!==null)throw Error('Foreign SDK scope was disclosed');cases.push('denied-customer');}
  await management('/api/mcp/connections/'+connectionId+'/revoke','POST',{requestKey:randomUUID(),expectedConnectionId:connectionId});revoked=true;
  lastStatus=undefined;let deniedAfterRevoke=false;try{await client.callTool({name:'turas_identity_v1',arguments:{}},{signal,timeout:10000});}catch{deniedAfterRevoke=lastStatus===401;}if(!deniedAfterRevoke)throw Error('SDK revocation denial unverified');cases.push('revoked-credential');
 }finally{
  try{
   if(!connectionId){const reconciled=z.object({data:z.object({confirmed:z.boolean(),connection:mcpConnectionMetadataSchema.nullable(),secretAvailable:z.literal(false)})}).parse(await management('/api/mcp/connections/requests/'+requestKey,'GET',undefined,true)).data;if(reconciled.confirmed&&reconciled.connection)connectionId=reconciled.connection.id;}
   if(connectionId&&!revoked)await management('/api/mcp/connections/'+connectionId+'/revoke','POST',{requestKey:randomUUID(),expectedConnectionId:connectionId},true);
   if(connectionId){const row=(await db.query('SELECT workspace_id,revoked_at FROM mcp_connections WHERE id=$1',[connectionId])).rows[0];if(row?.workspace_id!==scope.workspaceId||!row.revoked_at)throw Error('Exact SDK credential cleanup unverified');}
  }finally{credential=undefined;await client?.close();}
 }
 return {contract:'production-recovery-sdk-read-v1',scope:'normal-primary-recovery',customerScope:input.knowledgeOnly?'none':'selected-customer',customerId,deniedCustomerId,connectionId,governedBaselineCompared:true,cases:cases.map(id=>({id,state:'pass' as const})),passedCases:cases.length,credentialRevoked:true,providerCalls:0,domainAcceptedStateWrites:0};
}

/** Dynamic handles/request IDs are intentionally opaque. Content and presence of
 * pagination must still match the real same-credential domain projection exactly. */
export function assertRecoveryMcpProjection(expected:unknown,actual:unknown){
 const compare=(left:unknown,right:unknown):boolean=>{
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>compare(item,right[index]));
  if(left&&right&&typeof left==='object'&&typeof right==='object'){
   const a=left as Record<string,unknown>,b=right as Record<string,unknown>;
   const keys=(value:Record<string,unknown>)=>Object.keys(value).filter(key=>!['requestId','citationHandle'].includes(key)).sort();
   if(!isDeepStrictEqual(keys(a),keys(b)))return false;
   // Current quality assessments are recomputed per read. Validate their real
   // clocks and unchanged policy window rather than comparing generated times.
   const quality=['R','F','D','C','Q','band','freshness','asOf','validUntil'].every(key=>key in a&&key in b);
   if(quality){
    const before=Date.parse(String(a.asOf)),after=Date.parse(String(b.asOf)),firstExpiry=Date.parse(String(a.validUntil)),secondExpiry=Date.parse(String(b.validUntil));
    if(![before,after,firstExpiry,secondExpiry].every(Number.isFinite)||after<before||after-before>10000||firstExpiry<=before||secondExpiry<=after)return false;
    if(firstExpiry!==secondExpiry&&!(firstExpiry-before===86400000&&secondExpiry-after===86400000))return false;
   }
   return keys(a).every(key=>quality&&['asOf','validUntil'].includes(key)?true:key==='nextCursor'?Boolean(a[key])===Boolean(b[key]):compare(a[key],b[key]));
  }
  return isDeepStrictEqual(left,right);
 };
 if(!compare(expected,actual))throw Error('Recovery SDK differs from governed domain baseline');
}

/** Independent cursor chains prevent a faulty served cursor from selecting the
 * next baseline page and concealing omitted eligible records. */
export async function compareRecoveryMcpPages(baseline:(cursor?:string)=>Promise<unknown>,served:(cursor?:string)=>Promise<unknown>,visit:(item:any)=>Promise<void>){
 let expectedCursor:string|undefined,actualCursor:string|undefined,total=0;
 const expectedSeen=new Set<string>(),actualSeen=new Set<string>();
 for(let page=0;;page++){
  if(page>=20)throw Error('Recovery SDK pagination exceeds bound');
  const expected=await baseline(expectedCursor),actual=await served(actualCursor);assertRecoveryMcpProjection(expected,actual);
  const parsed=z.object({status:z.enum(['available','empty']),data:z.object({items:z.array(z.unknown()).max(20)}),nextCursor:z.string().min(1).nullable()});
  const left=parsed.parse(expected),right=parsed.parse(actual);
  if(right.status==='empty'&&(right.data.items.length||right.nextCursor))throw Error('Invalid empty recovery listing');
  total+=right.data.items.length;for(const item of right.data.items)await visit(item);
  if(!right.nextCursor)break;
  if(!left.nextCursor||expectedSeen.has(left.nextCursor)||actualSeen.has(right.nextCursor))throw Error('Recovery SDK cursor repeated');
  expectedSeen.add(left.nextCursor);actualSeen.add(right.nextCursor);expectedCursor=left.nextCursor;actualCursor=right.nextCursor;
 }
 return total;
}
