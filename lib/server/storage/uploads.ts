import {privateBlobAuth} from './blob-auth';
import {randomUUID,randomBytes} from 'node:crypto';
import {handleUpload,type HandleUploadBody} from '@vercel/blob/client';
import {z} from 'zod';
import {failure,HttpFailure,success,hiddenRecord} from '../../contracts/http';
import {artifactSession} from '../artifacts/http';
import {artifactUploadSnapshot,stageArtifactUpload,readArtifactUploadIntent} from '../artifacts/upload';
import {workforceUploadSnapshot,uploadImportOriginal} from '../staffing/imports';
import type {CurrentSession} from '../auth/sessions';
import {withTransaction} from '../db/client';
import {getServerConfig} from '../config';
import {privateObjectBackend} from './factory';
import {objectKey} from './private-objects';
import {BlobPrivateObjects} from './blob-objects';
type Domain='artifact'|'workforce';
type Capability={id:string;environment_id:string;workspace_id:string;principal_id:string;membership_id:string;session_id:string;domain_kind:Domain;domain_intent_id:string;source_generation:string;staging_key:string;expected_bytes:string;expires_at:Date;state:string};
const prepare=z.object({type:z.literal('prepare')}).strict(),finish=z.object({type:z.literal('finish'),capabilityId:z.uuid()}).strict();
const snapshot=(domain:Domain,actor:CurrentSession,id:string)=>domain==='artifact'?artifactUploadSnapshot(actor,id):workforceUploadSnapshot(actor,id);
const objects=()=>{if(privateObjectBackend()!=='blob')throw new HttpFailure(503,'store_unavailable','Private staging unavailable');return new BlobPrivateObjects(getServerConfig().TURAS_ENVIRONMENT_ID,privateBlobAuth(),10485760);};
export async function prepareDirectUpload(domain:Domain,actor:CurrentSession,id:string){const current=await snapshot(domain,actor,id);if(privateObjectBackend()==='local')return {strategy:'local' as const};return withTransaction(async db=>{
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['upload:'+domain+':'+id]);
 const env=getServerConfig().TURAS_ENVIRONMENT_ID;const prior=(await db.query<Capability>("SELECT * FROM operations_upload_capabilities WHERE environment_id=$1 AND domain_kind=$2 AND domain_intent_id=$3 AND state='prepared' FOR UPDATE",[env,domain,id])).rows[0];
 if(prior&&prior.session_id===actor.sessionId&&prior.expires_at.getTime()>Date.now()&&Number(prior.source_generation)===current.generation)return capabilityReceipt(prior);
 if(prior)await db.query("UPDATE operations_upload_capabilities SET state='revoked' WHERE id=$1",[prior.id]);
 const issued=new Date(),expires=new Date(Math.min(issued.getTime()+600000,current.expiresAt.getTime()));
 const namespace=domain==='artifact'?'artifact-staging':'workforce-staging',staging=domain==='artifact'?randomBytes(32).toString('hex'):randomUUID();
 const row=(await db.query<Capability>(`INSERT INTO operations_upload_capabilities(id,environment_id,workspace_id,principal_id,membership_id,session_id,domain_kind,domain_intent_id,source_generation,staging_key,expected_bytes,issued_at,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[randomUUID(),env,actor.workspaceId,actor.principalId,actor.membershipId,actor.sessionId,domain,id,current.generation,objectKey(env,namespace,staging),current.sizeBytes,issued,expires])).rows[0];return capabilityReceipt(row);
 });}
function capabilityReceipt(row:Capability){return {strategy:'blob' as const,capabilityId:row.id,pathname:row.staging_key,sizeBytes:Number(row.expected_bytes),validUntil:row.expires_at.getTime(),contentType:'application/octet-stream' as const};}
async function currentCapability(domain:Domain,actor:CurrentSession,id:string,capabilityId:string){const current=await snapshot(domain,actor,id);const row=await withTransaction(async db=>(await db.query<Capability>('SELECT * FROM operations_upload_capabilities WHERE id=$1 AND environment_id=$2 AND domain_kind=$3 AND domain_intent_id=$4 AND workspace_id=$5 AND principal_id=$6 AND membership_id=$7 AND session_id=$8',[capabilityId,getServerConfig().TURAS_ENVIRONMENT_ID,domain,id,actor.workspaceId,actor.principalId,actor.membershipId,actor.sessionId])).rows[0]);if(!row)throw hiddenRecord();if(row.state!=='prepared'||row.expires_at.getTime()<=Date.now()||Number(row.source_generation)!==current.generation||Number(row.expected_bytes)!==current.sizeBytes)throw new HttpFailure(409,'source_changed','Upload capability changed or expired');return {row,current};}
export async function finishDirectUpload(domain:Domain,actor:CurrentSession,id:string,capabilityId:string){
 const completed=await withTransaction(async db=>(await db.query<Capability>("SELECT * FROM operations_upload_capabilities WHERE id=$1 AND environment_id=$2 AND domain_kind=$3 AND domain_intent_id=$4 AND workspace_id=$5 AND principal_id=$6 AND membership_id=$7 AND session_id=$8 AND state='finished'",[capabilityId,getServerConfig().TURAS_ENVIRONMENT_ID,domain,id,actor.workspaceId,actor.principalId,actor.membershipId,actor.sessionId])).rows[0]);
 if(completed){if(domain==='artifact')return readArtifactUploadIntent(actor,id);const current=await workforceUploadSnapshot(actor,id);if(current.generation!==Number(completed.source_generation))throw new HttpFailure(409,'source_changed','Import changed');return {importId:id,generation:current.generation,state:'uploaded'};}
 const {row,current}=await currentCapability(domain,actor,id,capabilityId);const body=await objects().stream(row.staging_key);let result:unknown;
 if(domain==='artifact'){await stageArtifactUpload(actor,id,body,current.sizeBytes);result=await readArtifactUploadIntent(actor,id);}else result=await uploadImportOriginal(actor,id,body,'mime' in current&&typeof current.mime==='string'?current.mime:undefined);
 await withTransaction(async db=>{await db.query("UPDATE operations_upload_capabilities SET state='finished' WHERE id=$1 AND state='prepared'",[row.id]);});
 await objects().delete(row.staging_key);return result;
}
async function jsonBody(request:Request){if(!request.headers.get('content-type')?.startsWith('application/json')||!request.body)throw new HttpFailure(415,'invalid_input','JSON body required');const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>8192)throw new HttpFailure(413,'too_large','Upload request too large');parts.push(next.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}try{return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;}catch{throw new HttpFailure(422,'invalid_input','Invalid upload request');}}
export async function directUploadRequest(request:Request,domain:Domain,id:string):Promise<Response>{try{
 z.uuid().parse(id);const body=await jsonBody(request);if(prepare.safeParse(body).success){const actor=await artifactSession(request,true);return success(await prepareDirectUpload(domain,actor,id));}
 if(privateObjectBackend()!=='blob')throw new HttpFailure(409,'source_changed','Direct upload unavailable');
 const completed=finish.safeParse(body);if(completed.success){const actor=await artifactSession(request,true);return success(await finishDirectUpload(domain,actor,id,completed.data.capabilityId));}
 const kind=(body as {type?:unknown})?.type;if(kind!=='blob.generate-client-token'&&kind!=='blob.upload-completed')throw new HttpFailure(422,'invalid_input','Invalid upload request');
 const actor=kind==='blob.generate-client-token'?await artifactSession(request,true):null;
 const result=await handleUpload({request,body:body as HandleUploadBody,...privateBlobAuth(),onBeforeGenerateToken:async(pathname,payload,multipart)=>{if(!actor||multipart)throw hiddenRecord();const cap=z.object({capabilityId:z.uuid()}).strict().parse(JSON.parse(payload??'null'));const {row}=await currentCapability(domain,actor,id,cap.capabilityId);if(pathname!==row.staging_key)throw hiddenRecord();return {allowedContentTypes:['application/octet-stream'],maximumSizeInBytes:Number(row.expected_bytes),validUntil:row.expires_at.getTime(),addRandomSuffix:false,allowOverwrite:false,tokenPayload:JSON.stringify({capabilityId:row.id})};},
 // Authenticated provider callbacks never publish or accept domain facts. Completion requires a current browser actor and actual verified bytes.
 onUploadCompleted:async()=>{}});
 return Response.json(result,{headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch(error){return failure(error);}}
