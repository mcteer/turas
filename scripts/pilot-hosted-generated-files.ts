import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import {pilotHostedScopeSchema,type PilotHostedScope} from '../lib/contracts/pilot-hosted';
import type {HostedConfiguration} from '../lib/server/operations/hosted-configuration';
import {runHostedLinkedJourney} from './pilot-hosted-linked';
import {assertHostedFileTarget,verifyHostedFileRestart} from './pilot-hosted-maximum-files';
import {pilotHostedRequest} from './pilot-hosted-request';
import {verifyHostedPaidJobs} from './pilot-hosted-paid';
import {writeEvidence,evidenceDigest,readEvidence} from './pilot-evidence';
const digest=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.uuid();
/** Only identities are carried forward. Current domain reads and original worker
 * receipts, rather than manifest claims, establish eligibility after restart. */
export const hostedLinkedReferenceSchema=z.object({
 customerId:uuid,source:z.object({versionId:uuid,extractionRunId:uuid,lifecycleGeneration:z.number().int().positive(),profileRevisionId:uuid,providerCalls:z.literal(2)}),
 workforce:z.object({importId:uuid,sourceVersionId:uuid,jobId:uuid,providerCalls:z.literal(2)}),
 knowledge:z.object({contributionId:uuid,publicationId:uuid}),plan:z.object({planId:uuid,revisionId:uuid,engagementId:uuid,baselineId:uuid}),
 reports:z.object({providerCalls:z.literal(2)}),artifactIds:z.array(uuid).length(4),citationId:uuid,
});
export type HostedLinkedReference=z.infer<typeof hostedLinkedReferenceSchema>;
const artifact=z.strictObject({id:uuid,revisionId:uuid,reportId:uuid,jobId:uuid,format:z.enum(['pdf','pptx']),bytes:z.number().int().positive().max(10485760),digest,createdAt:z.iso.datetime({offset:true}),slides:z.literal(40),pages:z.number().int().positive().max(40)});
export const hostedGeneratedFilesManifestSchema=z.strictObject({contract:z.literal('pilot-hosted-generated-files-v1'),scope:pilotHostedScopeSchema,configurationDigest:digest,preparedAt:z.iso.datetime({offset:true}),journeyProofDigest:digest,reference:hostedLinkedReferenceSchema,artifacts:z.array(artifact).length(4)});
type Context={scope:PilotHostedScope;db:Client;headers:Headers;configuration:HostedConfiguration;evidenceDirectory:string;signal:AbortSignal};
const unwrap=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
async function readArtifact(input:Context,entry:z.infer<typeof artifact>){
 const response=await fetch(new URL('/api/reports/artifacts/'+entry.id,input.scope.origin),{headers:input.headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([input.signal,AbortSignal.timeout(30000)])});
 if(response.status!==200||response.headers.get('x-turas-code-version')!==input.scope.sourceCommit){await response.body?.cancel();throw Error('Exact current generated artifact unavailable');}
 const reader=response.body?.getReader();if(!reader)throw Error('Generated artifact stream required');let bytes=0;const hash=createHash('sha256');let header=Buffer.alloc(0);
 try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>entry.bytes)throw Error('Generated artifact exceeds immutable size');if(header.length<5)header=Buffer.concat([header,Buffer.from(next.value).subarray(0,5-header.length)]);hash.update(next.value);}}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 if(bytes!==entry.bytes||hash.digest('hex')!==entry.digest||header.subarray(0,entry.format==='pdf'?5:2).toString()!==(entry.format==='pdf'?'%PDF-':'PK'))throw Error('Actual generated artifact bytes differ');return {id:entry.id,format:entry.format,bytes,digest:entry.digest};
}
async function actualArtifacts(input:Context,reference:HostedLinkedReference){
 const rows=(await input.db.query(`SELECT a.id,a.revision_id,j.id AS job_id,a.format,a.size_bytes,a.content_digest,a.created_at,r.report_id,v.checks FROM report_artifacts a JOIN report_revisions r ON r.id=a.revision_id JOIN report_validations v ON v.id=a.validation_id AND v.revision_id=a.revision_id AND v.environment_id=a.environment_id AND v.workspace_id=a.workspace_id AND v.customer_id=a.customer_id JOIN report_jobs j ON j.revision_id=r.id AND j.environment_id=a.environment_id AND j.workspace_id=a.workspace_id AND j.customer_id=a.customer_id AND j.kind='render' AND j.state='completed' WHERE a.id=ANY($1::uuid[]) AND a.environment_id=$2 AND a.workspace_id=$3 AND a.customer_id=$4 AND a.validation_id IS NOT NULL AND EXISTS(SELECT 1 FROM report_publications p JOIN report_revision_states s ON s.revision_id=p.revision_id WHERE p.revision_id=r.id AND s.state='published') ORDER BY a.id`,[reference.artifactIds,input.scope.environmentMarker,input.scope.workspaceId,reference.customerId])).rows;
 const artifacts=rows.map(row=>artifact.parse({id:row.id,revisionId:row.revision_id,reportId:row.report_id,jobId:row.job_id,format:row.format,bytes:Number(row.size_bytes),digest:row.content_digest,createdAt:row.created_at.toISOString(),slides:row.checks.slides,pages:row.checks.pages}));
 if(artifacts.length!==4||new Set(reference.artifactIds).size!==4||new Set(artifacts.map(row=>row.revisionId)).size!==2||new Set(artifacts.map(row=>row.jobId)).size!==2||['pdf','pptx'].some(format=>artifacts.filter(row=>row.format===format).length!==2))throw Error('Exact normally published report artifact pairs required');
 for(const revisionId of new Set(artifacts.map(row=>row.revisionId)))if(artifacts.filter(row=>row.revisionId===revisionId).reduce((sum,row)=>sum+row.bytes,0)>15728640)throw Error('Normal combined artifact bound exceeded');
 return artifacts;
}
async function verifyChain(input:Context,reference:HostedLinkedReference){
 const customers=(await input.db.query('SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2',[reference.customerId,input.scope.workspaceId])).rows;if(customers.length!==1||customers[0].synthetic!==true)throw Error('Exact synthetic linked customer required');
 const request=pilotHostedRequest(input),source=z.object({id:uuid,state:z.literal('ready'),lifecycleGeneration:z.number().int(),publishedRunId:uuid}).parse(unwrap(await request('/api/artifacts/'+reference.source.versionId,'GET')));
 if(source.id!==reference.source.versionId||source.lifecycleGeneration!==reference.source.lifecycleGeneration||source.publishedRunId!==reference.source.extractionRunId)throw Error('Original reviewed source changed');
 const plan=z.object({planId:uuid,acceptedRevisionId:uuid,engagementId:uuid,reviewState:z.literal('accepted'),contentAvailability:z.literal('readable')}).parse(unwrap(await request('/api/plans/'+reference.plan.planId,'GET')));
 if(plan.planId!==reference.plan.planId||plan.acceptedRevisionId!==reference.plan.revisionId||plan.engagementId!==reference.plan.engagementId)throw Error('Original reviewed plan changed');
 const publication=z.object({id:uuid}).parse(unwrap(await request('/api/knowledge/'+reference.knowledge.publicationId,'GET')));if(publication.id!==reference.knowledge.publicationId)throw Error('Original reviewed baseline changed');
 const workforce=z.object({sourceVersionId:uuid,withheld:z.literal(false),extraction:z.object({complete:z.literal(true)})}).parse(unwrap(await request('/api/staffing/imports/'+reference.workforce.importId,'GET')));if(workforce.sourceVersionId!==reference.workforce.sourceVersionId)throw Error('Original workforce source changed');
 const images=[input.configuration.images.scanner,input.configuration.images.parser].map(value=>value.split('@sha256:')[1]);
 await verifyHostedPaidJobs({...input,domainKind:'artifact',domainJobIds:[reference.source.extractionRunId],expectedImageDigests:images});await verifyHostedPaidJobs({...input,domainKind:'workforce',domainJobIds:[reference.workforce.jobId],expectedImageDigests:images});
 const artifacts=await actualArtifacts(input,reference);await verifyHostedPaidJobs({...input,domainKind:'report',domainJobIds:[...new Set(artifacts.map(row=>row.jobId))],expectedImageDigests:[input.configuration.images.renderer.split('@sha256:')[1],input.configuration.images.renderer.split('@sha256:')[1]]});return artifacts;
}
/** First deployment: normal source/workforce/review/render/publication paths. */
export async function prepareHostedGeneratedFiles(input:Context&Parameters<typeof runHostedLinkedJourney>[0]){
 await assertHostedFileTarget(input);const journey=await runHostedLinkedJourney({...input,maximumReportLayout:true}),reference=hostedLinkedReferenceSchema.parse(journey),artifacts=await verifyChain(input,reference);
 for(const entry of artifacts)await readArtifact(input,entry);await assertHostedFileTarget(input);
 const journeyProofDigest=await writeEvidence(input.evidenceDirectory,'linked-execution.json',{scope:input.scope,journey}),manifest=hostedGeneratedFilesManifestSchema.parse({contract:'pilot-hosted-generated-files-v1',scope:input.scope,configurationDigest:evidenceDigest(JSON.stringify(input.configuration)),preparedAt:new Date().toISOString(),journeyProofDigest,reference,artifacts});
 await writeEvidence(input.evidenceDirectory,'generated-files.json',manifest);return manifest;
}
/** Second deployment: no repeated upload, review, render or paid operation. */
export async function verifyHostedGeneratedFiles(input:Context&{manifest:unknown;originalEvidenceDirectory:string}){
 const manifest=hostedGeneratedFilesManifestSchema.parse(input.manifest);if(manifest.configurationDigest!==evidenceDigest(JSON.stringify(input.configuration)))throw Error('Original generated-file configuration changed');
 const originalExecution=await readEvidence(input.originalEvidenceDirectory,'linked-execution.json',manifest.journeyProofDigest);const execution=z.object({scope:pilotHostedScopeSchema,journey:hostedLinkedReferenceSchema}).parse(originalExecution);if(JSON.stringify(execution.scope)!==JSON.stringify(manifest.scope)||JSON.stringify(execution.journey)!==JSON.stringify(manifest.reference))throw Error('Original normal journey identities differ');
 const created=await verifyHostedFileRestart(input,manifest.scope,manifest.preparedAt),artifacts=await verifyChain(input,manifest.reference);
 if(JSON.stringify(artifacts)!==JSON.stringify(manifest.artifacts)||artifacts.some(row=>Date.parse(row.createdAt)>Date.parse(manifest.preparedAt)||Date.parse(row.createdAt)>=created))throw Error('Actual original generated rows differ or follow restart');
 await writeEvidence(input.evidenceDirectory,'original-generated-chain.json',{contract:'pilot-original-generated-chain-v1',manifest,execution:originalExecution});
 const reads=[];for(const entry of artifacts)reads.push(await readArtifact(input,entry));await assertHostedFileTarget(input);
 await writeEvidence(input.evidenceDirectory,'generated-retention.json',{contract:'pilot-hosted-generated-retention-v1',scope:input.scope,originalDeploymentId:manifest.scope.deploymentId,restartedDeploymentId:input.scope.deploymentId,actualNormalGeneratedFiles:reads,actualNormalWorkerReceiptsVerified:true,maximumNormalSlideLayoutVerified:true,uncachedFullBytesAfterRestartVerified:true,newProviderJobs:0,modelCalls:0,maximumGeneratedByteBoundaryVerified:false,fullHostedFileCatalogVerified:false});return manifest.reference;
}
