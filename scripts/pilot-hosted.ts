import {Client,type QueryResultRow} from 'pg';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {resolve,dirname,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pilotHostedScopeSchema,verifyHostedDeployment,type PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {pilotRunSchema} from '../lib/contracts/pilot-readiness';
import {assertPilotDatabaseOnConnection} from '../lib/server/db/readiness';
import {readEvidence,createEvidenceDirectory,writeEvidence,evidenceDigest} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {runHostedReadChecks} from './pilot-hosted-http';
import {runHostedMcpJourney} from './pilot-hosted-mcp';
import {runHostedProfileReviewJourney} from './pilot-hosted-profile';
import {runHostedConversationBoundary} from './pilot-hosted-conversations';
import {runHostedConversationBrowser} from './pilot-hosted-browser';
import {runHostedSupportBoundary} from './pilot-hosted-support';
import {pilotHostedRequest} from './pilot-hosted-request';
import {runHostedExpansionBoundary} from './pilot-hosted-expansion';
import {runHostedGapBoundary} from './pilot-hosted-gaps';
import {runHostedPrimaryExclusion} from './pilot-hosted-primary';
import {hostedConfigurationSchema} from '../lib/server/operations/hosted-configuration';
import {previewInfrastructureAuthorizationSchema} from './pilot-hosted-paid';
import {runHostedLinkedJourney} from './pilot-hosted-linked';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
const execute=promisify(execFile);
async function platformDeployment(scope:PilotHostedScope,origin=false,signal?:AbortSignal){
 const endpoint='/v13/deployments/'+scope.deploymentId+'?teamId='+scope.teamId+(origin?'&url='+encodeURIComponent(new URL(scope.origin).hostname):'');
 // Fixed GET transport, no shell, arbitrary commands, login, linking or deploy.
 const result=await execute('vercel',['api',endpoint,'--raw'],{timeout:30000,signal,maxBuffer:1024*1024,env:Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]))});
 return verifyHostedDeployment(JSON.parse(result.stdout),scope);
}
function explicitRuntimeUrl(env:NodeJS.ProcessEnv){
 const raw=env.TURAS_PILOT_HOSTED_DATABASE_URL;if(!raw)throw Error('Explicit hosted runtime database required');
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.searchParams.get('sslmode')!=='verify-full')throw Error('Hosted runtime requires explicit Neon verify-full transport');
 return raw;
}
/** Read-only admission before any authenticated hosted journey. Completion here
 * is not the hosted catalog, file processing, participant proof or readiness. */
