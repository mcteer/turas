import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { staffingCreateResourceSchema, staffingReviseResourceSchema, staffingPartnerEligibilitySchema,
  staffingIdSchema, type StaffingResourceInput } from "../../contracts/staffing";
import { getServerConfig } from "../config";
import { parseStaffing, runStaffingCommand, staffingSha256 } from "./commands";
import type { StaffingActor } from "./policy";
import { lockStaffingResourcePool } from "./pool-lock";

export type ResourceHead = { id: string; external_key: string; kind: "internal" | "partner";
  membership_id: string | null; partner_organization_id: string | null; active: boolean;
  aggregate_version: string; current_revision_id: string | null };

/** Only invoke after the actor and any source/competency headers are locked. */
export async function lockResourceHeads(db: PoolClient, actor: StaffingActor, ids: string[],
  mode: "SHARE" | "UPDATE" = "SHARE"): Promise<ResourceHead[]> {
  const unique = [...new Set(ids)].sort();
  unique.forEach(id => parseStaffing(staffingIdSchema, id));
  const result = await db.query<ResourceHead>(`SELECT id,external_key,kind,membership_id,
    partner_organization_id,active,aggregate_version,current_revision_id FROM workforce_resources
    WHERE environment_id=$1 AND workspace_id=$2 AND id=ANY($3::uuid[]) ORDER BY id FOR ${mode}`,
    [getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, unique]);
  if (result.rowCount !== unique.length) throw hiddenRecord();
  return result.rows;
}

async function validateIdentity(db: PoolClient, actor: StaffingActor, resource: StaffingResourceInput) {
  if (resource.partnerOrganizationId) {
    const org = await db.query(`SELECT id FROM partner_organizations WHERE id=$1 AND workspace_id=$2 AND active`,
      [resource.partnerOrganizationId, actor.workspaceId]);
    if (!org.rowCount) throw hiddenRecord();
  }
  if (resource.membershipId) {
    const member = (await db.query<{ kind: string; partner_org_id: string | null }>(`SELECT kind,partner_org_id
      FROM memberships WHERE id=$1 AND workspace_id=$2 AND active`, [resource.membershipId, actor.workspaceId])).rows[0];
    if (!member || member.kind !== resource.kind || (resource.kind === "partner" &&
      member.partner_org_id !== resource.partnerOrganizationId)) throw hiddenRecord();
  }
}

async function appendResource(db: PoolClient, actor: StaffingActor, resourceId: string,
  number: number, resource: StaffingResourceInput, rationale: string) {
  const revisionId = randomUUID(), contentDigest = staffingSha256(resource);
  await db.query(`INSERT INTO workforce_resource_revisions(id,environment_id,workspace_id,resource_id,
    revision_number,content_digest,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [revisionId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resourceId, number, contentDigest, actor.membershipId]);
  await db.query(`INSERT INTO workforce_resource_payloads(revision_id,display_name,timezone,region_code,rationale)
    VALUES($1,$2,$3,$4,$5)`, [revisionId, resource.displayName, resource.timezone, resource.regionCode, rationale]);
  await db.query(`UPDATE workforce_resources SET current_revision_id=$2,active=$3,aggregate_version=$4,
    updated_at=now() WHERE id=$1`, [resourceId, revisionId, resource.state === "active", number]);
  return { resourceId, revisionId, contentDigest, aggregateVersion: number, state: resource.state };
}

export async function createResource(actor: StaffingActor, raw: unknown, client?: PoolClient) {
  const input = parseStaffing(staffingCreateResourceSchema, raw);
  return runStaffingCommand(actor, { ...input, action: "resource_create" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      await lockStaffingResourcePool(db, actor, "UPDATE");
      await validateIdentity(db, actor, input.resource);
      const duplicate = await db.query(`SELECT id FROM workforce_resources WHERE workspace_id=$1
        AND (external_key=$2 OR ($3::uuid IS NOT NULL AND membership_id=$3))`,
        [actor.workspaceId, input.resource.externalKey, input.resource.membershipId]);
      if (duplicate.rowCount) throw new HttpFailure(409, "version_conflict", "Resource identity already registered");
      const id = randomUUID();
      await db.query(`INSERT INTO workforce_resources(id,environment_id,workspace_id,external_key,kind,
        membership_id,partner_organization_id,active,created_by_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, input.resource.externalKey,
          input.resource.kind, input.resource.membershipId, input.resource.partnerOrganizationId,
          input.resource.state === "active", actor.membershipId]);
      return appendResource(db, actor, id, 1, input.resource, input.rationale);
    }, client);
}

export async function reviseResource(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const resourceId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingReviseResourceSchema, raw);
  return runStaffingCommand(actor, { ...input, resourceId, action: "resource_revise" },
    { capability: "manager", table: "workforce_command_receipts" }, async db => {
      await lockStaffingResourcePool(db, actor, "UPDATE");
      const [head] = await lockResourceHeads(db, actor, [resourceId], "UPDATE");
      const digest = (await db.query("SELECT content_digest FROM workforce_resource_revisions WHERE id=$1", [head.current_revision_id])).rows[0]?.content_digest;
      if (head.current_revision_id !== input.revisionId || Number(head.aggregate_version) !== input.expectedAggregateVersion ||
          digest !== input.contentDigest) throw new HttpFailure(409, "version_conflict", "Resource changed; reload");
      const r = input.resource;
      if (head.external_key !== r.externalKey || head.kind !== r.kind || head.membership_id !== r.membershipId ||
          head.partner_organization_id !== r.partnerOrganizationId) {
        throw new HttpFailure(422, "invalid_input", "Resource identity cannot be reassigned");
      }
      await validateIdentity(db, actor, r);
      return appendResource(db, actor, resourceId, input.expectedAggregateVersion + 1, r, input.rationale);
    }, client);
}

export async function revisePartnerEligibility(actor: StaffingActor, rawId: unknown, raw: unknown, client?: PoolClient) {
  const resourceId = parseStaffing(staffingIdSchema, rawId), input = parseStaffing(staffingPartnerEligibilitySchema, raw);
  return runStaffingCommand(actor, { ...input, resourceId, action: "resource_eligibility" },
    { capability: "manager", table: "workforce_command_receipts", customerId: input.customerId }, async db => {
      const [head] = await lockResourceHeads(db, actor, [resourceId], "UPDATE");
      const revision = (await db.query("SELECT content_digest FROM workforce_resource_revisions WHERE id=$1", [head.current_revision_id])).rows[0];
      if (head.kind !== "partner" || !head.active) throw new HttpFailure(422, "invalid_input", "Active partner resource required");
      if (head.current_revision_id !== input.revisionId || Number(head.aggregate_version) !== input.expectedAggregateVersion ||
          revision?.content_digest !== input.contentDigest) throw new HttpFailure(409, "version_conflict", "Resource changed; reload");
      const id = randomUUID(), digest = staffingSha256({ resourceId, customerId: input.customerId,
        fromDate: input.fromDate, toDate: input.toDate, state: input.state });
      await db.query(`INSERT INTO workforce_partner_eligibility(id,environment_id,workspace_id,resource_id,
        customer_id,from_date,to_date,state,actor_membership_id,content_digest,revision_number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId, resourceId, input.customerId,
          input.fromDate, input.toDate, input.state, actor.membershipId, digest, input.expectedAggregateVersion + 1]);
      await db.query("UPDATE workforce_resources SET aggregate_version=aggregate_version+1,updated_at=now() WHERE id=$1", [resourceId]);
      return { resourceId, revisionId: id, contentDigest: digest, aggregateVersion: input.expectedAggregateVersion + 1, state: input.state };
    }, client);
}
