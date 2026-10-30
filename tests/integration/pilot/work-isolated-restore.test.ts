import {verifyOwnedMaintenanceRecovery,requireOwnedMaintenanceVerification} from '../../../lib/server/operations/owned-maintenance-verification';
import {deriveOwnedMaintenanceInventory} from '../../../lib/server/operations/owned-maintenance-inventory';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {withOwnedProcess} from '../../../scripts/pilot-owned-process';
import {prepareOwnedRecoveryApplication,warmOwnedRecoveryApplication,withOwnedRecoveryApplication,withOwnedRecoveryApplicationConfiguration,retireOwnedRecoveryApplication,type OwnedRecoveryApplication} from '../../../scripts/pilot-owned-recovery-application';
import {reviewedSyntheticGap,gapEnvelope} from '../../fixtures/gaps/authoring';
import {prepareGapReport,readGapReport} from '../../../lib/server/gaps/reports';
import {claimGapReportJobs,runGapReportJob} from '../../../lib/server/gaps/report-jobs';
import {previewGapReportReview,commitGapReportReview} from '../../../lib/server/gaps/report-review';
import {admitGapExport} from '../../../lib/server/gaps/report-release';
import {readGapObject} from '../../../lib/server/gaps/store';
import {createImportIntent,uploadImportOriginal,completeImport,readImportOriginal} from '../../../lib/server/staffing/imports';
import {claimWorkforceImport} from '../../../lib/server/staffing/jobs';
import {runWorkforceImport} from '../../../lib/server/staffing/runner';
import {WorkforceStore} from '../../../lib/server/staffing/store';
import {parsePilotImagePreparation} from '../../../lib/contracts/pilot-images';
import {reportsDeliveryFixture,addReviewedReportActivity} from '../../fixtures/reports/delivery';
import {pilotLoadReportFixture} from '../../fixtures/pilot/load-delivery';
import {previewReportPublication,submitReportPublicationDecision} from '../../../lib/server/reports/service';
import {readReportObject} from '../../../lib/server/reports/store';
import {createArtifactDatabaseFixture} from '../../fixtures/artifact-database';
import {authenticateRecoveryHttpRead} from '../../../lib/server/operations/recovery-http-read';
import {issueOwnedRecoveryHttpRead,retireOwnedRecoveryHttpRead} from '../../../lib/server/operations/recovery-http-read-issuer';
import {sessionCookie} from '../../../lib/server/auth/sessions';
import {withOwnedRecoveryConfiguration} from '../../../lib/server/operations/recovery-configuration';
import {getServerConfig} from '../../../lib/server/config';
import {withAuthenticatedOwnerRecoveryRead} from '../../../lib/server/operations/authenticated-recovery-read';
import {readProfile} from '../../../lib/server/profiles/read';
import type {PoolClient} from 'pg';
import {registerOwnedRestoredRuntimeProcess,requireOwnedRestoredRuntimeEnvironment,verifyOwnedRestoredRequiredObjects,mintOwnedRestoreTarget,bindOwnedRestoredSource,withOwnedRestoreTarget,requireOwnedRestoreConnection,withOwnedRestoredRuntime} from '../../../lib/server/operations/owned-restore-target';
import {restoreOwnedWorkDump} from '../../../lib/server/operations/pg-restore';
import {measureRestoredWorkIntegrity,requireMeasuredWorkIntegrity} from '../../../lib/server/operations/restored-work-integrity';
import {it,expect} from 'vitest';
import {Client} from 'pg';
import {mkdir,mkdtemp,writeFile,readFile,rm,readdir,copyFile,chmod,cp} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureOwnedRecoveryCandidate} from '../../../lib/server/operations/capture-candidate';
import {pilotRecovery} from '../../../scripts/pilot-recovery';
import {pilotSource} from '../../../scripts/pilot-source';
import {workCaptureCandidateSchema,type WorkCaptureCandidate} from '../../../lib/contracts/pilot-capture';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {objectKey,environmentObjectId} from '../../../lib/server/storage/private-objects';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {observeWorkforceRecovery} from '../../fixtures/pilot/workforce-recovery-diagnostics';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';

