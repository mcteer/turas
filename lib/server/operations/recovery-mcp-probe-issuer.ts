import type {Client,PoolClient} from 'pg';
import {createAuthenticatedWorkMcpProbeSession} from './authenticated-recovery-read';
import {withParticipantRecoveryReadCapability} from './admission';
import {insertWorkRecoveryMcpConnection} from '../mcp/management';
import {issueRegisteredWorkMcpHttpRead} from './recovery-http-read-issuer';
import type {LockedWorkRecoveryTarget} from './locked-work-recovery-target';
/** Caller owns the genuine exact-target READ COMMITTED transaction. Independently
 * retained current denials are applied before a new connection identity exists.
 * This does not restore captured credentials or enable ordinary management. */
export async function issueWorkRecoveryMcpProbe(db:Client,target:LockedWorkRecoveryTarget,input:Parameters<typeof createAuthenticatedWorkMcpProbeSession>[2],journalDirectory:string){
 await db.query('SAVEPOINT issue_work_mcp_probe');
 try{
  const {actor,probe}=await createAuthenticatedWorkMcpProbeSession(db,target,input,journalDirectory);
  const result=await withParticipantRecoveryReadCapability(db as unknown as PoolClient,actor,{environmentId:target.environmentId,recoveryId:target.recoveryId,controlRevision:target.controlRevision,deadline:input.deadline},()=>insertWorkRecoveryMcpConnection(db,target,actor,probe));
  const admission=await issueRegisteredWorkMcpHttpRead(db,target,actor,probe,10);
  await db.query('RELEASE SAVEPOINT issue_work_mcp_probe');return Object.freeze({...result,probe,admission});
 }catch(error){await db.query('ROLLBACK TO SAVEPOINT issue_work_mcp_probe');await db.query('RELEASE SAVEPOINT issue_work_mcp_probe');throw error;}
}
