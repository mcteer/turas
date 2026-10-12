import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getServerConfig} from '../lib/server/config';
import {query,closeRuntimePool} from '../lib/server/db/client';
import {createMaintenanceBindings} from '../lib/server/operations/maintenance-bindings';
import {runMaintenanceClass,maintenanceClasses,validateMaintenanceBindings} from '../lib/server/operations/maintenance';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';
/** Fixed, finite cleanup catalog. Uses existing domain TTLs and tombstones;
 * never starts authoring, paid work, embeddings or email delivery. */
export async function runPilotLifecycle(environmentId:string){
 if(getServerConfig().TURAS_ENVIRONMENT_ID!==environmentId)throw Error('Lifecycle target differs');
 const marker=(await query('SELECT environment_id,schema_version FROM turas_environment')).rows;
 if(marker.length!==1||marker[0].environment_id!==environmentId||Number(marker[0].schema_version)!==57)throw Error('Exact lifecycle schema required');
 const source=await pilotSource(),bindings=createMaintenanceBindings();
 if(validateMaintenanceBindings(bindings).some(row=>!row.configured||!row.enabled)||bindings.length!==maintenanceClasses.length)throw Error('Incomplete lifecycle catalog');
 const startedAt=new Date().toISOString(),results=[];
 for(const binding of bindings){const result=await runMaintenanceClass(environmentId,source.sourceCommit,binding);results.push({classId:binding.id,...result});}
 const current=await pilotSource();if(current.sourceDigest!==source.sourceDigest||current.catalogDigest!==source.catalogDigest||current.sourceCommit!==source.sourceCommit)throw Error('Lifecycle source changed');
 return {version:'pilot-lifecycle-v1',environmentMarker:environmentId,...source,startedAt,completedAt:new Date().toISOString(),activeStore:{state:results.every(row=>row.state==='pass')?'pass':'fail',classes:results},backupExpiry:{state:'not_executed',reason:'independent_backup_authority_required'},permanentReceipts:{state:'not_verified',reason:'cross_feature_replay_catalog_required'},executionOnly:true,fullLifecycleVerified:false};
}
export async function pilotLifecycle(args=process.argv.slice(2)){
 if(args.length!==5||args[0]!=='--environment'||args[2]!=='--output'||args[4]!=='--execute')throw Error('Explicit lifecycle environment, new private output and execute required');
 const root=resolve(args[3]);await createEvidenceDirectory(root);
 try{const result=await runPilotLifecycle(args[1]);await writeEvidence(root,'lifecycle.json',result);console.info(JSON.stringify({state:result.activeStore.state,backupExpiry:'not_executed',fullLifecycleVerified:false}));if(result.activeStore.state!=='pass')process.exitCode=1;}
 finally{await closeRuntimePool();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotLifecycle().catch(()=>{console.error('Lifecycle catalog incomplete; no cleanup acceptance established.');process.exitCode=1;});
