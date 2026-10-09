import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { lockWorkspaceActor } from "../profiles/policy";
import { DEMO_IDS } from "../bootstrap-ids";
import { getServerConfig } from "../config";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
export type PartnerActor = CurrentSession;
export type TargetAuthority = { membershipId: string; membershipRevision: number; organizationId: string; organizationRevision: number; grantRevision: number };
export function isPartnerReviewer(actor: PartnerActor) { return actor.kind === "internal" && actor.role === "admin" && actor.principalId === DEMO_IDS.mcteer; }
export function requirePartnerReviewer(actor: PartnerActor) { if (!isPartnerReviewer(actor)) throw new HttpFailure(403,"forbidden","Action not allowed"); }
export function requireGuideAuthor(actor: PartnerActor) { if (actor.kind !== "internal") throw new HttpFailure(403,"forbidden","Action not allowed"); }
export async function requirePartnerSchema(db: PoolClient, learning=false) {
  const row=(await db.query("SELECT environment_id,schema_version FROM turas_environment LIMIT 1")).rows[0];
  if(row?.environment_id!==getServerConfig().TURAS_ENVIRONMENT_ID||Number(row.schema_version)<(learning?51:50)) throw new HttpFailure(503,"unavailable","Partner delivery is unavailable");
}
export async function lockPartnerActor(db: PoolClient, actor: PartnerActor, customerId?: string, targetMemberId?: string, write=false, allowUnavailableTarget=false): Promise<TargetAuthority|null> {
  await lockWorkspaceActor(db,actor,targetMemberId,!write,2000);
  await requirePartnerSchema(db);
  const lock=write?"FOR UPDATE":"FOR SHARE";
  let target: { id:string; revision:string; partner_org_id:string; principal_active:boolean; active:boolean; kind:string }|undefined;
  let orgRevision:number|undefined;
  if(targetMemberId){
    target=(await db.query(`SELECT m.id,m.revision,m.partner_org_id,m.active,m.kind,p.active AS principal_active FROM memberships m JOIN principals p ON p.id=m.principal_id WHERE m.id=$1 AND m.workspace_id=$2`,[targetMemberId,actor.workspaceId])).rows[0];
    if(!target||target.kind!=="partner")throw hiddenRecord();
    if((!target.active||!target.principal_active)&&!allowUnavailableTarget)throw hiddenRecord();
    const org=(await db.query(`SELECT active,authority_revision FROM partner_organizations WHERE id=$1 AND workspace_id=$2 ${lock}`,[target.partner_org_id,actor.workspaceId])).rows[0];
    if(!org)throw hiddenRecord();if(!org.active&&!allowUnavailableTarget)throw hiddenRecord();orgRevision=Number(org.authority_revision);
  }
  if(customerId){
    const found=await db.query(`SELECT s.customer_id FROM customer_profile_state s JOIN customer_references c ON c.id=s.customer_id AND c.workspace_id=s.workspace_id WHERE s.customer_id=$1 AND s.workspace_id=$2 ${write?"FOR UPDATE":"FOR SHARE"} OF s,c`,[customerId,actor.workspaceId]);
    if(!found.rowCount)throw hiddenRecord();
    const members=[actor.kind==="partner"?actor.membershipId:null,targetMemberId??null].filter((id):id is string=>Boolean(id)).sort();
    const grants=(await db.query(`SELECT membership_id,state,revision FROM customer_grants WHERE customer_id=$1 AND membership_id=ANY($2::uuid[]) ORDER BY membership_id ${lock}`,[customerId,members])).rows;
    for(const id of members)if(!grants.some(g=>g.membership_id===id&&g.state==="active")&&!(allowUnavailableTarget&&id===targetMemberId&&actor.kind==="internal"))throw hiddenRecord();
    if(target)return {membershipId:target.id,membershipRevision:Number(target.revision),organizationId:target.partner_org_id,organizationRevision:orgRevision!,grantRevision:Number(grants.find(g=>g.membership_id===target!.id)?.revision??-1)};
  }
  return null;
}
export function requirePartnerEnabled(action: string) {
  const base=action.startsWith("preview.")?action.slice(8):action;
  if(getServerConfig().TURAS_013_DISABLED==="1"&&!['guide.retire','assignment.withdraw','request.resolve'].includes(base))throw new HttpFailure(503,"disabled","New partner enablement work is paused");
}

export function requirePartnerAction(actor:PartnerActor,action:string,targetMembershipId?:string){
 const base=action.startsWith("preview.")?action.slice(8):action;
 if(["guide.create","guide.revise","guide.submit"].includes(base)){requireGuideAuthor(actor);return;}
 if(["guide.publish","guide.reject","guide.retire","assignment.create","assignment.withdraw","assignment.replace","checkpoint.verify","checkpoint.request_changes"].includes(base)){requirePartnerReviewer(actor);return;}
 if(["checkpoint.save","checkpoint.submit"].includes(base)){if(actor.kind!=="partner"||targetMembershipId!==actor.membershipId)throw new HttpFailure(403,"forbidden","Action not allowed");return;}
 if(base==="request.resolve")return;
 throw new HttpFailure(422,"invalid_action","Unknown partner action");
}
