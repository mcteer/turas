import {Client} from 'pg';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getServerConfig} from '../lib/server/config';
import {requireOwnedPilotDatabase} from './pilot-environment';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {retireOwnedLegacyRuntime} from '../lib/server/operations/runtime-retirement';

/** The protected input includes the separately selected replacement secret.
 * Receipts exclude it. No Production retirement or environment update is
 * inferred from this owned rehearsal command. */
export async function pilotRuntimeRetirement(args:string[]){
 if(args.length!==5||args[0]!=='--retire-owned-runtime'||args[1]!=='--input'||args[3]!=='--output'||[args[2],args[4]].some(value=>!value||value.startsWith('--')))throw Error('Explicit owned retirement input and new private output required');
 const file=resolve(args[2]),root=resolve(args[4]);
 const input=await readEvidence(dirname(file),basename(file)) as {environmentId?:unknown};
 if(input.environmentId!==getServerConfig().TURAS_ENVIRONMENT_ID)throw Error('Selected owned retirement environment differs');
 const source=await pilotSource(),before=await pilotProtectedSnapshot();
 const db=new Client({connectionString:requireOwnedPilotDatabase(process.env,true),connectionTimeoutMillis:5000,statement_timeout:10000});
 await createEvidenceDirectory(root);
 try{
  await db.connect();
  const result=await retireOwnedLegacyRuntime(db,input as Parameters<typeof retireOwnedLegacyRuntime>[1]);
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Retirement source or protected checkout changed; target remains locked');
  await writeEvidence(root,'retirement.json',{...result,...source,recordedAt:new Date().toISOString(),ownedRehearsal:true});
  console.info(JSON.stringify({oldLoginDisabled:true,oldBackendsTerminated:true,mode:'locked',hostedCredentialsChanged:false,restorationReady:false}));
  return result;
 }catch{
  await writeEvidence(root,'failure.json',{...source,state:'fail',safeFailure:'owned_runtime_retirement_incomplete',hostedCredentialsChanged:false,restorationReady:false});
  throw Error('Owned runtime retirement incomplete; inspect exact target before retry');
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotRuntimeRetirement(process.argv.slice(2)).catch(()=>{console.error('Owned runtime retirement incomplete; no hosted credential change or unlock established.');process.exitCode=1;});