it.each(['artifact','report','workforce','gap','command'] as const)('%s authenticates separate encrypted work bytes, restores accepted content and six stores, and quarantines authority',async surface=>{
 if(!['artifact','report','workforce','gap','command'].includes(surface))throw Error('Exact recovery surface required');
 const preparation=process.env.TURAS_PILOT_UI_PREPARATION_FILE,renderer=process.env.TURAS_PILOT_RENDERER_IMAGE??(preparation?parsePilotImagePreparation(await readFile(preparation)).images.find(image=>image.kind==='renderer')?.localImageId:undefined);
 if(!renderer||!/^sha256:[a-f0-9]{64}$/.test(renderer))throw Error('Explicit prepared recovery report renderer required');
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/work-rehearsal-')),key=randomBytes(32);
 let application:OwnedRecoveryApplication|undefined;
 let sourceGap:{jsonExportId:string;exportId:string;reportId:string;revisionId:string;workspaceId:string;digest:string;sizeBytes:number;objectKey:string}|undefined;
 let sourceWorkforce:{importId:string;sourceId:string;versionId:string;workspaceId:string;digest:string;bytes:Buffer}|undefined;
 let sourceReport:{artifactId:string;reportId:string;revisionId:string;customerId:string;workspaceId:string;digest:string;sizeBytes:number;objectKey:string}|undefined;
 let candidate:WorkCaptureCandidate|undefined,sourceEnvironmentId='',sourceProfile:{workspaceId:string;customerId:string;revisionId:string;artifactVersionId:string}|undefined;
 try{
  await mkdir(join(root,'keys'),{mode:0o700});await writeFile(join(root,'keys','key'),key,{mode:0o600});await mkdir(join(root,'cold'),{mode:0o700});
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    sourceEnvironmentId=environment.environmentId;const profile=await pilotPublishedKnowledgeFixture(db as any,'primary');
    if(surface==='workforce')await db.query(`WITH added AS (
     INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
     SELECT gen_random_uuid(),$1,'Synthetic inventory-only profile '||n,true FROM generate_series(1,260) n RETURNING id,workspace_id)
     INSERT INTO customer_profile_state(customer_id,workspace_id) SELECT id,workspace_id FROM added`,[profile.actor.workspaceId]);
    await db.query('BEGIN');const original=Buffer.from('Synthetic work restore artifact'),source=await createArtifactDatabaseFixture(db as unknown as PoolClient,profile.actor,profile.customerId,null,original,createHash('sha256').update(original).digest('hex'));await db.query("UPDATE artifact_extraction_runs SET state='published',scan_receipt='{}',coverage='{\"total\":1,\"visited\":1,\"omitted\":[]}',manifest_digest=$2,published_at=now() WHERE id=$1",[source.runId,source.originalDigest]);await db.query("UPDATE artifact_versions SET state='processing' WHERE id=$1",[source.versionId]);await db.query("UPDATE artifact_versions SET state='ready',submitted_at=now() WHERE id=$1",[source.versionId]);sourceProfile={workspaceId:profile.actor.workspaceId,customerId:profile.customerId,revisionId:profile.originalRevisionId,artifactVersionId:source.versionId};await db.query('COMMIT');
    process.env.TURAS_PILOT_RENDERER_IMAGE=renderer;process.env.TURAS_REPORTS_ENABLED='true';
    const baseline=await reportsDeliveryFixture(),activity=await addReviewedReportActivity(baseline,{narrative:'Controlled normally reviewed recovery byte fixture.'});
    const delivery={plan:{created:baseline.created,content:baseline.content,decision:baseline.decision},engagementId:baseline.engagementId,baselineId:baseline.baselineId,activity};
    const reports=await pilotLoadReportFixture(db as unknown as PoolClient,{actors:[baseline.reviewer,baseline.author],customers:[{id:baseline.customerId}]},delivery,environment.signal);
    const report=reports.reports[1],publication=await previewReportPublication(baseline.reviewer,report.reportId,{action:'publish',expectedVersion:report.version});
    await submitReportPublicationDecision(baseline.reviewer,report.reportId,{action:'publish',expectedVersion:report.version,requestKey:randomUUID(),rationale:'Review normally rendered synthetic recovery artifact',previewId:publication.previewId,previewDigest:publication.previewDigest});
    const reportArtifacts=(await db.query('SELECT a.*,r.report_id FROM report_artifacts a JOIN report_revisions r ON r.id=a.revision_id ORDER BY a.id')).rows;expect(reportArtifacts).toHaveLength(4);
    const pdf=reportArtifacts.find(row=>row.revision_id===report.revisionId&&row.format==='pdf');if(!pdf)throw Error('Normally rendered published PDF missing');
    sourceReport={artifactId:pdf.id,reportId:pdf.report_id,revisionId:pdf.revision_id,customerId:pdf.customer_id,workspaceId:pdf.workspace_id,digest:pdf.content_digest,sizeBytes:Number(pdf.size_bytes),objectKey:pdf.object_key};
    if(!preparation)throw Error('Explicit prepared workforce recovery images required');
    const images=parsePilotImagePreparation(await readFile(preparation)),parser=images.images.find(image=>image.kind==='parser')!,scanner=images.images.find(image=>image.kind==='scanner')!,preparedStore=join(dirname(preparation),'store');
    process.env.TURAS_PILOT_PARSER_IMAGE=parser.localImageId;process.env.TURAS_PILOT_SCANNER_IMAGE=scanner.localImageId;
    await cp(join(preparedStore,'signatures'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'signatures'),{recursive:true});
    await cp(join(preparedStore,'assets'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'assets'),{recursive:true});
    await writeFile(join(process.env.TURAS_WORKFORCE_STORE_ROOT!,'runtime-images.json'),JSON.stringify({contract:'workforce-table-v1',environmentId:environment.environmentId,parserImage:parser.localImageId,parserDigest:parser.localImageId.slice(7),scannerImage:scanner.localImageId,scannerDigest:scanner.localImageId.slice(7)}),{mode:0o600});
    const personnel=Buffer.from('resource,skill\nsynthetic,web\n'),personnelDigest=createHash('sha256').update(personnel).digest('hex');
    const intent=await createImportIntent(profile.actor,{requestKey:randomUUID(),filename:'synthetic-recovery.csv',format:'csv',byteSize:personnel.length,contentDigest:personnelDigest});
    await uploadImportOriginal(profile.actor,intent.importId!,(async function*(){yield personnel;})());
    const completed=await completeImport(profile.actor,intent.importId!,{requestKey:randomUUID(),contentDigest:personnelDigest,sourceGeneration:1}),claim=await claimWorkforceImport();
    if(!claim||claim.sourceVersionId!==completed.sourceVersionId)throw Error('Exact owned workforce recovery job required');
    await observeWorkforceRecovery(surface,claim,()=>runWorkforceImport(claim,environment.signal),async()=>{expect((await readImportOriginal(profile.actor,intent.importId!)).bytes).toEqual(personnel);});
    sourceWorkforce={importId:intent.importId!,sourceId:intent.sourceId!,versionId:completed.sourceVersionId!,workspaceId:profile.actor.workspaceId,digest:personnelDigest,bytes:personnel};
    const gap=await reviewedSyntheticGap(baseline.author,baseline.reviewer),gapReceipt=await prepareGapReport(baseline.author,{...gapEnvelope(),kind:'detail',gapIds:[gap.id],asOf:new Date().toISOString(),comparisonAt:null,audience:{team:'Synthetic engineering',recipients:['Synthetic reviewer'],purpose:'Verify controlled restored engineering export'}}),[gapJob]=await claimGapReportJobs();
    if(!gapJob||gapJob.id!==gapReceipt.resultId)throw Error('Exact normal recovery gap job required');await runGapReportJob(gapJob);
    let gapReport=await readGapReport(baseline.reviewer,gapReceipt.recordId!);if(!gapReport.revision||!gapReport.document)throw Error('Prepared recovery gap report missing');
    const gapPreview=await previewGapReportReview(baseline.reviewer,gapReport.id,{...gapEnvelope(gapReport.version),action:'approve',revisionId:gapReport.revision.id,customerDisclosures:gapReport.document.customers.map(row=>row.id),audienceDigest:gapReport.revision.audienceDigest,rationale:'Exact controlled synthetic recovery export review',selfReview:false});
    await commitGapReportReview(baseline.reviewer,gapReport.id,{...gapEnvelope(gapReport.version),previewId:gapPreview.resultId,bindingDigest:gapPreview.bindingDigest});gapReport=await readGapReport(baseline.reviewer,gapReport.id);
    const exported=await admitGapExport(baseline.reviewer,gapReport.id,{...gapEnvelope(gapReport.version),format:'markdown',reviewId:gapReport.review!.id});
    gapReport=await readGapReport(baseline.reviewer,gapReport.id);const jsonExport=await admitGapExport(baseline.reviewer,gapReport.id,{...gapEnvelope(gapReport.version),format:'json',reviewId:gapReport.review!.id});
    const gapArtifacts=(await db.query('SELECT * FROM gap_export_artifacts WHERE revision_id=$1 ORDER BY id',[gapReport.revision!.id])).rows;expect(gapArtifacts).toHaveLength(2);const markdown=gapArtifacts.find(row=>row.format==='markdown');if(!markdown)throw Error('Normal markdown export missing');
    sourceGap={jsonExportId:jsonExport.resultId!,exportId:exported.resultId!,reportId:gapReport.id,revisionId:gapReport.revision!.id,workspaceId:baseline.reviewer.workspaceId,digest:markdown.content_digest,sizeBytes:Number(markdown.size_bytes),objectKey:markdown.object_key};
    const recoveryId=randomUUID(),revision=Number((await db.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environment.environmentId,recoveryId])).rows[0].revision);
    const objects=join(root,'source-objects'),workflow=join(root,'empty-workflow');await mkdir(objects,{mode:0o700});await mkdir(workflow,{mode:0o700});
    const store=new LocalPrivateObjects(objects,environment.environmentId,10485760);
    for(const namespace of activeObjectNamespaces){await mkdir(join(objects,'e_'+environmentObjectId(environment.environmentId),namespace),{recursive:true,mode:0o700});const bytes=Buffer.from('Synthetic work restore '+namespace),digest=createHash('sha256').update(bytes).digest('hex');await store.put(objectKey(environment.environmentId,namespace,namespace.startsWith('artifact')?digest:randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});}
    for(const artifact of reportArtifacts){const bytes=await readReportObject(artifact.object_key,artifact.content_digest,Number(artifact.size_bytes));await store.put(objectKey(environment.environmentId,'report',artifact.object_key),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest:artifact.content_digest});}
    await store.put(objectKey(environment.environmentId,'workforce',sourceWorkforce.importId),(async function*(){yield await new WorkforceStore().read(sourceWorkforce!.importId);})(),{sizeBytes:personnel.length,digest:personnelDigest});
    for(const artifact of gapArtifacts){const bytes=await readGapObject(artifact.object_key,artifact.content_digest,Number(artifact.size_bytes));await store.put(objectKey(environment.environmentId,'gap-report',artifact.object_key),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest:artifact.content_digest});}
    const owned=await captureOwnedRecoveryCandidate({environmentId:environment.environmentId,recoveryId,controlRevision:revision,sourceRoot:objects,workflowRoot:workflow,keyFile:join(root,'keys','key'),keyReference:'synthetic-work-key',keyVersion:'1',output:join(root,'capture')},environment.signal);
    // This synthetic fixture supplies an empty managed-execution inventory;
    // it makes no claim to checkpoint or resume any provider workflow.
    const {providerCalls:_,...common}=owned;
    const {stableBytesCaptured:__stable,...emptyWorkflow}=owned.workflow;
    candidate=workCaptureCandidateSchema.parse({...common,contract:'pilot-work-capture-candidate-v1',modelCalls:0,mailCalls:0,workflow:{...emptyWorkflow,backend:'managed-workflow',capability:'interrupted-reconciliation',reconciliationVerified:false}});
    await copyFile(join(root,'capture','candidate.encrypted'),join(root,'cold','candidate.encrypted'));await chmod(join(root,'cold','candidate.encrypted'),0o600);
   }finally{await db.end();}
  },{postgresMajor:18,deadlineMs:180000});
  await rm(join(root,'capture'),{recursive:true,force:true});await rm(join(root,'source-objects'),{recursive:true,force:true});await rm(join(root,'empty-workflow'),{recursive:true,force:true});
  if(!candidate||!sourceProfile||!sourceReport||!sourceWorkforce||!sourceGap)throw Error('Synthetic work candidate unavailable');const captured=candidate,expectedProfile=sourceProfile,expectedReport=sourceReport,expectedWorkforce=sourceWorkforce,expectedGap=sourceGap;
  await writeFile(join(root,'cold','candidate.json'),JSON.stringify(captured),{mode:0o600});
  await withPilotEnvironment(async environment=>{
   process.env.TURAS_PILOT_RENDERER_IMAGE=renderer;
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    const ownedTarget=await mintOwnedRestoreTarget({container:environment.databaseContainer,ownerLabel:environment.databaseOwnerLabel,environmentId:environment.environmentId},environment.signal);
    const otherOwnedTarget=await mintOwnedRestoreTarget({container:environment.databaseContainer,ownerLabel:environment.databaseOwnerLabel,environmentId:environment.environmentId},environment.signal);
    expect(Object.isFrozen(ownedTarget)).toBe(true);
    await expect(mintOwnedRestoreTarget({container:environment.databaseContainer,ownerLabel:'0'.repeat(12),environmentId:environment.environmentId},environment.signal)).rejects.toThrow('Original owned');
    await db.query("UPDATE operations_control SET mode='locked'");
    const maintenanceConfiguration=join(root,'maintenance-configuration-private.json');
    await writeFile(maintenanceConfiguration,JSON.stringify({contract:'pilot-owned-maintenance-configuration-v1',environmentId:captured.environmentId,...await pilotSource(),password:process.env.TURAS_DEMO_PASSWORD,rendererImage:renderer}),{mode:0o600});
    const result=await pilotRecovery(['--restore-work-isolated','--environment',captured.environmentId,'--candidate',join(root,'cold','candidate.json'),'--bundle',join(root,'cold','candidate.encrypted'),'--key-file',join(root,'keys','key'),'--output',join(root,'restore'),...(surface==='command'?['--maintenance-configuration',maintenanceConfiguration]:[])]);
    expect(result).toMatchObject({acceptedContentVerified:true,ledgerVerified:true,objectsVerified:true,objectCount:13,requiredOriginals:{requiredObjectCount:8,requiredOriginalsVerified:true,serviceVerified:false,restorationReady:false},requiredScopeQuarantined:true,currentAuthorityVerified:false,permanentReplayVerified:false,workflowReconciled:false,restorationReady:false,mode:'locked'});
    if(surface==='command'){
    if(!('maintenance' in result)||!result.maintenance)throw Error('Actual command maintenance verification missing');
    expect(result.maintenance).toMatchObject({maintenanceHttpVerified:true,probeRetirementVerified:true,verifiedKinds:['artifact','execution','gap','plan','profile','report','workforce'],currentAuthorityVerified:false,ordinaryServiceVerified:false,workflowReconciled:false,requiredScopeHealthy:false,restorationReady:false});
    expect(result.maintenance.verifiedRecords).toBeGreaterThan(0);expect(result.maintenance.verifiedOriginalBytes).toBeGreaterThan(0);
    return;
    }
    if(!('physicalIntegrity' in result))throw Error('Measured physical checkpoint missing');
    const proof=result.physicalIntegrity,scope={environmentId:sourceEnvironmentId,recoveryId:proof.recoveryId,controlRevision:proof.controlRevision},storeRoot=join(root,'restore','objects');
    expect(Object.isFrozen(proof)).toBe(true);expect(proof.restorationReady).toBe(false);expect(proof.acceptedContentDigest).toBe(captured.acceptedContentDigest);expect(proof.objectCount).toBe(13);
    await db.query('BEGIN');
    expect(await requireMeasuredWorkIntegrity(db,proof,scope,storeRoot,environment.signal)).toBe(proof);
    await expect(requireMeasuredWorkIntegrity(db,JSON.parse(JSON.stringify(proof)),scope,storeRoot,environment.signal)).rejects.toThrow('Actual measured');
    const foreign=join(root,'foreign-objects');await mkdir(foreign,{mode:0o700});
    await expect(requireMeasuredWorkIntegrity(db,proof,scope,foreign,environment.signal)).rejects.toThrow('target changed');
    await db.query('COMMIT');
    await expect(bindOwnedRestoredSource(ownedTarget,JSON.parse(JSON.stringify(proof)),storeRoot,environment.signal)).rejects.toThrow('Actual measured');
    await bindOwnedRestoredSource(ownedTarget,proof,storeRoot,environment.signal);
    await bindOwnedRestoredSource(otherOwnedTarget,proof,storeRoot,environment.signal);
    const maintenance=await deriveOwnedMaintenanceInventory(ownedTarget,scope,environment.signal);
    expect(maintenance.requiredOriginals.requiredObjectCount).toBe(8);
    if(surface==='workforce'){expect(maintenance.records.filter(record=>record.kind==='profile').length).toBeGreaterThanOrEqual(260);expect(maintenance.records.length).toBeGreaterThan(256);expect(maintenance.records.length).toBeLessThanOrEqual(1024);}
    expect([...new Set(maintenance.records.map(record=>record.kind))].sort()).toEqual(['artifact','execution','gap','plan','profile','report','workforce']);
    expect(maintenance.requiredScopeHealthy).toBe(false);expect(maintenance.restorationReady).toBe(false);
    const foreignOwner=randomUUID(),workforceOwner=(await db.query('SELECT owner_membership_id FROM workforce_import_intents WHERE id=$1',[expectedWorkforce.importId])).rows[0].owner_membership_id;
    await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[foreignOwner,DEMO_IDS.panel,expectedWorkforce.workspaceId]);
    await db.query('ALTER TABLE workforce_import_intents DISABLE TRIGGER USER');
    try{
     await db.query('UPDATE workforce_import_intents SET owner_membership_id=$2 WHERE id=$1',[expectedWorkforce.importId,foreignOwner]);
     await expect(deriveOwnedMaintenanceInventory(ownedTarget,scope,environment.signal)).rejects.toThrow('Workforce owner maintenance unsupported');
    }finally{await db.query('UPDATE workforce_import_intents SET owner_membership_id=$2 WHERE id=$1',[expectedWorkforce.importId,workforceOwner]);await db.query('ALTER TABLE workforce_import_intents ENABLE TRIGGER USER');await db.query('DELETE FROM memberships WHERE id=$1',[foreignOwner]);}
    const jsonReceipt=(await db.query('SELECT state FROM gap_export_receipts WHERE id=$1',[expectedGap.jsonExportId])).rows[0];
    await db.query('ALTER TABLE gap_export_receipts DISABLE TRIGGER USER');
    try{
     await db.query("UPDATE gap_export_receipts SET state='cancelled' WHERE id=$1",[expectedGap.jsonExportId]);
     await expect(deriveOwnedMaintenanceInventory(ownedTarget,scope,environment.signal)).rejects.toThrow('Current gap original lacks owner export authority');
    }finally{await db.query('UPDATE gap_export_receipts SET state=$2 WHERE id=$1',[expectedGap.jsonExportId,jsonReceipt.state]);await db.query('ALTER TABLE gap_export_receipts ENABLE TRIGGER USER');}
    const gapObjects=await new LocalPrivateObjects(storeRoot,scope.environmentId,10485760).list('gap-report'),gapKeys=new Set((await db.query('SELECT object_key::text AS key FROM gap_report_store_objects')).rows.map(row=>row.key));
    const orphan=gapObjects.objects.find(object=>!gapKeys.has(object.key.split('/').at(-1)));if(!orphan)throw Error('Captured unattached gap original absent');
    const orphanId=orphan.key.split('/').at(-1)!,jobId=(await db.query('SELECT job_id FROM gap_report_revisions WHERE id=$1',[expectedGap.revisionId])).rows[0].job_id;
    await db.query('ALTER TABLE gap_report_store_objects DISABLE TRIGGER USER');
    try{
     await db.query("INSERT INTO gap_report_store_objects(object_key,environment_id,workspace_id,job_id,revision_id,format,content_digest,size_bytes,state) VALUES($1,$2,$3,$4,$5,'markdown',$6,$7,'attached')",[orphanId,scope.environmentId,expectedGap.workspaceId,jobId,expectedGap.revisionId,orphan.digest,orphan.sizeBytes]);
     await expect(deriveOwnedMaintenanceInventory(ownedTarget,scope,environment.signal)).rejects.toThrow('Current approved gap original lacks artifact authority');
    }finally{await db.query('DELETE FROM gap_report_store_objects WHERE object_key=$1',[orphanId]);await db.query('ALTER TABLE gap_report_store_objects ENABLE TRIGGER USER');}
    expect((await deriveOwnedMaintenanceInventory(ownedTarget,scope,environment.signal)).inventoryDigest).toBe(maintenance.inventoryDigest);
    await expect(withOwnedRestoreTarget(JSON.parse(JSON.stringify(ownedTarget)),scope,environment.signal,async()=>{})).rejects.toThrow('Actual owned restore target');
    await expect(withOwnedRestoreTarget(ownedTarget,{...scope,recoveryId:randomUUID()},environment.signal,async()=>{})).rejects.toThrow('Actual bound');
    await withOwnedRestoreTarget(ownedTarget,scope,environment.signal,async owner=>{
     expect(await requireOwnedRestoreConnection(owner,ownedTarget,scope,environment.signal)).toBe(proof);
     await owner.query('BEGIN');
     try{expect(await verifyOwnedRestoredRequiredObjects(owner,ownedTarget,scope,environment.signal)).toMatchObject({requiredObjectCount:8,requiredOriginalsVerified:true,serviceVerified:false,restorationReady:false});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
     const originalArtifact=(await owner.query('SELECT object_key FROM artifact_versions WHERE id=$1',[expectedProfile.artifactVersionId])).rows[0].object_key;
     // Deliberately corrupt only the disposable ledger's object reference. A
     // byte-perfect archive inventory must not hide a missing required original.
     await owner.query('ALTER TABLE artifact_versions DISABLE TRIGGER USER');
     try{
      await owner.query('UPDATE artifact_versions SET object_key=$2 WHERE id=$1',[expectedProfile.artifactVersionId,'0'.repeat(64)]);
      await owner.query('BEGIN');try{await expect(verifyOwnedRestoredRequiredObjects(owner,ownedTarget,scope,environment.signal)).rejects.toThrow('coverage differs');}finally{await owner.query('ROLLBACK');}
     }finally{await owner.query('UPDATE artifact_versions SET object_key=$2 WHERE id=$1',[expectedProfile.artifactVersionId,originalArtifact]);await owner.query('ALTER TABLE artifact_versions ENABLE TRIGGER USER');}

     await expect(requireOwnedRestoreConnection(db,ownedTarget,scope,environment.signal)).rejects.toThrow('Actual bound');
     const previous=process.env.TURAS_ENVIRONMENT_ID;process.env.TURAS_ENVIRONMENT_ID=sourceEnvironmentId;
     try{expect(()=>requireOwnedPilotDatabase(process.env,true)).toThrow('owning runner');expect(await requireOwnedRestoreConnection(owner,ownedTarget,scope,environment.signal)).toBe(proof);}
     finally{process.env.TURAS_ENVIRONMENT_ID=previous;}
    });
    let releaseDetached!:()=>void,detached:Promise<unknown>|undefined;
    const afterScope=new Promise<void>(done=>{releaseDetached=done;});
    await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,async owner=>{
     detached=afterScope.then(()=>getServerConfig());
     expect(getServerConfig().TURAS_ENVIRONMENT_ID).toBe(sourceEnvironmentId);
     expect(process.env.TURAS_ENVIRONMENT_ID).toBe(environment.environmentId);
     await owner.query('BEGIN');
     try{
      await withAuthenticatedOwnerRecoveryRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,password:process.env.TURAS_DEMO_PASSWORD!,deadline:Date.now()+60000},async actor=>{
       const profile=await readProfile(actor,expectedProfile.customerId,owner as unknown as PoolClient,undefined,undefined,false,true) as {customer:{id:string};acceptedFacts:{id:string}[]};
       expect(profile.customer.id).toBe(expectedProfile.customerId);expect(profile.acceptedFacts.some(fact=>fact.id===expectedProfile.revisionId)).toBe(true);
      });await owner.query('COMMIT');
     }catch(error){await owner.query('ROLLBACK');throw error;}
    });
    releaseDetached();await expect(detached).rejects.toThrow('Recovery configuration scope ended');
    expect(getServerConfig().TURAS_ENVIRONMENT_ID).toBe(environment.environmentId);
    const priorRuntime=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://synthetic:synthetic@127.0.0.1:1/turas_test_016_eval_aaaaaaaaaaaa';
    try{await expect(withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,async()=>{})).rejects.toThrow('configuration database differs');}
    finally{process.env.DATABASE_URL=priorRuntime;}
    await expect(withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,async()=>{throw Error('Controlled scoped read failure');})).rejects.toThrow('Controlled scoped read failure');
    expect(getServerConfig().TURAS_ENVIRONMENT_ID).toBe(environment.environmentId);
    // Real SQL rollback and ambiguous COMMIT acknowledgments must both close
    // the role and leave an explicitly repeatable owned operation.
    const originalQuery=Client.prototype.query;
    async function interruptedPreparation(afterCommit:boolean){
     let failNext=true;
     Client.prototype.query=function(this:Client,...args:any[]){
      if(failNext&&args[0]==='COMMIT'){
       failNext=false;
       if(afterCommit)return (originalQuery as any).apply(this,args).then(()=>{throw Error('Controlled commit acknowledgment loss');});
       return Promise.reject(Error('Controlled preparation rollback'));
      }
      return (originalQuery as any).apply(this,args);
     } as typeof Client.prototype.query;
     try{await expect(withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async()=>{throw Error('Unexpected runtime callback');})).rejects.toThrow(afterCommit?'Controlled commit acknowledgment loss':'Controlled preparation rollback');}
     finally{Client.prototype.query=originalQuery;}
     expect(failNext).toBe(false);
     expect((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rowCount).toBe(0);
     expect((await db.query("SELECT 1 FROM pg_auth_members WHERE member='turas_runtime_016'::regrole")).rowCount).toBe(0);
    }
    const recoveryApplication=await prepareOwnedRecoveryApplication({target:ownedTarget,scope,signal:environment.signal,deadline:Date.now()+120000});application=recoveryApplication;
    await warmOwnedRecoveryApplication(recoveryApplication,environment.signal);
    await interruptedPreparation(false);
    async function verifyRuntimePhase(kinds:readonly ('artifact'|'report'|'workforce'|'gap')[]){
    let phase='runtime-admission';const started=Date.now();
    try{await withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async(runtime,_signal,applicationEnvironment)=>{
     expect(()=>requireOwnedRestoredRuntimeEnvironment(ownedTarget,scope,JSON.parse(JSON.stringify(applicationEnvironment)))).toThrow('Actual active');
     expect(()=>requireOwnedRestoredRuntimeEnvironment(otherOwnedTarget,scope,applicationEnvironment)).toThrow('Actual active');
     phase='application-start';
     return withOwnedRecoveryApplication(recoveryApplication,applicationEnvironment,_signal,async()=>{
     const fetch:typeof globalThis.fetch=(input,init)=>globalThis.fetch(input,{...init,signal:AbortSignal.any([_signal,...(init?.signal?[init.signal]:[])])});
     phase='shared-profile-controls';
     expect((await runtime.query('SELECT current_user,session_user')).rows[0]).toEqual({current_user:'turas_runtime_016',session_user:'turas_runtime_016'});
     expect((await runtime.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
     await expect(runtime.query("UPDATE operations_control SET mode='open'")).rejects.toMatchObject({code:'42501'});
     await expect(runtime.query('CREATE TABLE runtime_escalation(id int)')).rejects.toMatchObject({code:'42501'});
     await expect(withOwnedRestoredRuntime(ownedTarget,scope,_signal,async()=>{})).rejects.toThrow('already active');
     await expect(withOwnedRestoredRuntime(otherOwnedTarget,scope,_signal,async()=>{})).rejects.toThrow('database lease active');
     expect(applicationEnvironment.TURAS_PRIVATE_OBJECT_BACKEND).toBe('local');
     const artifactNames=await readdir(join(applicationEnvironment.TURAS_ARTIFACT_STORE_ROOT,'objects'));expect(artifactNames).toHaveLength(1);expect(await readFile(join(applicationEnvironment.TURAS_ARTIFACT_STORE_ROOT,'objects',artifactNames[0]),'utf8')).toBe('Synthetic work restore artifact');
     let httpAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
     try{
    await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,async owner=>{
     await owner.query('BEGIN');
     try{httpAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,customerId:expectedProfile.customerId,deadline:Date.now()+59000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:3,deploymentId:null});await owner.query('COMMIT');}
     catch(error){await owner.query('ROLLBACK');throw error;}
    });
    if(!httpAdmission)throw Error('Actual owner-issued HTTP admission missing');
    const admission=httpAdmission;

      phase='shared-profile-controls';
      const path=recoveryApplication.origin+'/api/operations/recovery-read/'+admission.id+'/profile';
      const cookie=sessionCookie(admission.actor.token,admission.actor.expiresAt).split(';')[0];
      const headers={cookie,'x-turas-recovery-read':admission.secret,host:new URL(recoveryApplication.origin).host};
      await runtime.query('BEGIN');
      try{await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,()=>authenticateRecoveryHttpRead(runtime as unknown as PoolClient,new Request(path,{headers}),admission.id,false));await runtime.query('COMMIT');}
      catch(error){await runtime.query('ROLLBACK');throw error;}
      const noSecret=await fetch(path,{headers:{cookie},redirect:'manual'});expect(noSecret.status).toBe(403);await noSecret.body?.cancel();
      const noSession=await fetch(path,{headers:{'x-turas-recovery-read':admission.secret},redirect:'manual'});expect(noSession.status).toBe(403);await noSession.body?.cancel();
      const normal=await fetch(recoveryApplication.origin+'/api/customers/'+expectedProfile.customerId+'/profile',{headers,redirect:'manual'});expect([401,503]).toContain(normal.status);await normal.body?.cancel();
      const response=await fetch(path,{headers,redirect:'manual'});if(response.status!==200){const failure=await response.json() as {error:{code:string}};throw Error('Recovery HTTP denied: '+response.status+' '+failure.error.code);}expect(response.status).toBe(200);
      const body=await response.json() as {data:{customer:{id:string};acceptedFacts:{id:string}[]}};
      if(kinds.includes('artifact')){
      phase='artifact-controls';
      let artifactAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,async owner=>{await owner.query('BEGIN');try{artifactAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,customerId:expectedProfile.customerId,deadline:Date.now()+20000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:2,deploymentId:null,readKind:'artifact',recordId:expectedProfile.artifactVersionId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}});
      if(!artifactAdmission)throw Error('Actual artifact admission missing');
      const reverseKind=await fetch(path.replace('/profile','/artifact'),{headers,redirect:'manual'});expect(reverseKind.status).toBe(403);await reverseKind.body?.cancel();
      const artifactProof=artifactAdmission,artifactPath=recoveryApplication.origin+'/api/operations/recovery-read/'+artifactProof.id+'/artifact',artifactHeaders={cookie:sessionCookie(artifactProof.actor.token,artifactProof.actor.expiresAt).split(';')[0],'x-turas-recovery-read':artifactProof.secret};
      try{
       const wrongKind=await fetch(artifactPath.replace('/artifact','/profile'),{headers:artifactHeaders,redirect:'manual'});expect(wrongKind.status).toBe(403);await wrongKind.body?.cancel();
       await db.query('UPDATE operations_recovery_http_reads SET record_generation=record_generation+1 WHERE id=$1',[artifactProof.id]);
       try{const changed=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(changed.status).toBe(403);await changed.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_generation=record_generation-1 WHERE id=$1',[artifactProof.id]);}
       await db.query('UPDATE operations_recovery_http_reads SET record_digest=$2 WHERE id=$1',[artifactProof.id,'0'.repeat(64)]);
       try{const changed=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(changed.status).toBe(403);await changed.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_digest=$2 WHERE id=$1',[artifactProof.id,createHash('sha256').update('Synthetic work restore artifact').digest('hex')]);}
       const originalResponse=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(originalResponse.status).toBe(200);expect(Buffer.from(await originalResponse.arrayBuffer()).toString()).toBe('Synthetic work restore artifact');
       const ordinary=await fetch(recoveryApplication.origin+'/api/artifacts/'+expectedProfile.artifactVersionId+'/original',{headers:artifactHeaders,redirect:'manual'});expect([401,403,503]).toContain(ordinary.status);await ordinary.body?.cancel();
       const deniedRange=await fetch(artifactPath,{headers:{...artifactHeaders,range:'bytes=0-2'},redirect:'manual'});expect(deniedRange.status).toBe(403);await deniedRange.body?.cancel();
       const canonicalPath=join(applicationEnvironment.TURAS_ARTIFACT_STORE_ROOT,'objects',artifactNames[0]);await writeFile(canonicalPath,Buffer.alloc(Buffer.byteLength('Synthetic work restore artifact')),{mode:0o600});
       try{const corrupt=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(corrupt.status).toBe(503);await corrupt.body?.cancel();}finally{await writeFile(canonicalPath,'Synthetic work restore artifact',{mode:0o600});}
       const exhausted=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(exhausted.status).toBe(429);await exhausted.body?.cancel();

      }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,artifactProof.id);}
      }

      if(kinds.includes('report')){
      phase='report-controls';
      let reportAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,async owner=>{await owner.query('BEGIN');try{reportAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedReport.workspaceId,customerId:expectedReport.customerId,deadline:Date.now()+20000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:2,deploymentId:null,readKind:'report',recordId:expectedReport.artifactId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}});
      if(!reportAdmission)throw Error('Actual report admission missing');
      const reportProof=reportAdmission,reportPath=recoveryApplication.origin+'/api/operations/recovery-read/'+reportProof.id+'/report',reportHeaders={cookie:sessionCookie(reportProof.actor.token,reportProof.actor.expiresAt).split(';')[0],'x-turas-recovery-read':reportProof.secret};
      try{
       const wrongType=await fetch(reportPath.replace('/report','/artifact'),{headers:reportHeaders,redirect:'manual'});expect(wrongType.status).toBe(403);await wrongType.body?.cancel();
       await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[reportProof.id,randomUUID()]);
       try{const drift=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(drift.status).toBe(403);await drift.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[reportProof.id,expectedReport.revisionId]);}
       await db.query('UPDATE operations_recovery_http_reads SET record_parent_id=$2 WHERE id=$1',[reportProof.id,randomUUID()]);
       try{const drift=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(drift.status).toBe(403);await drift.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_parent_id=$2 WHERE id=$1',[reportProof.id,expectedReport.reportId]);}
       const reportResponse=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});if(reportResponse.status!==200){const failure=await reportResponse.json() as {error:{code:string}};throw Error('Recovery report HTTP denied: '+reportResponse.status+' '+failure.error.code);}expect(reportResponse.status).toBe(200);expect(reportResponse.headers.get('content-type')).toBe('application/pdf');const bytes=Buffer.from(await reportResponse.arrayBuffer());expect(bytes.length).toBe(expectedReport.sizeBytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedReport.digest);
       const ordinary=await fetch(recoveryApplication.origin+'/api/reports/artifacts/'+expectedReport.artifactId,{headers:reportHeaders,redirect:'manual'});expect([401,403,503]).toContain(ordinary.status);await ordinary.body?.cancel();
       const copied=join(applicationEnvironment.TURAS_REPORT_STORE_ROOT,'objects',expectedReport.objectKey);await writeFile(copied,Buffer.alloc(bytes.length),{mode:0o600});
       try{const corrupt=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(corrupt.status).toBe(503);await corrupt.body?.cancel();}finally{await writeFile(copied,bytes,{mode:0o600});}
       const exhausted=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(exhausted.status).toBe(429);await exhausted.body?.cancel();
      }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,reportProof.id);}
      }
      if(kinds.includes('workforce')){
      phase='workforce-controls';
      let workforceAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,async owner=>{await owner.query('BEGIN');try{workforceAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedWorkforce.workspaceId,customerId:null,deadline:Date.now()+20000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:2,deploymentId:null,readKind:'workforce',recordId:expectedWorkforce.importId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}});
      if(!workforceAdmission)throw Error('Actual workforce admission missing');
      const workforceProof=workforceAdmission,workforcePath=recoveryApplication.origin+'/api/operations/recovery-read/'+workforceProof.id+'/workforce',workforceHeaders={cookie:sessionCookie(workforceProof.actor.token,workforceProof.actor.expiresAt).split(';')[0],'x-turas-recovery-read':workforceProof.secret};
      try{
       const wrongType=await fetch(workforcePath.replace('/workforce','/profile'),{headers:workforceHeaders,redirect:'manual'});expect(wrongType.status).toBe(403);await wrongType.body?.cancel();
       await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[workforceProof.id,randomUUID()]);
       try{const drift=await fetch(workforcePath,{headers:workforceHeaders,redirect:'manual'});expect(drift.status).toBe(403);await drift.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[workforceProof.id,expectedWorkforce.versionId]);}
       const wrongSession=await fetch(workforcePath,{headers:{...workforceHeaders,cookie},redirect:'manual'});expect(wrongSession.status).toBe(403);await wrongSession.body?.cancel();
       const otherWorkspace=(await db.query('SELECT id FROM workspaces WHERE id<>$1 ORDER BY id LIMIT 1',[expectedWorkforce.workspaceId])).rows[0].id;
       await db.query('UPDATE operations_recovery_http_reads SET workspace_id=$2 WHERE id=$1',[workforceProof.id,otherWorkspace]);
       try{const denied=await fetch(workforcePath,{headers:workforceHeaders,redirect:'manual'});expect(denied.status).toBe(403);await denied.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET workspace_id=$2 WHERE id=$1',[workforceProof.id,expectedWorkforce.workspaceId]);}
       await db.query('UPDATE operations_recovery_http_reads SET record_generation=record_generation+1 WHERE id=$1',[workforceProof.id]);
       try{const drift=await fetch(workforcePath,{headers:workforceHeaders,redirect:'manual'});expect(drift.status).toBe(403);await drift.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_generation=record_generation-1 WHERE id=$1',[workforceProof.id]);}
       const original=await fetch(workforcePath,{headers:workforceHeaders,redirect:'manual'});if(original.status!==200){const failed=await original.json() as {error:{code:string}};throw Error('Recovery workforce HTTP denied: '+original.status+' '+failed.error.code);}expect(Buffer.from(await original.arrayBuffer())).toEqual(expectedWorkforce.bytes);
       const ordinary=await fetch(recoveryApplication.origin+'/api/staffing/imports/'+expectedWorkforce.importId+'/content',{headers:workforceHeaders,redirect:'manual'});expect([401,403,503]).toContain(ordinary.status);await ordinary.body?.cancel();
       const copied=join(applicationEnvironment.TURAS_WORKFORCE_STORE_ROOT,'objects',expectedWorkforce.importId);await writeFile(copied,Buffer.alloc(expectedWorkforce.bytes.length),{mode:0o600});
       try{const corrupt=await fetch(workforcePath,{headers:workforceHeaders,redirect:'manual'});expect(corrupt.status).toBe(503);await corrupt.body?.cancel();}finally{await writeFile(copied,expectedWorkforce.bytes,{mode:0o600});}
       const exhausted=await fetch(workforcePath,{headers:workforceHeaders,redirect:'manual'});expect(exhausted.status).toBe(429);await exhausted.body?.cancel();
      }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,workforceProof.id);}
      }
      if(kinds.includes('gap')){
      phase='gap-controls';
      let gapAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,async owner=>{await owner.query('BEGIN');try{gapAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedGap.workspaceId,customerId:null,deadline:Date.now()+20000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:3,deploymentId:null,readKind:'gap',recordId:expectedGap.exportId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}});
      if(!gapAdmission)throw Error('Actual gap admission missing');
      const gapProof=gapAdmission,gapPath=recoveryApplication.origin+'/api/operations/recovery-read/'+gapProof.id+'/gap',gapHeaders={cookie:sessionCookie(gapProof.actor.token,gapProof.actor.expiresAt).split(';')[0],'x-turas-recovery-read':gapProof.secret};
      try{
       const wrongType=await fetch(gapPath.replace('/gap','/report'),{headers:gapHeaders,redirect:'manual'});expect(wrongType.status).toBe(403);await wrongType.body?.cancel();
       const wrongSession=await fetch(gapPath,{headers:{...gapHeaders,cookie},redirect:'manual'});expect(wrongSession.status).toBe(403);await wrongSession.body?.cancel();
       await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[gapProof.id,randomUUID()]);
       try{const drift=await fetch(gapPath,{headers:gapHeaders,redirect:'manual'});expect(drift.status).toBe(403);await drift.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[gapProof.id,expectedGap.revisionId]);}
       const approved=(await db.query('SELECT approved_review_id FROM gap_reports WHERE id=$1',[expectedGap.reportId])).rows[0].approved_review_id;
       await db.query('UPDATE gap_reports SET approved_review_id=NULL WHERE id=$1',[expectedGap.reportId]);
       try{const denied=await fetch(gapPath,{headers:gapHeaders,redirect:'manual'});expect(denied.status).toBe(403);await denied.body?.cancel();}finally{await db.query('UPDATE gap_reports SET approved_review_id=$2 WHERE id=$1',[expectedGap.reportId,approved]);}
       const exported=await fetch(gapPath,{headers:gapHeaders,redirect:'manual'});if(exported.status!==200){const failed=await exported.json() as {error:{code:string}};throw Error('Recovery gap HTTP denied: '+exported.status+' '+failed.error.code);}const bytes=Buffer.from(await exported.arrayBuffer());expect(bytes.length).toBe(expectedGap.sizeBytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedGap.digest);expect(exported.headers.get('x-turas-content-digest')).toBe(expectedGap.digest);
       expect((await db.query('SELECT state FROM gap_export_receipts WHERE id=$1',[expectedGap.exportId])).rows[0].state).toBe('completed');
       const settled=(await db.query('SELECT state,version,lease_token,lease_until,completed_at FROM gap_export_receipts WHERE id=$1',[expectedGap.exportId])).rows[0];expect(settled.lease_until).toBeNull();
       await db.query('UPDATE gap_report_revision_states SET invalidated_at=clock_timestamp() WHERE revision_id=$1',[expectedGap.revisionId]);
       try{const withheld=await fetch(gapPath,{headers:gapHeaders,redirect:'manual'});expect(withheld.status).toBe(409);await withheld.body?.cancel();}finally{await db.query('UPDATE gap_report_revision_states SET invalidated_at=NULL WHERE revision_id=$1',[expectedGap.revisionId]);}
       expect((await db.query('SELECT state,version,lease_token,lease_until,completed_at FROM gap_export_receipts WHERE id=$1',[expectedGap.exportId])).rows[0]).toEqual(settled);
       const ordinary=await fetch(recoveryApplication.origin+'/api/product-gaps/reports/'+expectedGap.reportId+'/exports/'+expectedGap.exportId,{headers:gapHeaders,redirect:'manual'});expect([401,403,503]).toContain(ordinary.status);await ordinary.body?.cancel();
       const copied=join(applicationEnvironment.TURAS_REPORT_STORE_ROOT,'objects',expectedGap.objectKey);await writeFile(copied,Buffer.alloc(bytes.length),{mode:0o600});
       try{const corrupt=await fetch(gapPath,{headers:gapHeaders,redirect:'manual'});expect(corrupt.status).toBe(503);await corrupt.body?.cancel();}finally{await writeFile(copied,bytes,{mode:0o600});}
       expect((await db.query('SELECT state,version,lease_token,lease_until,completed_at FROM gap_export_receipts WHERE id=$1',[expectedGap.exportId])).rows[0]).toEqual(settled);
       const exhausted=await fetch(gapPath,{headers:gapHeaders,redirect:'manual'});expect(exhausted.status).toBe(429);await exhausted.body?.cancel();
      }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,gapProof.id);}
      }
      phase='shared-concurrency-controls';
      expect(body.data.customer.id).toBe(expectedProfile.customerId);expect(body.data.acceptedFacts.some(fact=>fact.id===expectedProfile.revisionId)).toBe(true);
      // A correctly ordered owner transition waits on the shared recovery
      // fence, then proceeds when the actual runtime read transaction closes.
      const transitioning=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await transitioning.connect();
      let waiting:Promise<unknown>|undefined;
      try{
       await runtime.query('BEGIN');await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,()=>authenticateRecoveryHttpRead(runtime as unknown as PoolClient,new Request(path,{headers}),admission.id,false));
       const pid=Number((await transitioning.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
       await transitioning.query('BEGIN');waiting=transitioning.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16017))',[scope.environmentId]);
       const until=Date.now()+3000;
       while(!(await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event='advisory'",[pid])).rowCount){if(Date.now()>until)throw Error('Owner transition did not reach recovery fence');await new Promise(done=>setTimeout(done,10));}
       await runtime.query('COMMIT');await waiting;waiting=undefined;
       await transitioning.query('SELECT mode FROM operations_control WHERE environment_id=$1 FOR UPDATE',[scope.environmentId]);await transitioning.query('ROLLBACK');
      }finally{await runtime.query('ROLLBACK');if(waiting)await waiting.catch(()=>{});await transitioning.query('ROLLBACK');await transitioning.end();}
      const concurrent=await Promise.all([fetch(path,{headers,redirect:'manual'}),fetch(path,{headers,redirect:'manual'})]);
      for(const result of concurrent){expect(result.status).toBe(200);await result.body?.cancel();}
      const exhausted=await fetch(path,{headers,redirect:'manual'});expect(exhausted.status).toBe(429);await exhausted.body?.cancel();
      await expect(runtime.query("UPDATE operations_recovery_http_reads SET secret_hash=repeat('0',64) WHERE id=$1",[admission.id])).rejects.toMatchObject({code:'42501'});
      const wrong=await fetch(path+'?customerId='+randomUUID(),{headers,redirect:'manual'});expect(wrong.status).toBe(403);await wrong.body?.cancel();
      phase='shared-binding-and-retirement-controls';
      const binding=(await db.query('SELECT database_binding_digest FROM operations_recovery_http_reads WHERE id=$1',[admission.id])).rows[0].database_binding_digest;
      await db.query("UPDATE operations_recovery_http_reads SET database_binding_digest=repeat('0',64) WHERE id=$1",[admission.id]);
      const wrongDatabase=await fetch(path,{headers,redirect:'manual'});expect(wrongDatabase.status).toBe(403);await wrongDatabase.body?.cancel();
      await db.query('UPDATE operations_recovery_http_reads SET database_binding_digest=$2 WHERE id=$1',[admission.id,binding]);
      await db.query("UPDATE operations_recovery_http_reads SET expires_at=created_at+interval '1 millisecond' WHERE id=$1",[admission.id]);
      const expired=await fetch(path,{headers,redirect:'manual'});expect(expired.status).toBe(403);await expired.body?.cancel();
      let retirementAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,async owner=>{
       await owner.query('BEGIN');try{retirementAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,customerId:expectedProfile.customerId,deadline:Date.now()+59000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:1,deploymentId:null});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
      });
      if(!retirementAdmission)throw Error('Actual retirement admission missing');
      const retiring=retirementAdmission,retirementOwner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await retirementOwner.connect();
      let closing:Promise<{error:unknown}>|undefined;
      const retirementPath=recoveryApplication.origin+'/api/operations/recovery-read/'+retiring.id+'/profile',retirementHeaders={...headers,cookie:sessionCookie(retiring.actor.token,retiring.actor.expiresAt).split(';')[0],'x-turas-recovery-read':retiring.secret};
      try{
       await runtime.query('BEGIN');await withOwnedRecoveryApplicationConfiguration(recoveryApplication,_signal,()=>authenticateRecoveryHttpRead(runtime as unknown as PoolClient,new Request(retirementPath,{headers:retirementHeaders}),retiring.id,false));
       const pid=Number((await retirementOwner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
       closing=retireOwnedRecoveryHttpRead(retirementOwner as unknown as PoolClient,retiring.id).then(()=>({error:null}),error=>({error}));
       const until=Date.now()+2000;
       while(!(await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[pid])).rowCount){if(Date.now()>until)throw Error('Retirement did not wait for its active read');await new Promise(done=>setTimeout(done,10));}
       await runtime.query('COMMIT');const result=await closing;closing=undefined;if(result.error)throw result.error;
       const revoked=await fetch(retirementPath,{headers:retirementHeaders,redirect:'manual'});expect(revoked.status).toBe(403);await revoked.body?.cancel();
       expect((await db.query('SELECT revoked_at IS NOT NULL AS revoked FROM login_sessions WHERE id=$1',[retiring.actor.sessionId])).rows[0].revoked).toBe(true);
      }finally{await runtime.query('ROLLBACK');if(closing)await closing;await retirementOwner.end();await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,retiring.id);}

     }finally{if(httpAdmission)await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,httpAdmission.id);}

    });
    });}catch(error){throw new Error(`Owned recovery ${surface} incomplete at ${phase}`,{cause:error});}finally{
    expect((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rowCount).toBe(0);
    expect((await db.query("SELECT 1 FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016')")).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM operations_recovery_http_reads a JOIN login_sessions s ON s.id=a.session_id WHERE a.environment_id=$1 AND (a.revoked_at IS NULL OR s.revoked_at IS NULL)',[sourceEnvironmentId])).rowCount).toBe(0);
    expect((await readdir(join(root,'restore'))).filter(name=>name.startsWith('canonical-runtime-'))).toEqual([]);
    }
    console.info(JSON.stringify({kind:'owned-recovery-surface-complete',surface,elapsedMs:Date.now()-started}));
    }
    // Each independent capture/restore case exercises one surface plus every
    // shared control inside the unchanged 60-second restricted runtime lease.
    await verifyRuntimePhase([surface]);
    await interruptedPreparation(true);
    await expect(withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async()=>{throw Error('Controlled runtime failure');})).rejects.toThrow('Controlled runtime failure');
    const interrupted=new AbortController();let held:Promise<boolean>|undefined,expiredEnvironment:Readonly<Record<string,string>>|undefined;
    await expect(withOwnedRestoredRuntime(ownedTarget,scope,interrupted.signal,async(_runtime,signal,environment)=>{
     expiredEnvironment=environment;
     await withOwnedProcess({command:process.execPath,args:['-e',"process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],cwd:process.cwd(),environment:{NODE_ENV:'test' as const},signal,deadline:Date.now()+10000,onProcess:process=>registerOwnedRestoredRuntimeProcess(ownedTarget,scope,environment,process)},async child=>{
      await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(Error('Controlled child readiness absent')),3000);child.stdout!.once('data',()=>{clearTimeout(timer);done();});});
      held=new Promise<boolean>(done=>setTimeout(async()=>{let alive=false;try{process.kill(-child.pid!,0);alive=true;}catch{}const present=await readdir(environment.TURAS_ARTIFACT_STORE_ROOT).then(()=>true,()=>false);done(alive&&present);},100));
      interrupted.abort(Error('Controlled runtime interrupted'));await new Promise(()=>{});
     });
    })).rejects.toThrow('interrupted');
    expect(await held).toBe(true);
    expect(()=>requireOwnedRestoredRuntimeEnvironment(ownedTarget,scope,expiredEnvironment!)).toThrow('Actual active');
    expect((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rowCount).toBe(0);
    expect((await db.query("SELECT 1 FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016')")).rowCount).toBe(0);
    expect((await readdir(join(root,'restore'))).filter(name=>name.startsWith('canonical-runtime-'))).toEqual([]);
    if(surface==='artifact'){
     const verified=await verifyOwnedMaintenanceRecovery({target:ownedTarget,scope,password:process.env.TURAS_DEMO_PASSWORD!,rendererImage:renderer,signal:environment.signal,deadline:Date.now()+150000});
     await withOwnedRecoveryApplicationConfiguration(application!,environment.signal,async decision=>{
      await decision.query('BEGIN');
      try{
       expect(await requireOwnedMaintenanceVerification(decision,ownedTarget,scope,verified,environment.signal)).toBe(verified);
       await expect(requireOwnedMaintenanceVerification(decision,ownedTarget,scope,JSON.parse(JSON.stringify(verified)),environment.signal)).rejects.toThrow('Actual fresh owned');
       await decision.query('SAVEPOINT maintenance_probe');
       await issueOwnedRecoveryHttpRead(decision as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,customerId:expectedProfile.customerId,deadline:Date.now()+59000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:1,deploymentId:null});
       await expect(requireOwnedMaintenanceVerification(decision,ownedTarget,scope,verified,environment.signal)).rejects.toThrow('Maintenance HTTP retirement incomplete');
       await decision.query('ROLLBACK TO SAVEPOINT maintenance_probe');
       await decision.query('RELEASE SAVEPOINT maintenance_probe');
       expect(await requireOwnedMaintenanceVerification(decision,ownedTarget,scope,verified,environment.signal)).toBe(verified);
       await decision.query('ALTER ROLE turas_runtime_016 LOGIN');
       await expect(requireOwnedMaintenanceVerification(decision,ownedTarget,scope,verified,environment.signal)).rejects.toThrow('Maintenance runtime retirement incomplete');
       await decision.query('ALTER ROLE turas_runtime_016 NOLOGIN');
       await decision.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[expectedProfile.customerId]);
       await expect(requireOwnedMaintenanceVerification(decision,ownedTarget,scope,verified,environment.signal)).rejects.toThrow('Maintenance verification inventory changed');
      }finally{await decision.query('ROLLBACK');}
     });
    }
    // A genuine process whose retirement fails must keep its canonical stores
    // and block future leases, even after database authority is safely closed.
    let failedChild=0,retainedRoot='';const originalKill=process.kill;
    try{
     await expect(withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async(_runtime,signal,runtimeEnvironment)=>{
      retainedRoot=dirname(runtimeEnvironment.TURAS_ARTIFACT_STORE_ROOT);
      await withOwnedProcess({command:process.execPath,args:['-e',"console.log('ready');setInterval(()=>{},1000)"],cwd:process.cwd(),environment:{NODE_ENV:'test' as const},signal,deadline:Date.now()+10000,onProcess:process=>registerOwnedRestoredRuntimeProcess(ownedTarget,scope,runtimeEnvironment,process)},async child=>{
       failedChild=child.pid!;
       await new Promise<void>((done,reject)=>{const timer=setTimeout(()=>reject(Error('Controlled cleanup child unavailable')),3000);child.stdout!.once('data',()=>{clearTimeout(timer);done();});});
       process.kill=((pid,signal)=>{if(pid===-failedChild&&signal!==0)throw Object.assign(Error('Controlled group retirement refusal'),{code:'EPERM'});return originalKill(pid,signal);}) as typeof process.kill;
      });
     })).rejects.toThrow('Owned restored child closure unverified');
     expect((await readdir(retainedRoot)).length).toBeGreaterThan(0);
     expect((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rowCount).toBe(0);
     await expect(withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async()=>{})).rejects.toThrow('already active');
    }finally{
     process.kill=originalKill;
     if(failedChild){
      try{originalKill(-failedChild,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
      const until=Date.now()+5000;
      for(;;){let alive=false;try{originalKill(-failedChild,0);alive=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}if(!alive)break;if(Date.now()>=until)throw Error('Controlled refused child cleanup unverified');await new Promise(done=>setTimeout(done,20));}
     }
     if(retainedRoot)await rm(retainedRoot,{recursive:true,force:true});
    }
    await expect(withOwnedRestoreTarget(ownedTarget,scope,environment.signal,async owner=>{await owner.query('UPDATE operations_control SET revision=revision+1');})).rejects.toThrow('Exact bound locked');
    expect((await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0]).toEqual({environment_id:sourceEnvironmentId,schema_version:80});
    expect(Number((await db.query('SELECT count(*) FROM operations_recovery_quarantines')).rows[0].count)).toBe(7);
    expect(Number((await db.query("SELECT count(*) FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rows[0].count)).toBe(0);
    expect((await readFile(join(root,'cold','candidate.encrypted'))).length).toBe(captured.encryptedBundle.sizeBytes);
   }finally{await db.end();}
  // The artifact and command cases compose the separate150s maintenance
  // measurement after the120s boundary runner. Each runtime lease stays60s.
  },{postgresMajor:18,deadlineMs:['artifact','command'].includes(surface)?300000:180000});
  // Real barrier regression: a waited-for fence must not leave measurement on
  // a repeatable-read snapshot established before the competing commit.
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),blocker=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();await blocker.connect();
   try{
    await db.query("UPDATE operations_control SET mode='locked'");
    const restored=await restoreOwnedWorkDump({dump:join(root,'restore','unpacked','database.dump'),...captured.database,sourceDatabaseName:captured.sourceDatabaseName,sourceEnvironmentId:captured.environmentId,signal:environment.signal});
    if(!restored.recoveryId||!restored.controlRevision)throw Error('Fresh race target lock missing');
    const pid=(await db.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,16020))',[captured.environmentId]);
    const measurement=measureRestoredWorkIntegrity(db,{candidate:captured,scope:{environmentId:captured.environmentId,recoveryId:restored.recoveryId,controlRevision:restored.controlRevision},storeRoot:join(root,'restore','objects'),bundle:join(root,'cold','candidate.encrypted'),keyFile:join(root,'keys','key'),signal:environment.signal}).then(value=>({value,error:null}),error=>({value:null,error}));
    const deadline=Date.now()+10000;while(!(await blocker.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event='advisory'",[pid])).rowCount){if(Date.now()>deadline)throw Error('Integrity barrier was not reached');await new Promise(done=>setTimeout(done,20));}
    await blocker.query("UPDATE principals SET display_name='Synthetic commit while measurement waited' WHERE login_name='mcteer'");await blocker.query('COMMIT');
    const outcome=await measurement;expect(outcome.value).toBeNull();expect(outcome.error).toBeInstanceOf(Error);expect(outcome.error.message).toContain('accepted content differs');
   }finally{await blocker.query('ROLLBACK').catch(()=>{});await blocker.end();await db.end();}
  },{postgresMajor:18,deadlineMs:180000});
 }finally{if(application)await retireOwnedRecoveryApplication(application);key.fill(0);await rm(root,{recursive:true,force:true});}
},420000);
