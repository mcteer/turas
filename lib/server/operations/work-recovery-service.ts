import {requireWorkMcpBranchCoverage,type WorkMcpCanonicalScope} from './work-mcp-branch-verification';
import type {RetainedWorkDenials} from '../../../scripts/pilot-denial-reader';
import type {Client} from 'pg';
import {recoveryDigest} from '../../contracts/pilot-recovery';
import {isWorkRecoveryDecisionClient,requireLockedWorkRecoveryConnection,type LockedWorkRecoveryTarget} from './locked-work-recovery-target';
import {requireMeasuredWorkMaintenanceHttpCoverage,type WorkMaintenanceHttpBatch} from './work-maintenance-verification';
import {requireMeasuredWorkMcpCoverage,type WorkMcpCategoryMeasurement} from './work-mcp-verification';
import {auditRecoveryConversationReads,requireAuditedRecoveryConversationReads} from './recovery-conversation-reads';
import {requireCurrentWorkConversationHttpCoverage,type WorkConversationHttpBatch} from './work-conversation-http';
import {currentRecoveryStateDigest} from './recovery-state';
export type WorkRecoveryServiceMeasurements={maintenance:readonly WorkMaintenanceHttpBatch[];mcp:readonly WorkMcpCategoryMeasurement[];canonicalMcp?:WorkMcpCanonicalScope;conversations:readonly WorkConversationHttpBatch[]};
const verified=new WeakMap<object,{db:Client;target:LockedWorkRecoveryTarget;state:string}>();
/** Exhaust current record, participant/category/customer and private-owner scope.
 * MCP creates and retires its final credentials before canonical conversation
 * authorization binds the resulting state. No mutation follows that binding. */
export async function verifyWorkRecoveryService(db:Client,target:LockedWorkRecoveryTarget,input:WorkRecoveryServiceMeasurements,passwords:Parameters<typeof auditRecoveryConversationReads>[2],journalDirectory:string,signal:AbortSignal,retained?:RetainedWorkDenials){
 if(!isWorkRecoveryDecisionClient(db))throw Error('Genuine final required-service owner required');
 await requireLockedWorkRecoveryConnection(db,target,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision});signal.throwIfAborted();
 const maintenance=await requireMeasuredWorkMaintenanceHttpCoverage(db,target,input.maintenance,signal);
 const mcp=input.canonicalMcp?await requireWorkMcpBranchCoverage(db,target,input.canonicalMcp,input.mcp,passwords,requireCurrentDenials(retained),journalDirectory):await requireMeasuredWorkMcpCoverage(db,target,input.mcp);
 const canonical=await auditRecoveryConversationReads(db,target,passwords,journalDirectory);
 const conversations=await requireCurrentWorkConversationHttpCoverage(db,target,input.conversations,canonical);
 await requireAuditedRecoveryConversationReads(db,target,canonical);signal.throwIfAborted();
 const state=await currentRecoveryStateDigest(db),serviceDigest=recoveryDigest({maintenance,mcp,conversations,canonical});
 const proof=Object.freeze({contract:'pilot-work-recovery-service-v2' as const,environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,currentStateDigest:state,serviceDigest,maintenanceRecordCoverageVerified:true as const,exhaustiveCanonicalScopeCoverageVerified:true as const,actualHostedSdkBranchCoverageVerified:true as const,privateConversationAuthorizationVerified:true as const,probeRetirementVerified:true as const,requiredScopeHealthy:true as const,restorationReady:false as const});
 verified.set(proof,{db,target,state});return proof;
}
export async function requireVerifiedWorkRecoveryService(db:Client,target:LockedWorkRecoveryTarget,proof:Awaited<ReturnType<typeof verifyWorkRecoveryService>>){
 const actual=verified.get(proof);if(!actual||actual.db!==db||actual.target!==target||!isWorkRecoveryDecisionClient(db)||actual.state!==await currentRecoveryStateDigest(db))throw Error('Actual unchanged final required-service verification required');return proof;
}

function requireCurrentDenials(retained:RetainedWorkDenials|undefined){if(!retained)throw Error('Current retained authority required for mixed canonical and hosted coverage');return retained;}
