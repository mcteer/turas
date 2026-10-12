import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getServerConfig} from '../lib/server/config';
import {closeRuntimePool} from '../lib/server/db/client';
import {observeMaintenanceHealth} from '../lib/server/operations/maintenance-health';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
export async function pilotHealth(args=process.argv.slice(2)){
 if(args.length!==5||args[0]!=='--environment'||args[2]!=='--output'||args[4]!=='--observe'||getServerConfig().TURAS_ENVIRONMENT_ID!==args[1])throw Error('Explicit health target, new private output and observe required');
 const root=resolve(args[3]);await createEvidenceDirectory(root);
 try{
  const source=await pilotSource(),result=await observeMaintenanceHealth(),current=await pilotSource();
  if(source.sourceCommit!==current.sourceCommit||source.sourceDigest!==current.sourceDigest||source.catalogDigest!==current.catalogDigest||result.codeVersion!==source.sourceCommit)throw Error('Health source changed or deployed code differs');
  await writeEvidence(root,'maintenance-health.json',{...source,...result});
  console.info(JSON.stringify({maintenanceHealthy:result.healthy,classes:result.classes.length,fullReadinessVerified:false}));
  if(!result.healthy)process.exitCode=1;
 }finally{await closeRuntimePool();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotHealth().catch(()=>{console.error('Maintenance observation failed; no readiness proof established.');process.exitCode=1;});
