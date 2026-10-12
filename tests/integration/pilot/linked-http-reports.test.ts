import {cp,readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {parsePilotImagePreparation} from '../../../lib/contracts/pilot-images';
import {runOwnedSourceJourney,sourceWithdrawalCommand} from '../../../scripts/pilot-owned-source';
import {claimArtifactRun} from '../../../lib/server/artifacts/jobs';
import {runArtifactJob} from '../../../lib/server/artifacts/runner';
import {z} from 'zod';
import {pilotHostedRequest} from '../../../scripts/pilot-hosted-request';
import {it,expect} from 'vitest';
import {Client,type PoolClient} from 'pg';
import {createHash} from 'node:crypto';
import {runOwnedReportJourney} from '../../../scripts/pilot-owned-report';
import {reportTransaction} from '../../../lib/server/reports/commands';
import {claimReportJobs} from '../../../lib/server/reports/jobs';
import {runReportRenderJob} from '../../../lib/server/reports/render-jobs';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {issueSession,sessionCookieName} from '../../../lib/server/auth/sessions';
import {csrfTokenForSession} from '../../../lib/server/auth/csrf';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {materializeCurrentProjection} from '../../../lib/server/retrieval/projections';
import {retrievalResponseSchema} from '../../../lib/contracts/retrieval';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {runHostedProfileFoundation} from '../../../scripts/pilot-hosted-foundation';
import {runHostedPlanJourney} from '../../../scripts/pilot-hosted-plan';
import {runHostedDeliveryReview,runHostedMilestoneReview} from '../../../scripts/pilot-hosted-delivery';
it('reviews an uploaded source through cited planning and delivery and denies published report files after normal withdrawal',async()=>{
const preparationFile=process.env.TURAS_PILOT_UI_PREPARATION_FILE;if(!preparationFile)throw Error('Explicit prepared source images required');
const preparation=parsePilotImagePreparation(await readFile(preparationFile)),preparedStore=join(dirname(preparationFile),'store');
await withPilotEnvironment(async environment=>{
 process.env.TURAS_REPORTS_ENABLED='true';process.env.TURAS_PILOT_RENDERER_IMAGE=preparation.images.find(row=>row.kind==='renderer')!.localImageId;
 const parser=preparation.images.find(row=>row.kind==='parser')!,scanner=preparation.images.find(row=>row.kind==='scanner')!;
 process.env.TURAS_PILOT_PARSER_IMAGE=parser.localImageId;process.env.TURAS_PILOT_SCANNER_IMAGE=scanner.localImageId;
 for(const asset of preparation.scanner.signatures){const bytes=await readFile(join(preparedStore,'signatures',asset.name));if(bytes.length!==asset.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==asset.digest)throw Error('Exact prepared scanner assets required');}
 if(createHash('sha256').update(await readFile(join(preparedStore,'assets/eng.traineddata'))).digest('hex')!==preparation.ocr.digest)throw Error('Exact prepared OCR asset required');
 await cp(join(preparedStore,'signatures'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'signatures'),{recursive:true});
 await cp(join(preparedStore,'assets'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'assets'),{recursive:true});
 await writeFile(join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'runtime-images.json'),JSON.stringify({contract:'artifact-intake-v1',parserImage:parser.localImageId,parserDigest:parser.localImageId.slice(7),scannerImage:scanner.localImageId,scannerDigest:scanner.localImageId.slice(7)}),{mode:0o600});
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{
  const workspaceId=randomUUID(),membershipId=randomUUID(),customerId=randomUUID();
  await owner.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic linked HTTP validation','synthetic_pilot',$2,$3)",[workspaceId,environment.environmentId,randomUUID()]);
  await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin')",[membershipId,DEMO_IDS.mcteer,workspaceId]);
  await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic linked HTTP customer',true)",[customerId,workspaceId]);
  await owner.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[customerId,workspaceId]);
  const memberId=randomUUID();await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[memberId,DEMO_IDS.panel,workspaceId]);
  const memberSession=await issueSession({principalId:DEMO_IDS.panel,loginName:'panel',displayName:'panel',membershipId:memberId,workspaceId,kind:'internal',role:'member'});
  const memberHeaders=new Headers({cookie:sessionCookieName()+'='+memberSession.token,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(memberSession.token)});
  const issued=await issueSession({principalId:DEMO_IDS.mcteer,loginName:'mcteer',displayName:'mcteer',membershipId,workspaceId,kind:'internal',role:'admin'});
  const headers=new Headers({cookie:sessionCookieName()+'='+issued.token,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(issued.token)});
  const scope:PilotHostedScope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:environment.origin,environmentMarker:environment.environmentId,workspaceId,target:'production',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)};
  await closeRuntimePool();await environment.startProduction();
  const request=pilotHostedRequest({scope,headers,signal:environment.signal}),authorRequest=pilotHostedRequest({scope,headers:memberHeaders,signal:environment.signal});
  const foundation=await runHostedProfileFoundation({scope,db:owner,customerId,signal:environment.signal,request});
  const uploaded=await runOwnedSourceJourney({scope,db:owner,customerId,workloadId:foundation.workloadId,signal:environment.signal,request,uploadBytes:async(intentId,bytes)=>{
   const binaryHeaders=new Headers(headers);binaryHeaders.set('content-type','application/octet-stream');binaryHeaders.set('content-length',String(bytes.length));
   const response=await fetch(environment.origin+'/api/artifacts/intents/'+intentId+'/bytes',{method:'PUT',headers:binaryHeaders,body:new Uint8Array(bytes),redirect:'manual',signal:environment.signal});
   expect(response.status).toBe(204);expect(response.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);await response.body?.cancel();
  },runQueuedExtraction:async(versionId)=>{const claim=await claimArtifactRun();if(!claim||claim.versionId!==versionId)throw Error('Exact normal queued extraction required');await runArtifactJob(claim,environment.signal);},readOriginal:async(versionId,expected)=>{
   const response=await fetch(environment.origin+'/api/artifacts/'+versionId+'/original',{headers,redirect:'manual',signal:environment.signal});expect(response.status).toBe(200);expect(response.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);
   const reader=response.body?.getReader();if(!reader)throw Error('Actual original body required');const parts:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>expected.length)throw Error('Actual original exceeds expected bound');parts.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}expect(Buffer.concat(parts).equals(expected)).toBe(true);
  }});
  await owner.query('BEGIN');try{const source=await materializeCurrentProjection(owner as unknown as PoolClient,'accepted_profile',uploaded.profileRevisionId,'delivery');if(!source)throw Error('Current projection unavailable');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
  const search=retrievalResponseSchema.parse(z.object({data:z.unknown()}).parse(await request('/api/retrieval/search','POST',{scope:'customer',customerId,workloadId:foundation.workloadId,query:'controlled synthetic workload serves synthetic public web requests',use:'discovery',limit:5})).data);
  if(search.mode!=='lexical_degraded')throw Error('No paid embedding admitted');
  const source=search.results.find(x=>x.sourceRevisionId===uploaded.profileRevisionId);if(!source)throw Error('Current governed linked citation unavailable');
  const plan=await runHostedPlanJourney({scope,db:owner,customerId,workloadId:foundation.workloadId,ownerMembershipId:membershipId,citationId:source.citationId,expectedSourceRevisionId:uploaded.profileRevisionId,signal:environment.signal,request});
  const baseline=(await owner.query('SELECT revision_id FROM milestone_baselines WHERE id=$1 AND engagement_id=$2',[plan.baselineId,plan.engagementId])).rows;
  if(baseline.length!==1||baseline[0].revision_id!==plan.revisionId)throw Error('Ordinary accepted baseline unavailable');
  const delivery=await runHostedDeliveryReview({scope,db:owner,customerId,engagementId:plan.engagementId,baselineId:plan.baselineId,signal:environment.signal,request});
  const milestone=await runHostedMilestoneReview({scope,db:owner,customerId,engagementId:plan.engagementId,baselineId:plan.baselineId,activityRevisionId:delivery.revisionId,signal:environment.signal,request});
  expect(milestone).toMatchObject({normalCommands:3,explicitMilestoneAcceptanceVerified:true,customerOutcomeEstablished:false,providerCalls:0});
  const publishedArtifactIds:string[]=[];
  const reports=await runOwnedReportJourney({scope,db:owner,customerId,engagementId:plan.engagementId,workloadId:foundation.workloadId,signal:environment.signal,request,authorRequest,runQueuedRender:async revisionId=>{const [job]=await reportTransaction(db=>claimReportJobs(db,'render'));if(!job||job.revision_id!==revisionId)throw Error('Exact normal queued render required');await runReportRenderJob(job,environment.signal);},readArtifact:async artifact=>{publishedArtifactIds.push(artifact.id);const response=await fetch(environment.origin+'/api/reports/artifacts/'+artifact.id,{headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([environment.signal,AbortSignal.timeout(30000)])});if(!response.ok||response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Exact published file read unavailable');}const reader=response.body?.getReader();if(!reader)throw Error('Actual file body required');const parts:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>10485760)throw Error('Published artifact exceeds bound');parts.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}const bytes=Buffer.concat(parts);if(size!==artifact.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==artifact.contentDigest||bytes.subarray(0,artifact.format==='pdf'?5:2).toString()!==(artifact.format==='pdf'?'%PDF-':'PK'))throw Error('Actual published file bytes differ');}});
  await request('/api/artifacts/'+uploaded.versionId+'/actions','POST',sourceWithdrawalCommand(uploaded.lifecycleGeneration));
  for(const path of ['/api/retrieval/citations/'+source.citationId,...publishedArtifactIds.map(id=>'/api/reports/artifacts/'+id)]){
   const denied=await fetch(environment.origin+path,{headers,redirect:'manual',cache:'no-store',signal:environment.signal});expect([404,409]).toContain(denied.status);expect(denied.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);await denied.body?.cancel();
  }
  expect(uploaded).toMatchObject({actualOriginalVerified:true,normalCommands:5,providerCalls:0,hostedProof:false});
  expect({profileCommands:foundation.normalCommands,planCommands:plan.normalCommands,deliveryCommands:delivery.normalCommands,reportCommands:reports.normalReportCommands,renderedJobs:reports.actualRenderedJobs,fileReads:reports.actualArtifactReads}).toEqual({profileCommands:5,planCommands:4,deliveryCommands:4,reportCommands:10,renderedJobs:2,fileReads:4});
  expect(delivery.activityIsNotCompletionVerified).toBe(true);
 }finally{await owner.end();await closeRuntimePool();}
},{postgresMajor:18,deadlineMs:300000});
},300000);
