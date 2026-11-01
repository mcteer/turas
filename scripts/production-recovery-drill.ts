import {Client} from 'pg';
import {z} from 'zod';
import {resolve,dirname,basename,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {getServerConfig} from '../lib/server/config';
import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {databaseSafetyCaptureSourceSchema,verifyDatabaseSafetySourceBinding} from './pilot-database-safety-copy';
import {pilotSource} from './pilot-source';
import {readEvidence,writeEvidence,createEvidenceDirectory} from './pilot-evidence';
import {readRetainedWorkDenialSnapshot} from './pilot-denial-reader';
import {pilotHostedScopeSchema,hostedDeploymentLookupPath,verifyHostedDeployment,type PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {workCaptureCandidateSchema} from '../lib/contracts/pilot-capture';
import {observeDrillBranch,readDrillDatabaseIdentity,verifyClosedDrillDatabase,admitVerifiedIsolatedDrill,authenticateDrillArchive,measureDrillObjects,refenceDrillTarget,assertDrillRuntimeConfiguration} from '../lib/server/operations/production-recovery-drill';
import {recoveryDigest} from '../lib/contracts/pilot-recovery';
import {verifyNativePostgresClient} from '../lib/server/operations/native-postgres';
import {BlobPrivateObjects} from '../lib/server/storage/blob-objects';
import {workIntegrityBlobAuth} from '../lib/server/operations/work-integrity-blob-auth';
import {productionRecoveryHttpFiles} from './production-recovery-objects';
import {runPrimaryRecoveryReadChecks,boundedHostedJson} from './pilot-hosted-http';
import {runProductionRecoveryMcpJourney} from './production-recovery-mcp';
import {hostedConfigurationSchema,verifyHostedConfiguration} from '../lib/server/operations/hosted-configuration';
import {RecoveryServiceTransport} from '../lib/server/operations/service-recovery-transport';
import {ordinaryRecoveryStateDigest} from '../lib/server/operations/service-recovery-state';
import {recoveryGrantCheckpoint} from '../lib/server/operations/grant-checkpoint';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {createHash} from 'node:crypto';
import {assertPilotDatabaseOnConnection} from '../lib/server/db/readiness';
const file=z.string().min(1).max(4096),providerId=z.string().regex(/^[a-z0-9-]{1,100}$/),need=(v:unknown)=>{if(!v)throw Error('Complete isolated Production recovery drill unavailable');};
const read=async(path:string)=>readEvidence(dirname(resolve(path)),basename(path));
/** Fixed official deployment GETs only; no retired programme/firewall module. */
async function assertDrillDeployment(scope:PilotHostedScope,signal:AbortSignal){
 need(scope.target==='preview'&&!execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8',timeout:10000}).trim());
 const source=await pilotSource();need(source.sourceCommit===scope.sourceCommit&&source.sourceDigest===scope.sourceDigest&&source.catalogDigest===scope.catalogDigest);
 const observations=[];for(const byOrigin of [false,true]){
  const result=await promisify(execFile)('vercel',['api',hostedDeploymentLookupPath(scope,byOrigin),'--raw'],{timeout:30000,signal,maxBuffer:1048576,env:Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]))});
  observations.push(verifyHostedDeployment(JSON.parse(result.stdout),scope));
 }need(JSON.stringify(observations[0])===JSON.stringify(observations[1]));
}

