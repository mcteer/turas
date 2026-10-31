import type {Client} from 'pg';
import {z} from 'zod';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {bindingSchema,type ClosureBinding} from './managed-workflow-closure';
export async function claimIndependentRunIntent(db:Client,installationId:string,binding:ClosureBinding,signal:AbortSignal){
 binding=bindingSchema.parse(binding);z.uuid().parse(installationId);signal.throwIfAborted();let transaction=false;
 const bindingDigest=recoveryDigest({installationId,binding});
 try{
  await db.query('BEGIN');transaction=true;
  await db.query("SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='3000ms'; SET LOCAL transaction_timeout='15s'; SET LOCAL synchronous_commit='on'");
  const rows=(await db.query(`SELECT installation_id,version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass)) AS owner FROM turas_backup.contract`)).rows;
  if(rows.length!==1||rows[0].installation_id!==installationId||rows[0].version!=='pilot-neon-archive-v1'||rows[0].owner!==true)throw Error('Exact independent cancellation owner required');
  await db.query('SELECT pg_advisory_xact_lock(160007)');
  const prior=(await db.query('SELECT binding_digest FROM turas_backup.native_cancel_intents WHERE project_id=$1 AND run_id=$2',[binding.projectId,binding.runId])).rows;
  if(prior.length){if(prior.length!==1||prior[0].binding_digest!==bindingDigest)throw Error('Existing cancellation intent differs');await db.query('COMMIT');transaction=false;return false;}
  await db.query(`INSERT INTO turas_backup.native_cancel_intents(project_id,run_id,installation_id,environment_id,recovery_id,control_revision,team_id,deployment_id,workflow_name,binding_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[binding.projectId,binding.runId,installationId,binding.environmentId,binding.recoveryId,binding.controlRevision,binding.teamId,binding.deploymentId,binding.workflowName,bindingDigest]);
  signal.throwIfAborted();await db.query('COMMIT');transaction=false;signal.throwIfAborted();return true;
 }finally{if(transaction)await db.query('ROLLBACK').catch(()=>undefined);}
}
export async function retainIndependentClosure(db:Client,installationId:string,raw:{binding:ClosureBinding;providerState:string;terminalVerified:boolean},sourceVersion:{sourceCommit:string;sourceDigest:string;catalogDigest:string},signal:AbortSignal){
 const proof=z.object({binding:bindingSchema,providerState:z.enum(['completed','failed','cancelled']),terminalVerified:z.literal(true)}).parse(raw);
 z.uuid().parse(installationId);const version=z.object({sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:z.string().regex(/^[a-f0-9]{64}$/),catalogDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(sourceVersion);signal.throwIfAborted();
 const binding=proof.binding,bindingDigest=recoveryDigest({installationId,binding}),proofDigest=recoveryDigest({proof,version});let transaction=false;
 try{
  await db.query('BEGIN');transaction=true;await db.query("SET LOCAL statement_timeout='5000ms'; SET LOCAL lock_timeout='3000ms'; SET LOCAL transaction_timeout='15s'; SET LOCAL synchronous_commit='on'");
  const marker=(await db.query("SELECT installation_id,version,current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass)) AS owner FROM turas_backup.contract")).rows;
  if(marker.length!==1||marker[0].installation_id!==installationId||marker[0].version!=='pilot-neon-archive-v1'||marker[0].owner!==true)throw Error('Exact independent closure owner required');
  await db.query('SELECT pg_advisory_xact_lock(160007)');
  const existing=(await db.query('SELECT id,binding_digest,provider_state,provider_proof_digest FROM turas_backup.native_closure_observations WHERE installation_id=$1 AND project_id=$2 AND run_id=$3 AND recovery_id=$4 AND control_revision=$5 AND source_commit=$6',[installationId,binding.projectId,binding.runId,binding.recoveryId,binding.controlRevision,version.sourceCommit])).rows[0];
  if(existing){if(existing.binding_digest!==bindingDigest||existing.provider_state!==proof.providerState||existing.provider_proof_digest!==proofDigest)throw Error('Existing provider closure differs');await db.query('COMMIT');transaction=false;return {id:existing.id,replayed:true};}
  const id=(await import('node:crypto')).randomUUID();
  await db.query('INSERT INTO turas_backup.native_closure_observations(id,installation_id,project_id,run_id,environment_id,recovery_id,control_revision,binding_digest,provider_state,source_commit,provider_proof_digest,source_digest,catalog_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,installationId,binding.projectId,binding.runId,binding.environmentId,binding.recoveryId,binding.controlRevision,bindingDigest,proof.providerState,version.sourceCommit,proofDigest,version.sourceDigest,version.catalogDigest]);
  signal.throwIfAborted();await db.query('COMMIT');transaction=false;signal.throwIfAborted();return {id,replayed:false};
 }finally{if(transaction)await db.query('ROLLBACK').catch(()=>undefined);}
}
