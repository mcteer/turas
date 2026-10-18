import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {storageCutoverPlanSchema} from '../lib/contracts/pilot-storage-cutover';
import {admitStorageCutover,copyStorageCutover} from '../lib/server/operations/storage-cutover';
import {operatorRecoveryDatabase} from './pilot-control';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {BlobPrivateObjects} from '../lib/server/storage/blob-objects';
import {LocalPrivateObjects} from '../lib/server/storage/local-objects';
import {privateBlobAuth} from '../lib/server/storage/blob-auth';
import {verifyHostedConfiguration} from '../lib/server/operations/hosted-configuration';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';
import {verifyHostedDeployment} from '../lib/contracts/pilot-hosted';

/** Explicit operator workflow. Environment changes and deployment use the release
 * commands; this command never changes configuration, unlocks or deletes bytes. */
export async function pilotStorageHosted(args:string[]){
 if(!['--admit-hosted','--copy-hosted'].includes(args[0]))throw Error('Explicit hosted storage operation required');
 const admitted=args[0]==='--admit-hosted',keys=new Set(['plan','output',...(admitted?[]:['reservation','recovery-id','control-revision'])]),values:Record<string,string>={};
 if(args.length!==1+2*keys.size)throw Error('Complete hosted storage scope required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!keys.has(key)||values[key]||!args[i+1])throw Error('Invalid storage scope');values[key]=args[i+1];}
 const bytes=await readFile(resolve(values.plan));if(bytes.length>32768)throw Error('Storage plan exceeds bound');
 const plan=storageCutoverPlanSchema.parse(JSON.parse(bytes.toString())),source=await pilotSource();
 if(source.sourceCommit!==plan.sourceCommit||source.sourceDigest!==plan.sourceDigest)throw Error('Storage copy source differs');
 const root=resolve(values.output);await createEvidenceDirectory(root);
 const pool=new Pool({connectionString:operatorRecoveryDatabase(plan.environmentId),connectionTimeoutMillis:5000,max:1}),db=await pool.connect();
 try{
  if(admitted){const receipt=await admitStorageCutover(db,plan);await writeEvidence(root,'admission.json',{...receipt,planId:plan.id,...source});return receipt;}
  if(process.env.VERCEL_BLOB_RETRIES!=='0')throw Error('Hosted storage copy requires disabled SDK retries');
  const revision=Number(values['control-revision']);if(!Number.isSafeInteger(revision)||revision<1)throw Error('Exact locked revision required');
  const cookie=process.env.TURAS_STORAGE_ADMIN_COOKIE;if(!cookie||cookie.length>8192||/[\r\n]/.test(cookie))throw Error('Explicit current administrator session required');
  const sessionHeaders={cookie};
  const signal=AbortSignal.timeout(300000);
  let deploymentId:string|undefined;
  async function readback(){
   // Resolve the actual origin through the authenticated platform before
   // attaching a session cookie. A proposed URL is not ownership evidence.
   const platform=await promisify(execFile)('vercel',['api','/v13/deployments/'+encodeURIComponent(new URL(plan.origin).hostname)+'?teamId='+plan.expectedConfiguration.teamId,'--raw'],{timeout:30000,signal,maxBuffer:1048576,env:{NODE_ENV:process.env.NODE_ENV??'production',...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL'].flatMap(key=>process.env[key]===undefined?[]:[[key,process.env[key]]]))}});
   const raw=JSON.parse(platform.stdout),identity=z.object({id:z.string().regex(/^dpl_[A-Za-z0-9]+$/)}).parse(raw);
   const deployment=verifyHostedDeployment(raw,{deploymentId:deploymentId??identity.id,projectId:plan.expectedConfiguration.projectId,teamId:plan.expectedConfiguration.teamId,sourceCommit:plan.sourceCommit,target:plan.target});
   deploymentId=deployment.deploymentId;
   const response=await fetch(new URL('/api/operations/status',plan.origin),{headers:sessionHeaders,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
   if(response.status!==200||response.headers.get('x-turas-code-version')!==plan.sourceCommit){await response.body?.cancel();throw Error('Exact authenticated storage deployment required');}
   if(!response.body)throw Error('Storage readback body required');
   const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>65536)throw Error('Storage readback exceeds bound');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const body=JSON.parse(Buffer.concat(chunks).toString()).data;if(body?.admission!=='closed'||body?.deployment?.codeVersion!==plan.sourceCommit)throw Error('Locked exact deployment readback required');
   verifyHostedConfiguration(body.configuration,plan.expectedConfiguration);
  }
  await readback();
  const auth=(storeId:string,prefix:'SOURCE'|'DESTINATION')=>privateBlobAuth({NODE_ENV:process.env.NODE_ENV??'production',BLOB_STORE_ID:storeId,BLOB_READ_WRITE_TOKEN:process.env[`TURAS_STORAGE_${prefix}_BLOB_TOKEN`],VERCEL_OIDC_TOKEN:process.env[`TURAS_STORAGE_${prefix}_OIDC_TOKEN`],VERCEL_ENV:plan.target,VERCEL_BLOB_RETRIES:'0'});
  const sourceStore=plan.source.backend==='local'?()=>new LocalPrivateObjects(resolve(plan.source.backend==='local'?plan.source.root:''),plan.environmentId,10485760):()=>new BlobPrivateObjects(plan.environmentId,auth(plan.source.backend==='blob'?plan.source.storeId:'','SOURCE'),10485760);
  const copied=await copyStorageCutover(db,{plan,reservationId:values.reservation,recoveryId:values['recovery-id'],controlRevision:revision,source:sourceStore,destination:()=>new BlobPrivateObjects(plan.environmentId,auth(plan.destination.storeId,'DESTINATION'),10485760),signal});
  await readback();
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Storage source changed');
  const receipt={...copied,...source,deploymentId,configurationReadbackVerified:true,destinationConfigurationVerified:true,cutoverVerified:false,serviceOpened:false,originalsRetained:true,rollback:'retain-lock-and-recopy-originals',accounting:'full-ceiling-held-pending-explicit-reconciliation'};
  await writeEvidence(root,'copy.json',receipt);return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{planId:plan.id,...source,state:'fail',safeFailure:'hosted_storage_incomplete',serviceOpened:false,originalsRetained:true,accountingReviewRequired:true});throw error;}
 finally{db.release();await pool.end();}
}
