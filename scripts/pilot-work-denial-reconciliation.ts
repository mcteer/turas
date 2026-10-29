import {Client} from 'pg';
import {resolve,dirname,basename,join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {pilotProtectedSnapshot} from './pilot-preservation';
import {databaseSafetyCaptureSourceSchema,verifyDatabaseSafetySourceBinding} from './pilot-database-safety-copy';
import {readRetainedWorkDenialSnapshot,requireAuthenticatedRetainedDenials} from './pilot-denial-reader';
import {withRecoveryCancellation} from '../lib/server/operations/recovery-cancellation';
import {reconcileLockedWorkCredentialDenials,requireRetiredLegacyWorkRuntime} from '../lib/server/operations/recovery-credential-denials';
import {auditRecoveredRequestFences} from '../lib/server/operations/recovery-replay-audit';

/** Explicit work-owner counterpart of the isolated reconciliation command.
 * Preserves the original target, grants no authority and never opens service. */
export async function pilotWorkDenialReconciliation(args:string[]){
 const allowed=new Set(['source','team','environment','recovery-id','expected-revision','denials','destination','backup-captured-at','output']),values:Record<string,string>={};
 if(args[0]!=='--reconcile-work-denials'||args.length!==19)throw Error('Explicit independently retained work denial inputs required');
 for(let i=1;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid work denial inputs');values[key]=args[i+1];}
 const file=resolve(values.source),target=databaseSafetyCaptureSourceSchema.parse(await readEvidence(dirname(file),basename(file)));
 const revision=z.number().int().positive().parse(Number(values['expected-revision']));z.uuid().parse(values['recovery-id']);z.iso.datetime({offset:true}).parse(values['backup-captured-at']);z.string().regex(/^team_[A-Za-z0-9]+$/).parse(values.team);
 const url=new URL(target.databaseUrl);
 if(target.schemaVersion!==80||target.environmentId!==values.environment||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||url.searchParams.get('sslmode')!=='verify-full'
  ||url.hash||url.searchParams.getAll('sslmode').length!==1||url.searchParams.getAll('channel_binding').length>1
  ||[...url.searchParams.keys()].some(key=>!['sslmode','channel_binding'].includes(key))||(url.searchParams.has('channel_binding')&&url.searchParams.get('channel_binding')!=='require'))throw Error('Exact direct current-schema bounded work target required');
 const source=await pilotSource(),preservation=await pilotProtectedSnapshot(),root=resolve(values.output),id=randomUUID();await createEvidenceDirectory(root);
 return withRecoveryCancellation(180000,async signal=>{
  let stage='platform_binding',denialsApplied=false;
  const db=new Client({connectionString:target.databaseUrl,connectionTimeoutMillis:5000,statement_timeout:10000,query_timeout:11000}),staging=await mkdtemp(join(root,'private-staging-'));
  try{
   const binding=await verifyDatabaseSafetySourceBinding(target,values.team,signal);
   stage='target_preflight';await db.connect();
   const rows=(await db.query(`SELECT current_database() AS name,current_user AS role,e.environment_id,e.schema_version,c.mode,c.recovery_id,c.revision,
    current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) AS owner
    FROM turas_environment e JOIN operations_control c USING(environment_id)`)).rows;
   const row=rows[0];
   if(rows.length!==1||row.name!==decodeURIComponent(url.pathname.slice(1))||row.role!==decodeURIComponent(url.username)||row.environment_id!==target.environmentId||row.schema_version!==80||row.mode!=='locked'||row.recovery_id!==values['recovery-id']||Number(row.revision)!==revision||row.owner!==true)throw Error('Exact locked work owner required before archive access');
   await requireRetiredLegacyWorkRuntime(db);
   stage='independent_current_denials';
   const retained=await readRetainedWorkDenialSnapshot({receipt:resolve(values.denials),destination:resolve(values.destination),staging,environmentId:target.environmentId,after:values['backup-captured-at']},signal);
   requireAuthenticatedRetainedDenials(retained,target.environmentId);signal.throwIfAborted();
   if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Work reconciliation source changed');
   const scope={environmentId:target.environmentId,recoveryId:values['recovery-id'],controlRevision:revision,snapshotDigest:retained.contextDigest,backupCapturedAt:retained.backupCapturedAt};
   stage='apply_denials';const applied=await reconcileLockedWorkCredentialDenials(db,retained,scope,{databaseName:row.name,ownerRole:row.role});denialsApplied=true;
   await writeEvidence(root,'denials-applied.json',{id,...source,...applied,recordedAt:new Date().toISOString(),serviceOpened:false});
   stage='permanent_request_audit';signal.throwIfAborted();requireAuthenticatedRetainedDenials(retained,target.environmentId);
   const audit=await auditRecoveredRequestFences(db,retained.snapshot,scope);
   stage='final_binding';signal.throwIfAborted();
   if(JSON.stringify(await verifyDatabaseSafetySourceBinding(target,values.team,signal))!==JSON.stringify(binding)||JSON.stringify(await pilotSource())!==JSON.stringify(source)||JSON.stringify(await pilotProtectedSnapshot())!==JSON.stringify(preservation))throw Error('Work binding or protected checkout changed');
   const receipt={contract:'pilot-work-denial-reconciliation-v1',id,...source,...scope,projectId:target.projectId,target:target.target,applied,audit,recordedAt:new Date().toISOString(),independentColdBytesVerified:true,serviceOpened:false,restorationReady:false};
   await writeEvidence(root,'reconciliation.json',receipt);return receipt;
  }catch(error){await writeEvidence(root,'failure.json',{id,...source,stage,denialsApplied,safeFailure:'incomplete_work_denial_reconciliation',serviceOpened:false,restorationReady:false});throw error;}
  finally{try{await db.end();}finally{await rm(staging,{recursive:true,force:true});}}
 });
}
