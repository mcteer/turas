import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { DEMO_IDS } from "../bootstrap-ids";
import { lockProfileActor } from "../profiles/policy";
import { getServerConfig } from "../config";
import { HttpFailure,hiddenRecord } from "../../contracts/http";
export type ExpansionActor=CurrentSession;
export function isExpansionOwnerAdministrator(actor:ExpansionActor){return actor.kind==="internal"&&actor.role==="admin"&&actor.principalId===DEMO_IDS.mcteer;}
export async function requireExpansionEnvironment(db:PoolClient,write=false,advice=false){
 const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment LIMIT 1')).rows[0];
 if(marker?.environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID||Number(marker.schema_version)<(advice?47:46))throw new HttpFailure(503,'schema_unavailable','Expansion unavailable');
 if(write&&process.env.TURAS_011_DISABLED==='1')throw new HttpFailure(503,'feature_disabled','New expansion work is temporarily unavailable');
}
/** Discover scoped membership IDs before authority locks; never discover new owners under record locks. */
export async function lockExpansionActor(db:PoolClient,actor:ExpansionActor,customerId:string,affected:readonly string[]=[],requireAffectedActive=true){
 if(actor.kind!=='internal')throw hiddenRecord();
 await requireExpansionEnvironment(db);
 const assignment=(await db.query('SELECT owner_membership_id,environment_id FROM expansion_account_owners WHERE customer_id=$1 AND workspace_id=$2',[customerId,actor.workspaceId])).rows[0];
 if(assignment&&assignment.environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID)throw hiddenRecord();
 const members=[...new Set([...affected,assignment?.owner_membership_id].filter((x):x is string=>!!x))].sort();
 await lockProfileActor(db,actor,customerId,members,true);
 for(const id of members){
  const row=(await db.query('SELECT m.kind,m.active,p.active AS principal_active FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE m.id=$1 AND m.workspace_id=$2 FOR SHARE OF p',[id,actor.workspaceId])).rows[0];
  if(requireAffectedActive&&affected.includes(id)&&(!row?.active||!row.principal_active||row.kind!=='internal'))throw new HttpFailure(422,'invalid_owner','Select an active internal owner');
 }
 const current=(await db.query('SELECT owner_membership_id FROM expansion_account_owners WHERE customer_id=$1 AND workspace_id=$2',[customerId,actor.workspaceId])).rows[0];
 if(current?.owner_membership_id!==assignment?.owner_membership_id)throw new HttpFailure(409,'owner_changed','Account owner changed; refresh');
}
export async function expansionAssignment(db:PoolClient,actor:ExpansionActor,customerId:string,lock=false){
 const row=(await db.query(`SELECT a.owner_membership_id,a.version,a.generation,
  (m.active AND p.active AND m.kind='internal') AS owner_active
  FROM expansion_account_owners a LEFT JOIN memberships m ON m.id=a.owner_membership_id
  LEFT JOIN principals p ON p.id=m.principal_id WHERE a.customer_id=$1 AND a.workspace_id=$2 AND a.environment_id=$3 ${lock?'FOR UPDATE OF a':''}`,[customerId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
 return {membershipId:row?.owner_membership_id??null,version:Number(row?.version??0),generation:Number(row?.generation??0),active:row?.owner_active===true};
}
export function requireExpansionReviewer(actor:ExpansionActor,assignment:Awaited<ReturnType<typeof expansionAssignment>>){
 if(!assignment.active||assignment.membershipId!==actor.membershipId)throw new HttpFailure(403,'forbidden','Only the current account owner may make this decision');
}
/** Authority prefix already holds membership/principal rows; validate new work after receipt replay. */
export async function validateExpansionMembers(db:PoolClient,actor:ExpansionActor,ids:readonly string[]){
 for(const id of [...new Set(ids)].sort()){
  const row=(await db.query(`SELECT m.kind,m.active,p.active AS principal_active FROM memberships m JOIN principals p ON p.id=m.principal_id
   WHERE m.id=$1 AND m.workspace_id=$2`,[id,actor.workspaceId])).rows[0];
  if(!row?.active||!row.principal_active||row.kind!=='internal')throw new HttpFailure(422,'invalid_owner','Select an active internal owner');
 }
}
