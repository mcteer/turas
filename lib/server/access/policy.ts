import {operationalAdmissionOpen} from '../operations/admission';
import type { CurrentSession } from "../auth/sessions";
import { query } from "../db/client";
import { hiddenRecord } from "../../contracts/http";

export type CustomerAccessFacts = {
  principalActive: boolean;
  membershipActive: boolean;
  workspaceActive: boolean;
  partnerOrganizationActive: boolean;
  kind: "internal" | "partner";
  membershipWorkspaceId: string;
  customerWorkspaceId: string;
  grantActive: boolean;
};

export function canAccessCustomer(facts: CustomerAccessFacts): boolean {
  if (!facts.principalActive || !facts.membershipActive || !facts.workspaceActive ||
      facts.membershipWorkspaceId !== facts.customerWorkspaceId) return false;
  return facts.kind === "internal" || (facts.partnerOrganizationActive && facts.grantActive);
}

export function canAccessConversation(facts: CustomerAccessFacts, actorId: string, ownerId: string): boolean {
  return canAccessCustomer(facts) && actorId === ownerId;
}

export async function requireCustomerAccess(session: CurrentSession, customerId: string): Promise<void> {
  if(!await operationalAdmissionOpen())throw hiddenRecord();
  const result = await query<{ workspace_id: string; grant_active: boolean }>(`
    SELECT c.workspace_id,
           EXISTS (SELECT 1 FROM customer_grants g WHERE g.customer_id = c.id
             AND g.membership_id = $2 AND g.state = 'active') AS grant_active
    FROM customer_references c JOIN memberships m ON m.id=$2 AND m.workspace_id=c.workspace_id
    JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
    JOIN login_sessions s ON s.id=$4 AND s.principal_id=m.principal_id AND s.membership_id=m.id AND s.workspace_id=m.workspace_id
    LEFT JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id
    WHERE c.id=$1 AND c.workspace_id=$3 AND m.principal_id=$5 AND m.kind=$6 AND m.role=$7
      AND m.active AND p.active AND w.active AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
      AND (m.kind='internal' OR o.active)
  `, [customerId,session.membershipId,session.workspaceId,session.sessionId,session.principalId,session.kind,session.role]);
  const customer = result.rows[0];
  if (!customer || !canAccessCustomer({
    principalActive: true,
    membershipActive: true,
    workspaceActive: true,
    partnerOrganizationActive: true,
    kind: session.kind,
    membershipWorkspaceId: session.workspaceId,
    customerWorkspaceId: customer.workspace_id,
    grantActive: customer.grant_active,
  })) throw hiddenRecord();
}

export type WorkspaceClassification="primary"|"synthetic_pilot";
/** Origin comes from immutable database provenance, never a supplied claim label. */
export function canUseSharedOrigin(origin:{workspaceId:string|null;classification:WorkspaceClassification|null},targetWorkspaceId:string):boolean {
 return !!origin.workspaceId && !!targetWorkspaceId && (origin.classification==="primary" || origin.classification==="synthetic_pilot" && origin.workspaceId===targetWorkspaceId);
}
/** Internal SQL fragments only; parameter and alias inputs cannot contain SQL. */
export function sharedOriginSql(alias:string,workspaceParameter:string):string {
 if(!/^[a-z_][a-z0-9_]*$/.test(alias)||!/^\$[1-9][0-9]{0,2}$/.test(workspaceParameter))throw new Error("Invalid internal origin predicate");
 return `(${alias}.origin_workspace_id IS NOT NULL AND
  (${alias}.origin_classification='primary' OR (${alias}.origin_classification='synthetic_pilot' AND ${alias}.origin_workspace_id=${workspaceParameter}::uuid))
  AND EXISTS(SELECT 1 FROM workspaces origin_workspace WHERE origin_workspace.id=${alias}.origin_workspace_id
   AND origin_workspace.classification=${alias}.origin_classification AND origin_workspace.active))`;
}
