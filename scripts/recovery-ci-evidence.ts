import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
export type RecoveryFeature='012'|'013'|'014';
/** Current-schema recovery receipts are not historical feature releases. Keep
 * the supported target explicit; a future manifest requires a reviewed update. */
export function completeRecoveryCiEvidence(feature:RecoveryFeature,schemaVersion:number,value:unknown):boolean{
 if(schemaVersion!==CURRENT_SCHEMA_VERSION||!Array.isArray(value)||value.length!==2)return false;
 const records=value as Record<string,unknown>[];
 if(records.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return false;
 const every=(flags:readonly string[])=>records.every(row=>flags.every(flag=>row[flag]===true));
 const paths=(prior:number)=>records.every(row=>row.schema===schemaVersion)&&
  new Set(records.map(row=>row.path)).size===2&&records.some(row=>row.path===`empty-to-${schemaVersion}`)&&records.some(row=>row.path===`${String(prior).padStart(3,'0')}-to-${schemaVersion}`);
 if(feature==='012')return paths(47)&&every(['predecessorPreserved','workflowPreserved','crashRecovered','disabledCleanup','noAutomaticRetry','tombstoneRotation']);
 if(feature==='013')return paths(49)&&every(['predecessorPreserved','workflowPreserved','sameDatabaseRestart','committedReplay','lateAdmissionDenied','beforeCommitRollback','afterCommitReconciled','expiredPreviewDenied','workerCrashRecovered','disabledRetention','deadlinePreserved']);
 return new Set(records.map(row=>row.from)).size===2&&records.some(row=>row.from==='empty')&&records.some(row=>row.from===51)&&records.every(row=>row.to===schemaVersion&&row.authenticatedNativeAppRestarts===2&&Number.isSafeInteger(row.domainChecks)&&Number(row.domainChecks)>0)&&every(['activationSnapshot','oldWriterDenied','runtimeGrants','workerCrashAndSigterm','sameDatabaseAndWorkflow','unknownCostHeld','earliestDeadlinePreserved']);
}
