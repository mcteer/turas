import {Client} from 'pg';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import {workRecoveryVerificationConfigurationSchema} from './pilot-work-recovery-verify';
import {databaseSafetyCaptureSourceSchema,verifyDatabaseSafetySourceBinding} from './pilot-database-safety-copy';
import {readEvidence,writeEvidence,createEvidenceDirectory} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {assertHostedFileTarget} from './pilot-hosted-maximum-files';
import {runHostedReadChecks,boundedHostedJson} from './pilot-hosted-http';
import {runHostedMcpJourney} from './pilot-hosted-mcp';
import {workCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {hostedConfigurationSchema} from '../lib/server/operations/hosted-configuration';
import {verifyRecoveryCandidate} from '../lib/server/operations/candidate-verification';
import {currentRecoveryStateDigest} from '../lib/server/operations/recovery-state';
import {RecoveryServiceTransport} from '../lib/server/operations/service-recovery-transport';
import {ordinaryRecoveryStateDigest} from '../lib/server/operations/service-recovery-state';
import {readRecoveryIncident,serviceRecoveryIntervals} from '../lib/server/operations/service-recovery-timing';
import {databaseTargetDigest,operationalDatabaseBindingSchema} from '../lib/server/operations/database-binding';
import {recoveryGrantCheckpoint} from '../lib/server/operations/grant-checkpoint';
import {requireRetiredLegacyWorkRuntime} from '../lib/server/operations/recovery-credential-denials';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';

const file=z.string().min(1).max(4096),id=z.uuid(),providerId=z.string().regex(/^[a-z0-9-]{1,60}$/);
const nativeReference=z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('artifact'),id}),z.strictObject({kind:z.literal('workforce'),id,sourceVersionId:id}),z.strictObject({kind:z.literal('report'),id})]);
const inputSchema=z.strictObject({contract:z.literal('pilot-work-service-recovery-input-v1'),verificationConfigurationFile:file,verificationId:id,incidentOperationId:id,targetAttemptId:id,openOperationId:id,configurationFile:file,serviceCustomerId:id,deniedCustomerId:id,nativeReferences:z.array(nativeReference).length(3),targetNeon:z.strictObject({projectId:providerId,branchId:providerId,endpointId:providerId}),output:file});
const privateJson=(path:string)=>readEvidence(dirname(resolve(path)),basename(path));
const need=(value:unknown)=>{if(!value)throw Error('Complete ordinary recovery service proof unavailable');};

/** A fixed read-only provider lookup establishes that the isolated target was
 * created AFTER the original incident. A restored pre-existing cluster cannot
 * be used to omit provisioning/restore time from RTO. No resources are created. */
