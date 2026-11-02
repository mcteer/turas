import {z} from 'zod';
import type {AppIdentity} from './identity';
import {withTransaction} from '../../db/client';
import {hiddenRecord} from '../../../contracts/http';
import {lockOwnedDiscussion} from './discussions';
import {discussionSnapshots,discussionSnapshotsCurrent} from './discussion-sources';
import {specialistOutcomeSchema} from './discussion-results';
import {digest} from './research-cache/schema';
import {sourceSchema} from './solution-research/schema';
import {publicResearchUrl} from './solution-research/evidence';

import {practiceBriefSchema,practiceResultSchema} from '../../../contracts/vercel-practice-result';
export {practiceBriefSchema,practiceResultSchema} from '../../../contracts/vercel-practice-result';

/** The reference is not a capability. Only a result owned by this current parent
 * may be read; no fresh research lease, model call, cache fallback or writes. */
export async function readOwnedPracticeResult(identity:AppIdentity,parentSessionId:string,reference:string,signal:AbortSignal){
 if(!/^[a-f0-9]{64}$/.test(reference))throw hiddenRecord();signal.throwIfAborted();
 return withTransaction(async db=>{
  const scope=(await db.query(`SELECT d.id,d.conversation_id,a.result_reference FROM specialist_discussions d
   JOIN specialist_assignments a ON a.discussion_id=d.id JOIN conversations c ON c.id=d.conversation_id
   WHERE d.environment_id=$1 AND d.workspace_id=$2 AND d.owner_principal_id=$3 AND d.parent_session_id=$4
    AND c.native_protocol=27 AND c.eve_session_id=d.parent_session_id AND c.environment_id=d.environment_id AND c.workspace_id=d.workspace_id AND c.owner_principal_id=d.owner_principal_id
    AND d.kind='best-practices' AND a.state='completed' AND a.result_reference->>'kind'='best-practices'
    AND a.result_reference->>'reference'=$5 AND a.result_reference->>'status' IN('ready','incomplete')
   ORDER BY a.ordinal DESC LIMIT 1`,[identity.environmentId,identity.workspaceId,identity.principalId,parentSessionId,reference])).rows[0];
  if(!scope)throw hiddenRecord();
  const discussion=await lockOwnedDiscussion(db,identity,scope.conversation_id,scope.id);
  const snapshots=discussionSnapshots(discussion.dependencies);
  if(!snapshots.length||!await discussionSnapshotsCurrent(db,identity,discussion.customer_id,snapshots))throw hiddenRecord();
  const outcome=specialistOutcomeSchema.parse(scope.result_reference);
  const row=(await db.query(`SELECT product,topic,brief,source_urls,created_at,refresh_after FROM turas_vercel_practice_runs
   WHERE id=$1 AND environment_id=$2 AND workspace_id=$3 AND refresh_after>clock_timestamp() FOR SHARE`,[reference,identity.environmentId,identity.workspaceId])).rows[0];
  if(!row)throw hiddenRecord();
  // JSONB reorders object keys. Rebuild the authored finalizer's schema order
  // before verifying its original reference preimage. Arrays retain their order.
  const brief=practiceBriefSchema.parse(row.brief);
  if(digest(JSON.stringify([identity.environmentId,identity.workspaceId,row.product,row.topic,brief,row.source_urls]))!==reference)throw hiddenRecord();
  const urls=z.array(z.url().max(2000).refine(publicResearchUrl)).min(1).max(96).parse(row.source_urls);
  const records=(await db.query(`SELECT source,url,checked_at,refresh_after FROM turas_evidence_snapshots
   WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::text[]) AND url=ANY($4::text[]) ORDER BY id FOR SHARE`,[identity.environmentId,identity.workspaceId,snapshots.map(item=>item.snapshotId),urls])).rows;
  const sources=records.map(record=>{const source=sourceSchema.parse(record.source);if(source.url!==record.url)throw hiddenRecord();return {id:source.id,url:source.url,title:source.title,publishedAt:source.publication?.date??null,checkedAt:record.checked_at.toISOString(),refreshAfter:record.refresh_after.toISOString()};});
  if(urls.some(url=>!sources.some(source=>source.url===url))||brief.practices.some(practice=>!practice.sourceIds.length||practice.sourceIds.some(id=>!sources.some(source=>source.id===id))))throw hiddenRecord();
  signal.throwIfAborted();
  return practiceResultSchema.parse({status:outcome.status,product:row.product,topic:row.topic,brief,sources,storedAt:row.created_at.toISOString(),refreshAfter:row.refresh_after.toISOString()});
 });
}
