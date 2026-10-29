import {it,expect} from 'vitest';
import {completeRecoveryCiEvidence,type RecoveryFeature} from '../../scripts/recovery-ci-evidence';
const flags={
 '012':['predecessorPreserved','workflowPreserved','crashRecovered','disabledCleanup','noAutomaticRetry','tombstoneRotation'],
 '013':['predecessorPreserved','workflowPreserved','sameDatabaseRestart','committedReplay','lateAdmissionDenied','beforeCommitRollback','afterCommitReconciled','expiredPreviewDenied','workerCrashRecovered','disabledRetention','deadlinePreserved'],
 '014':['activationSnapshot','oldWriterDenied','runtimeGrants','workerCrashAndSigterm','sameDatabaseAndWorkflow','unknownCostHeld','earliestDeadlinePreserved'],
} as const;
function records(feature:RecoveryFeature){const prior={'012':47,'013':49,'014':51}[feature];return ['empty',prior].map(from=>feature==='014'?{from,to:80,domainChecks:11,authenticatedNativeAppRestarts:2,...Object.fromEntries(flags[feature].map(flag=>[flag,true]))}:{path:from==='empty'?'empty-to-80':`${String(from).padStart(3,'0')}-to-80`,schema:80,...Object.fromEntries(flags[feature].map(flag=>[flag,true]))});}
for(const feature of ['012','013','014'] as const){
 it(`${feature} accepts only both complete current-schema recovery paths`,()=>{
  const rows=records(feature);expect(completeRecoveryCiEvidence(feature,80,rows)).toBe(true);
  for(const invalid of [undefined,[],[rows[0]],[rows[0],rows[0]],[null,rows[1]],[[],rows[1]]])expect(completeRecoveryCiEvidence(feature,80,invalid)).toBe(false);
  expect(completeRecoveryCiEvidence(feature,79,rows)).toBe(false);
  expect(completeRecoveryCiEvidence(feature,80,rows.map(row=>({...row,schema:49,to:55})))).toBe(false);
 });
 it(`${feature} retains every authority, replay and lifecycle requirement`,()=>{
  for(const flag of flags[feature]){const rows=records(feature);expect(completeRecoveryCiEvidence(feature,80,[{...rows[0],[flag]:false},rows[1]])).toBe(false);expect(completeRecoveryCiEvidence(feature,80,[{...rows[0],[flag]:'true'},rows[1]])).toBe(false);}
  if(feature==='014')for(const invalid of [{domainChecks:0},{domainChecks:0.5},{authenticatedNativeAppRestarts:1},{from:49}]){const rows=records(feature);expect(completeRecoveryCiEvidence(feature,80,[{...rows[0],...invalid},rows[1]])).toBe(false);}
 });
}
