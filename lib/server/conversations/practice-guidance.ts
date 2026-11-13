import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {getServerConfig} from '../config';
import {HttpFailure} from '../../contracts/http';
import {currentPracticeSnapshotSql} from '../research/specialists/research-cache/practice-guidance';

async function ready(db:PoolClient){
 return Number((await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',
  [getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0]?.schema_version)>=86;
}

/** Call only after ordinary owner/scope and exact source eligibility checks.
 * Active freshness is mutable; the independent withdrawal ledger stays intact. */
export async function recordPracticeGuidance(db:PoolClient,actor:CurrentSession,
 conversationId:string,attemptId:string,customerId:string|undefined,snapshotIds:readonly string[]){
 if(!snapshotIds.length)return;
 if(!await ready(db))throw new HttpFailure(503,'unavailable','Current guidance requires the freshness migration');
 const recorded=await db.query(`INSERT INTO ordinary_practice_guidance_reads
  (conversation_id,customer_id,snapshot_id,attempt_id,valid_until)
  SELECT $1,$2,s.id,$3,min(least(s.refresh_after,s.checked_at+interval '7 days 0.001 seconds',
   CASE WHEN m.source_type='vercel_documentation' AND s.url LIKE 'https://vercel.com/docs/%' AND s.url !~ '[?#]'
    THEN 'infinity'::timestamptz ELSE m.published_at+interval '7 days 0.001 seconds' END))
  FROM turas_evidence_snapshots s JOIN turas_vercel_practice_sources m
   ON m.environment_id=s.environment_id AND m.workspace_id=s.workspace_id AND m.snapshot_id=s.id
  WHERE s.environment_id=$4 AND s.workspace_id=$5 AND s.id=ANY($6::text[]) AND (${currentPracticeSnapshotSql})
  GROUP BY s.id
  ON CONFLICT(conversation_id,scope_key,snapshot_id) DO UPDATE
   SET attempt_id=EXCLUDED.attempt_id,valid_until=EXCLUDED.valid_until,retired_refresh_id=NULL
  RETURNING snapshot_id`,[conversationId,customerId??null,attemptId,getServerConfig().TURAS_ENVIRONMENT_ID,
  actor.workspaceId,[...snapshotIds]]);
 if(recorded.rowCount!==new Set(snapshotIds).size)throw new HttpFailure(409,'context_changed','Practice evidence expired; search again');
}

export async function expiredPracticeGuidance(db:PoolClient,conversationId:string){
 if(!await ready(db))return [] as string[];
 return (await db.query<{snapshot_id:string}>(`SELECT DISTINCT snapshot_id FROM ordinary_practice_guidance_reads
  WHERE conversation_id=$1 AND retired_refresh_id IS NULL AND valid_until<=clock_timestamp()
  ORDER BY snapshot_id LIMIT 1001`,[conversationId])).rows.map(row=>row.snapshot_id);
}

export async function assertPracticeGuidanceCurrent(db:PoolClient,conversationId:string){
 if((await expiredPracticeGuidance(db,conversationId)).length)
  throw new HttpFailure(409,'context_changed','Current product evidence expired; refresh it before continuing');
}

export async function historicalPracticeGuidance(db:PoolClient,conversationId:string){
 if(!await ready(db))return [] as Array<{snapshotId:string;url:string|null}>;
 return (await db.query<{snapshot_id:string;url:string|null}>(`SELECT DISTINCT r.snapshot_id,s.url
  FROM ordinary_practice_guidance_reads r JOIN conversations c ON c.id=r.conversation_id
  LEFT JOIN turas_evidence_snapshots s ON s.environment_id=c.environment_id AND s.workspace_id=c.workspace_id::text AND s.id=r.snapshot_id
  WHERE r.conversation_id=$1 AND (r.retired_refresh_id IS NOT NULL OR r.valid_until<=clock_timestamp())
  ORDER BY r.snapshot_id LIMIT 5`,[conversationId])).rows.map(row=>({snapshotId:row.snapshot_id,url:row.url}));
}

export async function retireExpiredPracticeGuidance(db:PoolClient,conversationId:string,refreshId:string,snapshotIds:readonly string[]){
 if(!snapshotIds.length||!await ready(db))return;
 await db.query(`UPDATE ordinary_practice_guidance_reads SET retired_refresh_id=$2
  WHERE conversation_id=$1 AND snapshot_id=ANY($3::text[]) AND retired_refresh_id IS NULL
   AND valid_until<=clock_timestamp()`,[conversationId,refreshId,[...snapshotIds]]);
}
