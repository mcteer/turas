import {Client} from 'pg';
import {z} from 'zod';
import {resolve,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {databaseSafetySourceSchema,verifyDatabaseSafetySourceBinding} from './pilot-database-safety-copy';
import {retireLockedLegacyRuntime} from '../lib/server/operations/runtime-retirement';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';

const scopeSchema=z.strictObject({contract:z.literal('pilot-work-runtime-retirement-v1'),projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),environmentId:z.string().min(1).max(256),recoveryId:z.uuid(),controlRevision:z.number().int().positive(),password:z.string().regex(/^[A-Za-z0-9_-]{43}$/)});

/** Explicit locked work target only. The secret stays in protected input and
 * database protocol; it is never a CLI argument, receipt or deployment update. */
export async function pilotWorkRuntimeRetirement(args:string[]){
 if(args.length!==7||args[0]!=='--retire-work-runtime'||args[1]!=='--source'||args[3]!=='--input'||args[5]!=='--output'||[args[2],args[4],args[6]].some(value=>!value||value.startsWith('--')))throw Error('Explicit protected work retirement scope required');
 const sourceFile=resolve(args[2]),inputFile=resolve(args[4]),root=resolve(args[6]);
 const target=databaseSafetySourceSchema.parse(await readEvidence(dirname(sourceFile),basename(sourceFile))),scope=scopeSchema.parse(await readEvidence(dirname(inputFile),basename(inputFile)));
 if(target.schemaVersion!==57||target.projectId!==scope.projectId||target.environmentId!==scope.environmentId)throw Error('Exact work retirement project and current schema required');
 const source=await pilotSource(),before=await pilotProtectedSnapshot(),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(90000,async signal=>{
  let stage='platform_binding',retired=false;
  try{
   const binding=await verifyDatabaseSafetySourceBinding(target,scope.teamId,signal);
   signal.throwIfAborted();stage='database_retirement';
   const url=new URL(target.databaseUrl),db=new Client({connectionString:target.databaseUrl,connectionTimeoutMillis:10000,statement_timeout:10000});
   let result:Awaited<ReturnType<typeof retireLockedLegacyRuntime>>;
   try{await db.connect();result=await retireLockedLegacyRuntime(db,{environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,password:scope.password},{databaseName:decodeURIComponent(url.pathname.slice(1)),ownerRole:decodeURIComponent(url.username)});retired=true;}finally{await db.end();}
   stage='replacement_connection';signal.throwIfAborted();
   const replacementUrl=new URL(target.databaseUrl);replacementUrl.username=result.replacementRole;replacementUrl.password=scope.password;
   const replacement=new Client({connectionString:replacementUrl.toString(),connectionTimeoutMillis:10000,statement_timeout:5000});
   try{await replacement.connect();const marker=(await replacement.query('SELECT environment_id,schema_version FROM turas_environment')).rows,control=(await replacement.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1',[scope.environmentId])).rows[0];if(marker.length!==1||marker[0].environment_id!==scope.environmentId||Number(marker[0].schema_version)!==57||control?.mode!=='locked'||Number(control.revision)!==scope.controlRevision||control.recovery_id!==scope.recoveryId)throw Error('Replacement connection binding differs');}finally{await replacement.end();}
   stage='final_binding';
   if(JSON.stringify(await verifyDatabaseSafetySourceBinding(target,scope.teamId,signal))!==JSON.stringify(binding)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(before))throw Error('Retirement binding or protected checkout changed');
   const receipt={...result,id,...source,projectId:scope.projectId,teamId:scope.teamId,...binding,recordedAt:new Date().toISOString(),replacementConnectionVerified:true,hostedCredentialsChanged:false,providerRunsRetired:false,paidEffectsReconciled:false,restorationReady:false};
   await writeEvidence(root,'retirement.json',receipt);
   console.info(JSON.stringify({oldLoginDisabled:true,oldBackendsTerminated:true,replacementConnectionVerified:true,mode:'locked',hostedCredentialsChanged:false,restorationReady:false}));return receipt;
  }catch{await writeEvidence(root,'failure.json',{id,...source,projectId:scope.projectId,environmentId:scope.environmentId,recoveryId:scope.recoveryId,controlRevision:scope.controlRevision,stage,retirementCompleted:retired,safeFailure:'incomplete_work_runtime_retirement',hostedCredentialsChanged:false,restorationReady:false});throw Error('Work retirement incomplete; target remains locked and exact input is required for reconciliation');}
 });
}
