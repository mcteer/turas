import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {DEMO_IDS} from '../bootstrap-ids';
export type ReportJobAuthority={environmentId:string;workspaceId:string;customerId:string;ownerMembershipId:string;ownerDecisionId:string|null;policyRevisionId:string|null};
/** A persisted capability is checked against live memberships, never a browser session. */
export async function lockReportJobAuthority(db:PoolClient,authority:ReportJobAuthority,reviewRequired=false){
 if(authority.environmentId!==process.env.TURAS_ENVIRONMENT_ID)throw new HttpFailure(403,'forbidden','Job authority unavailable');
 const actor=(await db.query(`SELECT m.kind,m.role,m.principal_id FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
 WHERE m.id=$1 AND m.workspace_id=$2 AND m.active AND p.active AND w.active FOR SHARE OF m,p,w`,[authority.ownerMembershipId,authority.workspaceId])).rows[0];
 if(!actor || actor.kind!=='internal' || (reviewRequired && (actor.role!=='admin' || actor.principal_id!==DEMO_IDS.mcteer)))throw new HttpFailure(403,'forbidden','Job authority unavailable');
 if(!(await db.query('SELECT 1 FROM customer_references WHERE id=$1 AND workspace_id=$2 FOR SHARE',[authority.customerId,authority.workspaceId])).rowCount)throw new HttpFailure(403,'forbidden','Job authority unavailable');
 if(authority.policyRevisionId){
  const policy=(await db.query(`SELECT p.id FROM report_recipient_policies p JOIN report_policy_heads h ON h.current_revision_id=p.id
    WHERE p.id=$1 AND p.environment_id=$2 AND p.workspace_id=$3 AND p.customer_id=$4 AND h.state='approved' AND EXISTS(SELECT 1 FROM report_decisions d WHERE d.id=$5 AND d.environment_id=p.environment_id AND d.workspace_id=p.workspace_id AND d.customer_id=p.customer_id AND d.actor_membership_id=$6 AND ((d.action='approve_policy' AND d.id=h.approval_decision_id) OR d.action='authorize_send')) FOR SHARE OF p,h`,
   [authority.policyRevisionId,authority.environmentId,authority.workspaceId,authority.customerId,authority.ownerDecisionId,authority.ownerMembershipId])).rows[0];
  if(!policy)throw new HttpFailure(409,'policy_changed','Job authority changed');
 }
}
