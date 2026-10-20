import {writePilotAuxiliaryRun} from './pilot-auxiliary-evidence';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {Pool} from 'pg';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {withPilotEnvironment,requireOwnedPilotDatabase} from './pilot-environment';
import {pilotSource} from './pilot-source';
import {prepareLoadStatistics,loadQueryCounter,queryCounterDelta,loadResources} from './pilot-load-statistics';
import {parsePilotImagePreparation} from '../lib/contracts/pilot-images';
import {pilotLoadProfile as profile,pilotLoadClasses,assessPilotLoad,type LoadSample} from '../lib/server/operations/load-measurements';
import {pilotLoadEvidenceFixture} from '../tests/fixtures/pilot/load';
import {pilotLoadDeliveryBaseFixture,pilotLoadReportFixture} from '../tests/fixtures/pilot/load-delivery';
import {pilotLoadTrainingFixture} from '../tests/fixtures/pilot/load-training';
import {pilotLoadKnowledgeFixture} from '../tests/fixtures/pilot/load-knowledge';
import {pilotLoadInternalFixture} from '../tests/fixtures/pilot/load-internal';
import {pilotLoadLearningFixture} from '../tests/fixtures/pilot/load-learning';
import {pilotLoadMcpConnections} from '../tests/fixtures/pilot/load-mcp';
import {sessionCookieName} from '../lib/server/auth/sessions';
import {csrfTokenForSession} from '../lib/server/auth/csrf';
import {mcpProtocolVersion,mcpToolOutputs,type McpToolName} from '../lib/contracts/mcp';
import {closeRuntimePool} from '../lib/server/db/client';

/** Fixed real HTTP and SDK workload. Only an owned disposable environment is
 * admitted; no target override, paid calls, quota reset or latency substitution. */
