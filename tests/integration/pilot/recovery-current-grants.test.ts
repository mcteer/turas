import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withAuthorityEnvironment,coldAuthorityProof,authorityCheckpointTime,lockAuthorityTarget} from '../../fixtures/pilot/recovery-authority';
import {pilotPublishedKnowledgeFixture} from '../../fixtures/pilot/knowledge';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {quarantineRestoredAuthority} from '../../../lib/server/operations/recovery-quarantine';
// Stub only the external work archive authentication boundary. Domain mutations,
// cold owned encrypted metadata, actual snapshot/digest checks and rollback are
// real. These fixtures are not actual Neon/Vercel independent archive proof.
const fixtureProofs=vi.hoisted(()=>new WeakSet<object>());
vi.mock('../../../scripts/pilot-denial-reader',async importOriginal=>({...await importOriginal<typeof import('../../../scripts/pilot-denial-reader')>(),requireAuthenticatedRetainedDenials:(value:object)=>{if(!fixtureProofs.has(value))throw Error('Actual independently retained current denials required');return value;}}));

it('preserves an unchanged current grant while revoking newer denials and all restored credentials',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 await pilotPublishedKnowledgeFixture(owner as any,'primary');
 const validId=randomUUID();await owner.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[validId,DEMO_IDS.partnerMembership,DEMO_IDS.workspace,DEMO_IDS.deniedCustomer,DEMO_IDS.mcteer]);
 const valid=(await owner.query('SELECT * FROM customer_grants WHERE id=$1',[validId])).rows[0],old=(await owner.query('SELECT * FROM customer_grants WHERE membership_id=$1 AND customer_id=$2',[DEMO_IDS.partnerMembership,DEMO_IDS.sharedCustomer])).rows[0],backup=await authorityCheckpointTime(owner);
 await owner.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE id=$1",[old.id]);const snapshot=await coldAuthorityProof(owner,environmentId);
 await owner.query("UPDATE customer_grants SET state='active',revision=$2 WHERE id=$1",[old.id,old.revision]);
 const locked=await lockAuthorityTarget(owner,environmentId,snapshot,backup),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision},proof={snapshot,contextDigest:snapshot.snapshotDigest,backupCapturedAt:backup};fixtureProofs.add(proof);
 const result=await quarantineRestoredAuthority(owner,scope,proof);
 expect(result).toMatchObject({currentGrantsPreserved:true,independentDenialsApplied:true,newlyRevokedGrants:0,restorationReady:false,allRequiredScopesQuarantined:true});
 expect((await owner.query('SELECT * FROM customer_grants WHERE id=$1',[validId])).rows[0]).toEqual(valid);
 expect((await owner.query('SELECT state,revision FROM customer_grants WHERE id=$1',[old.id])).rows[0]).toEqual({state:'revoked',revision:String(BigInt(old.revision)+1n)});
 expect(Number((await owner.query('SELECT count(*) FROM login_sessions WHERE revoked_at IS NULL')).rows[0].count)).toBe(0);
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
 await quarantineRestoredAuthority(owner,scope,proof);
 expect((await owner.query('SELECT * FROM customer_grants WHERE id=$1',[validId])).rows[0]).toEqual(valid);
 await expect(quarantineRestoredAuthority(owner,scope,JSON.parse(JSON.stringify(proof)))).rejects.toThrow('Actual independently retained');
}),210000);

it('rolls back grant-preserving quarantine when actual current-denial validation fails',async()=>withAuthorityEnvironment(async(owner,_runtime,environmentId)=>{
 const f=await pilotPublishedKnowledgeFixture(owner as any,'primary'),backup=await authorityCheckpointTime(owner),snapshot=await coldAuthorityProof(owner,environmentId),locked=await lockAuthorityTarget(owner,environmentId,snapshot,backup),scope={environmentId,recoveryId:locked.recoveryId,controlRevision:locked.controlRevision};
 const before=(await owner.query('SELECT id,state,revision FROM customer_grants ORDER BY id')).rows;
 const proof={snapshot,contextDigest:'f'.repeat(64),backupCapturedAt:backup};fixtureProofs.add(proof);
 await expect(quarantineRestoredAuthority(owner,scope,proof)).rejects.toThrow('Fresh independent denial snapshot context required');
 expect((await owner.query('SELECT id,state,revision FROM customer_grants ORDER BY id')).rows).toEqual(before);
 expect((await owner.query('SELECT revoked_at FROM login_sessions WHERE id=$1',[f.actor.sessionId])).rows[0].revoked_at).toBeNull();
 expect(Number((await owner.query('SELECT count(*) FROM operations_recovery_quarantines')).rows[0].count)).toBe(0);
 expect((await owner.query('SELECT mode FROM operations_control')).rows[0].mode).toBe('locked');
}),210000);