async function recoveryBranch(input:z.infer<typeof inputSchema>['targetNeon'],connection:string,incident:{operationId:string;incidentStartedAt:string},attemptId:string,signal:AbortSignal){
 const key=process.env.NEON_API_KEY;if(!key)throw Error('Explicit Neon observation credential required');
 async function get(path:string){
  const response=await fetch('https://console.neon.tech/api/v2/projects/'+input.projectId+path,{headers:{authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  need(response.status===200);return boundedHostedJson(response);
 }
 const branch=z.object({branch:z.object({id:providerId,project_id:providerId,name:z.string(),created_at:z.iso.datetime({offset:true})})}).parse(await get('/branches/'+input.branchId)).branch;
 const endpoint=z.object({endpoint:z.object({id:providerId,project_id:providerId,branch_id:providerId,host:z.string(),type:z.literal('read_write')})}).parse(await get('/endpoints/'+input.endpointId)).endpoint;
 need(branch.id===input.branchId&&branch.project_id===input.projectId&&branch.name==='pilot-recovery-'+attemptId&&Date.parse(branch.created_at)>=Date.parse(incident.incidentStartedAt));
 need(endpoint.id===input.endpointId&&endpoint.project_id===input.projectId&&endpoint.branch_id===branch.id&&endpoint.host===new URL(connection).hostname);
 return {projectId:input.projectId,branchId:branch.id,endpointId:endpoint.id,targetCreatedAt:branch.created_at};
}

/** Completes timing only AFTER an independently composed verification, explicit
 * resolution and explicit owner opening. Inputs contain identities/paths, never
 * timestamps or healthy flags. All ordinary HTTP/SDK/byte probes are real and
 * their exact newly issued credentials are retired before the final DB clock. */
export async function pilotWorkRecoveryService(args:string[]){
 if(args.length!==3||args[0]!=='--verify-service-recovery'||args[1]!=='--configuration')throw Error('Explicit service recovery configuration required');
 const input=inputSchema.parse(await privateJson(args[2])),config=workRecoveryVerificationConfigurationSchema.parse(await privateJson(input.verificationConfigurationFile));
 need(config.contract==='pilot-work-recovery-verification-input-v4');
 const scope=config.hostedScope,candidate=workCaptureCandidateSchema.parse(await privateJson(config.candidateFile)),configuration=hostedConfigurationSchema.parse(await privateJson(input.configurationFile));
 const source=databaseSafetyCaptureSourceSchema.parse(await privateJson(config.denialSourceFile)),target=databaseSafetyCaptureSourceSchema.parse(await privateJson(config.sourceFile));
 const runtime=z.strictObject({connection:z.string().min(1).max(16384)}).parse(await privateJson(config.runtimeFile));
 const credentials=z.object({passwords:z.strictObject({mcteer:z.string().min(1),panel:z.string().min(1),partner:z.string().min(1)}),protectionBypass:z.string().min(1)}).parse(await privateJson(config.credentialsFile));
 need(source.projectId===scope.projectId&&target.projectId===scope.projectId&&source.environmentId===scope.environmentMarker&&target.environmentId===scope.environmentMarker&&candidate.environmentId===scope.environmentMarker&&config.scope.environmentId===scope.environmentMarker&&config.backupCapturedAt===candidate.capturedAt);
 need(databaseTargetDigest(source.databaseUrl,source.environmentId)!==databaseTargetDigest(target.databaseUrl,target.environmentId)&&databaseTargetDigest(runtime.connection,target.environmentId)===databaseTargetDigest(target.databaseUrl,target.environmentId));
 need(decodeURIComponent(new URL(runtime.connection).username)==='turas_runtime_016'&&configuration.storeId===config.storeId&&JSON.stringify(configuration)===JSON.stringify(config.restoredStore!.expectedConfiguration));
 need(new Set(input.nativeReferences.map(row=>row.kind)).size===3&&input.serviceCustomerId!==input.deniedCustomerId);
 const root=resolve(input.output);await createEvidenceDirectory(root);let stage='archive';
 return withRecoveryCancellation(300000,async signal=>{
  const owner=new Client({connectionString:target.databaseUrl,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:12000}),original=new Client({connectionString:source.databaseUrl,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000,options:'-c default_transaction_read_only=on'}),reader=new Client({connectionString:runtime.connection,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000});
  for(const db of[owner,original,reader])db.on('error',()=>{});
  const expectedSource=await pilotSource(),connections:string[]=[],ordinary:unknown[]=[],streams:unknown[]=[],oldSessions=new Set<string>(),oldConnections=new Set<string>();let observation:RecoveryServiceTransport|undefined,ownerConnected=false,probeFloor:string|undefined;
  const transport:typeof fetch=async(...args)=>{need(observation);return observation!.fetch(...args);};
  async function sameSource(){need(JSON.stringify(await pilotSource())===JSON.stringify(expectedSource));need(expectedSource.sourceCommit===scope.sourceCommit&&expectedSource.sourceDigest===scope.sourceDigest&&expectedSource.catalogDigest===scope.catalogDigest);await assertHostedFileTarget({scope,signal});}
  async function ownerState(){
   const rows=(await owner.query(`SELECT e.environment_id,e.schema_version,c.*,clock_timestamp() AS now,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner FROM turas_environment e JOIN operations_control c USING(environment_id) FOR SHARE OF e,c`)).rows,row=rows[0];
   need(rows.length===1&&row.owner&&row.environment_id===scope.environmentMarker&&Number(row.schema_version)===80&&row.mode==='open'&&row.recovery_id===config.scope.recoveryId&&Number(row.revision)===config.scope.controlRevision+1&&row.verified_bundle_digest===candidate.encryptedBundle.digest);
   const verified=(await owner.query(`SELECT * FROM operations_recovery_verifications WHERE id=$1 AND environment_id=$2 AND recovery_id=$3 AND control_revision=$4 AND required_scope_healthy AND integrity_verified AND denial_verified AND replay_verified AND workflow_verified`,[input.verificationId,scope.environmentMarker,config.scope.recoveryId,config.scope.controlRevision])).rows;
   need(verified.length===1&&verified[0].bundle_digest===candidate.encryptedBundle.digest&&verified[0].ledger_digest===candidate.ledgerDigest&&verified[0].objects_digest===candidate.objects.inventoryDigest&&verified[0].verified_at<=row.now&&row.now-verified[0].verified_at<=1800000);
   const opened=(await owner.query("SELECT * FROM operations_control_transitions WHERE id=$1 AND environment_id=$2 AND recovery_id=$3 AND revision=$4 AND from_mode='locked' AND to_mode='open'",[input.openOperationId,scope.environmentMarker,config.scope.recoveryId,row.revision])).rows;
   need(opened.length===1&&opened[0].bundle_digest===candidate.encryptedBundle.digest&&opened[0].operation_digest===row.owner_operation_digest&&opened[0].created_at>=verified[0].verified_at&&opened[0].created_at<=row.now);
   const role=(await owner.query(`SELECT r.rolcanlogin,r.rolvaliduntil,r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,r.rolbypassrls,
    pg_has_role(r.oid,(SELECT datdba FROM pg_database WHERE datname=current_database()),'MEMBER') AS owner_membership,
    EXISTS(SELECT 1 FROM pg_roles a WHERE a.rolname='neon_superuser' AND pg_has_role(r.oid,a.oid,'MEMBER')) AS administrative_membership
    FROM pg_roles r WHERE r.rolname='turas_runtime_016'`)).rows[0];
   need(role?.rolcanlogin&&!role.rolsuper&&!role.rolcreaterole&&!role.rolcreatedb&&!role.rolreplication&&!role.rolbypassrls&&!role.owner_membership&&!role.administrative_membership&&(!role.rolvaliduntil||role.rolvaliduntil>row.now));
   need(!(await owner.query(`SELECT 1 FROM operations_recovery_quarantines q WHERE q.environment_id=$1 AND NOT EXISTS(SELECT 1 FROM operations_recovery_quarantine_resolutions r WHERE r.environment_id=q.environment_id AND r.recovery_id=q.recovery_id AND r.scope_kind=q.scope_kind AND r.verification_id=$2) LIMIT 1`,[scope.environmentMarker,input.verificationId])).rowCount);
   await requireRetiredLegacyWorkRuntime(owner);return {controlRevision:Number(row.revision),openedAt:(opened[0].created_at as Date).toISOString(),verified:verified[0],now:(row.now as Date).toISOString()};
  }
  try{
   await sameSource();await verifyRecoveryCandidate({candidate,environmentId:scope.environmentMarker,bundle:resolve(config.bundle),keyFile:resolve(config.keyFile),signal});
   await verifyDatabaseSafetySourceBinding(source,scope.teamId,signal);await verifyDatabaseSafetySourceBinding(target,scope.teamId,signal);
   await original.connect();await owner.connect();ownerConnected=true;await reader.connect();for(const db of[original,owner,reader])need((db as any).connection.stream.encrypted&&(db as any).connection.stream.authorized);
   stage='incident';const incident=await readRecoveryIncident(original,{environmentId:scope.environmentMarker,capturedAt:candidate.capturedAt,operationId:input.incidentOperationId}),branch=await recoveryBranch(input.targetNeon,target.databaseUrl,incident,input.targetAttemptId,signal);
   stage='open-baseline';await owner.query('BEGIN');const initial=await ownerState();need(Date.parse(initial.openedAt)>=Date.parse(branch.targetCreatedAt)&&Date.parse(initial.openedAt)>=Date.parse(incident.incidentStartedAt));need(await currentRecoveryStateDigest(owner)===initial.verified.current_state_digest);
   const baseline=await ordinaryRecoveryStateDigest(owner,{sessionHashes:[],connectionIds:[]}),grants=await recoveryGrantCheckpoint(owner);probeFloor=initial.now;
   const priorSessions=(await owner.query('SELECT token_hash FROM login_sessions LIMIT 100001')).rows,priorConnections=(await owner.query('SELECT id FROM mcp_connections LIMIT 100001')).rows;need(priorSessions.length<=100000&&priorConnections.length<=100000);for(const row of priorSessions)oldSessions.add(row.token_hash);for(const row of priorConnections)oldConnections.add(row.id);await owner.query('COMMIT');
   observation=new RecoveryServiceTransport({origin:new URL(scope.origin).origin,signal,oldSessionHashes:[...oldSessions],oldConnectionIds:[...oldConnections],createdConnection:async({connectionId,cookieHash,requestKeys})=>(await reader.query(`SELECT 1 FROM mcp_management_receipts r JOIN login_sessions s ON s.membership_id=r.actor_membership_id AND s.workspace_id=r.workspace_id WHERE r.request_key=ANY($1::uuid[]) AND r.environment_id=$2 AND r.workspace_id=$3 AND r.action='create' AND r.connection_id=$4 AND s.token_hash=$5 LIMIT 1`,[[...requestKeys],scope.environmentMarker,scope.workspaceId,connectionId,cookieHash])).rowCount===1});

   const env={NODE_ENV:'production' as const,TURAS_PILOT_HOSTED_ADMIN_PASSWORD:credentials.passwords.mcteer,TURAS_PILOT_HOSTED_MEMBER_PASSWORD:credentials.passwords.panel,TURAS_PILOT_HOSTED_PARTNER_PASSWORD:credentials.passwords.partner,TURAS_PILOT_HOSTED_BYPASS_SECRET:credentials.protectionBypass};
   stage='ordinary-service';const reads=await runHostedReadChecks(scope,reader,signal,transport,env,async context=>{
    need(context.customerIds.includes(input.serviceCustomerId)&&context.allCustomerIds.includes(input.deniedCustomerId));
    const mcp=await runHostedMcpJourney({scope,db:reader,headers:context.headers,customerId:input.serviceCustomerId,deniedCustomerId:input.deniedCustomerId,signal,transport});need(mcp.credentialRevoked&&mcp.connectionId&&['tool-catalog','identity','customers','profile','evidence','evidence-citation','knowledge','knowledge-citation','plan','report','denied-customer','revoked-credential'].every(id=>mcp.cases.some(row=>row.id===id&&row.state==='pass')));connections.push(mcp.connectionId!);ordinary.push({role:context.role,sdk:mcp});
    if(context.role!=='internal-admin')return;
    const response=await transport(new URL('/api/operations/status',scope.origin),{headers:context.headers,signal}),health=z.object({data:z.object({ready:z.literal(true),admission:z.literal('open'),connectionBinding:operationalDatabaseBindingSchema,recovery:z.object({requiredScopesQuarantined:z.literal(0)})})}).parse(await boundedHostedJson(response));const binding=health.data.connectionBinding;need(response.status===200&&binding.databaseBindingDigest===databaseTargetDigest(target.databaseUrl,scope.environmentMarker)&&binding.environmentId===scope.environmentMarker&&binding.codeVersion===scope.sourceCommit&&binding.mode==='open'&&binding.recoveryId===config.scope.recoveryId&&binding.controlRevision===initial.controlRevision&&binding.effectiveRuntimeRole&&binding.directRuntimeLogin);
    for(const reference of input.nativeReferences){
     const query=reference.kind==='artifact'?['SELECT object_key,sha256_digest AS digest,actual_size_bytes AS bytes FROM artifact_versions WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[reference.id,scope.environmentMarker,scope.workspaceId]]:reference.kind==='workforce'?['SELECT v.object_key,v.content_digest AS digest,v.byte_size AS bytes FROM workforce_source_versions v JOIN workforce_import_intents i ON i.source_id=v.source_id AND i.environment_id=v.environment_id WHERE i.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.id=$4',[reference.id,scope.environmentMarker,scope.workspaceId,reference.sourceVersionId]]:['SELECT object_key,content_digest AS digest,size_bytes AS bytes FROM report_artifacts WHERE id=$1 AND environment_id=$2 AND workspace_id=$3',[reference.id,scope.environmentMarker,scope.workspaceId]];
     const rows=(await reader.query(query[0] as string,query[1] as string[])).rows,row=rows[0];need(rows.length===1&&Number(row.bytes)>0&&Number(row.bytes)<=10485760);
     const entry=candidate.objects.entries.find(value=>value.name==='objects/'+reference.kind+'/'+row.object_key);need(entry&&entry.digest===row.digest&&entry.sizeBytes===Number(row.bytes));
     const path=reference.kind==='artifact'?'/api/artifacts/'+reference.id+'/original':reference.kind==='workforce'?'/api/staffing/imports/'+reference.id+'/content':'/api/reports/artifacts/'+reference.id;
     const stream=await transport(new URL(path,scope.origin),{headers:context.headers,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});need(stream.status===200&&stream.headers.get('x-turas-code-version')===scope.sourceCommit);const readerBody=stream.body?.getReader();need(readerBody);let bytes=0;const digest=createHash('sha256');try{for(;;){const part=await readerBody!.read();if(part.done)break;bytes+=part.value.byteLength;need(bytes<=Number(row.bytes));digest.update(part.value);}}finally{await readerBody!.cancel().catch(()=>{});readerBody!.releaseLock();}need(bytes===Number(row.bytes)&&digest.digest('hex')===row.digest);streams.push({kind:reference.kind,id:reference.id,bytes,digest:row.digest});
    }
   },configuration);
   stage='retired-final-state';const observed=observation.snapshot(),sessions=new Set(observed.sessionHashes);need(reads.sessionsRevoked===3&&reads.revokedCookieDenials===3&&sessions.size===3&&connections.length===3&&new Set(connections).size===3&&ordinary.length===3&&streams.length===3);
   await sameSource();const finalIncident=await readRecoveryIncident(original,{environmentId:scope.environmentMarker,capturedAt:candidate.capturedAt,operationId:input.incidentOperationId});need(JSON.stringify(finalIncident)===JSON.stringify(incident));
   await owner.query('BEGIN');const final=await ownerState();need(final.controlRevision===initial.controlRevision&&final.openedAt===initial.openedAt);
   const retired=(await owner.query('SELECT count(*)::int AS count FROM login_sessions WHERE token_hash=ANY($1::text[]) AND workspace_id=$2 AND created_at>=$3::timestamptz AND revoked_at IS NOT NULL',[[...sessions],scope.workspaceId,initial.now])).rows[0];need(retired.count===3);
   const revoked=(await owner.query('SELECT count(*)::int AS count FROM mcp_connections WHERE id=ANY($1::uuid[]) AND workspace_id=$2 AND created_at>=$3::timestamptz AND revoked_at IS NOT NULL',[connections,scope.workspaceId,initial.now])).rows[0];need(revoked.count===3&&!(await owner.query('SELECT 1 FROM mcp_read_leases WHERE connection_id=ANY($1::uuid[]) LIMIT 1',[connections])).rowCount);
   need(await ordinaryRecoveryStateDigest(owner,{sessionHashes:[...sessions],connectionIds:connections})===baseline&&await recoveryGrantCheckpoint(owner)===grants);
   signal.throwIfAborted();const verifiedServiceAt=(await owner.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString(),timing=serviceRecoveryIntervals({capturedAt:candidate.capturedAt,incidentStartedAt:incident.incidentStartedAt,targetCreatedAt:branch.targetCreatedAt,openedAt:initial.openedAt,verifiedServiceAt});signal.throwIfAborted();
   await owner.query('COMMIT');const receipt={contract:'pilot-work-service-recovery-v1',...expectedSource,environmentId:scope.environmentMarker,deploymentId:scope.deploymentId,recoveryId:config.scope.recoveryId,verificationId:input.verificationId,targetAttemptId:input.targetAttemptId,incident,branch,openOperationId:input.openOperationId,bundleDigest:candidate.encryptedBundle.digest,...timing,ordinaryServiceVerified:true,completeRequiredScopeVerified:true,healthReady:true,probeRetirementVerified:true,oldCredentialsAndDomainStateUnchanged:true,reads,ordinary,streams,httpRequests:observed.ordinaryRequests,cleanupRequests:observed.cleanupRequests,providerModelCalls:0,paidJobs:0,rpoVerified:timing.captureWithin24Hours,rtoVerified:timing.verifiedServiceWithin4Hours,fullRecoveryReady:timing.captureWithin24Hours&&timing.verifiedServiceWithin4Hours,acceptedWorkLossClaim:'Conservative authenticated capture watermark; not a zero-loss assertion'};
   await writeEvidence(root,'service-recovery.json',receipt);return receipt;
  }catch(error){
   if(ownerConnected)await owner.query('ROLLBACK').catch(()=>{});
   // A failed observation never grants service readiness. The owner may only
   // retire exact NEW credentials identified by actual cookies/create receipts;
   // pre-existing credentials and unknown login acknowledgments are not guessed.
   const observed=observation?.snapshot(),sessions=new Set(observed?.sessionHashes??[]),requests=new Map(observed?.createRequests??[]);let observedCredentialsRetired=sessions.size===0&&requests.size===0,ownerDenyOnlyCleanup=false,unconfirmedMcpCreates=requests.size;
   if(ownerConnected&&probeFloor&&(sessions.size||requests.size))try{
    await owner.query("BEGIN; SET LOCAL transaction_timeout='30s'; SET LOCAL lock_timeout='3000ms'");
    const created=(await owner.query(`SELECT DISTINCT r.request_key,r.connection_id FROM mcp_management_receipts r JOIN login_sessions s ON s.membership_id=r.actor_membership_id AND s.workspace_id=r.workspace_id
     WHERE r.request_key=ANY($1::uuid[]) AND r.environment_id=$2 AND r.workspace_id=$3 AND r.action='create' AND r.created_at>=$4::timestamptz AND s.token_hash=ANY($5::text[])`,[[...requests.keys()],scope.environmentMarker,scope.workspaceId,probeFloor,[...sessions]])).rows;unconfirmedMcpCreates=requests.size-created.length;const createdIds=[...new Set(created.map(row=>String(row.connection_id)))];
    need(createdIds.length<=3&&createdIds.every(id=>!oldConnections.has(id))&&[...sessions].every(token=>!oldSessions.has(token)));
    await owner.query('UPDATE mcp_connections SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoker_membership_id=COALESCE(revoker_membership_id,membership_id) WHERE id=ANY($1::uuid[]) AND environment_id=$2 AND workspace_id=$3',[createdIds,scope.environmentMarker,scope.workspaceId]);
    await owner.query('UPDATE login_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE token_hash=ANY($1::text[]) AND workspace_id=$2',[[...sessions],scope.workspaceId]);
    need(!(await owner.query('SELECT 1 FROM login_sessions WHERE token_hash=ANY($1::text[]) AND revoked_at IS NULL UNION ALL SELECT 1 FROM mcp_connections WHERE id=ANY($2::uuid[]) AND revoked_at IS NULL LIMIT 1',[[...sessions],createdIds])).rowCount);await owner.query('COMMIT');observedCredentialsRetired=unconfirmedMcpCreates===0;ownerDenyOnlyCleanup=true;
   }catch{await owner.query('ROLLBACK').catch(()=>{});}
   await writeEvidence(root,'failure.json',{contract:'pilot-work-service-recovery-failure-v1',stage,environmentId:scope.environmentMarker,observedCredentialsRetired,ownerDenyOnlyCleanup,unknownLoginAcknowledgement:observed?.unknownLoginAcknowledgement??false,unconfirmedMcpCreates,rpoVerified:false,rtoVerified:false,fullRecoveryReady:false,automaticRetry:false});throw error;
  }
  finally{const closed=await Promise.allSettled([reader.end(),owner.end(),original.end()]);if(closed.some(result=>result.status==='rejected'))throw Error('Service recovery observer cleanup incomplete');}
 });
}
