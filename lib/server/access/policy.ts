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
  const result = await query<{ workspace_id: string; grant_active: boolean }>(`
    SELECT c.workspace_id,
           EXISTS (SELECT 1 FROM customer_grants g WHERE g.customer_id = c.id
             AND g.membership_id = $2 AND g.state = 'active') AS grant_active
    FROM customer_references c WHERE c.id = $1 AND c.workspace_id = $3
  `, [customerId, session.membershipId, session.workspaceId]);
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
