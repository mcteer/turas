import {it,expect,vi} from 'vitest';
import type {Client} from 'pg';
import {withAuthorityEnvironment,authorityCheckpointTime,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {captureRecoveryDenialSnapshot} from '../../../lib/server/operations/recovery-denial-snapshot';
import {reconcileLockedWorkCredentialDenials} from '../../../lib/server/operations/recovery-credential-denials';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {revokeSession} from '../../../lib/server/auth/sessions';
import {closeRuntimePool} from '../../../lib/server/db/client';
// Actual owned PostgreSQL and deny-only domain logic. Only the independent
// cloud reader capability is modeled; this is not hosted-provider acceptance.
const authenticated=vi.hoisted(()=>new WeakSet<object>());
vi.mock('../../../scripts/pilot-denial-reader',()=>({requireAuthenticatedRetainedDenials:(value:object)=>{if(!authenticated.has(value))throw Error('Actual independently retained current denials required');return value;}}));
async function expected(owner:Client){const row=(await owner.query('SELECT current_database() AS name,current_user AS role')).rows[0];return {databaseName:row.name,ownerRole:row.role};}
async function retained(owner:Client,environmentId:string,backup:string){const snapshot=await captureRecoveryDenialSnapshot(owner,environmentId,AbortSignal.timeout(60000)),proof={snapshot,contextDigest:snapshot.snapshotDigest,backupCapturedAt:backup};authenticated.add(proof);return proof;}
async function retire(owner:Client,runtime:Client){await closeRuntimePool();await runtime.end();await owner.query('ALTER ROLE turas_runtime NOLOGIN');}
it('reconciles current work denials with the actual locked owner and retains idempotent permanent fences',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const fixture=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner);await revokeSession(fixture.actor.sessionId);
 const proof=await retained(owner,environmentId,backup);await owner.query('UPDATE login_sessions SET revoked_at=NULL WHERE id=$1',[fixture.actor.sessionId]);
 const scope=await lockAuthorityTarget(owner,environmentId,proof.snapshot,backup);await retire(owner,runtime);
 const result=await reconcileLockedWorkCredentialDenials(owner,proof,scope,await expected(owner));
 expect(result).toMatchObject({contract:'pilot-work-credential-denials-v1',revokedSessions:1,authorityGranted:false,quarantineCleared:false,restorationReady:false,independentColdBytesVerified:true});
 expect(result.permanentReplayFencesAdded).toBeGreaterThan(0);
 expect((await reconcileLockedWorkCredentialDenials(owner,proof,scope,await expected(owner))).revokedSessions).toBe(0);
 expect((await owner.query('SELECT mode,revision::int,recovery_id FROM operations_control')).rows[0]).toMatchObject({mode:'locked',revision:scope.controlRevision,recovery_id:scope.recoveryId});
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_recovery_verifications')).rows[0].n).toBe(0);
}),210000);
it('rejects serialized reader claims and mismatched retained scope before mutation',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const backup=await authorityCheckpointTime(owner),proof=await retained(owner,environmentId,backup),scope=await lockAuthorityTarget(owner,environmentId,proof.snapshot,backup);await retire(owner,runtime);
 await expect(reconcileLockedWorkCredentialDenials(owner,{...proof},scope,await expected(owner))).rejects.toThrow('Actual independently retained');
 await expect(reconcileLockedWorkCredentialDenials(owner,proof,{...scope,snapshotDigest:'a'.repeat(64)},await expected(owner))).rejects.toThrow('Exact independently retained');
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_replay_fences')).rows[0].n).toBe(0);
}),210000);
it('requires the selected owner and retired legacy login without terminating caller connections',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const backup=await authorityCheckpointTime(owner),proof=await retained(owner,environmentId,backup),scope=await lockAuthorityTarget(owner,environmentId,proof.snapshot,backup),identity=await expected(owner);
 await expect(reconcileLockedWorkCredentialDenials(owner,proof,scope,{...identity,databaseName:'wrong_database'})).rejects.toThrow('Exact work denial database owner');
 await expect(reconcileLockedWorkCredentialDenials(owner,proof,scope,identity)).rejects.toThrow('Legacy work runtime must be retired');
 expect((await runtime.query('SELECT 1 AS alive')).rows[0].alive).toBe(1);
 await owner.query('ALTER ROLE turas_runtime NOLOGIN');
 await expect(reconcileLockedWorkCredentialDenials(owner,proof,scope,identity)).rejects.toThrow('Legacy work runtime must be retired');
 await runtime.end();await reconcileLockedWorkCredentialDenials(owner,proof,scope,identity);
}),210000);
it('rolls back current denials when the selected recovery revision or authenticated bytes change',async()=>withAuthorityEnvironment(async(owner,runtime,environmentId)=>{
 const backup=await authorityCheckpointTime(owner),proof=await retained(owner,environmentId,backup),scope=await lockAuthorityTarget(owner,environmentId,proof.snapshot,backup);await retire(owner,runtime);
 await expect(reconcileLockedWorkCredentialDenials(owner,proof,{...scope,controlRevision:scope.controlRevision+1},await expected(owner))).rejects.toThrow('Exact locked credential');
 proof.snapshot.snapshotDigest='f'.repeat(64);
 await expect(reconcileLockedWorkCredentialDenials(owner,proof,scope,await expected(owner))).rejects.toThrow();
 expect((await owner.query('SELECT count(*)::int AS n FROM operations_replay_fences')).rows[0].n).toBe(0);
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
