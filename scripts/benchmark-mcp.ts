import { mkdir,mkdtemp,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { withMcpEnvironment } from './mcp-environment';
import { featureSourceDigest } from './execution-source-digest';
import { verifyMcpSuites } from './test-mcp';
import { mcpFixture,mcpInternalPeer,mcpAcceptedFact,withMcpDatabase } from '../tests/fixtures/mcp/setup';
import { mcpAcceptedPlan } from '../tests/fixtures/mcp/plans';
import { mcpPublishedReport } from '../tests/fixtures/mcp/reports';
import { mcpPublishedKnowledge } from '../tests/fixtures/mcp/knowledge';
import { withMcpConsumer } from '../tests/fixtures/mcp/consumer';
import { createMcpConnection,revokeMcpConnection } from '../lib/server/mcp/management';
import { materializeCurrentProjection } from '../lib/server/retrieval/projections';
import { query } from '../lib/server/db/client';
import { mcpToolOutputs,type McpToolName,type McpCategory } from '../lib/contracts/mcp';
if(process.argv.length!==2)throw Error('MCP benchmark takes no overrides');
verifyMcpSuites();const sourceDigest=await featureSourceDigest('015');
await mkdir('local-artifacts/015',{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/015/benchmark-'));
const percentile=(values:number[],fraction:number)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*fraction)-1];
const results=await withMcpEnvironment(async environment=>{
 await environment.startProduction();
 const fixtures=[];
 for(const category of ['profiles','evidence','knowledge','plans','reports'] as const){
  const fixture=await withMcpDatabase(async db=>{
   const {browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
   let tool:McpToolName,args:Record<string,unknown>;
   if(category==='profiles'){await mcpAcceptedFact(db,browser,reviewer,customerId);tool='turas_profile_read_v1';args={customerId,section:'facts',limit:20};}
   else if(category==='evidence'){
    const fact=await mcpAcceptedFact(db,browser,reviewer,customerId);await materializeCurrentProjection(db,'accepted_profile',fact.revisionId,'internal');
    const passage=(await db.query('SELECT p.id FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.source_revision_id=$1 ORDER BY p.id LIMIT 1',[fact.revisionId])).rows[0];
    tool='turas_evidence_read_v1';args={customerId,revisionId:fact.revisionId,passageId:passage.id};
   }else if(category==='knowledge'){
    const practice=await mcpPublishedKnowledge(db,browser,reviewer,customerId);tool='turas_knowledge_read_v1';args={publicationId:practice.publicationId};
   }else if(category==='plans'){
    const plan=await mcpAcceptedPlan(browser,reviewer,customerId);tool='turas_plan_read_v1';args={customerId,planId:plan.created.planId};
   }else{const report=await mcpPublishedReport(db,browser,customerId);tool='turas_report_read_v1';args={customerId,reportId:report.reportId};}
   const created=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic benchmark',categories:[category] as McpCategory[],
     customerIds:category==='knowledge'?[]:[customerId],lifetimeDays:7});
   if(!created.secretAvailable)throw Error('No synthetic benchmark credential');
   return {category,tool,args,browser,connectionId:created.connection.id,credential:created.credential};
  });fixtures.push(fixture);
 }
 return Promise.all(fixtures.map(async fixture=>withMcpConsumer(environment.origin,fixture.credential,async client=>{
  let quotaWaitMs=0;const samples:number[]=[],clientSamples:number[]=[];
  async function waitQuota(){
   for(;;){const state=(await query<{count:number;wait:number}>(`SELECT coalesce((SELECT count FROM mcp_rate_windows WHERE environment_id=$1
     AND bucket='connection' AND subject_id=$2 AND window_start=date_trunc('minute',clock_timestamp())),0) AS count,
     ceil(60000-extract(second FROM clock_timestamp())*1000)::integer AS wait`,[environment.environmentId,fixture.connectionId])).rows[0];
    if(state.count<29)return;const wait=Math.max(1,Math.min(60000,state.wait+20)),at=performance.now();
    await new Promise<void>((done,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Benchmark interrupted'));};const timer=setTimeout(()=>{environment.signal.removeEventListener('abort',abort);done();},wait);environment.signal.addEventListener('abort',abort,{once:true});if(environment.signal.aborted)abort();});
    quotaWaitMs+=performance.now()-at;
   }
  }
  const warm=await client.callTool({name:fixture.tool,arguments:fixture.args});if(mcpToolOutputs[fixture.tool].parse(warm.structuredContent).status!=='available')throw Error('Benchmark requires available positive context');
  for(let i=0;i<100;i++){
   await waitQuota();const started=performance.now(),output=await client.callTool({name:fixture.tool,arguments:fixture.args});clientSamples.push(performance.now()-started);
   if(mcpToolOutputs[fixture.tool].parse(output.structuredContent).status!=='available')throw Error('Benchmark read unavailable');
   const receipt=(await query<{duration_ms:number;result:string}>(`SELECT duration_ms,result FROM mcp_access_receipts WHERE connection_id=$1 AND operation=$2
     ORDER BY created_at DESC,id DESC LIMIT 1`,[fixture.connectionId,fixture.category])).rows[0];
   if(!receipt||receipt.result!=='available')throw Error('Benchmark usage receipt missing');samples.push(receipt.duration_ms);
  }
  let overLimitDenied=false;
  for(let i=0;i<31;i++){
   try{await client.callTool({name:fixture.tool,arguments:fixture.args});}
   catch{const count=(await query<{count:number}>(`SELECT max(count)::integer AS count FROM mcp_rate_windows WHERE bucket='connection' AND subject_id=$1`,[fixture.connectionId])).rows[0].count;
    if(count!==31)throw Error('Over-limit trial failed without a durable quota charge');overLimitDenied=true;break;}
  }
  const p95Ms=percentile(samples,.95);if(!overLimitDenied||p95Ms>=1000)throw Error('MCP benchmark gate failed');
  const result={class:fixture.category,operations:100,p95Ms,clientP95Ms:percentile(clientSamples,.95),
    clientAndTransportOverheadP95Ms:percentile(clientSamples.map((value,i)=>Math.max(0,value-samples[i])),.95),quotaWaitMs:Math.round(quotaWaitMs),quotaResets:0,overLimitDenied};
  await revokeMcpConnection(fixture.browser,fixture.connectionId,{requestKey:randomUUID(),expectedConnectionId:fixture.connectionId});
  console.info(JSON.stringify(result));return result;
 })));
},{deadlineMs:900000});
if(await featureSourceDigest('015')!==sourceDigest)throw Error('Benchmark source changed');
const summary={sourceDigest,results,quotaResets:0,paidCalls:0,hostedProof:false};await writeFile(join(directory,'summary.json'),JSON.stringify(summary),{mode:0o600});console.info(JSON.stringify(summary));
