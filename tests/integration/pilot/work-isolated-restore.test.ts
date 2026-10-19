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
import {mintOwnedRestoreTarget,bindOwnedRestoredSource,withOwnedRestoreTarget,requireOwnedRestoreConnection,withOwnedRestoredRuntime} from '../../../lib/server/operations/owned-restore-target';
import {restoreOwnedWorkDump} from '../../../lib/server/operations/pg-restore';
import {measureRestoredWorkIntegrity,requireMeasuredWorkIntegrity} from '../../../lib/server/operations/restored-work-integrity';
import {it,expect} from 'vitest';
import {Client} from 'pg';
import {mkdir,mkdtemp,writeFile,readFile,rm,readdir,copyFile,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {captureOwnedRecoveryCandidate} from '../../../lib/server/operations/capture-candidate';
import {pilotRecovery} from '../../../scripts/pilot-recovery';
import {workCaptureCandidateSchema,type WorkCaptureCandidate} from '../../../lib/contracts/pilot-capture';
import {LocalPrivateObjects} from '../../../lib/server/storage/local-objects';
import {objectKey,environmentObjectId} from '../../../lib/server/storage/private-objects';
import {activeObjectNamespaces} from '../../../lib/server/storage/inventory';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';

it('authenticates separate encrypted work bytes, restores accepted content and six stores, and quarantines authority',async()=>{
 const preparation=process.env.TURAS_PILOT_UI_PREPARATION_FILE,renderer=process.env.TURAS_PILOT_RENDERER_IMAGE??(preparation?parsePilotImagePreparation(await readFile(preparation)).images.find(image=>image.kind==='renderer')?.localImageId:undefined);
 if(!renderer||!/^sha256:[a-f0-9]{64}$/.test(renderer))throw Error('Explicit prepared recovery report renderer required');
 await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/work-rehearsal-')),key=randomBytes(32);
 let sourceReport:{artifactId:string;reportId:string;revisionId:string;customerId:string;workspaceId:string;digest:string;sizeBytes:number;objectKey:string}|undefined;
 let candidate:WorkCaptureCandidate|undefined,sourceEnvironmentId='',sourceProfile:{workspaceId:string;customerId:string;revisionId:string;artifactVersionId:string}|undefined;
 try{
  await mkdir(join(root,'keys'),{mode:0o700});await writeFile(join(root,'keys','key'),key,{mode:0o600});await mkdir(join(root,'cold'),{mode:0o700});
  await withPilotEnvironment(async environment=>{
   const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await db.connect();
   try{
    sourceEnvironmentId=environment.environmentId;const profile=await pilotPublishedKnowledgeFixture(db as any,'primary');await db.query('BEGIN');const original=Buffer.from('Synthetic work restore artifact'),source=await createArtifactDatabaseFixture(db as unknown as PoolClient,profile.actor,profile.customerId,null,original,createHash('sha256').update(original).digest('hex'));await db.query("UPDATE artifact_extraction_runs SET state='published',scan_receipt='{}',coverage='{\"total\":1,\"visited\":1,\"omitted\":[]}',manifest_digest=$2,published_at=now() WHERE id=$1",[source.runId,source.originalDigest]);await db.query("UPDATE artifact_versions SET state='processing' WHERE id=$1",[source.versionId]);await db.query("UPDATE artifact_versions SET state='ready',submitted_at=now() WHERE id=$1",[source.versionId]);sourceProfile={workspaceId:profile.actor.workspaceId,customerId:profile.customerId,revisionId:profile.originalRevisionId,artifactVersionId:source.versionId};await db.query('COMMIT');
    process.env.TURAS_PILOT_RENDERER_IMAGE=renderer;process.env.TURAS_REPORTS_ENABLED='true';
    const baseline=await reportsDeliveryFixture(),activity=await addReviewedReportActivity(baseline,{narrative:'Controlled normally reviewed recovery byte fixture.'});
    const delivery={plan:{created:baseline.created,content:baseline.content,decision:baseline.decision},engagementId:baseline.engagementId,baselineId:baseline.baselineId,activity};
    const reports=await pilotLoadReportFixture(db as unknown as PoolClient,{actors:[baseline.reviewer,baseline.author],customers:[{id:baseline.customerId}]},delivery,environment.signal);
    const report=reports.reports[1],publication=await previewReportPublication(baseline.reviewer,report.reportId,{action:'publish',expectedVersion:report.version});
    await submitReportPublicationDecision(baseline.reviewer,report.reportId,{action:'publish',expectedVersion:report.version,requestKey:randomUUID(),rationale:'Review normally rendered synthetic recovery artifact',previewId:publication.previewId,previewDigest:publication.previewDigest});
    const reportArtifacts=(await db.query('SELECT a.*,r.report_id FROM report_artifacts a JOIN report_revisions r ON r.id=a.revision_id ORDER BY a.id')).rows;expect(reportArtifacts).toHaveLength(4);
    const pdf=reportArtifacts.find(row=>row.revision_id===report.revisionId&&row.format==='pdf');if(!pdf)throw Error('Normally rendered published PDF missing');
    sourceReport={artifactId:pdf.id,reportId:pdf.report_id,revisionId:pdf.revision_id,customerId:pdf.customer_id,workspaceId:pdf.workspace_id,digest:pdf.content_digest,sizeBytes:Number(pdf.size_bytes),objectKey:pdf.object_key};
    const recoveryId=randomUUID(),revision=Number((await db.query("UPDATE operations_control SET mode='locked',revision=revision+1,recovery_id=$2 WHERE environment_id=$1 RETURNING revision",[environment.environmentId,recoveryId])).rows[0].revision);
    const objects=join(root,'source-objects'),workflow=join(root,'empty-workflow');await mkdir(objects,{mode:0o700});await mkdir(workflow,{mode:0o700});
    const store=new LocalPrivateObjects(objects,environment.environmentId,10485760);
    for(const namespace of activeObjectNamespaces){await mkdir(join(objects,'e_'+environmentObjectId(environment.environmentId),namespace),{recursive:true,mode:0o700});const bytes=Buffer.from('Synthetic work restore '+namespace),digest=createHash('sha256').update(bytes).digest('hex');await store.put(objectKey(environment.environmentId,namespace,namespace.startsWith('artifact')?digest:randomUUID()),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest});}
    for(const artifact of reportArtifacts){const bytes=await readReportObject(artifact.object_key,artifact.content_digest,Number(artifact.size_bytes));await store.put(objectKey(environment.environmentId,'report',artifact.object_key),(async function*(){yield bytes;})(),{sizeBytes:bytes.length,digest:artifact.content_digest});}
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
  if(!candidate||!sourceProfile||!sourceReport)throw Error('Synthetic work candidate unavailable');const captured=candidate,expectedProfile=sourceProfile,expectedReport=sourceReport;
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
    const result=await pilotRecovery(['--restore-work-isolated','--environment',captured.environmentId,'--candidate',join(root,'cold','candidate.json'),'--bundle',join(root,'cold','candidate.encrypted'),'--key-file',join(root,'keys','key'),'--output',join(root,'restore')]);
    expect(result).toMatchObject({acceptedContentVerified:true,ledgerVerified:true,objectsVerified:true,objectCount:10,requiredScopeQuarantined:true,currentAuthorityVerified:false,permanentReplayVerified:false,workflowReconciled:false,restorationReady:false,mode:'locked'});
    if(!('physicalIntegrity' in result))throw Error('Measured physical checkpoint missing');
    const proof=result.physicalIntegrity,scope={environmentId:sourceEnvironmentId,recoveryId:proof.recoveryId,controlRevision:proof.controlRevision},storeRoot=join(root,'restore','objects');
    expect(Object.isFrozen(proof)).toBe(true);expect(proof.restorationReady).toBe(false);expect(proof.acceptedContentDigest).toBe(captured.acceptedContentDigest);expect(proof.objectCount).toBe(10);
    await db.query('BEGIN');
    expect(await requireMeasuredWorkIntegrity(db,proof,scope,storeRoot,environment.signal)).toBe(proof);
    await expect(requireMeasuredWorkIntegrity(db,JSON.parse(JSON.stringify(proof)),scope,storeRoot,environment.signal)).rejects.toThrow('Actual measured');
    const foreign=join(root,'foreign-objects');await mkdir(foreign,{mode:0o700});
    await expect(requireMeasuredWorkIntegrity(db,proof,scope,foreign,environment.signal)).rejects.toThrow('target changed');
    await db.query('COMMIT');
    await expect(bindOwnedRestoredSource(ownedTarget,JSON.parse(JSON.stringify(proof)),storeRoot,environment.signal)).rejects.toThrow('Actual measured');
    await bindOwnedRestoredSource(ownedTarget,proof,storeRoot,environment.signal);
    await bindOwnedRestoredSource(otherOwnedTarget,proof,storeRoot,environment.signal);
    await expect(withOwnedRestoreTarget(JSON.parse(JSON.stringify(ownedTarget)),scope,environment.signal,async()=>{})).rejects.toThrow('Actual owned restore target');
    await expect(withOwnedRestoreTarget(ownedTarget,{...scope,recoveryId:randomUUID()},environment.signal,async()=>{})).rejects.toThrow('Actual bound');
    await withOwnedRestoreTarget(ownedTarget,scope,environment.signal,async owner=>{
     expect(await requireOwnedRestoreConnection(owner,ownedTarget,scope,environment.signal)).toBe(proof);
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
    // Compile denied routes while both runtime logins remain closed. This is
    // fixture preparation, outside the unchanged 60-second restricted lease.
    const warmUrl=new URL(process.env.DATABASE_URL!);warmUrl.username='turas_runtime_016';warmUrl.password=randomBytes(32).toString('base64url');
    const warmSaved={DATABASE_URL:process.env.DATABASE_URL,DATABASE_URL_UNPOOLED:process.env.DATABASE_URL_UNPOOLED};
    try{
     Object.assign(process.env,{DATABASE_URL:warmUrl.toString(),DATABASE_URL_UNPOOLED:warmUrl.toString()});await environment.start();
     for(const path of ['/api/operations/recovery-read/'+randomUUID()+'/profile','/api/customers/'+expectedProfile.customerId+'/profile','/api/operations/recovery-read/'+randomUUID()+'/artifact','/api/operations/recovery-read/'+randomUUID()+'/report']){const response=await fetch(environment.origin+path,{redirect:'manual',signal:environment.signal});expect([401,403,503]).toContain(response.status);await response.body?.cancel();}
    }finally{await environment.stop();Object.assign(process.env,warmSaved);}
    await interruptedPreparation(false);
    await withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async(runtime,_signal,applicationEnvironment)=>{
     expect((await runtime.query('SELECT current_user,session_user')).rows[0]).toEqual({current_user:'turas_runtime_016',session_user:'turas_runtime_016'});
     expect((await runtime.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
     await expect(runtime.query("UPDATE operations_control SET mode='open'")).rejects.toMatchObject({code:'42501'});
     await expect(runtime.query('CREATE TABLE runtime_escalation(id int)')).rejects.toMatchObject({code:'42501'});
     await expect(withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async()=>{})).rejects.toThrow('already active');
     await expect(withOwnedRestoredRuntime(otherOwnedTarget,scope,environment.signal,async()=>{})).rejects.toThrow('database lease active');
     expect(applicationEnvironment.TURAS_PRIVATE_OBJECT_BACKEND).toBe('local');
     const artifactNames=await readdir(join(applicationEnvironment.TURAS_ARTIFACT_STORE_ROOT,'objects'));expect(artifactNames).toHaveLength(1);expect(await readFile(join(applicationEnvironment.TURAS_ARTIFACT_STORE_ROOT,'objects',artifactNames[0]),'utf8')).toBe('Synthetic work restore artifact');
     let httpAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
     try{
     const saved=Object.fromEntries(Object.keys(applicationEnvironment).map(key=>[key,process.env[key]]));
     try{Object.assign(process.env,applicationEnvironment);await environment.start();}
     finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
    await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,async owner=>{
     await owner.query('BEGIN');
     try{httpAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,customerId:expectedProfile.customerId,deadline:Date.now()+59000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:3,deploymentId:null});await owner.query('COMMIT');}
     catch(error){await owner.query('ROLLBACK');throw error;}
    });
    if(!httpAdmission)throw Error('Actual owner-issued HTTP admission missing');
    const admission=httpAdmission;

      const path=environment.origin+'/api/operations/recovery-read/'+admission.id+'/profile';
      const cookie=sessionCookie(admission.actor.token,admission.actor.expiresAt).split(';')[0];
      const headers={cookie,'x-turas-recovery-read':admission.secret,host:new URL(environment.origin).host};
      await runtime.query('BEGIN');
      try{await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,()=>authenticateRecoveryHttpRead(runtime as unknown as PoolClient,new Request(path,{headers}),admission.id,false));await runtime.query('COMMIT');}
      catch(error){await runtime.query('ROLLBACK');throw error;}
      const noSecret=await fetch(path,{headers:{cookie},redirect:'manual'});expect(noSecret.status).toBe(403);await noSecret.body?.cancel();
      const noSession=await fetch(path,{headers:{'x-turas-recovery-read':admission.secret},redirect:'manual'});expect(noSession.status).toBe(403);await noSession.body?.cancel();
      const normal=await fetch(environment.origin+'/api/customers/'+expectedProfile.customerId+'/profile',{headers,redirect:'manual'});expect([401,503]).toContain(normal.status);await normal.body?.cancel();
      const response=await fetch(path,{headers,redirect:'manual'});if(response.status!==200){const failure=await response.json() as {error:{code:string}};throw Error('Recovery HTTP denied: '+response.status+' '+failure.error.code);}expect(response.status).toBe(200);
      const body=await response.json() as {data:{customer:{id:string};acceptedFacts:{id:string}[]}};
      let artifactAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,async owner=>{await owner.query('BEGIN');try{artifactAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,customerId:expectedProfile.customerId,deadline:Date.now()+20000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:2,deploymentId:null,readKind:'artifact',recordId:expectedProfile.artifactVersionId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}});
      if(!artifactAdmission)throw Error('Actual artifact admission missing');
      const reverseKind=await fetch(path.replace('/profile','/artifact'),{headers,redirect:'manual'});expect(reverseKind.status).toBe(403);await reverseKind.body?.cancel();
      const artifactProof=artifactAdmission,artifactPath=environment.origin+'/api/operations/recovery-read/'+artifactProof.id+'/artifact',artifactHeaders={cookie:sessionCookie(artifactProof.actor.token,artifactProof.actor.expiresAt).split(';')[0],'x-turas-recovery-read':artifactProof.secret};
      try{
       const wrongKind=await fetch(artifactPath.replace('/artifact','/profile'),{headers:artifactHeaders,redirect:'manual'});expect(wrongKind.status).toBe(403);await wrongKind.body?.cancel();
       await db.query('UPDATE operations_recovery_http_reads SET record_generation=record_generation+1 WHERE id=$1',[artifactProof.id]);
       try{const changed=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(changed.status).toBe(403);await changed.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_generation=record_generation-1 WHERE id=$1',[artifactProof.id]);}
       await db.query('UPDATE operations_recovery_http_reads SET record_digest=$2 WHERE id=$1',[artifactProof.id,'0'.repeat(64)]);
       try{const changed=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(changed.status).toBe(403);await changed.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_digest=$2 WHERE id=$1',[artifactProof.id,createHash('sha256').update('Synthetic work restore artifact').digest('hex')]);}
       const originalResponse=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(originalResponse.status).toBe(200);expect(Buffer.from(await originalResponse.arrayBuffer()).toString()).toBe('Synthetic work restore artifact');
       const ordinary=await fetch(environment.origin+'/api/artifacts/'+expectedProfile.artifactVersionId+'/original',{headers:artifactHeaders,redirect:'manual'});expect([401,403,503]).toContain(ordinary.status);await ordinary.body?.cancel();
       const deniedRange=await fetch(artifactPath,{headers:{...artifactHeaders,range:'bytes=0-2'},redirect:'manual'});expect(deniedRange.status).toBe(403);await deniedRange.body?.cancel();
       const canonicalPath=join(applicationEnvironment.TURAS_ARTIFACT_STORE_ROOT,'objects',artifactNames[0]);await writeFile(canonicalPath,Buffer.alloc(Buffer.byteLength('Synthetic work restore artifact')),{mode:0o600});
       try{const corrupt=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(corrupt.status).toBe(503);await corrupt.body?.cancel();}finally{await writeFile(canonicalPath,'Synthetic work restore artifact',{mode:0o600});}
       const exhausted=await fetch(artifactPath,{headers:artifactHeaders,redirect:'manual'});expect(exhausted.status).toBe(429);await exhausted.body?.cancel();

      }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,artifactProof.id);}

      let reportAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,async owner=>{await owner.query('BEGIN');try{reportAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedReport.workspaceId,customerId:expectedReport.customerId,deadline:Date.now()+20000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:2,deploymentId:null,readKind:'report',recordId:expectedReport.artifactId});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}});
      if(!reportAdmission)throw Error('Actual report admission missing');
      const reportProof=reportAdmission,reportPath=environment.origin+'/api/operations/recovery-read/'+reportProof.id+'/report',reportHeaders={cookie:sessionCookie(reportProof.actor.token,reportProof.actor.expiresAt).split(';')[0],'x-turas-recovery-read':reportProof.secret};
      try{
       const wrongType=await fetch(reportPath.replace('/report','/artifact'),{headers:reportHeaders,redirect:'manual'});expect(wrongType.status).toBe(403);await wrongType.body?.cancel();
       await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[reportProof.id,randomUUID()]);
       try{const drift=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(drift.status).toBe(403);await drift.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_revision_id=$2 WHERE id=$1',[reportProof.id,expectedReport.revisionId]);}
       await db.query('UPDATE operations_recovery_http_reads SET record_parent_id=$2 WHERE id=$1',[reportProof.id,randomUUID()]);
       try{const drift=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(drift.status).toBe(403);await drift.body?.cancel();}finally{await db.query('UPDATE operations_recovery_http_reads SET record_parent_id=$2 WHERE id=$1',[reportProof.id,expectedReport.reportId]);}
       const reportResponse=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});if(reportResponse.status!==200){const failure=await reportResponse.json() as {error:{code:string}};throw Error('Recovery report HTTP denied: '+reportResponse.status+' '+failure.error.code);}expect(reportResponse.status).toBe(200);expect(reportResponse.headers.get('content-type')).toBe('application/pdf');const bytes=Buffer.from(await reportResponse.arrayBuffer());expect(bytes.length).toBe(expectedReport.sizeBytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedReport.digest);
       const ordinary=await fetch(environment.origin+'/api/reports/artifacts/'+expectedReport.artifactId,{headers:reportHeaders,redirect:'manual'});expect([401,403,503]).toContain(ordinary.status);await ordinary.body?.cancel();
       const copied=join(applicationEnvironment.TURAS_REPORT_STORE_ROOT,'objects',expectedReport.objectKey);await writeFile(copied,Buffer.alloc(bytes.length),{mode:0o600});
       try{const corrupt=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(corrupt.status).toBe(503);await corrupt.body?.cancel();}finally{await writeFile(copied,bytes,{mode:0o600});}
       const exhausted=await fetch(reportPath,{headers:reportHeaders,redirect:'manual'});expect(exhausted.status).toBe(429);await exhausted.body?.cancel();
      }finally{await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,reportProof.id);}
      expect(body.data.customer.id).toBe(expectedProfile.customerId);expect(body.data.acceptedFacts.some(fact=>fact.id===expectedProfile.revisionId)).toBe(true);
      // A correctly ordered owner transition waits on the shared recovery
      // fence, then proceeds when the actual runtime read transaction closes.
      const transitioning=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await transitioning.connect();
      let waiting:Promise<unknown>|undefined;
      try{
       await runtime.query('BEGIN');await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,()=>authenticateRecoveryHttpRead(runtime as unknown as PoolClient,new Request(path,{headers}),admission.id,false));
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
      const binding=(await db.query('SELECT database_binding_digest FROM operations_recovery_http_reads WHERE id=$1',[admission.id])).rows[0].database_binding_digest;
      await db.query("UPDATE operations_recovery_http_reads SET database_binding_digest=repeat('0',64) WHERE id=$1",[admission.id]);
      const wrongDatabase=await fetch(path,{headers,redirect:'manual'});expect(wrongDatabase.status).toBe(403);await wrongDatabase.body?.cancel();
      await db.query('UPDATE operations_recovery_http_reads SET database_binding_digest=$2 WHERE id=$1',[admission.id,binding]);
      await db.query("UPDATE operations_recovery_http_reads SET expires_at=created_at+interval '1 millisecond' WHERE id=$1",[admission.id]);
      const expired=await fetch(path,{headers,redirect:'manual'});expect(expired.status).toBe(403);await expired.body?.cancel();
      let retirementAdmission:Awaited<ReturnType<typeof issueOwnedRecoveryHttpRead>>|undefined;
      await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,async owner=>{
       await owner.query('BEGIN');try{retirementAdmission=await issueOwnedRecoveryHttpRead(owner as unknown as PoolClient,{...scope,workspaceId:expectedProfile.workspaceId,customerId:expectedProfile.customerId,deadline:Date.now()+59000,password:process.env.TURAS_DEMO_PASSWORD!,maximumRequests:1,deploymentId:null});await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
      });
      if(!retirementAdmission)throw Error('Actual retirement admission missing');
      const retiring=retirementAdmission,retirementOwner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await retirementOwner.connect();
      let closing:Promise<{error:unknown}>|undefined;
      const retirementPath=environment.origin+'/api/operations/recovery-read/'+retiring.id+'/profile',retirementHeaders={...headers,cookie:sessionCookie(retiring.actor.token,retiring.actor.expiresAt).split(';')[0],'x-turas-recovery-read':retiring.secret};
      try{
       await runtime.query('BEGIN');await withOwnedRecoveryConfiguration(ownedTarget,scope,environment.signal,()=>authenticateRecoveryHttpRead(runtime as unknown as PoolClient,new Request(retirementPath,{headers:retirementHeaders}),retiring.id,false));
       const pid=Number((await retirementOwner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
       closing=retireOwnedRecoveryHttpRead(retirementOwner as unknown as PoolClient,retiring.id).then(()=>({error:null}),error=>({error}));
       const until=Date.now()+2000;
       while(!(await db.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'",[pid])).rowCount){if(Date.now()>until)throw Error('Retirement did not wait for its active read');await new Promise(done=>setTimeout(done,10));}
       await runtime.query('COMMIT');const result=await closing;closing=undefined;if(result.error)throw result.error;
       const revoked=await fetch(retirementPath,{headers:retirementHeaders,redirect:'manual'});expect(revoked.status).toBe(403);await revoked.body?.cancel();
       expect((await db.query('SELECT revoked_at IS NOT NULL AS revoked FROM login_sessions WHERE id=$1',[retiring.actor.sessionId])).rows[0].revoked).toBe(true);
      }finally{await runtime.query('ROLLBACK');if(closing)await closing;await retirementOwner.end();await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,retiring.id);}

     }finally{await environment.stop();if(httpAdmission)await retireOwnedRecoveryHttpRead(db as unknown as PoolClient,httpAdmission.id);}

    });
    expect((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rowCount).toBe(0);
    expect((await readdir(join(root,'restore'))).filter(name=>name.startsWith('canonical-runtime-'))).toEqual([]);
    await interruptedPreparation(true);
    await expect(withOwnedRestoredRuntime(ownedTarget,scope,environment.signal,async()=>{throw Error('Controlled runtime failure');})).rejects.toThrow('Controlled runtime failure');
    const interrupted=new AbortController();
    await expect(withOwnedRestoredRuntime(ownedTarget,scope,interrupted.signal,async runtime=>{interrupted.abort();await runtime.query('SELECT pg_sleep(20)');})).rejects.toThrow('interrupted');
    expect((await db.query("SELECT 1 FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rowCount).toBe(0);
    expect((await db.query("SELECT 1 FROM pg_stat_activity WHERE usename IN('turas_runtime','turas_runtime_016')")).rowCount).toBe(0);
    expect((await readdir(join(root,'restore'))).filter(name=>name.startsWith('canonical-runtime-'))).toEqual([]);
    await expect(withOwnedRestoreTarget(ownedTarget,scope,environment.signal,async owner=>{await owner.query('UPDATE operations_control SET revision=revision+1');})).rejects.toThrow('Exact bound locked');
    expect((await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows[0]).toEqual({environment_id:sourceEnvironmentId,schema_version:79});
    expect(Number((await db.query('SELECT count(*) FROM operations_recovery_quarantines')).rows[0].count)).toBe(7);
    expect(Number((await db.query("SELECT count(*) FROM pg_roles WHERE rolname IN('turas_runtime','turas_runtime_016') AND rolcanlogin")).rows[0].count)).toBe(0);
    expect((await readFile(join(root,'cold','candidate.encrypted'))).length).toBe(captured.encryptedBundle.sizeBytes);
   }finally{await db.end();}
  },{postgresMajor:18,deadlineMs:180000});
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
 }finally{key.fill(0);await rm(root,{recursive:true,force:true});}
},420000);
