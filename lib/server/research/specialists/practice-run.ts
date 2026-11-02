import {z} from 'zod';
import type {PoolClient} from 'pg';
import type {AppIdentity} from './identity';
import type {OwnedDiscussion} from './discussions';
import {hiddenRecord} from '../../../contracts/http';
import {discussionSnapshots,discussionSnapshotsCurrent} from './discussion-sources';
import {digest} from './research-cache/schema';
import {sourceSchema} from './solution-research/schema';
import {publicResearchUrl} from './solution-research/evidence';
import {practiceBriefSchema} from '../../../contracts/vercel-practice-result';

/** Shared stored-data validation for publication and subsequent owned reads.
 * The caller must first lock and authorize the exact discussion/assignment. */
export async function readEligiblePracticeRun(db:PoolClient,identity:AppIdentity,discussion:OwnedDiscussion,reference:string,signal:AbortSignal,notBefore?:Date){
 signal.throwIfAborted();
 const snapshots=discussionSnapshots(discussion.dependencies);
 if(!snapshots.length||!await discussionSnapshotsCurrent(db,identity,discussion.customer_id,snapshots))throw hiddenRecord();
 const row=(await db.query(`SELECT product,topic,brief,source_urls,created_at,refresh_after FROM turas_vercel_practice_runs
  WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND refresh_after>clock_timestamp()
   AND ($4::timestamptz IS NULL OR created_at>=$4) FOR SHARE`,[reference,identity.environmentId,identity.workspaceId,notBefore??null])).rows[0];
 if(!row)throw hiddenRecord();
 // JSONB reorders keys; reconstruct the finalizer's authored schema order.
 const brief=practiceBriefSchema.parse(row.brief);
 if(digest(JSON.stringify([identity.environmentId,identity.workspaceId,row.product,row.topic,brief,row.source_urls]))!==reference)throw hiddenRecord();
 const urls=z.array(z.url().max(2000).refine(publicResearchUrl)).min(1).max(96).parse(row.source_urls);
 const records=(await db.query(`SELECT source,url,checked_at,refresh_after FROM turas_evidence_snapshots
  WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::text[]) AND url=ANY($4::text[]) ORDER BY id FOR SHARE`,[identity.environmentId,identity.workspaceId,snapshots.map(item=>item.snapshotId),urls])).rows;
 const sources=records.map(record=>{const source=sourceSchema.parse(record.source);if(source.url!==record.url)throw hiddenRecord();return {id:source.id,url:source.url,title:source.title,publishedAt:source.publication?.date??null,checkedAt:record.checked_at.toISOString(),refreshAfter:record.refresh_after.toISOString()};});
 if(urls.some(url=>!sources.some(source=>source.url===url))||brief.practices.some(practice=>!practice.sourceIds.length||practice.sourceIds.some(id=>!sources.some(source=>source.id===id))))throw hiddenRecord();
 signal.throwIfAborted();
 return {product:row.product,topic:row.topic,brief,sources,storedAt:row.created_at.toISOString(),refreshAfter:row.refresh_after.toISOString()};
}
