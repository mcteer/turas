import {requireCurrentRecoveryJobFences} from './recovery-current-job-fences';
import type {Client} from 'pg';
import {requireAuthenticatedRetainedDenials,type RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import replayTables from '../../contracts/recovery-replay-tables.json' with {type:'json'};
import {recoveryJobReplayTables} from './recovery-job-replay-keys';
import {isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {auditRecoveredRequestFencesInTransaction} from './recovery-replay-audit';
import {auditRecoveryDispatchState} from './recovery-dispatch-audit';
/** Database admission invariant across reopening, rather than a provider stop
 * assertion. The installed unconditional INSERT/UPDATE guards match authored
 * bodies, cover every original actual/semantic business key, and are immutable
 * to runtime roles. Their only UPDATE exception requires a locked owner session;
 * it does not apply to an open control row. Terminal providers are separate. */
export async function auditRecoveryResumptionAdmission(db:Client,target:LockedWorkRecoveryTarget,retained:RetainedWorkDenials){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine resumption admission owner required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});
 const source=requireAuthenticatedRetainedDenials(retained,target.environmentId),dispatch=await auditRecoveryDispatchState(db,target);
 const replay=await auditRecoveredRequestFencesInTransaction(db,source.snapshot,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,backupCapturedAt:source.backupCapturedAt});
 const required=[...replayTables,...recoveryJobReplayTables].sort();
 if(required.some(name=>!replay.tables.some(table=>table.name===name)))throw Error('Complete original application resumption admission inventory required');
 const currentJobs=await requireCurrentRecoveryJobFences(db,target);
 requireAuthenticatedRetainedDenials(retained,target.environmentId);
 return Object.freeze({contract:'pilot-recovery-resumption-admission-v1' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,snapshotDigest:source.contextDigest,admissionDigest:recoveryDigest({dispatch:dispatch.dispatchStateDigest,replay:replay.proofDigest,required,currentJobs}),applicationResumptionAdmissionVerified:true as const,providerExecutionClosed:false as const,providerCredentialsRevoked:false as const,unknownEffectsSettled:false as const,restorationReady:false as const});
}
