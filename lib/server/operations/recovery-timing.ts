import {z} from 'zod';
const timestamp=z.iso.datetime({offset:true});
const inputSchema=z.strictObject({capturedAt:timestamp,restoreStartedAt:timestamp,physicalRestoreFinishedAt:timestamp});
/** Diagnostic timings, not recovery acceptance. Capture is only a conservative
 * accepted-work boundary. The restore command is not an incident timestamp, and
 * restored bytes are not authenticated restricted service. */
export function physicalRecoveryTiming(input:unknown){
 const value=inputSchema.parse(input),capture=Date.parse(value.capturedAt),start=Date.parse(value.restoreStartedAt),finish=Date.parse(value.physicalRestoreFinishedAt);
 if(capture>start||start>finish)throw Error('Recovery timing order differs');
 const captureAgeAtRestoreStartMs=start-capture,physicalRestoreDurationMs=finish-start;
 return {version:'pilot-physical-recovery-timing-v1' as const,...value,captureAgeAtRestoreStartMs,physicalRestoreDurationMs,
  maximumAcceptedWorkLossMs:86400000,maximumVerifiedServiceRecoveryMs:14400000,
  captureWithin24Hours:captureAgeAtRestoreStartMs<=86400000,physicalRestoreWithin4Hours:physicalRestoreDurationMs<=14400000,
  incidentStartedAt:null,verifiedServiceAt:null,rpoVerified:false as const,rtoVerified:false as const,fullRecoveryReady:false as const};
}
