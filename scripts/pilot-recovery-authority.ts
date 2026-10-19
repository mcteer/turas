import {pilotOwnedRecoveryRead} from './pilot-owned-recovery-read';
import {pilotDenialSnapshot} from './pilot-denial-snapshot';
import {pilotRuntimeRetirement} from './pilot-runtime-retirement';
import {pilotWorkRuntimeRetirement} from './pilot-work-runtime-retirement';
import {pilotManagedWorkflowInspect} from './pilot-managed-workflow-inspect';
import {Client} from 'pg';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {operatorRecoveryDatabase} from './pilot-control';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {quarantineRestoredAuthority} from '../lib/server/operations/recovery-quarantine';
import {resolveRecoveryQuarantines} from '../lib/server/operations/recovery-resolution';
import {auditRecoveredRequestFences} from '../lib/server/operations/recovery-replay-audit';
import {readRetainedWorkDenialSnapshot} from './pilot-denial-reader';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {pilotOwnedDenialReconciliation} from './pilot-owned-denial-reconciliation';
import {pilotWorkDenialReconciliation} from './pilot-work-denial-reconciliation';
export async function pilotRecoveryAuthority(args=process.argv.slice(2)){
 if(args[0]==='--probe-owned-service'){
  const result=await pilotOwnedRecoveryRead(args);console.info(JSON.stringify({profilesRead:1,plansRead:result.plans.length,reportsRead:result.contract==='pilot-owned-recovery-read-v2'?result.reports.length:0,temporarySessionRevoked:result.temporarySessionRevoked,serviceOpened:false,restorationReady:false}));return result;
 }
 if(args[0]==='--reconcile-owned-work-denials'){
  const receipt=await pilotOwnedDenialReconciliation(args);
  console.info(JSON.stringify({denialsApplied:true,permanentRequestFencesVerified:receipt.audit.permanentRequestFencesVerified,serviceOpened:false,restorationReady:false}));return receipt;
 }
 if(args[0]==='--reconcile-work-denials')return pilotWorkDenialReconciliation(args);
 if(args[0]==='--capture-work-denials')return pilotDenialSnapshot(args);
 if(args[0]==='--retire-owned-runtime')return pilotRuntimeRetirement(args);
 if(args[0]==='--retire-work-runtime')return pilotWorkRuntimeRetirement(args);
 if(args[0]==='--inspect-managed-workflow')return pilotManagedWorkflowInspect(args);
 if(args[0]==='--resolve-quarantines')return pilotResolveQuarantines(args);
 if(args[0]==='--audit-work-request-fences')return pilotAuditWorkRequestFences(args);
 if(args.length!==9||args[0]!=='--quarantine')throw Error('Explicit current-proof-unavailable quarantine required');
 const allowed=new Set(['environment','recovery-id','expected-revision','output']),values:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid authority quarantine inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete authority quarantine scope required');
 const connection=operatorRecoveryDatabase(values.environment),root=resolve(values.output),source=await pilotSource(),id=randomUUID();await createEvidenceDirectory(root);
 const db=new Client({connectionString:connection,connectionTimeoutMillis:5000});
 try{
  await db.connect();const result=await quarantineRestoredAuthority(db,{environmentId:values.environment,recoveryId:values['recovery-id'],controlRevision:Number(values['expected-revision'])});
  const current=await pilotSource();if(JSON.stringify(current)!==JSON.stringify(source))throw Error('Authority quarantine source changed');
  const receipt={id,...source,...result,recordedAt:new Date().toISOString(),paidCalls:0,hostedProof:false};await writeEvidence(root,'quarantine.json',receipt);console.info(JSON.stringify({mode:'locked',currentAuthorityVerified:false,allRequiredScopesQuarantined:true,restorationReady:false,paidCalls:0}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',safeFailure:'incomplete_authority_quarantine',restorationReady:false});throw error;}
 finally{await db.end();}
}
/** Re-read actual independent encrypted bytes and inspect the exact locked
 * database. No caller-supplied healthy flag or raw-snapshot digest is admitted. */
async function pilotAuditWorkRequestFences(args:string[]){
 const allowed=new Set(['environment','recovery-id','expected-revision','denials','destination','backup-captured-at','output']),values:Record<string,string>={};
 if(args.length!==15)throw Error('Explicit independently retained replay audit inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid independent replay audit inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete independent replay audit scope required');
 z.uuid().parse(values['recovery-id']);z.iso.datetime({offset:true}).parse(values['backup-captured-at']);
 const revision=Number(values['expected-revision']);z.number().int().positive().parse(revision);
 const connection=operatorRecoveryDatabase(values.environment),root=resolve(values.output),source=await pilotSource(),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(180000,async signal=>{
  const staging=await mkdtemp(join(root,'private-staging-')),db=new Client({connectionString:connection,connectionTimeoutMillis:5000,statement_timeout:10000});
  try{
   await db.connect();const rows=(await db.query(`SELECT e.environment_id,e.schema_version,c.mode,c.recovery_id,c.revision,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner
    FROM turas_environment e JOIN operations_control c ON c.environment_id=e.environment_id`)).rows;
   if(rows.length!==1||rows[0].environment_id!==values.environment||Number(rows[0].schema_version)!==79||rows[0].mode!=='locked'||rows[0].recovery_id!==values['recovery-id']||Number(rows[0].revision)!==revision||rows[0].owner!==true)throw Error('Exact current locked owner target required before independent reads');
   const current=await readRetainedWorkDenialSnapshot({receipt:resolve(values.denials),destination:resolve(values.destination),staging,environmentId:values.environment,after:values['backup-captured-at']},signal);
   signal.throwIfAborted();const proof=await auditRecoveredRequestFences(db,current.snapshot,{environmentId:values.environment,recoveryId:values['recovery-id'],controlRevision:revision,snapshotDigest:current.contextDigest,backupCapturedAt:current.backupCapturedAt});
   signal.throwIfAborted();if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Independent replay audit source changed');
   const receipt={id,...source,...proof,recordedAt:new Date().toISOString(),independentColdBytesVerified:true,paidCalls:0,serviceOpened:false};await writeEvidence(root,'request-fences.json',receipt);
   console.info(JSON.stringify({permanentRequestFencesVerified:true,independentColdBytesVerified:true,currentAuthorityVerified:false,replayReconciled:false,restorationReady:false,paidCalls:0}));return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',safeFailure:'incomplete_independent_request_fence_audit',serviceOpened:false,restorationReady:false});throw error;}
  finally{await db.end();await rm(staging,{recursive:true,force:true});}
 });
}
async function pilotResolveQuarantines(args:string[]){
 const allowed=new Set(['environment','recovery-id','expected-revision','verification-id','output']),values:Record<string,string>={};
 if(args.length!==11)throw Error('Explicit recovery resolution inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid recovery resolution inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete recovery resolution scope required');
 const connection=operatorRecoveryDatabase(values.environment),root=resolve(values.output),source=await pilotSource(),id=randomUUID();await createEvidenceDirectory(root);
 const db=new Client({connectionString:connection,connectionTimeoutMillis:5000});
 try{await db.connect();const result=await resolveRecoveryQuarantines(db,{environmentId:values.environment,recoveryId:values['recovery-id'],controlRevision:Number(values['expected-revision']),verificationId:values['verification-id']});
  if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Recovery resolution source changed');
  const receipt={id,...source,...result,recordedAt:new Date().toISOString(),paidCalls:0};await writeEvidence(root,'resolution.json',receipt);console.info(JSON.stringify({newlyResolved:result.newlyResolved,quarantineHistoryRetained:true,serviceOpened:false,restorationReady:false}));return receipt;
 }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',safeFailure:'incomplete_quarantine_resolution',serviceOpened:false,restorationReady:false});throw error;}
 finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotRecoveryAuthority().catch(()=>{console.error('Recovery authority command incomplete; inspect private receipts before recovery admission.');process.exitCode=1;});
