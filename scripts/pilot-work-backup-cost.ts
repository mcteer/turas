import {Client} from 'pg';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {workBackupCostAuthoritySchema,provisionWorkBackupCostAuthority,workBackupCostReviewSchema,reviewWorkBackupCost} from '../lib/server/operations/work-backup-cost';
import {neonArchiveDestinationSchema,verifyWorkNeonDestination} from './pilot-neon-archive';
import {readEvidence,createEvidenceDirectory,writeEvidence,evidenceDigest} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';

/** Explicit owner provisioning for a separately approved hosting/Blob scope.
 * No cron deployment, provider job, model, mail or source mutation is performed. */
export async function pilotWorkBackupCost(args:string[]){
 const review=args[0]==='--review-work-cost';if(args.length!==7||!review&&args[0]!=='--provision-work-cost')throw Error('Explicit work backup cost operation required');
 const allowed=new Set(['destination',review?'review':'authority','output']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid work cost provisioning argument');values[key]=args[i+1];}
 if(Object.keys(values).length!==3)throw Error('Complete work cost provisioning scope required');
 const file=resolve(values.destination),authorityFile=resolve(values[review?'review':'authority']),destination=neonArchiveDestinationSchema.parse(await readEvidence(dirname(file),basename(file))),authority=(review?workBackupCostReviewSchema:workBackupCostAuthoritySchema).parse(await readEvidence(dirname(authorityFile),basename(authorityFile)));
 if(authority.installationId!==destination.installationId)throw Error('Exact work cost destination installation required');
 const source=await pilotSource(),preservation=await pilotProtectedSnapshot(),root=resolve(values.output),id=randomUUID();await createEvidenceDirectory(root);
 await writeEvidence(root,'request.json',{contract:'pilot-work-cost-request-v1',id,...source,requestDigest:evidenceDigest(JSON.stringify(authority)),authority});
 return withRecoveryCancellation(90000,async signal=>{
  try{
   const cloud=await verifyWorkNeonDestination(destination,signal),db=new Client({connectionString:destination.databaseUrl,connectionTimeoutMillis:5000,statement_timeout:10000});let result;
   try{await db.connect();result=review?await reviewWorkBackupCost(db,authority):await provisionWorkBackupCostAuthority(db,authority);}finally{await db.end();}
   if(JSON.stringify(await verifyWorkNeonDestination(destination,signal))!==JSON.stringify(cloud)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(preservation))throw Error('Work cost provisioning identity changed; inspect retained budgets before retry');
   const receipt={id,...source,...result,cloud,recordedAt:new Date().toISOString(),operatorDeployed:false,sourceMutated:false,restorationReady:false};await writeEvidence(root,'cost.json',receipt);
   console.info(JSON.stringify({costOperation:review?'review':'provision',recorded:true,...('allocatedMicroUsd'in result?{allocatedMicroUsd:result.allocatedMicroUsd}:{chargedMicroUsd:result.chargedMicroUsd,chargeKind:'estimate',actualInvoiceVerified:false}),replayed:result.replayed,providerDispatched:false,operatorDeployed:false}));return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',safeFailure:'incomplete_work_cost_provision',providerDispatched:false,restorationReady:false});throw error;}
 });
}
