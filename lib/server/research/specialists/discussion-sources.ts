import type {PoolClient} from 'pg';
import type {AppIdentity} from './identity';
import {snapshotReferenceSchema} from './research-cache/schema';
import {researchSourcesAreEligibleInTransaction,researchSourceKey} from './account';

export type DiscussionSnapshot={kind:'snapshot';snapshotId:string;checkedAt:string;refreshAfter:string};
export function discussionSnapshots(dependencies:readonly unknown[]):DiscussionSnapshot[]{
 return dependencies.filter((value):value is DiscussionSnapshot=>typeof value==='object'&&value!==null&&'kind' in value&&value.kind==='snapshot')
  .map(value=>({kind:'snapshot',...snapshotReferenceSchema.parse({snapshotId:value.snapshotId,checkedAt:value.checkedAt,refreshAfter:value.refreshAfter})}));
}

export async function discussionSnapshotsCurrent(db:PoolClient,identity:AppIdentity,accountId:string,references:readonly DiscussionSnapshot[]){
 if(!references.length)return true;
 if(references.some(reference=>Date.parse(reference.refreshAfter)<=Date.now()))return false;
 const ids=[...new Set(references.map(reference=>reference.snapshotId))];
 if(ids.length>256)return false;
 const rows=(await db.query<{id:string;url:string;checked_at:Date}>(`SELECT s.id,s.url,s.checked_at FROM turas_evidence_snapshots s
  WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.id=ANY($3::text[]) AND s.refresh_after>clock_timestamp()
   AND NOT EXISTS(SELECT 1 FROM turas_evidence_snapshots newer WHERE newer.environment_id=s.environment_id
    AND newer.workspace_id=s.workspace_id AND newer.fetch_key=s.fetch_key AND newer.checked_at>s.checked_at)
  ORDER BY s.id FOR SHARE OF s`,[identity.environmentId,identity.workspaceId,ids])).rows;
 if(rows.length!==ids.length)return false;
 if(rows.some(row=>references.some(reference=>reference.snapshotId===row.id&&reference.checkedAt!==row.checked_at.toISOString())))return false;
 const eligible=await researchSourcesAreEligibleInTransaction(db,identity,rows.map(row=>({accountId,url:row.url})));
 return rows.every(row=>eligible.get(researchSourceKey({accountId,url:row.url}))===true);
}
