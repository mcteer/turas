import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import type { PartnerActor } from "./policy";
import { partnerHash } from "./repository";

export async function partnerAuthorityDigest(db:PoolClient,actor:PartnerActor,customerId?:string){
 const member=(await db.query(`SELECT m.revision,p.revision AS principal_revision,o.authority_revision
  FROM memberships m JOIN principals p ON p.id=m.principal_id LEFT JOIN partner_organizations o ON o.id=m.partner_org_id WHERE m.id=$1`,[actor.membershipId])).rows[0];
 const grants=actor.kind==="partner"?(await db.query(`SELECT customer_id,state,revision FROM customer_grants WHERE membership_id=$1 AND ($2::uuid IS NULL OR customer_id=$2) ORDER BY customer_id`,[actor.membershipId,customerId??null])).rows:[];
 const state=customerId?(await db.query("SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$1 AND workspace_id=$2",[customerId,actor.workspaceId])).rows[0]:null;
 return partnerHash({member,grants,state});
}
export async function readPartnerCursor(db:PoolClient,actor:PartnerActor,cursor:string|undefined,scope:string,authority:string):Promise<Record<string,string>|null>{
 if(!cursor)return null;
 const row=(await db.query(`SELECT sort_key,scope_digest,authority_digest,expires_at FROM partner_list_cursors WHERE id=$1 AND environment_id=$2 AND actor_membership_id=$3 AND session_id=$4`,[cursor,getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,actor.sessionId])).rows[0];
 if(!row||row.scope_digest!==scope||row.authority_digest!==authority||row.expires_at.getTime()<=Date.now())throw new HttpFailure(409,"stale_cursor","Discovery changed; restart this list");
 return row.sort_key;
}
export async function issuePartnerCursor(db:PoolClient,actor:PartnerActor,scope:string,authority:string,key:Record<string,string>){
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`partner.cursor:${actor.membershipId}`]);
 await db.query(`DELETE FROM partner_list_cursors WHERE id IN(SELECT id FROM partner_list_cursors WHERE actor_membership_id=$1 AND (expires_at<=clock_timestamp() OR id IN(SELECT id FROM partner_list_cursors WHERE actor_membership_id=$1 ORDER BY created_at DESC,id DESC OFFSET 99)))`,[actor.membershipId]);
 const id=randomUUID();await db.query(`INSERT INTO partner_list_cursors(id,environment_id,actor_membership_id,session_id,scope_digest,authority_digest,sort_key) VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,actor.sessionId,scope,authority,JSON.stringify(key)]);return id;
}
