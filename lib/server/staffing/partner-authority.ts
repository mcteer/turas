import type { PoolClient } from "pg";
import type { StaffingActor } from "./policy";
import type { ResourceHead } from "./resources";

type Identity = Pick<ResourceHead, "kind" | "membership_id" | "partner_organization_id">;
export type StaffingPartnerAuthority = {
  members: { id: string; principal_id: string; active: boolean; kind: string; partner_org_id: string | null }[];
  principals: { id: string; active: boolean }[];
  organizations: { id: string; active: boolean }[];
  grants: { id: string; membership_id: string; state: string; revision: string }[];
};

/** Metadata authority prefix: acquire before approved sources and resource
 * heads. Resource identities are immutable; later resource locks protect dated
 * eligibility against its writer, including first-declaration phantoms. */
export async function lockStaffingPartnerAuthority(db: PoolClient, actor: StaffingActor,
  rows: readonly Identity[], customerId: string): Promise<StaffingPartnerAuthority> {
  const partners = rows.filter(row => row.kind === "partner");
  if (!partners.length) return { members: [], principals: [], organizations: [], grants: [] };
  const memberIds = [...new Set(partners.flatMap(row => row.membership_id ? [row.membership_id] : []))].sort();
  const members = (await db.query<StaffingPartnerAuthority["members"][number]>(`SELECT id,principal_id,active,kind,partner_org_id
    FROM memberships WHERE id=ANY($1::uuid[]) AND workspace_id=$2 ORDER BY id FOR SHARE`, [memberIds, actor.workspaceId])).rows;
  const principals = (await db.query<StaffingPartnerAuthority["principals"][number]>(`SELECT id,active FROM principals
    WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE`, [[...new Set(members.map(row => row.principal_id))].sort()])).rows;
  const organizations = (await db.query<StaffingPartnerAuthority["organizations"][number]>(`SELECT id,active FROM partner_organizations
    WHERE id=ANY($1::uuid[]) AND workspace_id=$2 ORDER BY id FOR SHARE`,
    [[...new Set(partners.flatMap(row => row.partner_organization_id ? [row.partner_organization_id] : []))].sort(), actor.workspaceId])).rows;
  const grants = (await db.query<StaffingPartnerAuthority["grants"][number]>(`SELECT id,membership_id,state,revision FROM customer_grants
    WHERE membership_id=ANY($1::uuid[]) AND workspace_id=$2 AND customer_id=$3 ORDER BY id FOR SHARE`,
    [memberIds, actor.workspaceId, customerId])).rows;
  return { members, principals, organizations, grants };
}

/** Unknown declarations remain unknown; an explicit retraction or loss of
 * organization/member/principal/grant authority is an immediate denial. */
export function staffingPartnerEligible(head: Identity, authority: StaffingPartnerAuthority,
  declarations: readonly { state: string | null }[], requiredDays: number): boolean | null {
  if (head.kind !== "partner") return null;
  const organization = authority.organizations.find(row => row.id === head.partner_organization_id);
  const member = authority.members.find(row => row.id === head.membership_id);
  const principal = authority.principals.find(row => row.id === member?.principal_id);
  const grant = authority.grants.find(row => row.membership_id === head.membership_id);
  if (!organization?.active || head.membership_id && (!member?.active || !principal?.active || member.kind !== "partner" ||
    member.partner_org_id !== head.partner_organization_id || grant?.state !== "active") ||
    declarations.some(row => row.state === "retracted")) return false;
  return requiredDays > 0 && declarations.length === requiredDays && declarations.every(row => row.state === "active") ? true : null;
}