const startSchema=z.strictObject({contract:z.literal('production-recovery-drill-start-v1'),drillId:z.uuid(),startedAt:z.iso.datetime(),source:z.object({sourceCommit:z.string(),sourceDigest:z.string(),catalogDigest:z.string()}),sourceIdentity:z.object({environmentId:z.string(),schemaVersion:z.number(),databaseName:z.string(),systemIdentifier:z.string(),timelineId:z.string().nullable(),ownerRole:z.string(),owner:z.literal(true),mode:z.literal('open'),revision:z.number(),recoveryId:z.string().nullable(),at:z.string()}),sourceFileDigest:z.string().regex(/^[a-f0-9]{64}$/)});
export const productionRecoveryDrillConfigurationSchema=z.strictObject({contract:z.literal('production-recovery-drill-input-v1'),startFile:file,sourceFile:file,targetFile:file,runtimeFile:file,hostedScope:pilotHostedScopeSchema,candidateFile:file,bundle:file,keyFile:file,assetRoot:file,credentialsFile:file,denialReceipt:file,denialDestination:file,originalStoreId:z.string().min(1),configuration:hostedConfigurationSchema,targetNeon:z.strictObject({projectId:providerId,branchId:providerId,endpointId:providerId}),serviceCustomerId:z.uuid(),deniedCustomerId:z.uuid(),admitIsolatedDrill:z.literal(true),output:file});
const credentialsSchema=z.strictObject({passwords:z.strictObject({mcteer:z.string().min(1),panel:z.string().min(1),partner:z.string().min(1)}),protectionBypass:z.string().min(1).optional(),blobToken:z.string().min(1).optional(),oidcToken:z.string().min(1).optional()}).refine(value=>(value.blobToken!==undefined)!==(value.oidcToken!==undefined));
function connect(connectionString:string,readOnly=false){return new Client({connectionString,connectionTimeoutMillis:10000,statement_timeout:10000,query_timeout:12000,...(readOnly?{options:'-c default_transaction_read_only=on'}:{})});}
function tls(db:Client){need((db as any).connection.stream.encrypted&&(db as any).connection.stream.authorized);}
/** --start is an actual READ ONLY Source DB clock observation, not an incident. */
export async function productionRecoveryDrill(args=process.argv.slice(2)){
 if(args.length===5&&args[0]==='--start'&&args[1]==='--source'&&args[3]==='--output'){
  need(!execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8',timeout:10000}).trim());
  const sourceFile=resolve(args[2]),source=databaseSafetyCaptureSourceSchema.parse(await read(sourceFile));need(source.target==='production'&&source.schemaVersion===CURRENT_SCHEMA_VERSION);
  const root=resolve(args[4]);await createEvidenceDirectory(root);const db=connect(source.databaseUrl,true);try{await db.connect();tls(db);const identity=await readDrillDatabaseIdentity(db);need(identity.owner&&identity.mode==='open'&&identity.schemaVersion===CURRENT_SCHEMA_VERSION&&identity.environmentId===source.environmentId);const receipt=startSchema.parse({contract:'production-recovery-drill-start-v1',drillId:randomUUID(),startedAt:identity.at,source:await pilotSource(),sourceIdentity:identity,sourceFileDigest:recoveryDigest(source)});await writeEvidence(root,'start.json',receipt);return receipt;}finally{await db.end();}
 }
 if(args.length!==3||args[0]!=='--verify'||args[1]!=='--configuration')throw Error('Explicit isolated recovery drill configuration required');
 const c=productionRecoveryDrillConfigurationSchema.parse(await read(args[2])),start=startSchema.parse(await read(c.startFile)),source=databaseSafetyCaptureSourceSchema.parse(await read(c.sourceFile)),target=databaseSafetyCaptureSourceSchema.parse(await read(c.targetFile)),runtime=z.strictObject({connection:z.string().min(1)}).parse(await read(c.runtimeFile)),credentials=credentialsSchema.parse(await read(c.credentialsFile)),candidate=workCaptureCandidateSchema.parse(await read(c.candidateFile)),scope=c.hostedScope;
 need(source.target==='production'&&target.target==='preview'&&scope.target==='preview'&&source.environmentId===target.environmentId&&source.environmentId===scope.environmentMarker&&candidate.environmentId===scope.environmentMarker&&recoveryDigest(source)===start.sourceFileDigest);
 need(new URL(source.databaseUrl).hostname!==new URL(target.databaseUrl).hostname&&new URL(runtime.connection).hostname===new URL(target.databaseUrl).hostname&&decodeURIComponent(new URL(runtime.connection).pathname)===decodeURIComponent(new URL(target.databaseUrl).pathname)&&decodeURIComponent(new URL(runtime.connection).username)==='turas_runtime_016');
 need(c.originalStoreId!==c.configuration.storeId&&c.configuration.environmentMarker===scope.environmentMarker&&c.configuration.projectId===scope.projectId&&c.configuration.teamId===scope.teamId&&!c.configuration.dispatcherEnabled&&!c.configuration.embeddingProviderConfigured&&c.serviceCustomerId!==c.deniedCustomerId);
 // A repaired verifier retains the original provisioning clock and Source
 // identity; its current clean deployment/source is independently checked.
 const selectedSource=await pilotSource();need(scope.sourceCommit===selectedSource.sourceCommit&&scope.sourceDigest===selectedSource.sourceDigest&&scope.catalogDigest===selectedSource.catalogDigest);
 assertDrillRuntimeConfiguration(getServerConfig(),{runtimeConnection:runtime.connection,environmentId:scope.environmentMarker,origin:scope.origin,processEnvironmentId:process.env.TURAS_ENVIRONMENT_ID});
 const root=resolve(c.output);await createEvidenceDirectory(root);
 return withRecoveryCancellation(900000,async parentSignal=>{
  const connectionLost=new AbortController(),signal=AbortSignal.any([parentSignal,connectionLost.signal]);
  const live=connect(source.databaseUrl,true),owner=connect(target.databaseUrl),reader=connect(runtime.connection),connections:string[]=[],results:unknown[]=[],httpFiles:unknown[]=[];let probeFloor:string|undefined;const oldProbeConnections=new Set<string>();let ownerConnected=false,admissionMayHaveStarted=false;let targetIdentity:Awaited<ReturnType<typeof readDrillDatabaseIdentity>>|undefined;let targetAdmitted=false,observation:RecoveryServiceTransport|undefined,sourceBefore:Awaited<ReturnType<typeof readDrillDatabaseIdentity>>|undefined;
  for(const db of [live,owner,reader])db.on('error',error=>connectionLost.abort(error));
  const staging=await mkdtemp(join(root,'current-denials-'));
  try{
   await verifyDatabaseSafetySourceBinding(source,scope.teamId,signal);await assertDrillDeployment(scope,signal);
   const branch=await observeDrillBranch({...c.targetNeon,targetConnection:target.databaseUrl,sourceConnection:source.databaseUrl,drillId:start.drillId,startedAt:start.startedAt},signal);
   const archive=await authenticateDrillArchive({candidate,bundle:resolve(c.bundle),keyFile:resolve(c.keyFile),signal});
   const native=await verifyNativePostgresClient(resolve(c.assetRoot));need(recoveryDigest({environmentId:candidate.environmentId,databaseName:candidate.sourceDatabaseName,sourceProjectId:scope.projectId,storeId:c.originalStoreId,backend:'private-blob',workflow:'managed-workflow',clientManifestDigest:native.manifestDigest})===candidate.configurationDigest);
   await live.connect();tls(live);sourceBefore=await readDrillDatabaseIdentity(live);need(Date.now()-Date.parse(candidate.capturedAt)<=86400000&&Date.parse(candidate.capturedAt)<=Date.parse(start.startedAt)&&Date.parse(start.startedAt)-Date.parse(candidate.capturedAt)<=86400000);need(sourceBefore.owner&&sourceBefore.mode==='open'&&sourceBefore.systemIdentifier===start.sourceIdentity.systemIdentifier&&sourceBefore.databaseName===start.sourceIdentity.databaseName&&sourceBefore.schemaVersion===CURRENT_SCHEMA_VERSION);
   await owner.connect();ownerConnected=true;tls(owner);const identity=await readDrillDatabaseIdentity(owner);targetIdentity=identity;need((owner as any).connectionParameters.host===branch.host);if(identity.timelineId&&sourceBefore.timelineId)need(identity.timelineId!==sourceBefore.timelineId);need(identity.environmentId===sourceBefore.environmentId&&identity.recoveryId===start.drillId);
   const retained=await readRetainedWorkDenialSnapshot({receipt:resolve(c.denialReceipt),destination:resolve(c.denialDestination),staging,environmentId:candidate.environmentId,after:candidate.capturedAt},signal);
   const store=new BlobPrivateObjects(candidate.environmentId,workIntegrityBlobAuth(c.configuration.storeId,credentials),10485760);
   const objects=await measureDrillObjects(owner,archive,store,signal);
   const database=await verifyClosedDrillDatabase(owner,{branch,drillId:start.drillId,archive,objects,denials:retained});await writeEvidence(root,'closed-database.json',{database,objects:{captured:objects.capturedObjectCount,required:objects.requiredObjectCount,verified:objects.verifiedObjectCount}});
   admissionMayHaveStarted=true;const admission=await admitVerifiedIsolatedDrill(owner,database);targetAdmitted=true;await writeEvidence(root,'isolated-drill-admission.json',admission);
   signal.throwIfAborted();await reader.connect();tls(reader);await assertPilotDatabaseOnConnection(scope.environmentMarker,(sql,values)=>reader.query(sql,[...(values??[])]));const runtimeIdentity=(await reader.query('SELECT current_user,current_database(),e.environment_id,e.schema_version,c.mode FROM turas_environment e JOIN operations_control c USING(environment_id)')).rows;need(runtimeIdentity.length===1&&runtimeIdentity[0].current_user==='turas_runtime_016'&&runtimeIdentity[0].current_database===identity.databaseName&&runtimeIdentity[0].environment_id===candidate.environmentId&&runtimeIdentity[0].schema_version===CURRENT_SCHEMA_VERSION&&runtimeIdentity[0].mode==='open');
   await owner.query('BEGIN');const baseline=await ordinaryRecoveryStateDigest(owner,{sessionHashes:[],connectionIds:[]}),grants=await recoveryGrantCheckpoint(owner),oldSessions=(await owner.query('SELECT token_hash FROM login_sessions LIMIT 100001')).rows.map(r=>r.token_hash),oldConnections=(await owner.query('SELECT id FROM mcp_connections LIMIT 100001')).rows.map(r=>r.id);need(oldSessions.length<=100000&&oldConnections.length<=100000);for(const id of oldConnections)oldProbeConnections.add(id);probeFloor=(await readDrillDatabaseIdentity(owner)).at;await owner.query('COMMIT');
   observation=new RecoveryServiceTransport({origin:new URL(scope.origin).origin,signal,oldSessionHashes:oldSessions,oldConnectionIds:oldConnections,createdConnection:async({connectionId,cookieHash,requestKeys})=>(await reader.query(`SELECT 1 FROM mcp_management_receipts r JOIN login_sessions s ON s.membership_id=r.actor_membership_id AND s.workspace_id=r.workspace_id WHERE r.request_key=ANY($1::uuid[]) AND r.environment_id=$2 AND r.workspace_id=$3 AND r.action='create' AND r.connection_id=$4 AND s.token_hash=$5`,[[...requestKeys],scope.environmentMarker,scope.workspaceId,connectionId,cookieHash])).rowCount===1});
   const transport:typeof fetch=(...args)=>observation!.fetch(...args),env={TURAS_DEMO_PASSWORD:credentials.passwords.mcteer,PANEL_PASSWORD:credentials.passwords.panel,PARTNER_PASSWORD:credentials.passwords.partner,TURAS_PILOT_HOSTED_BYPASS_SECRET:credentials.protectionBypass};
   const reads=await runPrimaryRecoveryReadChecks(scope,reader,signal,transport,env,async context=>{
    const mcp=await runProductionRecoveryMcpJourney({scope,db:reader,headers:context.headers,customerId:c.serviceCustomerId,deniedCustomerId:c.deniedCustomerId,signal,transport,...(context.role==='assigned-partner'&&!context.partnerCustomerIds.length?{knowledgeOnly:true as const}:{})});need(mcp.connectionId&&mcp.credentialRevoked);connections.push(mcp.connectionId!);results.push({role:context.role,mcp});
    if(context.role!=='internal-admin')return;
    const response=await transport(new URL('/api/operations/status',scope.origin),{headers:context.headers,signal}),body=z.object({data:z.object({configuration:z.unknown(),connectionBinding:z.object({environmentId:z.string(),codeVersion:z.string(),databaseBindingDigest:z.string(),mode:z.string()})})}).parse(await boundedHostedJson(response));need(response.status===200&&response.headers.get('x-turas-code-version')===scope.sourceCommit);verifyHostedConfiguration(body.data.configuration,c.configuration);
    const {databaseTargetDigest}=await import('../lib/server/operations/database-binding');need(body.data.connectionBinding.environmentId===scope.environmentMarker&&body.data.connectionBinding.codeVersion===scope.sourceCommit&&body.data.connectionBinding.mode==='open'&&body.data.connectionBinding.databaseBindingDigest===databaseTargetDigest(target.databaseUrl,scope.environmentMarker));
    for(const reference of await productionRecoveryHttpFiles(reader,scope.environmentMarker,scope.workspaceId,context.headers)){
     const captured=objects.captured.find(value=>value.key===reference.key);need(captured&&captured.digest===reference.digest&&captured.sizeBytes===reference.sizeBytes);const response=await transport(new URL(reference.path,scope.origin),{headers:context.headers,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});need(response.status===200&&response.headers.get('x-turas-code-version')===scope.sourceCommit&&response.body);
     const body=response.body!.getReader(),hash=createHash('sha256');let bytes=0;try{for(;;){const part=await body.read();if(part.done)break;bytes+=part.value.byteLength;need(bytes<=reference.sizeBytes);hash.update(part.value);}}finally{await body.cancel().catch(()=>{});body.releaseLock();}need(bytes===reference.sizeBytes&&hash.digest('hex')===reference.digest);httpFiles.push({kind:reference.kind,id:reference.id,digest:reference.digest,bytes});
    }
   },c.configuration);
   const observed=observation.snapshot();need(reads.sessionsRevoked===3&&reads.revokedCookieDenials===3&&observed.sessionHashes.length===3&&connections.length===3&&!observed.unknownLoginAcknowledgement);
   await owner.query('BEGIN');need(await ordinaryRecoveryStateDigest(owner,{sessionHashes:observed.sessionHashes,connectionIds:connections})===baseline&&await recoveryGrantCheckpoint(owner)===grants);
   need(!(await owner.query('SELECT 1 FROM login_sessions WHERE token_hash=ANY($1::text[]) AND revoked_at IS NULL UNION ALL SELECT 1 FROM mcp_connections WHERE id=ANY($2::uuid[]) AND revoked_at IS NULL UNION ALL SELECT 1 FROM mcp_read_leases WHERE connection_id=ANY($2::uuid[]) LIMIT 1',[[...observed.sessionHashes],connections])).rowCount);const finished=await readDrillDatabaseIdentity(owner);await owner.query('COMMIT');
   const sourceAfter=await readDrillDatabaseIdentity(live);need(sourceAfter.mode==='open'&&sourceAfter.systemIdentifier===sourceBefore.systemIdentifier&&sourceAfter.databaseName===sourceBefore.databaseName&&sourceAfter.revision===sourceBefore.revision&&sourceAfter.recoveryId===sourceBefore.recoveryId);
   need(JSON.stringify(await pilotSource())===JSON.stringify(selectedSource)&&Date.parse(finished.at)>=Date.parse(start.startedAt));await assertDrillDeployment(scope,signal);
   signal.throwIfAborted();const receipt={contract:'production-isolated-recovery-drill-v1',...selectedSource,drillId:start.drillId,startedSource:start.source,startedAt:start.startedAt,finishedAt:finished.at,drillElapsedMs:Date.parse(finished.at)-Date.parse(start.startedAt),captureAgeAtStartMs:Date.parse(start.startedAt)-Date.parse(candidate.capturedAt),drillWithinFourHours:Date.parse(finished.at)-Date.parse(start.startedAt)<=14400000,captureWithin24HoursAtDrillStart:Date.parse(start.startedAt)-Date.parse(candidate.capturedAt)<=86400000,rpoBoundary:'Authenticated capture watermark as of drill start; live Source continued operating',branch,sourceRemainedOpen:true,sourceSqlWrites:0,firewallOperations:0,providerModelCalls:0,paidJobs:0,liveProductionFailoverVerified:false,fullRecoveryReady:false,isolatedReadServiceVerified:true,database,admission,objects:{captured:objects.capturedObjectCount,required:objects.requiredObjectCount,verified:objects.verifiedObjectCount},reads,roles:results,httpFiles,probeCredentialsRetired:true,scope:'Non-disruptive isolated read-service drill; not observed outage RTO or automatic failover'};await writeEvidence(root,'drill.json',receipt);return receipt;
  }catch(error){
   if(ownerConnected)await owner.query('ROLLBACK').catch(()=>{});let exactProbeCleanup=false,targetRefenced=false;
   if(admissionMayHaveStarted&&targetIdentity){
    const cleanup=connect(target.databaseUrl);cleanup.on('error',()=>{});let cleanupConnected=false;
    try{
     await cleanup.connect();cleanupConnected=true;tls(cleanup);
     const fenced=await refenceDrillTarget(cleanup,{environmentId:scope.environmentMarker,databaseName:targetIdentity.databaseName,systemIdentifier:targetIdentity.systemIdentifier,host:new URL(target.databaseUrl).hostname,drillId:start.drillId});targetRefenced=fenced.targetRefenced;
     const observed=observation?.snapshot(),sessions=[...(observed?.sessionHashes??[])],requests=[...(observed?.createRequests??[])];
     await cleanup.query('BEGIN');
     const ids=requests.length?(await cleanup.query(`SELECT DISTINCT r.connection_id FROM mcp_management_receipts r JOIN login_sessions s ON s.membership_id=r.actor_membership_id AND s.workspace_id=r.workspace_id WHERE r.request_key=ANY($1::uuid[]) AND r.environment_id=$2 AND r.workspace_id=$3 AND r.action='create' AND s.token_hash=ANY($4::text[]) AND r.created_at>=$5::timestamptz AND s.created_at>=$5::timestamptz`,[requests.map(row=>row[0]),scope.environmentMarker,scope.workspaceId,sessions,probeFloor])).rows.map(row=>row.connection_id):[];
     need(ids.length<=3&&sessions.length<=3&&ids.every(id=>!oldProbeConnections.has(id)));
     await cleanup.query('UPDATE mcp_connections SET revoked_at=COALESCE(revoked_at,clock_timestamp()),revoker_membership_id=COALESCE(revoker_membership_id,membership_id) WHERE id=ANY($1::uuid[]) AND environment_id=$2 AND workspace_id=$3',[ids,scope.environmentMarker,scope.workspaceId]);
     await cleanup.query('UPDATE login_sessions SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE token_hash=ANY($1::text[]) AND workspace_id=$2',[sessions,scope.workspaceId]);
     await cleanup.query('COMMIT');exactProbeCleanup=!observed?.unknownLoginAcknowledgement&&ids.length===requests.length;
    }catch{if(cleanupConnected)await cleanup.query('ROLLBACK').catch(()=>{});}
    finally{await cleanup.end().catch(()=>{});}
   }
   await writeEvidence(root,'failure.json',{targetAdmitted,admissionMayHaveStarted,admissionOutcomeUnknown:admissionMayHaveStarted&&!targetAdmitted,targetRefenced,exactProbeCleanup,isolatedReadServiceVerified:false,liveProductionFailoverVerified:false,automaticRetry:false,sourceSqlWrites:0,firewallOperations:0});throw error;
  }
  finally{await Promise.allSettled([reader.end(),owner.end(),live.end()]);await rm(staging,{recursive:true,force:true});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)productionRecoveryDrill().then(()=>console.info('Isolated recovery drill recorded; no live failover claim')).catch(()=>{console.error('Isolated recovery drill incomplete; inspect private retained stages');process.exitCode=1;});
