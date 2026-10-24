import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';

/** Original provenance for low-level ranking/lease fixtures only. This does not
 * approve a fact or establish an eligible end-to-end retrieval projection. */
export async function insertRetrievalProfileOrigin(db:PoolClient,input:{workspaceId:string;customerId:string;revisionId:string;text:string;digest:string}){
 const principalId=randomUUID(),membershipId=randomUUID(),recordId=randomUUID();
 await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic retrieval author')",[principalId,'retrieval-'+principalId]);
 await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[membershipId,principalId,input.workspaceId]);
 await db.query("INSERT INTO profile_records(id,workspace_id,customer_id,kind,created_by) VALUES($1,$2,$3,'claim',$4)",[recordId,input.workspaceId,input.customerId,membershipId]);
 await db.query(`INSERT INTO profile_revisions(id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
  VALUES($1,$2,$3,$4,1,'profile-v1',$5,'{}'::jsonb,$6,'manual','internal','internal_operations',$7)`,[input.revisionId,recordId,input.workspaceId,input.customerId,JSON.stringify({kind:'claim',text:input.text,sourceType:'manual'}),membershipId,input.digest]);
}
