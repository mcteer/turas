import {Client} from 'pg';
import {resolve,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {requireOwnedPilotDatabase} from './pilot-environment';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {readRetainedWorkDenialSnapshot} from './pilot-denial-reader';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {reconcileOwnedCredentialDenials} from '../lib/server/operations/recovery-credential-denials';
import {auditRecoveredRequestFences} from '../lib/server/operations/recovery-replay-audit';

/** Apply independently retained denials to an owned isolated restore, then
 * inspect actual permanent guards. No hosted mutation, unlock or effect replay. */
export async function pilotOwnedDenialReconciliation(args:string[]){
 const allowed=new Set(['environment','recovery-id','expected-revision','denials','destination','backup-captured-at','output']),values:Record<string,string>={};
 if(args[0]!=='--reconcile-owned-work-denials'||args.length!==15)throw Error('Explicit owned denial reconciliation inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid owned denial reconciliation inputs');values[key]=args[i+1];}
 if(Object.keys(values).length!==allowed.size)throw Error('Complete owned denial reconciliation scope required');
 z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/).parse(values.environment);
 z.uuid().parse(values['recovery-id']);z.iso.datetime({offset:true}).parse(values['backup-captured-at']);
 const revision=z.number().int().positive().parse(Number(values['expected-revision']));
 // The restored marker may differ from the owning disposable cluster marker.
 // Validate the owned connection independently, then the exact restored source.
 // Refuse hosted/unowned targets before contacting the independent archive.
 const connection=requireOwnedPilotDatabase(process.env,true),target=new URL(connection),name=target.pathname.slice(1),token=name.slice('turas_test_016_eval_'.length);
 const owned=await promisify(execFile)('docker',['inspect','--format','{{index .Config.Labels "turas.016.owner"}}','turas-016-check-'+token],{timeout:5000,maxBuffer:8192});
 if(owned.stdout.trim()!==token)throw Error('Actual owned isolated denial target required');
 const root=resolve(values.output),source=await pilotSource(),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(180000,async signal=>{
  const staging=await mkdtemp(join(root,'private-staging-')),db=new Client({connectionString:connection,connectionTimeoutMillis:5000,statement_timeout:10000});
  let denialsApplied=false;
  try{
   await db.connect();
   const rows=(await db.query(`SELECT current_database() AS name,current_user AS role,e.environment_id,e.schema_version,c.mode,c.recovery_id,c.revision,
    current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner
    FROM turas_environment e JOIN operations_control c ON c.environment_id=e.environment_id`)).rows;
   if(rows.length!==1||rows[0].name!==name||rows[0].role!==decodeURIComponent(target.username)||rows[0].environment_id!==values.environment||Number(rows[0].schema_version)!==80||rows[0].mode!=='locked'||rows[0].recovery_id!==values['recovery-id']||Number(rows[0].revision)!==revision||rows[0].owner!==true)throw Error('Exact current locked owner target required before independent reads');
   const current=await readRetainedWorkDenialSnapshot({receipt:resolve(values.denials),destination:resolve(values.destination),staging,environmentId:values.environment,after:values['backup-captured-at']},signal);
   if(current.snapshot.contract!=='pilot-denial-replay-snapshot-v7'||current.snapshot.schemaVersion!==80)throw Error('Complete current schema-080 denial inventory required');
   signal.throwIfAborted();if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Denial reconciliation source changed');
   const scope={environmentId:values.environment,recoveryId:values['recovery-id'],controlRevision:revision,snapshotDigest:current.contextDigest,backupCapturedAt:current.backupCapturedAt};
   const applied=await reconcileOwnedCredentialDenials(db,current.snapshot,scope);denialsApplied=true;
   // Keep the committed-denial checkpoint if a later audit fails. Resume is
   // idempotent; failure never rolls back a denial or makes replay permissible.
   await writeEvidence(root,'denials-applied.json',{id,...source,...applied,recordedAt:new Date().toISOString(),independentColdBytesVerified:true,serviceOpened:false});
   signal.throwIfAborted();const audit=await auditRecoveredRequestFences(db,current.snapshot,scope);
   signal.throwIfAborted();if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Denial reconciliation source changed');
   const receipt={contract:'pilot-owned-work-denial-reconciliation-v1',id,...source,...scope,applied,audit,recordedAt:new Date().toISOString(),independentColdBytesVerified:true,serviceOpened:false,restorationReady:false};
   await writeEvidence(root,'reconciliation.json',receipt);return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,state:'fail',safeFailure:'incomplete_owned_denial_reconciliation',denialsApplied,serviceOpened:false,restorationReady:false});throw error;}
  finally{try{await db.end();}finally{await rm(staging,{recursive:true,force:true});}}
 });
}
