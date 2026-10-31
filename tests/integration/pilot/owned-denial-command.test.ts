import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {withAuthorityEnvironment,authorityCheckpointTime,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {revokeSession} from '../../../lib/server/auth/sessions';
import {pilotOwnedDenialReconciliation} from '../../../scripts/pilot-owned-denial-reconciliation';
const reader=vi.hoisted(()=>vi.fn());
vi.mock('../../../scripts/pilot-denial-reader',()=>({readRetainedWorkDenialSnapshot:reader}));
// Real owned DB/denial application/audit. The independent provider read is
// stubbed here; actual archive authentication remains a separate provider gate.
const args=(environmentId:string,recoveryId:string,controlRevision:number,backup:string,root:string)=>['--reconcile-owned-work-denials','--environment',environmentId,'--recovery-id',recoveryId,'--expected-revision',String(controlRevision),'--denials',join(root,'input.json'),'--destination',join(root,'destination.json'),'--backup-captured-at',backup,'--output',join(root,randomUUID())];
async function temporary(run:(root:string)=>Promise<void>){await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/denial-command-'));reader.mockReset();try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}
it('applies current denials and verifies permanent fences through the owned command without opening service',async()=>temporary(root=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner);await revokeSession(f.actor.sessionId);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));
 await owner.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[f.actor.sessionId]);const scope=await lockAuthorityTarget(owner,environmentId,snapshot,backup);
 reader.mockResolvedValue({snapshot,contextDigest:snapshot.snapshotDigest,backupCapturedAt:backup});
 const firstArgs=args(environmentId,scope.recoveryId,scope.controlRevision,backup,root),receipt=await pilotOwnedDenialReconciliation(firstArgs);
 expect(receipt.applied).toMatchObject({revokedSessions:1,authorityGranted:false,quarantineCleared:false});expect(receipt.audit.permanentRequestFencesVerified).toBe(true);
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0].revoked_at).toBeInstanceOf(Date);
 expect((await owner.query('SELECT mode,revision::int,recovery_id FROM operations_control')).rows[0]).toMatchObject({mode:'locked',revision:scope.controlRevision,recovery_id:scope.recoveryId});
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_verifications')).rows[0].n).toBe(0);
 expect((await readdir(firstArgs.at(-1)!)).sort()).toEqual(['denials-applied.json','reconciliation.json']);
 expect((await pilotOwnedDenialReconciliation(args(environmentId,scope.recoveryId,scope.controlRevision,backup,root))).applied.revokedSessions).toBe(0);
})),210000);
it('rejects a changed owner lock before fetching independent denial bytes',async()=>temporary(root=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const backup=await authorityCheckpointTime(owner),scope=await lockAuthorityTarget(owner,environmentId),input=args(environmentId,scope.recoveryId,scope.controlRevision+1,backup,root);
 await expect(pilotOwnedDenialReconciliation(input)).rejects.toThrow('before independent reads');expect(reader).not.toHaveBeenCalled();
 expect(JSON.parse(await readFile(join(input.at(-1)!,'failure.json'),'utf8'))).toMatchObject({denialsApplied:false,serviceOpened:false});expect((await readdir(input.at(-1)!)).sort()).toEqual(['failure.json']);
})),210000);
it('retains committed denials and a resumable failure when the actual replay audit fails',async()=>temporary(root=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner);await revokeSession(f.actor.sessionId);
 const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000));await owner.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[f.actor.sessionId]);const scope=await lockAuthorityTarget(owner,environmentId,snapshot,backup);
 reader.mockResolvedValue({snapshot,contextDigest:snapshot.snapshotDigest,backupCapturedAt:backup});await owner.query('ALTER TABLE operations_replay_fences DISABLE TRIGGER replay_fence_immutable');
 const input=args(environmentId,scope.recoveryId,scope.controlRevision,backup,root);try{await expect(pilotOwnedDenialReconciliation(input)).rejects.toThrow('immutability unavailable');}finally{await owner.query('ALTER TABLE operations_replay_fences ENABLE TRIGGER replay_fence_immutable');}
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0].revoked_at).toBeInstanceOf(Date);
 expect(JSON.parse(await readFile(join(input.at(-1)!,'failure.json'),'utf8'))).toMatchObject({denialsApplied:true,serviceOpened:false,restorationReady:false});expect((await readdir(input.at(-1)!)).sort()).toEqual(['denials-applied.json','failure.json']);
 expect((await pilotOwnedDenialReconciliation(args(environmentId,scope.recoveryId,scope.controlRevision,backup,root))).audit.permanentRequestFencesVerified).toBe(true);
})),210000);
it('withholds mutations for unavailable, older-schema or stale current proof',async()=>temporary(root=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner),snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),scope=await lockAuthorityTarget(owner,environmentId,snapshot,backup);
 reader.mockRejectedValueOnce(Error('Independent archive unavailable'));
 await expect(pilotOwnedDenialReconciliation(args(environmentId,scope.recoveryId,scope.controlRevision,backup,root))).rejects.toThrow('archive unavailable');
 reader.mockResolvedValueOnce({snapshot:{...snapshot,schemaVersion:55},contextDigest:snapshot.snapshotDigest,backupCapturedAt:backup});
 await expect(pilotOwnedDenialReconciliation(args(environmentId,scope.recoveryId,scope.controlRevision,backup,root))).rejects.toThrow('Complete current schema denial inventory required');
 reader.mockResolvedValueOnce({snapshot,contextDigest:snapshot.snapshotDigest,backupCapturedAt:new Date(Date.parse(snapshot.capturedAt)+1).toISOString()});
 await expect(pilotOwnedDenialReconciliation(args(environmentId,scope.recoveryId,scope.controlRevision,backup,root))).rejects.toThrow();
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0].revoked_at).toBeNull();
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_replay_fences')).rows[0].n).toBe(0);
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
})),210000);
