import {restoredWorkStoreDigest} from './work-recovery-store-binding';
import {requireRetainedWorkDenialHistory,type RetainedWorkDenialHistory} from '../../../scripts/pilot-retained-denial-history';
import {fenceCurrentRecoveryJobs} from './recovery-current-job-fences';
import {workCaptureCandidateSchema} from '../../contracts/pilot-capture';
import {randomUUID} from 'node:crypto';
import type {Client} from 'pg';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {withLockedWorkRecoveryDecision,prepareWorkRecoveryDecisionDenials,type LockedWorkRecoveryInput,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {requireMatchingWorkTargetIntegrityMaterial,requireMeasuredWorkTargetIntegrity,authenticateCommittedWorkTargetIntegrity,type WorkTargetIntegrity,type WorkTargetIntegrityInput} from './work-target-integrity';
import {verifyWorkRecoveryService,requireVerifiedWorkRecoveryService,type WorkRecoveryServiceMeasurements} from './work-recovery-service';
import {verifyWorkRecoveryEffects,requireVerifiedWorkRecoveryEffects,type WorkRecoveryEffectMeasurements} from './work-recovery-effects';
import {deriveWorkMaintenanceInventoryInTransaction} from './owned-maintenance-inventory';
import {deriveWorkMcpScopeInTransaction} from './work-mcp-verification';
import {deriveWorkConversationInventory} from './work-conversation-http';
import {currentRecoveryStateDigest} from './recovery-state';
async function scopeDigest(db:Client,target:LockedWorkRecoveryTarget,signal:AbortSignal,material:WorkTargetIntegrityInput){
 const maintenance=await deriveWorkMaintenanceInventoryInTransaction(db,target,signal),mcp=await deriveWorkMcpScopeInTransaction(db,target),conversations=await deriveWorkConversationInventory(db,target),{deadline,contract,...identity}=target;
 return recoveryDigest({identity,...(material.restoredStore?{restoredStoreDigest:restoredWorkStoreDigest(material.restoredStore)}:{}),maintenance:maintenance.inventoryDigest,mcp:mcp.scopeDigest,conversations:conversations.inventoryDigest});
}
type Input={target:LockedWorkRecoveryInput;integrity:WorkTargetIntegrity;integrityMaterial:WorkTargetIntegrityInput;retained:RetainedWorkDenials;denialHistory:RetainedWorkDenialHistory;service:WorkRecoveryServiceMeasurements;effects:WorkRecoveryEffectMeasurements;passwords:Parameters<typeof verifyWorkRecoveryService>[3];journalDirectory:string};
/** The only complete work verification producer. An INSERT remains pending until
 * the transport's independent retirement/platform/source checks and COMMIT.
 * Resolution and opening continue through their existing separate guarded APIs. */
export async function produceWorkRecoveryVerification(input:Input){
 return withLockedWorkRecoveryDecision(input.target,async(db,target)=>{
  const signal=input.target.signal;
  // Inspect before deny application or credential probes: a lost COMMIT reply
  // must never mutate the state against which its immutable row was committed.
  const existing=await committedVerification(db,target,input.integrityMaterial,input.integrity.encryptedBundleDigest,signal);if(existing)return existing;
  requireMatchingWorkTargetIntegrityMaterial(input.integrity,input.integrityMaterial);
  const historical=requireRetainedWorkDenialHistory(input.denialHistory,input.retained,target.environmentId),source=requireAuthenticatedRetainedDenials(input.retained,target.environmentId);
  await requireMeasuredWorkTargetIntegrity(db,target,input.integrity,signal,input.integrityMaterial.storeObservation);
  await prepareWorkRecoveryDecisionDenials(db,target,input.retained);
  await fenceCurrentRecoveryJobs(db,target,input.retained);
  const service=await verifyWorkRecoveryService(db,target,input.service,input.passwords,input.journalDirectory,signal,input.retained);
  const effects=await verifyWorkRecoveryEffects(db,target,input.retained,input.effects,signal,input.denialHistory);
  await requireMeasuredWorkTargetIntegrity(db,target,input.integrity,signal,input.integrityMaterial.storeObservation);
  await requireVerifiedWorkRecoveryService(db,target,service);await requireVerifiedWorkRecoveryEffects(db,target,effects);
  const state=await currentRecoveryStateDigest(db),scope=await scopeDigest(db,target,signal,input.integrityMaterial),workflow=recoveryDigest({history:historical.historyDigest,effects:effects.workflowDigest,service:service.serviceDigest});
  if(state!==service.currentStateDigest||state!==effects.currentStateDigest||!effects.applicationResumptionAdmissionVerified||!effects.originalNativeSendIdentitiesVerified)throw Error('Complete unchanged recovery service and effects required');
  requireRetainedWorkDenialHistory(input.denialHistory,input.retained,target.environmentId);requireAuthenticatedRetainedDenials(input.retained,target.environmentId);signal.throwIfAborted();const id=randomUUID();
  await db.query(`INSERT INTO operations_recovery_verifications(id,environment_id,recovery_id,control_revision,bundle_digest,ledger_digest,objects_digest,current_state_digest,denial_digest,replay_digest,workflow_digest,scope_digest,required_scope_healthy,integrity_verified,denial_verified,replay_verified,workflow_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true,true,true,true)`,[id,target.environmentId,target.recoveryId,target.controlRevision,input.integrity.encryptedBundleDigest,input.integrity.ledgerDigest,input.integrity.objectsDigest,state,source.contextDigest,effects.replayDigest,workflow,scope]);
  if(await currentRecoveryStateDigest(db)!==state)throw Error('Recovery verification changed its verified state');signal.throwIfAborted();
  return Object.freeze({verificationId:id,bundleDigest:input.integrity.encryptedBundleDigest,currentStateDigest:state,resumed:false,serviceOpened:false,restorationReady:false});
 });
}

async function committedVerification(db:Client,target:LockedWorkRecoveryTarget,material:WorkTargetIntegrityInput,bundleDigest:string,signal:AbortSignal){
 const existing=(await db.query(`SELECT *,verified_at<=clock_timestamp() AND verified_at>clock_timestamp()-interval '30 minutes' AS fresh FROM operations_recovery_verifications WHERE environment_id=$1 AND recovery_id=$2 AND control_revision=$3`,[target.environmentId,target.recoveryId,target.controlRevision])).rows;
  if(existing.length){
   const row=existing[0];if(existing.length!==1||row.bundle_digest!==bundleDigest||!row.fresh||!row.required_scope_healthy||!row.integrity_verified||!row.denial_verified||!row.replay_verified||!row.workflow_verified||row.current_state_digest!==await currentRecoveryStateDigest(db)||row.scope_digest!==await scopeDigest(db,target,signal,material))throw Error('Existing recovery verification is stale or changed; no new probes permitted');
   const physical=await authenticateCommittedWorkTargetIntegrity(db,target,material,signal);
   if(physical.bundleDigest!==row.bundle_digest||physical.ledgerDigest!==row.ledger_digest||physical.objectsDigest!==row.objects_digest)throw Error('Committed recovery verification physical identity differs');
   signal.throwIfAborted();return Object.freeze({verificationId:row.id,bundleDigest:row.bundle_digest,currentStateDigest:row.current_state_digest,resumed:true,serviceOpened:false,restorationReady:false});
  }
 return null;
}
/** Must run before initial measurement/probe work when resuming a command. */
export async function resumeCommittedWorkRecoveryVerification(target:LockedWorkRecoveryInput,material:WorkTargetIntegrityInput){
 const candidate=workCaptureCandidateSchema.parse(material.candidate);
 return withLockedWorkRecoveryDecision(target,(db,current)=>committedVerification(db,current,material,candidate.encryptedBundle.digest,target.signal));
}