export async function benchmarkPilot(){
 if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['--disposable']))throw Error('Pilot benchmark requires exactly --disposable');
 process.umask(0o077);const prepFile=process.env.TURAS_PILOT_UI_PREPARATION_FILE;if(!prepFile)throw Error('Explicit immutable image preparation file required');
 const prep=parsePilotImagePreparation(await readFile(prepFile)),renderer=prep.images.find(row=>row.kind==='renderer');if(!renderer)throw Error('Prepared renderer required');
 const source=await pilotSource(),startedAt=new Date().toISOString();let environmentMarker='';await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const directory=await mkdtemp(resolve('local-artifacts/016/load-'));
 const samples:LoadSample[]=[],resources:unknown[]=[],queryCounts=Object.fromEntries(pilotLoadClasses.map(id=>[id,0]));
 await writeFile(join(directory,'source.json'),JSON.stringify(source));
 try{await withPilotEnvironment(async env=>{
  environmentMarker=env.environmentId;
  process.env.TURAS_PILOT_RENDERER_IMAGE=renderer.localImageId;process.env.TURAS_REPORTS_ENABLED='true';
  const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect(),clients:Client[]=[];
  try{
   const statistics=await prepareLoadStatistics(db),evidence=await pilotLoadEvidenceFixture(db,env.signal),deliveryBase=await pilotLoadDeliveryBaseFixture(db,evidence,env.signal),training=await pilotLoadTrainingFixture(db,evidence,deliveryBase,env.signal),knowledge=await pilotLoadKnowledgeFixture(db,evidence),internal=await pilotLoadInternalFixture(db,evidence),learning=await pilotLoadLearningFixture(db,evidence,deliveryBase),delivery=await pilotLoadReportFixture(db,evidence,deliveryBase,env.signal),connections=await pilotLoadMcpConnections(evidence);
   const revisionId=evidence.customers[0].revisionIds[0],customerId=evidence.customers[0].id,passageIds:Record<string,string>={};
   for(const audience of ['internal','delivery']){const id=(await db.query("SELECT p.id FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.source_revision_id=$1 AND s.audience=$2 AND p.locators->0->>'fieldPath'='usageDescription' ORDER BY p.ordinal LIMIT 1",[revisionId,audience])).rows[0]?.id;if(!id)throw Error('Actual eligible audience passage missing');passageIds[audience]=id;}
   await closeRuntimePool();await env.startProduction();
   for(const actor of evidence.actors){const response=await fetch(env.origin+'/api/auth/session',{headers:{cookie:sessionCookieName()+'='+actor.token},signal:AbortSignal.timeout(10000)}),body=await response.json();if(response.status!==200||body.data?.membership?.id!==actor.membershipId||body.data?.workspace?.id!==evidence.workspaceId)throw Error('Actual HTTP participant binding failed');}
   for(const connection of connections){const client=new Client({name:'turas-owned-load',version:'1.0.0'},{versionNegotiation:{mode:{pin:mcpProtocolVersion},probe:{maxRetries:0,timeoutMs:10000}}});clients.push(client);await client.connect(new StreamableHTTPClientTransport(new URL('/api/mcp/v1',env.origin),{requestInit:{headers:{Authorization:'Bearer '+connection.credential}},reconnectionOptions:{maxRetries:0,maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1}}));}
   const mcp:Record<string,{name:McpToolName;arguments:Record<string,unknown>}>= {
    'mcp-profiles':{name:'turas_profile_read_v1',arguments:{customerId,section:'facts',limit:1}},'mcp-evidence':{name:'turas_evidence_read_v1',arguments:{customerId,revisionId}},'mcp-knowledge':{name:'turas_knowledge_read_v1',arguments:{publicationId:knowledge.publicationId}},'mcp-plans':{name:'turas_plan_read_v1',arguments:{customerId,planId:delivery.plan.created.planId}},'mcp-reports':{name:'turas_report_read_v1',arguments:{customerId,reportId:delivery.reports[0].reportId}}
   };
   const citations=new Map<number,string>();let cycle=0;
   const start=performance.now(),measurementStart=start+profile.warmupMs,end=measurementStart+profile.measurementMs;
   let warmupBoundary:number|null=null,maxQuotaWait=0;
   const needsQuotaExtension=()=>pilotLoadClasses.some(id=>samples.some(s=>s.classId===id&&s.phase==='measured'&&s.result==='quota')&&samples.filter(s=>s.classId===id&&s.phase==='measured'&&s.result!=='quota').length<100);
   const readReceiptIds=async(operation:string)=>(await db.query('SELECT id FROM mcp_access_receipts WHERE workspace_id=$1 AND operation=$2',[evidence.workspaceId,operation])).rows.map(row=>String(row.id));
   async function request(classId:string,actorIndex:number,phase:LoadSample['phase'],waveStart:number):Promise<LoadSample>{
    const actor=evidence.actors[actorIndex],started=performance.now(),sample:LoadSample={classId,actorIndex,phase,clientMs:0,admittedMs:null,queueWaitMs:started-waveStart,quotaWaitMs:0,queryCount:null,result:'unexpected_failure',failureCategory:'invalid_output'};
    try{
     if(mcp[classId]){const operation=mcp[classId],argumentsForActor=classId==='mcp-evidence'?{...operation.arguments,passageId:passageIds[actor.kind==='internal'?'internal':'delivery']}:operation.arguments,response=await clients[actorIndex].callTool({...operation,arguments:argumentsForActor}),parsed=mcpToolOutputs[operation.name].parse(response.structuredContent);if(parsed.status==='available'){sample.result='available';sample.failureCategory='none';}else{sample.failureCategory='unavailable';}}
     else{
      const customer=evidence.customers[(cycle*25+actorIndex)%250],assignment=training.assignments.find(a=>a.actorIndex===actorIndex)??training.assignments[0];
      const paths:Record<string,string>={profiles:`/api/customers/${customer.id}/profile`,evidence:`/api/customers/${customer.id}/records/${customer.recordIds[0]}`,passages:'/api/retrieval/search',citations:'/api/retrieval/citations/'+(citations.get(actorIndex)??'missing'),plans:'/api/plans/'+delivery.plan.created.planId,execution:'/api/execution/engagements/'+delivery.engagementId,reports:'/api/reports/'+delivery.reports[0].reportId,support:`/api/support/customers/${customerId}?audience=delivery`,expansion:'/api/expansion/customers/'+customerId+'?recordId='+internal.expansion.recordId,gaps:'/api/product-gaps/'+internal.gapId,'partner-workspace':'/api/partners/workspace',training:'/api/partners/assignments/'+assignment.assignmentId,learning:'/api/learning/measurements/'+learning.measurementId};
      const response=await fetch(env.origin+paths[classId],{method:classId==='passages'?'POST':'GET',headers:{cookie:sessionCookieName()+'='+actor.token,origin:env.origin,'x-csrf-token':csrfTokenForSession(actor.token),'content-type':'application/json'},...(classId==='passages'?{body:JSON.stringify({scope:'customer',customerId:customer.id,query:'synthetic engineering build stage timing',use:'discovery',limit:1})}:{}),signal:AbortSignal.timeout(10000)});
      sample.httpStatus=response.status;if(response.status===429){sample.result='quota';sample.failureCategory='quota';const retry=Number(response.headers.get('retry-after'));if(!Number.isInteger(retry)||retry<1||retry>60)throw Error('Unbounded quota denial');sample.quotaWaitMs=retry*1000;await response.body?.cancel();}
      else{const body=await response.json();if(response.status===401||response.status===403)sample.failureCategory='authorization';else if(response.status!==200)sample.failureCategory='unavailable';else if(!body.data||typeof body.data!=='object')sample.failureCategory='invalid_output';else if(classId==='passages'){const citation=body.data.results?.[0]?.citationId;if(typeof citation!=='string')sample.failureCategory='invalid_output';else{citations.set(actorIndex,citation);sample.result='available';sample.failureCategory='none';}}else{const data=body.data;const readable:Record<string,boolean>={profiles:data.customer?.id===customer.id&&Array.isArray(data.acceptedFacts)&&data.acceptedFacts.length>0,evidence:Array.isArray(data.items)&&data.items.some((item:{reviewState?:string;payload?:unknown})=>item.reviewState==='accepted'&&item.payload),citations:data.citationId===citations.get(actorIndex)&&typeof data.text==='string'&&data.text.length>0,plans:data.planId===delivery.plan.created.planId&&data.contentAvailability==='readable'&&!!data.content,execution:data.engagementId===delivery.engagementId&&data.initialized===true&&data.reviewRequired===false,reports:!!data.document&&data.state==='published',support:!!data.assessment?.content,expansion:Array.isArray(data.records)&&data.records.some((record:{disposition?:string;working?:{payload?:unknown}})=>record.disposition==='deferred'&&record.working?.payload),gaps:!!data.reviewed?.content,'partner-workspace':Array.isArray(data.items)&&data.items.length>0,training:data.assignmentId===assignment.assignmentId&&Array.isArray(data.checkpoints)&&data.checkpoints.length>0,learning:data.state==='approved'&&!!data.content};if(readable[classId]){sample.result='available';sample.failureCategory='none';}}}
     }
    }catch(error){sample.failureCategory=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'timeout':'invalid_output';}
    sample.clientMs=performance.now()-started;return sample;
   }
   while(performance.now()<end||needsQuotaExtension()){
    if(performance.now()-start>=profile.maxTotalMs)throw Error('Natural quota pacing exceeded the fixed 60-minute bound');
    env.signal.throwIfAborted();
    for(const classId of pilotLoadClasses){
     if(performance.now()>=end&&!needsQuotaExtension())break;const waveStart=performance.now(),phase:LoadSample['phase']=waveStart<measurementStart?'warmup':'measured';if(phase==='measured'&&warmupBoundary===null)warmupBoundary=waveStart;
     const before=await loadQueryCounter(db),operation=mcp[classId]?classId.slice(4):null,oldIds=operation?new Set(await readReceiptIds(operation)):null,actorCount=profile.internalOnlyClasses.includes(classId)?15:25,wave:LoadSample[]=[];
     // Search keeps the unchanged five-active-request ceiling. Queue delay is
     // measured separately, and every denial/error remains in the evidence.
     const concurrency=classId==='passages'?5:mcp[classId]?16:actorCount;
     for(let offset=0;offset<actorCount;offset+=concurrency)wave.push(...await Promise.all(Array.from({length:Math.min(concurrency,actorCount-offset)},(_,i)=>request(classId,offset+i,phase,waveStart))));
     if(operation){const receipts=(await db.query('SELECT id,connection_id,result,duration_ms FROM mcp_access_receipts WHERE workspace_id=$1 AND operation=$2',[evidence.workspaceId,operation])).rows.filter(row=>!oldIds!.has(String(row.id)));for(const sample of wave){const matching=receipts.filter(row=>row.connection_id===connections[sample.actorIndex].connectionId);if(matching.length!==1)throw Error('MCP request lacks one exact actual admission receipt');sample.admittedMs=Number(matching[0].duration_ms);if(matching[0].result==='limited'){sample.result='quota';sample.failureCategory='quota';sample.quotaWaitMs=60000;}if(matching[0].result!=='available'&&sample.result==='available')throw Error('SDK output differs from its actual receipt');}}
     const requestedWait=Math.max(0,...wave.map(s=>s.quotaWaitMs));if(requestedWait){const waitStart=performance.now();await sleep(requestedWait,undefined,{signal:env.signal});const actualWait=performance.now()-waitStart;for(const sample of wave)if(sample.result==='quota')sample.quotaWaitMs=actualWait;}const after=await loadQueryCounter(db),queries=queryCounterDelta(before,after);if(phase==='measured')queryCounts[classId]+=queries;samples.push(...wave);maxQuotaWait=Math.max(maxQuotaWait,...wave.map(s=>s.quotaWaitMs));
     await writeFile(join(directory,'progress.json'),JSON.stringify({cycle,classId,phase,elapsedMs:performance.now()-start,samples:samples.length,unexpectedFailures:samples.filter(s=>s.result==='unexpected_failure').length,classFailures:wave.filter(s=>s.result==='unexpected_failure').map(s=>({actorIndex:s.actorIndex,category:s.failureCategory,httpStatus:s.httpStatus}))}));
     await writeFile(join(directory,'samples.json'),JSON.stringify(samples));if(phase==='warmup'&&wave.every(s=>s.result==='unexpected_failure'))throw Error('Every actor failed the '+classId+' warmup response check');
     await sleep(Math.max(0,profile.waveIntervalMs-(performance.now()-waveStart)),undefined,{signal:env.signal});
    }
    resources.push(await loadResources(env));cycle++;
   }
   // The fixed measured window is never shortened. Quota waits are reported;
   // missing completed samples fail rather than being filled by unmeasured work.
   const finished=performance.now(),warmupElapsedMs=warmupBoundary===null?finished-start:profile.warmupMs,measurementElapsedMs=finished-start-profile.warmupMs;
   const assessment=assessPilotLoad(samples,{...evidence.population,warmupElapsedMs,measurementElapsedMs,totalElapsedMs:finished-start,quotaResets:0,providerCalls:0,queryCounts});
   await writeFile(join(directory,'samples.json'),JSON.stringify(samples));await writeFile(join(directory,'resources.json'),JSON.stringify(resources));await writeFile(join(directory,'measurements.json'),JSON.stringify({...source,environmentMarker,statistics,setupQuotaWaitMs:training.quotaWaitMs,maxObservedRetryAfterMs:maxQuotaWait,...assessment}));
   if(!assessment.pass)throw Error('Fixed pilot load thresholds failed; inspect private measurements');
  }finally{await Promise.allSettled(clients.map(client=>client.close()));db.release();await pool.end();await closeRuntimePool();}
 },{postgresMajor:18,queryStatistics:true,deadlineMs:4800000});
 if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Source changed during fixed load benchmark');
 await writeFile(join(directory,'completed.json'),JSON.stringify({...source,environmentMarker,pass:true,scope:'owned local actual HTTP and pinned SDK workload',hostedProof:false}));await writePilotAuxiliaryRun({directory,environmentMarker,source,startedAt,completedAt:new Date().toISOString(),gateId:'G10',caseIds:pilotLoadClasses.map(id=>'pilot.load.'+id),artifactNames:['samples.json','measurements.json','completed.json']});console.info(JSON.stringify({directory,pass:true,hostedProof:false}));
 }catch(error){await writeFile(join(directory,'samples.json'),JSON.stringify(samples));await writeFile(join(directory,'failed.json'),JSON.stringify({...source,pass:false,reason:error instanceof Error?error.message:'Load failed'}));throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)benchmarkPilot().catch(error=>{console.error(error instanceof Error?error.message:'Pilot benchmark failed');process.exitCode=1;});
