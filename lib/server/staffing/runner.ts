import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {parseArtifactStoreConfig} from '../config';
import {assertFreshArtifactSignatures,verifyArtifactImage} from '../artifacts/scan';
import {WorkforceStore} from './store';
import {preparedWorkforceImages} from './prepared';
import {claimWorkforceImport,heartbeatWorkforceImport,failWorkforceImport,publishWorkforceImport,fenceWorkforceImport,type WorkforceClaim} from './jobs';
import {recordStaffingTelemetry} from './telemetry';
import {staffingSha256} from './commands';
import {runGovernedExecution,executionBackend} from '../jobs/governed';
import {sha256} from '../jobs/executor';
import type {ArtifactScanReceipt} from '../../contracts/artifacts';
/** Personnel bytes use the same fixed execution boundary and their own source locks. */
export async function runWorkforceImport(claim:WorkforceClaim,parentSignal?:AbortSignal){
 const startedAt=Date.now();let published=false,busy=false,pending:Promise<void>|undefined;const controller=new AbortController();
 const abort=()=>controller.abort();parentSignal?.throwIfAborted();parentSignal?.addEventListener('abort',abort,{once:true});
 const heartbeat=setInterval(()=>{if(busy)return;busy=true;pending=heartbeatWorkforceImport(claim).then(valid=>{if(!valid)controller.abort();}).catch(()=>controller.abort()).finally(()=>{busy=false;});},10000);
 const deadline=setTimeout(()=>controller.abort(),Math.max(1,Date.parse(claim.deadlineAt)-Date.now()));
 try{
  const images=preparedWorkforceImages(),local=executionBackend()==='local',root=local?parseArtifactStoreConfig(process.env).root:'';
  if(images.parserDigest!==claim.parserImageDigest||images.scannerDigest!==claim.scannerImageDigest)throw Error('source_changed');
  const bytes=await new WorkforceStore().read(claim.objectKey);
  if(bytes.length!==claim.byteSize||sha256(bytes)!==claim.originalDigest)throw Error('source_changed');controller.signal.throwIfAborted();
  const localAssets={signaturesPath:join(root,'signatures'),ocrAssetsPath:join(root,'assets')},inputs=[{name:'original' as const,bytes,digest:claim.originalDigest,sizeBytes:claim.byteSize}];
  const domain={domainKind:'workforce' as const,domainJobId:claim.jobId,sourceGeneration:claim.generation,sourceDigest:claim.originalDigest};
  const sourceCurrent=(db:import('pg').PoolClient)=>fenceWorkforceImport(db,claim);
  const signatureVersion=local?await assertFreshArtifactSignatures(localAssets.signaturesPath):images.signatureVersion!;
  if(local)await verifyArtifactImage(images.scannerImage,images.scannerDigest);
  const receipt=await runGovernedExecution({domain,sourceCurrent,localAssets,request:{id:randomUUID(),kind:'artifact-scan',image:local?'sha256:'+images.scannerDigest:images.scannerImage,imageDigest:images.scannerDigest,deadlineAt:claim.deadlineAt,inputs,signal:controller.signal},complete:async(_db,output)=>{
   if(output.exitCode===1||output.stdout.toString('utf8').includes('FOUND'))throw Error('unsafe_content');
   if(output.exitCode!==0||!/\/input: OK\b/.test(output.stdout.toString('utf8')))throw Error('scan_unavailable');
   if(!local&&output.scannerSignatureVersion!==signatureVersion)throw Error('scan_stale');
   return {contract:'artifact-intake-v1',originalDigest:claim.originalDigest,engineVersion:'ClamAV 1.5.4',signatureVersion,scanPolicyVersion:'004-scan-v1',scannedAt:new Date().toISOString(),result:'clean'} as ArtifactScanReceipt;
  }});
  controller.signal.throwIfAborted();if(local)await verifyArtifactImage(images.parserImage,images.parserDigest);
  await runGovernedExecution({domain,sourceCurrent,localAssets,request:{id:randomUUID(),kind:'workforce-parse',image:local?'sha256:'+images.parserDigest:images.parserImage,imageDigest:images.parserDigest,deadlineAt:claim.deadlineAt,inputs,parser:{filename:claim.filename,mime:claim.format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',scanReceiptDigest:staffingSha256(receipt)},signal:controller.signal},complete:async(db,output)=>{
   if(output.exitCode!==0)throw Error(output.safeFailure??'parser_failed');await publishWorkforceImport(claim,JSON.parse(output.stdout.toString('utf8')),receipt,db);
  }});published=true;
 }catch(error){const raw=error instanceof Error?error.message:'parser_failed',code=controller.signal.aborted||raw.includes('deadline')?'parser_timeout':raw.includes('output exceeds')?'limit_exceeded':raw;await failWorkforceImport(claim,code,['scan_unavailable','scan_stale','parser_timeout'].includes(code));}
 finally{clearInterval(heartbeat);clearTimeout(deadline);parentSignal?.removeEventListener('abort',abort);if(pending)await pending;recordStaffingTelemetry({operation:'import',outcome:published?'committed':'failed',durationMs:Math.min(86400000,Math.max(0,Date.now()-startedAt)),count:1});}
}
export async function runWorkforceWorkerTick(){const claim=await claimWorkforceImport();if(claim)await runWorkforceImport(claim);}
