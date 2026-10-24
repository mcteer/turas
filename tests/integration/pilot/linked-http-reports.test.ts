import {prepareHostedPlanSourceBoundary,verifyHostedPlanSourceBoundary} from '../../../scripts/pilot-hosted-plan-boundary';
import {runHostedDeliveryRegisters} from '../../../scripts/pilot-hosted-delivery-registers';
import {runHostedMcpJourney} from '../../../scripts/pilot-hosted-mcp';
import {runHostedSourceWithdrawal} from '../../../scripts/pilot-hosted-withdrawal';
import {runHostedKnowledgeBaseline} from '../../../scripts/pilot-hosted-knowledge';
import {cp,readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {parsePilotImagePreparation} from '../../../lib/contracts/pilot-images';
import {runOwnedSourceJourney} from '../../../scripts/pilot-owned-source';
import {claimArtifactRun} from '../../../lib/server/artifacts/jobs';
import {runArtifactJob} from '../../../lib/server/artifacts/runner';
import {z} from 'zod';
import {pilotHostedRequest} from '../../../scripts/pilot-hosted-request';
import {it,expect} from 'vitest';
import {Client} from 'pg';
import {createHash} from 'node:crypto';
import {preparePilotAssetPermissions} from '../../../scripts/pilot-asset-permissions';
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
import {retrievalResponseSchema} from '../../../lib/contracts/retrieval';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {runHostedProfileFoundation} from '../../../scripts/pilot-hosted-foundation';
import {runHostedPlanJourney} from '../../../scripts/pilot-hosted-plan';
import {runHostedDeliveryReview,runHostedMilestoneReview} from '../../../scripts/pilot-hosted-delivery';
import {runHostedSupportBoundary} from '../../../scripts/pilot-hosted-support';
import {runHostedExpansionBoundary} from '../../../scripts/pilot-hosted-expansion';
import {expansionWorkspaceProjectionSchema} from '../../../lib/server/expansion/projection-schema';
import {runHostedGapBoundary} from '../../../scripts/pilot-hosted-gaps';
import {claimGapReportJobs,runGapReportJob} from '../../../lib/server/gaps/report-jobs';
import {runHostedPrimaryExclusion} from '../../../scripts/pilot-hosted-primary';
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
 await preparePilotAssetPermissions(process.env.TURAS_ARTIFACT_STORE_ROOT!);
 await writeFile(join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'runtime-images.json'),JSON.stringify({contract:'artifact-intake-v1',parserImage:parser.localImageId,parserDigest:parser.localImageId.slice(7),scannerImage:scanner.localImageId,scannerDigest:scanner.localImageId.slice(7)}),{mode:0o600});
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
 try{
  const workspaceId=randomUUID(),membershipId=randomUUID(),customerId=randomUUID();
  await owner.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic linked HTTP validation','synthetic_pilot',$2,$3)",[workspaceId,environment.environmentId,randomUUID()]);
  await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin')",[membershipId,DEMO_IDS.mcteer,workspaceId]);
  await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic linked HTTP customer',true)",[customerId,workspaceId]);
  await owner.query('INSERT INTO customer_profile_state(customer_id,workspace_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[customerId,workspaceId]);
  const deniedCustomerId=randomUUID();await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic denied SDK customer',true)",[deniedCustomerId,workspaceId]);
  const memberId=randomUUID();await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[memberId,DEMO_IDS.panel,workspaceId]);
  const memberSession=await issueSession({principalId:DEMO_IDS.panel,loginName:'panel',displayName:'panel',membershipId:memberId,workspaceId,kind:'internal',role:'member'});
  const memberHeaders=new Headers({cookie:sessionCookieName()+'='+memberSession.token,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(memberSession.token)});
  const issued=await issueSession({principalId:DEMO_IDS.mcteer,loginName:'mcteer',displayName:'mcteer',membershipId,workspaceId,kind:'internal',role:'admin'});
  const headers=new Headers({cookie:sessionCookieName()+'='+issued.token,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(issued.token)});
  const scope:PilotHostedScope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:environment.origin,environmentMarker:environment.environmentId,workspaceId,target:'production',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)};
  await closeRuntimePool();await environment.startProduction();
  const supportDiagnostics:typeof fetch=async(input,options)=>{
   const response=await fetch(input,options);
   if(new URL(String(input)).pathname.startsWith('/api/support/')&&!response.ok){
    const code=(await response.clone().json().catch(()=>null))?.error?.code;
    const known=['invalid_assessment','invalid_source','invalid_owner','invalid_disposition','source_changed','not_found','forbidden','invalid_date','unavailable','rate_limited'];
    await response.body?.cancel();throw Error('Hosted support HTTP '+response.status+' '+(known.includes(code)?code:'other'));
   }
   return response;
  };
  const request=pilotHostedRequest({scope,headers,signal:environment.signal,transport:supportDiagnostics}),authorRequest=pilotHostedRequest({scope,headers:memberHeaders,signal:environment.signal,transport:supportDiagnostics});
  const foundation=await runHostedProfileFoundation({scope,db:owner,customerId,signal:environment.signal,request});
  const uploaded=await runOwnedSourceJourney({scope,db:owner,customerId,workloadId:foundation.workloadId,signal:environment.signal,request,uploadBytes:async(intentId,bytes)=>{
   const binaryHeaders=new Headers(headers);binaryHeaders.set('content-type','application/octet-stream');binaryHeaders.set('content-length',String(bytes.length));
   const response=await fetch(environment.origin+'/api/artifacts/intents/'+intentId+'/bytes',{method:'PUT',headers:binaryHeaders,body:new Uint8Array(bytes),redirect:'manual',signal:environment.signal});
   expect(response.status).toBe(204);expect(response.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);await response.body?.cancel();
  },runQueuedExtraction:async(versionId)=>{const claim=await claimArtifactRun();if(!claim||claim.versionId!==versionId)throw Error('Exact normal queued extraction required');await runArtifactJob(claim,environment.signal);},readOriginal:async(versionId,expected)=>{
   const response=await fetch(environment.origin+'/api/artifacts/'+versionId+'/original',{headers,redirect:'manual',signal:environment.signal});expect(response.status).toBe(200);expect(response.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);
   const reader=response.body?.getReader();if(!reader)throw Error('Actual original body required');const parts:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>expected.length)throw Error('Actual original exceeds expected bound');parts.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}expect(Buffer.concat(parts).equals(expected)).toBe(true);
  }});
  const knowledge=await runHostedKnowledgeBaseline({scope,db:owner,customerId,sourceRevisionId:uploaded.profileRevisionId,request,signal:environment.signal});
  expect(knowledge).toMatchObject({normalCommands:3,providerCalls:0,preActivationBaseline:true,pairedEvaluationVerified:false});
  const search=retrievalResponseSchema.parse(z.object({data:z.unknown()}).parse(await request('/api/retrieval/search','POST',{scope:'customer',customerId,workloadId:foundation.workloadId,query:'controlled synthetic workload serves synthetic public web requests',use:'discovery',limit:5})).data);
  if(search.mode!=='lexical_degraded')throw Error('No paid embedding admitted');
  const source=search.results.find(x=>x.sourceRevisionId===uploaded.profileRevisionId);if(!source)throw Error('Current governed linked citation unavailable');
  const plan=await runHostedPlanJourney({scope,db:owner,customerId,workloadId:foundation.workloadId,ownerMembershipId:membershipId,citationId:source.citationId,expectedSourceRevisionId:uploaded.profileRevisionId,signal:environment.signal,request});
  const baseline=(await owner.query('SELECT revision_id FROM milestone_baselines WHERE id=$1 AND engagement_id=$2',[plan.baselineId,plan.engagementId])).rows;
  if(baseline.length!==1||baseline[0].revision_id!==plan.revisionId)throw Error('Ordinary accepted baseline unavailable');
  const delivery=await runHostedDeliveryReview({scope,db:owner,customerId,engagementId:plan.engagementId,baselineId:plan.baselineId,signal:environment.signal,request});
  const milestone=await runHostedMilestoneReview({scope,db:owner,customerId,engagementId:plan.engagementId,baselineId:plan.baselineId,activityRevisionId:delivery.revisionId,signal:environment.signal,request});
  expect(milestone).toMatchObject({normalCommands:3,explicitMilestoneAcceptanceVerified:true,customerOutcomeEstablished:false,providerCalls:0});
  const registers=await runHostedDeliveryRegisters({customerId,engagementId:plan.engagementId,baselineId:plan.baselineId,activityId:delivery.recordId,activityRevisionId:delivery.revisionId,signal:environment.signal,authorRequest,reviewerRequest:request});
  expect(registers).toMatchObject({normalCommands:12,replayedCommands:4,reviewPreviews:4,customerOutcomeEstablished:false,receivingAcknowledgementRecorded:false});
  expect(registers.accepted.map(x=>x.kind)).toEqual(['raid','scope_change','handoff','outcome']);
  const support=await runHostedSupportBoundary({scope,db:owner,customerId,workloadId:foundation.workloadId,planId:plan.planId,revisionId:plan.revisionId,engagementId:plan.engagementId,ownerMembershipId:membershipId,authorRequest,reviewerRequest:request,signal:environment.signal});
  expect(support).toMatchObject({normalCommands:6,providerCalls:0,externalHandoffRecorded:false,externalActionsDispatched:0,readiness:'unknown',syntheticOnly:true,fullHostedCatalogVerified:false});
  const expansion=await runHostedExpansionBoundary({scope,db:owner,customerId,workloadId:foundation.workloadId,planId:plan.planId,revisionId:plan.revisionId,engagementId:plan.engagementId,ownerMembershipId:membershipId,authorRequest,reviewerRequest:request,signal:environment.signal});
  expect(expansion).toMatchObject({normalCommands:6,qualificationDenied:true,providerCalls:0,benefit:'unknown',currentUse:'unknown',externalActionsDispatched:0,syntheticOnly:true,fullHostedCatalogVerified:false});
  expect(expansion.qualified).toMatchObject({normalProfileCommands:4,normalExpansionCommands:2,ownerQualificationVerified:true,syntheticOnly:true,realizedCustomerBenefitEstablished:false,currentUse:'unknown'});
  const gaps=await runHostedGapBoundary({scope,db:owner,customerId,workloadId:foundation.workloadId,planId:plan.planId,revisionId:plan.revisionId,engagementId:plan.engagementId,ownerMembershipId:membershipId,authorRequest,reviewerRequest:request,signal:environment.signal,waitForReport:async reportId=>{
   const [job]=await claimGapReportJobs();if(!job||job.report_id!==reportId)throw Error('Exact normally queued gap report required');await runGapReportJob(job);
  },verifyPrimaryIsolation:async(gapIds,reportId,query)=>{
   const proof=await runHostedPrimaryExclusion({scope,db:owner,gapIds,reportId,query,signal:environment.signal,env:{...process.env,TURAS_PILOT_HOSTED_ADMIN_PASSWORD:process.env.TURAS_DEMO_PASSWORD}});
   expect(proof).toMatchObject({directDenials:4,registryEmpty:true,sessionRevoked:true,primaryCustomerWrites:0,providerCalls:0});
  },readExport:async artifact=>{
   const response=await fetch(environment.origin+'/api/product-gaps/reports/'+artifact.reportId+'/exports/'+artifact.exportId,{headers,redirect:'manual',cache:'no-store',signal:environment.signal});
   expect(response.status).toBe(200);expect(response.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);const reader=response.body?.getReader();if(!reader)throw Error('Actual private gap export required');
   const parts:Uint8Array[]=[];let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>5242880)throw Error('Gap export exceeds bound');parts.push(next.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}return Buffer.concat(parts);
  }});
  expect(gaps).toMatchObject({actualExportReads:2,pilotCustomerCountsVerified:true,primaryCountsIsolationVerified:true,providerCalls:0,externalMessagesSent:0,syntheticOnly:true,humanFeedbackRecorded:false,fullHostedCatalogVerified:false});
  const publishedArtifactIds:string[]=[];
  const reports=await runOwnedReportJourney({maximumReportLayout:true,scope,db:owner,customerId,engagementId:plan.engagementId,workloadId:foundation.workloadId,signal:environment.signal,request,authorRequest,runQueuedRender:async revisionId=>{const [job]=await reportTransaction(db=>claimReportJobs(db,'render'));if(!job||job.revision_id!==revisionId)throw Error('Exact normal queued render required');await runReportRenderJob(job,environment.signal);},readArtifact:async artifact=>{publishedArtifactIds.push(artifact.id);const response=await fetch(environment.origin+'/api/reports/artifacts/'+artifact.id,{headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([environment.signal,AbortSignal.timeout(30000)])});if(!response.ok||response.headers.get('x-turas-code-version')!==scope.sourceCommit){await response.body?.cancel();throw Error('Exact published file read unavailable');}const reader=response.body?.getReader();if(!reader)throw Error('Actual file body required');const parts:Uint8Array[]=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>10485760)throw Error('Published artifact exceeds bound');parts.push(part.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}const bytes=Buffer.concat(parts);if(size!==artifact.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==artifact.contentDigest||bytes.subarray(0,artifact.format==='pdf'?5:2).toString()!==(artifact.format==='pdf'?'%PDF-':'PK'))throw Error('Actual published file bytes differ');}});
  expect(reports.normalFortySlideRevisions).toBe(2);
  expect((await owner.query('SELECT checks FROM report_validations WHERE revision_id=ANY(SELECT revision_id FROM report_artifacts WHERE id=ANY($1::uuid[]))',[publishedArtifactIds])).rows.every(row=>row.checks.slides===40)).toBe(true);
  z.object({data:z.object({effectiveReadiness:z.literal('unknown'),assessment:z.object({revisionId:z.literal(support.assessmentRevisionId),contentUnavailable:z.literal(false)})})}).parse(await request('/api/support/customers/'+customerId+'?workloadId='+foundation.workloadId+'&audience=delivery&limit=20','GET'));
  const expansionPath='/api/expansion/customers/'+customerId+'?workloadId='+foundation.workloadId+'&recordId='+expansion.recordId+'&limit=20';
  const beforeWithdrawal=expansionWorkspaceProjectionSchema.parse(z.object({data:z.unknown()}).parse(await request(expansionPath,'GET')).data);
  expect(beforeWithdrawal.records[0]?.working.availability).toBe('eligible');
  const sdk=await runHostedMcpJourney({scope,db:owner,headers,customerId,deniedCustomerId,expectedEvidenceRevisionId:uploaded.profileRevisionId,expectedPublicationId:knowledge.publicationId,expectedPlanId:plan.planId,signal:environment.signal,sourceBoundary:async()=>{const intent=await prepareHostedPlanSourceBoundary({scope,customerId,workloadId:foundation.workloadId,ownerMembershipId:membershipId,citationId:source.citationId,sourceRevisionId:uploaded.profileRevisionId,request,signal:environment.signal});const withdrawal=await runHostedSourceWithdrawal({scope,db:owner,headers,customerId,versionId:uploaded.versionId,lifecycleGeneration:uploaded.lifecycleGeneration,citationId:source.citationId,publicationId:knowledge.publicationId,artifactIds:publishedArtifactIds,signal:environment.signal});expect(withdrawal).toMatchObject({normalCommands:1,authenticatedContentDenials:6,providerCalls:0,originalDeletionRequested:false});const boundary=await verifyHostedPlanSourceBoundary({intent,scope,db:owner,request,signal:environment.signal});expect(boundary).toMatchObject({sourceChangeAcceptanceDenied:true,acceptedStateUnchanged:true,normalPreparationCommands:3,deniedAcceptanceCommands:1});}});
  expect(sdk.credentialRevoked).toBe(true);expect(sdk.cases.map(row=>row.id)).toContain('identity-after-source-withdrawal');
  for(const name of ['turas_evidence_read_v1','turas_knowledge_read_v1','turas_plan_read_v1','turas_report_read_v1'])expect(sdk.cases.map(row=>row.id)).toContain('current-source-denied-'+name);
  for(const name of ['evidence-citation','knowledge-citation'])expect(sdk.cases.map(row=>row.id)).toContain('current-source-denied-'+name);
  expect(new Set(sdk.cases.map(row=>row.id)).size).toBe(sdk.passedCases);
  const unavailable=z.object({data:z.object({effectiveReadiness:z.literal('review_required'),assessment:z.object({revisionId:z.literal(support.assessmentRevisionId),contentUnavailable:z.literal(true),content:z.null()}),actions:z.array(z.object({recordId:z.uuid(),accepted:z.object({contentUnavailable:z.literal(true),content:z.null()}).nullable()}))})}).parse(await request('/api/support/customers/'+customerId+'?workloadId='+foundation.workloadId+'&audience=delivery&limit=20','GET')).data;
  expect(unavailable.actions.some(row=>row.recordId===support.actionRecordId&&row.accepted?.contentUnavailable)).toBe(true);
  const changed=expansionWorkspaceProjectionSchema.parse(z.object({data:z.unknown()}).parse(await request(expansionPath,'GET')).data);
  expect(changed.records[0]?.id).toBe(expansion.recordId);expect(changed.records[0]?.working.availability).toBe('changed');expect(changed.records[0]?.working.payload).toBeNull();expect(changed.records[0]?.reviewRequired).toBe(true);
  for(const path of ['/api/retrieval/citations/'+source.citationId,'/api/knowledge/'+knowledge.publicationId,...publishedArtifactIds.map(id=>'/api/reports/artifacts/'+id)]){
   const denied=await fetch(environment.origin+path,{headers,redirect:'manual',cache:'no-store',signal:environment.signal});expect([404,409]).toContain(denied.status);expect(denied.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);await denied.body?.cancel();
  }
  expect(uploaded).toMatchObject({actualOriginalVerified:true,normalCommands:5,providerCalls:0,hostedProof:false});
  expect({profileCommands:foundation.normalCommands,planCommands:plan.normalCommands,deliveryCommands:delivery.normalCommands,reportCommands:reports.normalReportCommands,renderedJobs:reports.actualRenderedJobs,fileReads:reports.actualArtifactReads}).toEqual({profileCommands:5,planCommands:8,deliveryCommands:4,reportCommands:12,renderedJobs:2,fileReads:4});
  expect(delivery.activityIsNotCompletionVerified).toBe(true);
 }finally{await owner.end();await closeRuntimePool();}
},{postgresMajor:18,deadlineMs:300000});
},300000);
