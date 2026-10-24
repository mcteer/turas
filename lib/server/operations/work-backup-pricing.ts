import {createHash} from 'node:crypto';
import {recoveryDigest} from '../../contracts/pilot-recovery';
/** Published on-demand iad1 rates; credits and free allowances never lower a
 * reservation. A changed/missing document rate fails before paid backup work. */
export const workBackupPublishedRates=Object.freeze({contract:'pilot-work-backup-pricing-v1',region:'iad1',cpuMicroUsdPerHour:128000,memoryMicroUsdPerGbHour:10600,invocationMicroUsdPerMillion:600000,simpleMicroUsdPerMillion:400000,advancedMicroUsdPerMillion:5000000,blobTransferMicroUsdPerGb:50000,fastTransferMicroUsdPerGb:150000,originTransferMicroUsdPerGb:60000,cdnMicroUsdPerMillion:2000000,storageMicroUsdPerGbMonth:23000});
export function workBackupPricingDigest(){return recoveryDigest(workBackupPublishedRates);}
const ceil=(amount:bigint,divisor:bigint)=>Number((amount+divisor-1n)/divisor);
export function workBackupCostCeilings(maximumObjectBytes:number){
 if(!Number.isSafeInteger(maximumObjectBytes)||maximumObjectBytes<0||maximumObjectBytes>25165824)throw Error('Bounded work pricing object allowance required');
 // Both inventories read each object twice; copying reads it once. One changed
 // provider object can consume at most the adapter's 10 MiB before failure.
 const downloadBytes=BigInt(maximumObjectBytes)*5n+10485760n;
 const metadataAndHeaders=32n*131072n+1280n*16384n;
 const blob=ceil((downloadBytes+metadataAndHeaders)*260000n,1000000000n)+512+2560+160+
  ceil(BigInt(maximumObjectBytes)*23000n*7n,1000000000n*30n*14n);
 const hosting=ceil(2n*300n*128000n,3600n)+ceil(4n*300n*10600n,3600n)+1+
  ceil((4n*67108864n+8388608n)*150000n,1000000000n);
 return {hostingMinimumMicroUsd:hosting,blobMinimumMicroUsd:blob,hostingCeilingMicroUsd:100000,blobCeilingMicroUsd:50000,maximumBlobListRequests:32,maximumBlobReadRequests:1280,maximumBlobDownloadBytes:Number(downloadBytes)};
}
const documents=[
 {url:'https://vercel.com/docs/functions/usage-and-pricing',patterns:[/Washington D\.C\., USA \(iad1\) \$0\.128 \$0\.0106/,/\$0\.60 per million/]},
 {url:'https://vercel.com/docs/vercel-blob/usage-and-pricing',patterns:[/Blob Storage Size .*?\$0\.023 per GB/,/Blob Simple Operations .*?\$0\.400 per 1M/,/Blob Advanced Operations .*?\$5\.000 per 1M/,/Blob Data Transfer .*?\$0\.050 per GB/]},
 {url:'https://vercel.com/docs/pricing/regional-pricing/iad1',patterns:[/Fast Data Transfer \$0\.15 per 1 GB/,/CDN Requests \$2\.00 per 1,000,000 Requests/,/Fast Origin Transfer \$0\.06 per 1 GB/]},
] as const;
/** Actual official-document verification, not a caller-supplied healthy label.
 * Transport is bounded, sequential and has no retry or paid model/search call. */
export async function verifyWorkBackupPricing(input:{maximumObjectBytes:number;pricingDigest:string;hostingCeilingMicroUsd:number;blobCeilingMicroUsd:number},signal:AbortSignal,transport:typeof fetch=fetch){
 const bounds=workBackupCostCeilings(input.maximumObjectBytes);
 if(input.pricingDigest!==workBackupPricingDigest()||input.hostingCeilingMicroUsd<bounds.hostingMinimumMicroUsd||input.blobCeilingMicroUsd<bounds.blobMinimumMicroUsd)throw Error('Published work cost ceiling unavailable');
 const captures=[];
 for(const document of documents){
  signal.throwIfAborted();const response=await transport(document.url,{redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),cache:'no-store'});
  if(!response.ok||!response.body||!/^text\/html(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('Published work pricing unavailable');
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
  try{for(;;){signal.throwIfAborted();const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>2097152)throw Error('Published pricing response exceeds bound');parts.push(next.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=Buffer.concat(parts),text=bytes.toString('utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
  if(document.patterns.some(pattern=>!pattern.test(text)))throw Error('Published work rate changed or unavailable');
  captures.push({url:document.url,digest:createHash('sha256').update(bytes).digest('hex'),sizeBytes:size});
 }
 return {contract:'pilot-work-pricing-verification-v1' as const,verifiedAt:new Date().toISOString(),pricingDigest:input.pricingDigest,...bounds,captures,actualInvoiceVerified:false};
}
