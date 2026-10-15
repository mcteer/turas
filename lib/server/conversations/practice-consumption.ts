import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {researchSourceIsEligibleInTransaction} from '../research/specialists/account';

export const practiceCitationPrefix='public_practice:';
/** Shared library records contain public product sources, never account claims. */
export async function practiceSnapshotIsCurrent(db:PoolClient,actor:CurrentSession,customerId:string|undefined,snapshotId:string){
 if(!/^[a-f0-9]{64}$/.test(snapshotId))return false;
 const environmentId=getServerConfig().TURAS_ENVIRONMENT_ID;
 const rows=(await db.query<{url:string}>(`SELECT DISTINCT s.url FROM turas_evidence_snapshots s
  JOIN turas_vercel_practice_sources m ON m.environment_id=s.environment_id AND m.workspace_id=s.workspace_id AND m.snapshot_id=s.id
  WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.id=$3
   AND ($4::boolean OR (m.source_type='vercel_documentation' AND s.url LIKE 'https://vercel.com/docs/%' AND s.url !~ '[?#]'))
   AND NOT EXISTS(SELECT 1 FROM turas_evidence_snapshots newer WHERE newer.environment_id=s.environment_id
    AND newer.workspace_id=s.workspace_id AND newer.url=s.url AND newer.checked_at>s.checked_at AND newer.content_hash<>s.content_hash)`,
 [environmentId,actor.workspaceId,snapshotId,Boolean(customerId)])).rows;
 if(rows.length!==1)return false;
 if(!customerId)return true; // Original workspace-public product library, not customer data.
 return researchSourceIsEligibleInTransaction(db,{...actor,userId:actor.principalId,environmentId},customerId,rows[0].url);
}