export async function pilotHosted(args=process.argv.slice(2)){
 if(args.length!==8||args[0]!=='--scope'||args[2]!=='--run'||args[4]!=='--configuration'||args[6]!=='--authorization')throw Error('Explicit private hosted scope, run, configuration and infrastructure authorization required');
 process.umask(0o077);
 const scopePath=resolve(args[1]),runPath=resolve(args[3]);
 const scope=pilotHostedScopeSchema.parse(await readEvidence(dirname(scopePath),basename(scopePath)));
 const run=pilotRunSchema.parse(await readEvidence(dirname(runPath),basename(runPath)));
 const configurationPath=resolve(args[5]);
 const configuration=hostedConfigurationSchema.parse(await readEvidence(dirname(configurationPath),basename(configurationPath)));
 if(configuration.environmentMarker!==scope.environmentMarker||configuration.projectId!==scope.projectId||configuration.teamId!==scope.teamId||!configuration.dispatcherEnabled)throw Error('Hosted configuration target or enabled dispatcher differs');
 const authorizationPath=resolve(args[7]),rawAuthorization=await readEvidence(dirname(authorizationPath),basename(authorizationPath)),authorization=previewInfrastructureAuthorizationSchema.parse(rawAuthorization),authorizationDigest=evidenceDigest(JSON.stringify(rawAuthorization));
 if(scope.target!=='preview'||authorization.environmentMarker!==scope.environmentMarker||authorization.projectId!==scope.projectId||authorization.teamId!==scope.teamId||authorization.maximumSandboxJobs!==configuration.maximumSandboxDispatches||Date.parse(authorization.approvedAt)>Date.now()||Date.parse(authorization.expiresAt)<=Date.now())throw Error('Fresh applicable Preview infrastructure authority required');
 const source=await pilotSource();
 if(run.id!==scope.runId||run.environmentMarker!==scope.environmentMarker||run.scopeDigest!==evidenceDigest(JSON.stringify(scope)))throw Error('Hosted run and scope differ');
 for(const key of ['sourceCommit','sourceDigest','catalogDigest'] as const)if(run[key]!==scope[key]||scope[key]!==source[key])throw Error('Hosted source or catalog differs');
 const protectedBefore=await pilotProtectedSnapshot(),id=randomUUID(),root=join(dirname(runPath),'hosted-'+id);
 await createEvidenceDirectory(root);
 const startedAt=new Date().toISOString();
 // This finite catalog may wait for multiple independently bounded 300s jobs.
 // Their original deadlines/concurrency remain unchanged; authority expiry also
 // cancels the whole operator run, rather than extending a job or approval.
 return withRecoveryCancellation(Math.max(1,Math.min(7200000,Date.parse(authorization.expiresAt)-Date.now())),async signal=>{
 let stage='preflight';
 let paidDispatchPossible=false;
 try{
  const dirty=await execute('git',['status','--porcelain','--untracked-files=all'],{timeout:10000,maxBuffer:1024*1024});
  if(dirty.stdout.trim())throw Error('Hosted verification requires committed source');
  const deployment=await platformDeployment(scope,false,signal),resolvedOrigin=await platformDeployment(scope,true,signal);
  if(JSON.stringify(resolvedOrigin)!==JSON.stringify(deployment))throw Error('Hosted origin targets another deployment');
  const db=new Client({connectionString:explicitRuntimeUrl(process.env),connectionTimeoutMillis:5000,statement_timeout:5000});
  let schemaLedgerDigest:string;
  let connected=false;
  try{
   await db.connect();connected=true;
   await db.query('BEGIN READ ONLY');
   await db.query("SET LOCAL transaction_timeout='15s'");
   await assertPilotDatabaseOnConnection(scope.environmentMarker,<Row extends QueryResultRow=QueryResultRow>(sql:string,values:readonly unknown[]=[])=>db.query<Row>(sql,[...values]));
   const workspace=(await db.query("SELECT classification,pilot_environment_id,active FROM workspaces WHERE id=$1",[scope.workspaceId])).rows[0];
   if(workspace?.classification!=='synthetic_pilot'||workspace.pilot_environment_id!==scope.environmentMarker||workspace.active!==true)throw Error('Exact active hosted pilot workspace required');
   schemaLedgerDigest=evidenceDigest(JSON.stringify((await db.query('SELECT name FROM turas_migrations ORDER BY name')).rows));
   await db.query('COMMIT');
  }catch(error){if(connected)await db.query('ROLLBACK');throw error;}finally{await db.end();}
  if(JSON.stringify(await platformDeployment(scope,true,signal))!==JSON.stringify(deployment)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(protectedBefore))throw Error('Hosted identity or protected checkout changed');
  const receipt={contract:'pilot-hosted-preflight-v1',id,runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,startedAt,completedAt:new Date().toISOString(),state:'pass',deployment,origin:scope.origin,schemaVersion:57,schemaLedgerDigest,runtimeGrantsVerified:true,syntheticWorkspaceVerified:true,readOnly:true,paidCalls:0,authenticatedJourneysVerified:false,hostedCatalogVerified:false,restorationReady:false};
  await writeEvidence(root,'preflight.json',receipt);
  const credentials=['TURAS_PILOT_HOSTED_ADMIN_PASSWORD','TURAS_PILOT_HOSTED_MEMBER_PASSWORD','TURAS_PILOT_HOSTED_PARTNER_PASSWORD'];
  if(credentials.some(key=>!process.env[key])){
   await writeEvidence(root,'blocked.json',{id,runId:run.id,...source,state:'blocked',safeFailure:'explicit_hosted_role_credentials_required',hostedCatalogVerified:false});
   console.info(JSON.stringify({preflight:'pass',roleReads:'blocked',hostedCatalog:'blocked',paidCalls:0}));process.exitCode=1;return receipt;
  }
  stage='role_reads';
  const readDb=new Client({connectionString:explicitRuntimeUrl(process.env),connectionTimeoutMillis:5000,statement_timeout:5000});
  let reads:Awaited<ReturnType<typeof runHostedReadChecks>>;
  const sdkJourneys:(Awaited<ReturnType<typeof runHostedMcpJourney>>&{role:string})[]=[];
  const profileJourneys:Awaited<ReturnType<typeof runHostedProfileReviewJourney>>[]=[];
  const conversationJourneys:(Awaited<ReturnType<typeof runHostedConversationBoundary>>&{role:string})[]=[];
  const browserJourneys:(Awaited<ReturnType<typeof runHostedConversationBrowser>>&{role:string})[]=[];
  const supportJourneys:Awaited<ReturnType<typeof runHostedSupportBoundary>>[]=[];
  const expansionJourneys:Awaited<ReturnType<typeof runHostedExpansionBoundary>>[]=[];
  const gapJourneys:Awaited<ReturnType<typeof runHostedGapBoundary>>[]=[];
  const linkedJourneys:Awaited<ReturnType<typeof runHostedLinkedJourney>>[]=[];
  try{await readDb.connect();reads=await runHostedReadChecks(scope,readDb,signal,fetch,process.env,async context=>{
    if(context.role==='internal-admin'){
     // The reader verified the actual version-bound diagnostic before this hook.
     stage='configuration_boundary';
     await writeEvidence(root,'configuration.json',{contract:'pilot-hosted-configuration-readback-v1',runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,completedAt:new Date().toISOString(),configuration,configurationDigest:evidenceDigest(JSON.stringify(configuration)),actualReadbackVerified:true,providerPermissionVerified:false,hostedCatalogVerified:false});
    }
    stage='conversation_boundary';
    conversationJourneys.push({...await runHostedConversationBoundary({scope,db:readDb,headers:context.headers,customerId:context.partnerCustomerIds[0],signal,foreignConversationIds:conversationJourneys.map(row=>row.conversationId)}),role:context.role});
    await writeEvidence(root,'conversation-'+context.role+'.json',{runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,completedAt:new Date().toISOString(),...conversationJourneys.at(-1)});
    stage='browser_boundary';
    browserJourneys.push({...await runHostedConversationBrowser({scope,headers:context.headers,conversationId:conversationJourneys.at(-1)!.conversationId,foreignConversationIds:conversationJourneys.slice(0,-1).map(row=>row.conversationId),signal}),role:context.role});
    await writeEvidence(root,'browser-'+context.role+'.json',{runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,completedAt:new Date().toISOString(),...browserJourneys.at(-1)});
    stage='profile_boundary';
    if(context.role==='internal-admin')profileJourneys.push(await runHostedProfileReviewJourney({scope,db:readDb,headers:context.headers,customerId:context.customerIds[0],signal}));
    if(context.role==='internal-admin'){
     stage='linked_chain';
     paidDispatchPossible=true;
     const owner=(await readDb.query("SELECT m.id FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE m.workspace_id=$1 AND m.active AND m.kind='internal' AND m.role='admin' AND p.active AND p.login_name='mcteer'",[scope.workspaceId])).rows;
     if(owner.length!==1)throw Error('Exact active linked reviewer required');
     linkedJourneys.push(await runHostedLinkedJourney({scope,db:readDb,headers:context.headers,customerId:context.partnerCustomerIds[0],ownerMembershipId:owner[0].id,configuration,authorizationDigest,authorizationExpiresAt:authorization.expiresAt,signal}));
     await writeEvidence(root,'linked-internal-admin.json',{runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,completedAt:new Date().toISOString(),...linkedJourneys.at(-1)});
    }
    const positive=(await readDb.query(`SELECT c.id FROM customer_references c WHERE c.workspace_id=$1 AND c.synthetic AND c.id=ANY($2::uuid[])
     AND EXISTS(SELECT 1 FROM profile_records p WHERE p.customer_id=c.id AND p.current_accepted_revision_id IS NOT NULL)
     AND EXISTS(SELECT 1 FROM delivery_plans p WHERE p.workspace_id=c.workspace_id AND p.customer_id=c.id AND p.audience='delivery' AND p.accepted_revision_id IS NOT NULL)
     AND EXISTS(SELECT 1 FROM report_scopes s JOIN report_publications p ON p.report_id=s.id JOIN report_revision_states st ON st.revision_id=p.revision_id WHERE s.workspace_id=c.workspace_id AND s.customer_id=c.id AND s.audience='delivery' AND st.state='published')
     AND ($3::uuid IS NULL OR c.id=$3)
     ORDER BY c.id LIMIT 1`,[scope.workspaceId,context.customerIds,linkedJourneys[0]?.customerId??null])).rows[0]?.id;
    const denied=context.allCustomerIds.find(id=>id!==positive);
    if(!positive||!denied)throw Error('Ordinarily accepted hosted SDK chain required');
    stage='sdk_boundary';
    sdkJourneys.push({...await runHostedMcpJourney({scope,db:readDb,headers:context.headers,customerId:String(positive),deniedCustomerId:denied,signal}),role:context.role});
    if(context.role==='internal-admin'){
     stage='support_boundary';
     const linked=(await readDb.query(`SELECT p.id AS plan_id,p.accepted_revision_id,p.workload_id,p.engagement_id,m.id AS owner_id
      FROM delivery_plans p JOIN customer_workloads w ON w.id=p.workload_id AND w.workspace_id=p.workspace_id AND w.customer_id=p.customer_id AND w.lifecycle='active'
      JOIN memberships m ON m.workspace_id=p.workspace_id AND m.active AND m.kind='internal' AND m.role='admin'
      JOIN principals a ON a.id=m.principal_id AND a.active AND a.login_name='mcteer'
      WHERE p.workspace_id=$1 AND p.customer_id=$2 AND p.audience='delivery' AND p.accepted_revision_id IS NOT NULL AND p.engagement_id IS NOT NULL
       AND NOT EXISTS(SELECT 1 FROM support_scopes s JOIN support_records r ON r.scope_id=s.id WHERE s.workspace_id=p.workspace_id AND s.customer_id=p.customer_id AND s.workload_id=p.workload_id AND r.audience='delivery')
      ORDER BY p.id LIMIT 1`,[scope.workspaceId,positive])).rows[0];
     if(!linked)throw Error('Fresh ordinarily accepted support baseline required');
     const request=pilotHostedRequest({scope,headers:context.headers,signal});
     supportJourneys.push(await runHostedSupportBoundary({scope,db:readDb,customerId:String(positive),workloadId:linked.workload_id,planId:linked.plan_id,revisionId:linked.accepted_revision_id,engagementId:linked.engagement_id,ownerMembershipId:linked.owner_id,authorRequest:request,reviewerRequest:request,signal}));
     await writeEvidence(root,'support-internal-admin.json',{runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,completedAt:new Date().toISOString(),...supportJourneys.at(-1)});
     stage='expansion_boundary';
     expansionJourneys.push(await runHostedExpansionBoundary({scope,db:readDb,customerId:String(positive),workloadId:linked.workload_id,planId:linked.plan_id,revisionId:linked.accepted_revision_id,engagementId:linked.engagement_id,ownerMembershipId:linked.owner_id,authorRequest:request,reviewerRequest:request,signal}));
     await writeEvidence(root,'expansion-internal-admin.json',{runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,completedAt:new Date().toISOString(),...expansionJourneys.at(-1)});
     stage='gap_boundary';
     gapJourneys.push(await runHostedGapBoundary({scope,db:readDb,customerId:String(positive),workloadId:linked.workload_id,planId:linked.plan_id,revisionId:linked.accepted_revision_id,engagementId:linked.engagement_id,ownerMembershipId:linked.owner_id,authorRequest:request,reviewerRequest:request,signal,waitForReport:async reportId=>{
      const until=Date.now()+300000;
      for(;;){signal.throwIfAborted();const result=await request('/api/product-gaps/reports/'+reportId,'GET') as {data?:{job?:{state?:unknown};availability?:unknown}};if(result.data?.job?.state==='prepared'&&result.data.availability==='eligible')return;if(['failed','cancelled'].includes(String(result.data?.job?.state))||Date.now()>=until)throw Error('Actual normally scheduled gap report unavailable');await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);done();},2000);const abort=()=>{clearTimeout(timer);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});});}
     },verifyPrimaryIsolation:async(gapIds,reportId,query)=>{
      const proof=await runHostedPrimaryExclusion({scope,db:readDb,gapIds,reportId,query,signal});await writeEvidence(root,'primary-gap-exclusion.json',{runId:run.id,...source,environmentMarker:scope.environmentMarker,deployment,completedAt:new Date().toISOString(),...proof});
     },readExport:async artifact=>{
      const response=await fetch(new URL('/api/product-gaps/reports/'+artifact.reportId+'/exports/'+artifact.exportId,scope.origin),{headers:context.headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
      if(response.status!==200||response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Exact private gap export unavailable or release differs');}
      const reader=response.body?.getReader();if(!reader)throw Error('Actual private gap export body required');const parts:Uint8Array[]=[];let size=0;
      try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>artifact.sizeBytes||size>5242880)throw Error('Private gap export exceeds bound');parts.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}return Buffer.concat(parts);
     }}));
     await writeEvidence(root,'gaps-internal-admin.json',{runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,completedAt:new Date().toISOString(),...gapJourneys.at(-1)});
    }
   },configuration);}finally{await readDb.end();}
  if(JSON.stringify(await platformDeployment(scope,true,signal))!==JSON.stringify(deployment)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(protectedBefore))throw Error('Hosted identity or protected checkout changed');
  await writeEvidence(root,'reads.json',{contract:'pilot-hosted-role-boundaries-v1',id,runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,startedAt,completedAt:new Date().toISOString(),roleReads:reads,sdkJourneys,profileJourneys,conversationJourneys,browserJourneys,supportJourneys,expansionJourneys,gapJourneys,linkedJourneys,normalProfileCommands:profileJourneys.reduce((sum,row)=>sum+row.normalProfileCommands,0),normalConversationCommands:conversationJourneys.reduce((sum,row)=>sum+row.normalCommands,0),normalSupportCommands:supportJourneys.reduce((sum,row)=>sum+row.normalCommands,0),normalExpansionCommands:expansionJourneys.reduce((sum,row)=>sum+row.normalCommands,0),normalGapCommands:gapJourneys.reduce((sum,row)=>sum+row.normalCommands,0),fullHostedCatalogVerified:false});
  // Required journeys are not yet dispatched: do not return acceptance success.
  await writeEvidence(root,'blocked.json',{id,runId:run.id,...source,state:'blocked',safeFailure:'hosted_core_journey_catalog_not_complete',hostedCatalogVerified:false});
  console.info(JSON.stringify({preflight:'pass',roleReads:reads.passedCases,sdkCases:sdkJourneys.reduce((sum,row)=>sum+row.passedCases,0),hostedCatalog:'blocked',paidCalls:linkedJourneys.reduce((sum,row)=>sum+row.source.providerCalls+row.reports.providerCalls,0)}));process.exitCode=1;return receipt;
 }catch{
  await writeEvidence(root,'failure.json',{id,runId:run.id,...source,startedAt,completedAt:new Date().toISOString(),state:'fail',safeFailure:'hosted_'+stage+'_incomplete',hostedCatalogVerified:false,paidCalls:paidDispatchPossible?null:0,paidDispatchPossible,scopedCostLedgerReviewRequired:paidDispatchPossible});
  throw Error('Hosted preflight failed; inspect private target prerequisites');
 }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotHosted().catch(()=>{console.error('Hosted catalog incomplete; no runtime acceptance established.');process.exitCode=1;});
