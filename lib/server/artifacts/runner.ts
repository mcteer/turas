import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {getServerConfig,parseArtifactStoreConfig} from '../config';
import {query} from '../db/client';
import {createArtifactStore} from './store-factory';
import {preparedArtifactImages} from './prepared';
import {failArtifactRun,heartbeatArtifactRun,publishArtifactRun,type ArtifactJobClaim} from './jobs';
import {assertFreshArtifactSignatures,verifyArtifactImage} from './scan';
import {recordArtifactMetric} from './telemetry';
import {runGovernedExecution,executionBackend} from '../jobs/governed';
import {sha256} from '../jobs/executor';
import type {ArtifactScanReceipt} from '../../contracts/artifacts';

type Original={object_key:string;filename:string;declared_type:string;sha256_digest:string;actual_size_bytes:string};
const safeFailures=new Set(['unsupported_format','encrypted','malformed','unsafe_content','limit_exceeded','scan_unavailable','scan_stale','parser_timeout','parser_failed']);
/** Verified bytes enter fixed programs; domain publication shares current source locks. */
export async function runArtifactJob(claim:ArtifactJobClaim,parentSignal?:AbortSignal):Promise<void>{
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID,root=executionBackend()==='local'?parseArtifactStoreConfig(process.env).root:'';
 const controller=new AbortController();let busy=false,pending:Promise<void>|undefined;
 const abort=()=>controller.abort();parentSignal?.throwIfAborted();parentSignal?.addEventListener('abort',abort,{once:true});
 const heartbeat=setInterval(()=>{if(busy)return;busy=true;pending=heartbeatArtifactRun(claim).then(valid=>{if(!valid)controller.abort();}).catch(()=>controller.abort()).finally(()=>{busy=false;});},5000);
 const deadline=setTimeout(()=>controller.abort(),Math.max(1,Date.parse(claim.deadlineAt)-Date.now()));
 try{
  const images=preparedArtifactImages(),original=(await query<Original>('SELECT object_key,filename,declared_type,sha256_digest,actual_size_bytes FROM artifact_versions WHERE id=$1 AND environment_id=$2 AND sha256_digest=$3',[claim.versionId,environmentId,claim.originalDigest])).rows[0];
  if(!original||images.parserDigest!==claim.parserImageDigest)throw Error('parser_failed');
  const size=Number(original.actual_size_bytes);if(!Number.isSafeInteger(size)||size<1||size>10485760)throw Error('limit_exceeded');
  const chunks:Buffer[]=[];let total=0;for await(const chunk of await createArtifactStore().read(original.object_key)){controller.signal.throwIfAborted();total+=chunk.length;if(total>size)throw Error('limit_exceeded');chunks.push(Buffer.from(chunk));}
  const bytes=Buffer.concat(chunks,total);if(total!==size||sha256(bytes)!==claim.originalDigest)throw Error('parser_failed');
  const localAssets={signaturesPath:join(root,'signatures'),ocrAssetsPath:join(root,'assets')};
  const sourceCurrent=(db:import('pg').PoolClient)=>heartbeatArtifactRun(claim,db);
  const domain={domainKind:'artifact' as const,domainJobId:claim.runId,sourceGeneration:claim.lifecycleGeneration,sourceDigest:claim.originalDigest};
  const inputs=[{name:'original' as const,bytes,digest:claim.originalDigest,sizeBytes:size}];
  const local=executionBackend()==='local';
  const signatureVersion=local?await assertFreshArtifactSignatures(localAssets.signaturesPath):images.signatureVersion!;
  if(local)await verifyArtifactImage(images.scannerImage,images.scannerDigest);
  const scanStarted=Date.now();
  const receipt=await runGovernedExecution({domain,sourceCurrent,localAssets,request:{id:randomUUID(),kind:'artifact-scan',image:local?'sha256:'+images.scannerDigest:images.scannerImage,imageDigest:images.scannerDigest,deadlineAt:claim.deadlineAt,inputs,signal:controller.signal},complete:async(_db,output)=>{
   if(output.exitCode===1||output.stdout.toString('utf8').includes('FOUND'))throw Error('unsafe_content');
   if(output.exitCode!==0||! /\/input: OK\b/.test(output.stdout.toString('utf8')))throw Error('scan_unavailable');
   if(!local&&output.scannerSignatureVersion!==signatureVersion)throw Error('scan_stale');
   return {contract:'artifact-intake-v1',originalDigest:claim.originalDigest,engineVersion:'ClamAV 1.5.4',signatureVersion,scanPolicyVersion:'004-scan-v1',scannedAt:new Date().toISOString(),result:'clean'} as ArtifactScanReceipt;
  }});
  recordArtifactMetric('scan_duration_ms',Date.now()-scanStarted);controller.signal.throwIfAborted();
  if(local)await verifyArtifactImage(images.parserImage,images.parserDigest);
  const parseStarted=Date.now();
  await runGovernedExecution({domain,sourceCurrent,localAssets,request:{id:randomUUID(),kind:'artifact-parse',image:local?'sha256:'+images.parserDigest:images.parserImage,imageDigest:images.parserDigest,deadlineAt:claim.deadlineAt,inputs,parser:{filename:original.filename,mime:original.declared_type,scanReceiptDigest:createHash('sha256').update(JSON.stringify(receipt)).digest('hex')},signal:controller.signal},complete:async(db,output)=>{
   if(output.exitCode!==0)throw Error(output.safeFailure??'parser_failed');let manifest:unknown;try{manifest=JSON.parse(output.stdout.toString('utf8'));}catch{throw Error('parser_failed');}
   await publishArtifactRun(claim,manifest,receipt,db);
  }});
  recordArtifactMetric('parse_duration_ms',Date.now()-parseStarted);
 }catch(error){const raw=error instanceof Error?error.message:'parser_failed',code=controller.signal.aborted||raw.includes('deadline')?'parser_timeout':raw.includes('output exceeds')?'limit_exceeded':safeFailures.has(raw)?raw:'parser_failed';await failArtifactRun(claim,code,['scan_unavailable','scan_stale','parser_timeout','parser_failed'].includes(code));}
 finally{clearInterval(heartbeat);clearTimeout(deadline);parentSignal?.removeEventListener('abort',abort);if(pending)await pending;}
}
