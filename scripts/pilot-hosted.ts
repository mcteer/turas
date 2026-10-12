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
 if(args.length!==4||args[0]!=='--scope'||args[2]!=='--run')throw Error('Explicit private hosted scope and run required');
 process.umask(0o077);
 const scopePath=resolve(args[1]),runPath=resolve(args[3]);
 const scope=pilotHostedScopeSchema.parse(await readEvidence(dirname(scopePath),basename(scopePath)));
 const run=pilotRunSchema.parse(await readEvidence(dirname(runPath),basename(runPath)));
 const source=await pilotSource();
 if(run.id!==scope.runId||run.environmentMarker!==scope.environmentMarker||run.scopeDigest!==evidenceDigest(JSON.stringify(scope)))throw Error('Hosted run and scope differ');
 for(const key of ['sourceCommit','sourceDigest','catalogDigest'] as const)if(run[key]!==scope[key]||scope[key]!==source[key])throw Error('Hosted source or catalog differs');
 const protectedBefore=await pilotProtectedSnapshot(),id=randomUUID(),root=join(dirname(runPath),'hosted-'+id);
 await createEvidenceDirectory(root);
 const startedAt=new Date().toISOString();
 return withRecoveryCancellation(300000,async signal=>{
 let stage='preflight';
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
  try{await readDb.connect();reads=await runHostedReadChecks(scope,readDb,signal,fetch,process.env,async context=>{
    if(context.role==='internal-admin')profileJourneys.push(await runHostedProfileReviewJourney({scope,db:readDb,headers:context.headers,customerId:context.customerIds[0],signal}));
    const positive=(await readDb.query(`SELECT c.id FROM customer_references c WHERE c.workspace_id=$1 AND c.synthetic AND c.id=ANY($2::uuid[])
     AND EXISTS(SELECT 1 FROM profile_records p WHERE p.customer_id=c.id AND p.current_accepted_revision_id IS NOT NULL)
     AND EXISTS(SELECT 1 FROM delivery_plans p WHERE p.workspace_id=c.workspace_id AND p.customer_id=c.id AND p.audience='delivery' AND p.accepted_revision_id IS NOT NULL)
     AND EXISTS(SELECT 1 FROM report_scopes s JOIN report_publications p ON p.report_id=s.id JOIN report_revision_states st ON st.revision_id=p.revision_id WHERE s.workspace_id=c.workspace_id AND s.customer_id=c.id AND s.audience='delivery' AND st.state='published')
     ORDER BY c.id LIMIT 1`,[scope.workspaceId,context.customerIds])).rows[0]?.id;
    const denied=context.allCustomerIds.find(id=>id!==positive);
    if(!positive||!denied)throw Error('Ordinarily accepted hosted SDK chain required');
    sdkJourneys.push({...await runHostedMcpJourney({scope,db:readDb,headers:context.headers,customerId:String(positive),deniedCustomerId:denied,signal}),role:context.role});
   });}finally{await readDb.end();}
  if(JSON.stringify(await platformDeployment(scope,true,signal))!==JSON.stringify(deployment)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(protectedBefore))throw Error('Hosted identity or protected checkout changed');
  await writeEvidence(root,'reads.json',{id,runId:run.id,...source,environmentMarker:scope.environmentMarker,workspaceId:scope.workspaceId,deployment,startedAt,completedAt:new Date().toISOString(),...reads,sdkJourneys,profileJourneys,normalProfileCommands:profileJourneys.reduce((sum,row)=>sum+row.normalProfileCommands,0)});
  // Required journeys are not yet dispatched: do not return acceptance success.
  await writeEvidence(root,'blocked.json',{id,runId:run.id,...source,state:'blocked',safeFailure:'hosted_core_journey_catalog_not_complete',hostedCatalogVerified:false});
  console.info(JSON.stringify({preflight:'pass',roleReads:reads.passedCases,sdkCases:sdkJourneys.reduce((sum,row)=>sum+row.passedCases,0),hostedCatalog:'blocked',paidCalls:0}));process.exitCode=1;return receipt;
 }catch{
  await writeEvidence(root,'failure.json',{id,runId:run.id,...source,startedAt,completedAt:new Date().toISOString(),state:'fail',safeFailure:'hosted_'+stage+'_incomplete',hostedCatalogVerified:false,paidCalls:0});
  throw Error('Hosted preflight failed; inspect private target prerequisites');
 }
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotHosted().catch(()=>{console.error('Hosted catalog incomplete; no runtime acceptance established.');process.exitCode=1;});
