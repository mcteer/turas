import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import type {HostedConfiguration} from '../lib/server/operations/hosted-configuration';
import {artifactVersionDtoSchema} from '../lib/contracts/artifacts';
import {BlobPrivateObjects} from '../lib/server/storage/blob-objects';
import {privateBlobAuth} from '../lib/server/storage/blob-auth';
import {objectKey} from '../lib/server/storage/private-objects';
import {hostedMaximumFilesManifestSchema,verifyHostedMaximumFiles,assertHostedFileTarget} from './pilot-hosted-maximum-files';
import {pilotHostedRequest} from './pilot-hosted-request';
import {readHostedOriginalRefusal} from './pilot-hosted-file-access';
import {writeEvidence} from './pilot-evidence';
const data=(value:unknown)=>z.object({data:z.unknown()}).parse(value).data;
/** Explicit post-retention phase. Deletes only two fixed harmless originals
 * after normal withdrawal; all original mutation keys are retained before IO. */
export async function retireHostedMaximumFiles(input:{scope:PilotHostedScope;db:Client;headers:Headers;configuration:HostedConfiguration;manifest:unknown;evidenceDirectory:string;signal:AbortSignal}){
 const manifest=hostedMaximumFilesManifestSchema.parse(input.manifest);await verifyHostedMaximumFiles(input);
 if(process.env.BLOB_STORE_ID?.replace(/^store_/,'')!==input.configuration.storeId||process.env.VERCEL_BLOB_RETRIES!=='0')throw Error('Exact original private store with disabled retries required');
 const objects=new BlobPrivateObjects(input.scope.environmentMarker,privateBlobAuth(),10485760),request=pilotHostedRequest(input),identities=[];
 for(const entry of manifest.originals){
  const rows=entry.kind==='artifact'?(await input.db.query('SELECT object_key FROM artifact_versions WHERE id=$1 AND workspace_id=$2 AND environment_id=$3',[entry.id,input.scope.workspaceId,input.scope.environmentMarker])).rows:(await input.db.query('SELECT v.object_key,v.source_id FROM workforce_source_versions v JOIN workforce_import_intents i ON i.source_id=v.source_id AND i.id=$1 WHERE v.id=$2 AND v.workspace_id=$3 AND v.environment_id=$4',[entry.id,entry.sourceVersionId,input.scope.workspaceId,input.scope.environmentMarker])).rows;
  if(rows.length!==1)throw Error('Exact original private object row required');const key=objectKey(input.scope.environmentMarker,entry.kind==='artifact'?'artifact':'workforce',rows[0].object_key),before=await objects.stat(key,input.signal);if(!before||before.sizeBytes!==entry.bytes||before.digest!==entry.digest)throw Error('Original store readback must precede retirement');
  identities.push({entry,key,sourceId:rows[0].source_id as string|undefined});
 }
 for(const {entry} of identities){
  if(entry.kind==='artifact'){
   const view=artifactVersionDtoSchema.parse(data(await request('/api/artifacts/'+entry.id,'GET'))),body={action:'withdraw',expectedGeneration:view.lifecycleGeneration,reason:'Controlled post-restart maximum-file withholding exercise',idempotencyKey:randomUUID()};await writeEvidence(input.evidenceDirectory,'maximum-artifact-withdraw-intent.json',{scope:input.scope,versionId:entry.id,body});
   try{await request('/api/artifacts/'+entry.id+'/actions','POST',body);}catch(error){await request('/api/artifacts/'+entry.id,'GET').catch(()=>undefined);throw error;}
   const after=artifactVersionDtoSchema.parse(data(await request('/api/artifacts/'+entry.id,'GET')));if(after.state!=='withdrawn'||after.canReadOriginal||after.canPropose||after.lifecycleGeneration!==view.lifecycleGeneration+1)throw Error('Normal original withdrawal unconfirmed');
  }else{
   const view=z.object({generation:z.number().int().positive(),sourceVersionId:z.uuid()}).parse(data(await request('/api/staffing/imports/'+entry.id,'GET')));if(view.sourceVersionId!==entry.sourceVersionId)throw Error('Original personnel generation changed');const body={requestKey:randomUUID(),sourceGeneration:view.generation,rationale:'Controlled post-restart maximum-file withholding exercise'};await writeEvidence(input.evidenceDirectory,'maximum-workforce-withdraw-intent.json',{scope:input.scope,importId:entry.id,body});
   try{await request('/api/staffing/imports/'+entry.id,'DELETE',body);}catch(error){await request('/api/staffing/commands/'+body.requestKey,'GET').catch(()=>undefined);throw error;}
   const after=z.object({withheld:z.literal(true),generation:z.number().int()}).parse(data(await request('/api/staffing/imports/'+entry.id,'GET')));if(after.generation!==view.generation+1)throw Error('Normal personnel withdrawal unconfirmed');
  }
 }
 const denied=[];
 for(const {entry} of identities){const paths=entry.kind==='artifact'?['/api/artifacts/'+entry.id+'/original','/api/artifacts/'+entry.id+'/units']:['/api/staffing/imports/'+entry.id+'/content','/api/staffing/imports/'+entry.id+'/rows'];for(const path of paths){const response=await fetch(new URL(path,input.scope.origin),{headers:input.headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([input.signal,AbortSignal.timeout(10000)])});if(!(entry.kind==='artifact'?[409]:[404]).includes(response.status)||response.headers.get('x-turas-code-version')!==input.scope.sourceCommit){await response.body?.cancel();throw Error('Current withdrawn original/text withholding unverified');}await readHostedOriginalRefusal(response);denied.push({kind:entry.kind,status:response.status});}}
 const artifact=manifest.originals.find(row=>row.kind==='artifact')!,current=artifactVersionDtoSchema.parse(data(await request('/api/artifacts/'+artifact.id,'GET'))),deleteBody={action:'delete',expectedGeneration:current.lifecycleGeneration,reason:'Delete only the controlled harmless maximum-file fixture after retention and withholding checks',idempotencyKey:randomUUID()};await writeEvidence(input.evidenceDirectory,'maximum-artifact-delete-intent.json',{scope:input.scope,versionId:artifact.id,body:deleteBody});try{await request('/api/artifacts/'+artifact.id+'/actions','POST',deleteBody);}catch(error){await request('/api/artifacts/'+artifact.id,'GET').catch(()=>undefined);throw error;}
 const workforce=identities.find(row=>row.entry.kind==='workforce')!,until=Date.now()+300000;
 for(;;){input.signal.throwIfAborted();const a=(await input.db.query("SELECT state,(SELECT count(*)::int FROM artifact_cleanup_jobs WHERE version_id=v.id AND lifecycle_generation=v.lifecycle_generation AND state='done') AS complete FROM artifact_versions v WHERE id=$1 AND environment_id=$2 AND workspace_id=$3",[artifact.id,input.scope.environmentMarker,input.scope.workspaceId])).rows[0],w=(await input.db.query("SELECT state,(SELECT count(*)::int FROM workforce_cleanup_jobs WHERE source_id=s.id AND generation=s.generation-1 AND state='completed') AS complete FROM workforce_sources s WHERE id=$1 AND environment_id=$2 AND workspace_id=$3",[workforce.sourceId,input.scope.environmentMarker,input.scope.workspaceId])).rows[0];if(a?.state==='deleted'&&Number(a.complete)===5&&w?.state==='deleted'&&Number(w.complete)===1)break;if(Date.now()>=until)throw Error('Normal owned file cleanup incomplete');await new Promise<void>((done,reject)=>{const abort=()=>{clearTimeout(timer);reject(input.signal.reason);},timer=setTimeout(()=>{input.signal.removeEventListener('abort',abort);done();},2000);input.signal.addEventListener('abort',abort,{once:true});if(input.signal.aborted)abort();});}
 for(const identity of identities)if(await objects.stat(identity.key,input.signal)!==null)throw Error('Actual original Blob absence unverified');
 const payload=(await input.db.query(`SELECT (SELECT count(*) FROM artifact_extraction_units WHERE version_id=$1 AND (text IS NOT NULL OR formula IS NOT NULL OR cached_value IS NOT NULL))+(SELECT count(*) FROM artifact_evidence_payloads p JOIN artifact_evidence_selections s ON s.id=p.selection_id WHERE s.version_id=$1)+(SELECT count(*) FROM workforce_source_payloads WHERE revision_id=$2)+(SELECT count(*) FROM workforce_extraction_payloads p JOIN workforce_extractions x ON x.id=p.revision_id WHERE x.source_version_id=$2)+(SELECT count(*) FROM workforce_extracted_cell_payloads p JOIN workforce_extracted_cells c ON c.id=p.revision_id JOIN workforce_extractions x ON x.id=c.extraction_id WHERE x.source_version_id=$2) AS remaining`,[artifact.id,workforce.entry.sourceVersionId])).rows;if(payload.length!==1||Number(payload[0].remaining)!==0)throw Error('Actual original extraction payload purge incomplete');
 await assertHostedFileTarget(input);const result={contract:'pilot-hosted-maximum-retirement-v1',scope:input.scope,normalCommands:3,withheld:denied,normalCleanupJobs:6,actualOriginalBlobAbsenceVerified:true,actualOriginalExtractionPayloadPurgeVerified:true,originals:manifest.originals.map(row=>({kind:row.kind,id:row.id})),modelCalls:0,newProviderJobs:0,fullHostedFileCatalogVerified:false};await writeEvidence(input.evidenceDirectory,'maximum-retirement.json',result);return result;
}
