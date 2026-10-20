import {auditRecoveryResumptionAdmission} from './recovery-resumption-admission';
import {auditRecoveryNativeSendIdentities} from './recovery-native-send-identities';
import type {Client} from 'pg';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {currentRecoveryStateDigest} from './recovery-state';
import {requireMeasuredWorkCronAdmission} from './work-cron-admission';
import {requireMeasuredWorkLegacyProductionPool} from './work-legacy-production-pool';
import {requireMeasuredWorkOldHttpAdmission} from './work-old-http-admission';
import {requireMeasuredWorkManagedTerminalInventory} from './work-managed-terminal-inventory';
import {requireMeasuredWorkSandboxTerminalInventory} from './work-sandbox-terminal-inventory';
import {auditRecoveryDispatchState} from './recovery-dispatch-audit';
import {auditRecoveryModelHolds} from './recovery-model-hold-audit';
import {auditRecoveryLearningCosts} from './recovery-learning-cost-audit';
import {auditRecoveryServiceCosts} from './recovery-service-cost-audit';
import {auditRecoveryProviderJournals} from './recovery-provider-journal-audit';
import {auditRecoveredRequestFencesInTransaction} from './recovery-replay-audit';
type Proof<F extends (...args:never[])=>unknown>=Parameters<F>[2];
export type WorkRecoveryEffectMeasurements={
 cron:Proof<typeof requireMeasuredWorkCronAdmission>;
 legacyProductionPeer?:Proof<typeof requireMeasuredWorkLegacyProductionPool>;
 oldHttp:Proof<typeof requireMeasuredWorkOldHttpAdmission>;
 native:Proof<typeof requireMeasuredWorkManagedTerminalInventory>;
 sandbox:Proof<typeof requireMeasuredWorkSandboxTerminalInventory>;
};
const composed=new WeakMap<object,{db:Client;target:LockedWorkRecoveryTarget;state:string}>();
/** Consume actual repeated ingress/provider observations and original accounting
 * under the same final owner transaction. Unknown effects stay held and cannot
 * be replayed; this never claims they settled, delivered, or had zero cost. */
export async function verifyWorkRecoveryEffects(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials,input:WorkRecoveryEffectMeasurements,signal:AbortSignal){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine final effects owner required');
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId);
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const cron=await requireMeasuredWorkCronAdmission(db,target,input.cron,signal);
 let peer:Awaited<ReturnType<typeof requireMeasuredWorkLegacyProductionPool>>|null=null;
 if(cron.legacyProductionPeerProofRequired){if(!input.legacyProductionPeer)throw Error('Observed distinct Production peer pool required');peer=await requireMeasuredWorkLegacyProductionPool(db,target,input.legacyProductionPeer,signal);}
 else if(input.legacyProductionPeer)throw Error('Production recovery cannot exclude a peer pool');
 const oldHttp=await requireMeasuredWorkOldHttpAdmission(db,target,input.oldHttp,signal);
 // Read terminal providers after the final HTTP requests. Both components use
 // complete genuine inventories including original retained provider identities.
 const native=await requireMeasuredWorkManagedTerminalInventory(db,target,input.native,signal),sandbox=await requireMeasuredWorkSandboxTerminalInventory(db,target,input.sandbox,signal);
 const dispatch=await auditRecoveryDispatchState(db,target),model=await auditRecoveryModelHolds(db,target,retained),learning=await auditRecoveryLearningCosts(db,target,retained),service=await auditRecoveryServiceCosts(db,target,retained),journals=await auditRecoveryProviderJournals(db,target,retained),nativeSend=await auditRecoveryNativeSendIdentities(db,target,retained);
 const replay=await auditRecoveredRequestFencesInTransaction(db,source.snapshot,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,backupCapturedAt:source.backupCapturedAt});
 signal.throwIfAborted();requireAuthenticatedRetainedDenials(retained,target.environmentId);
 const resumption=await auditRecoveryResumptionAdmission(db,target,retained);
 const state=await currentRecoveryStateDigest(db),workflowDigest=recoveryDigest({cron,peer,oldHttp,native,sandbox,dispatch,model,learning,service,journals,nativeSend,resumption,replay:replay.proofDigest});
 const proof=Object.freeze({contract:'pilot-work-recovery-effects-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,denialDigest:source.contextDigest,currentStateDigest:state,workflowDigest,replayDigest:replay.proofDigest,terminalProviderInventoriesVerified:true as const,originalFinancialAccountingPreserved:true as const,permanentRequestFencesVerified:true as const,applicationResumptionAdmissionVerified:true as const,originalNativeSendIdentitiesVerified:true as const,unknownEffectsSettled:false as const,requiredScopeHealthy:false as const,restorationReady:false as const});
 composed.set(proof,{db,target,state});return proof;
}
/** In-process provenance lasts only for this same active final owner and exact
 * post-probe state. A serialized summary cannot become unlock authority. */
export async function requireVerifiedWorkRecoveryEffects(db:Client,target:LockedWorkRecoveryTarget,proof:Awaited<ReturnType<typeof verifyWorkRecoveryEffects>>){
 const actual=composed.get(proof);if(!actual||actual.db!==db||actual.target!==target||!isWorkRecoveryDecisionClient(db)||actual.state!==await currentRecoveryStateDigest(db))throw Error('Actual unchanged final recovery effects required');return proof;
}
