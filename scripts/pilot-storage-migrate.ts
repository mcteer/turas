import {Client} from 'pg';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,lstat,realpath} from 'node:fs/promises';
import {requireOwnedPilotDatabase} from './pilot-environment';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {withRecoveryDatabaseCheckpoint} from '../lib/server/operations/database-checkpoint';
import {LocalPrivateObjects} from '../lib/server/storage/local-objects';
import {copyVerifiedObjects,activeObjectNamespaces} from '../lib/server/storage/inventory';
import {environmentObjectId} from '../lib/server/storage/private-objects';
async function privateDirectory(path:string){const stat=await lstat(path);if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o700||await realpath(path)!==path)throw Error('Direct private operator directory required');}
/** Explicit local copy rehearsal only. No provider credential, hosted target,
 * implicit store initialization, configuration change or original deletion. */
export async function pilotStorageMigrate(args=process.argv.slice(2)){
 const allowed=new Set(['environment','recovery-id','control-revision','source-root','destination-root','output']),values:Record<string,string>={};
 if(args[0]!=='--copy-owned'||args.length!==13)throw Error('Explicit owned copy rehearsal required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid storage migration input');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size||values.environment!==process.env.TURAS_ENVIRONMENT_ID||!Number.isSafeInteger(Number(values['control-revision']))||Number(values['control-revision'])<1||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(values['recovery-id']))throw Error('Exact owned capture identity required');
 const connection=requireOwnedPilotDatabase(process.env,true),sourceRoot=resolve(values['source-root']),destinationRoot=resolve(values['destination-root']),output=resolve(values.output);
 const overlap=(a:string,b:string)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
 if(overlap(sourceRoot,destinationRoot)||overlap(sourceRoot,output)||overlap(destinationRoot,output))throw Error('Separate source destination and evidence required');
 await privateDirectory(sourceRoot);await privateDirectory(destinationRoot);const source=await pilotSource();await createEvidenceDirectory(output);
 const db=new Client({connectionString:connection,connectionTimeoutMillis:5000});await db.connect();
 try{
  const signal=AbortSignal.timeout(300000),result=await withRecoveryDatabaseCheckpoint(db,{environmentId:values.environment,recoveryId:values['recovery-id'],controlRevision:Number(values['control-revision']),signal},async()=>{
   // Only the explicit destination receives namespace directories. A missing
   // source namespace is an incomplete inventory and must fail.
   for(const namespace of activeObjectNamespaces)await mkdir(join(destinationRoot,'e_'+environmentObjectId(values.environment),namespace),{recursive:true,mode:0o700});
   const copied=await copyVerifiedObjects({source:new LocalPrivateObjects(sourceRoot,values.environment,10485760),destination:new LocalPrivateObjects(destinationRoot,values.environment,10485760),environmentId:values.environment,signal});
   // Cold clients verify the full source and destination again; no warm cache or
   // metadata-only size check can authorize an operator cutover.
   const cold=await copyVerifiedObjects({source:new LocalPrivateObjects(sourceRoot,values.environment,10485760),destination:new LocalPrivateObjects(destinationRoot,values.environment,10485760),environmentId:values.environment,signal});
   if(cold.copied!==0||cold.inventoryDigest!==copied.inventoryDigest)throw Error('Cold store parity differs');return copied;
  });
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Storage rehearsal source changed');
  const receipt={version:'pilot-storage-copy-rehearsal-v1',...source,environmentMarker:values.environment,recoveryId:values['recovery-id'],controlRevision:Number(values['control-revision']),completedAt:new Date().toISOString(),...result,coldParityVerified:true,originalsRetained:true,configurationChanged:false,hostedCopyVerified:false,cutoverAuthorized:false,providerCalls:0};
  await writeEvidence(output,'copy.json',receipt);return receipt;
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotStorageMigrate().then(receipt=>console.info(JSON.stringify({objectCount:receipt.objectCount,copied:receipt.copied,configurationChanged:false,hostedCopyVerified:false}))).catch(()=>{console.error('Owned storage copy failed; retain original stores and the service fence.');process.exitCode=1;});
