import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { createProfileTestSession } from "../fixtures/profiles";
import { setMembershipActive } from "../../lib/server/access/service";
import { readProfile } from "../../lib/server/profiles/read";
import { readEligibleContext } from "../../lib/server/profiles/context";
import { submitProfileCommand } from "../../lib/server/profiles/service";

describe("membership lifecycle fence", () => {
  it("rechecks a partner's grant, organization and membership on each protected read", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const partner = await createProfileTestSession(client, "partner");
          await expect(readProfile(partner, DEMO_IDS.sharedCustomer, client))
            .resolves.toMatchObject({ customer: { id: DEMO_IDS.sharedCustomer } });
          await expect(readEligibleContext(partner, DEMO_IDS.sharedCustomer, {}, client))
            .resolves.toMatchObject({ contextVersion: expect.any(String) });
          await client.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",
            [DEMO_IDS.sharedCustomer, partner.membershipId]);
          await expect(readProfile(partner, DEMO_IDS.sharedCustomer, client))
            .rejects.toMatchObject({ status: 404 });
          await expect(readEligibleContext(partner, DEMO_IDS.sharedCustomer, {}, client))
            .rejects.toMatchObject({ status: 404 });
          await client.query("UPDATE customer_grants SET state='active' WHERE customer_id=$1 AND membership_id=$2",
            [DEMO_IDS.sharedCustomer, partner.membershipId]);
          await client.query("UPDATE partner_organizations SET active=false WHERE id=$1",
            [DEMO_IDS.partnerOrganization]);
          await expect(readProfile(partner, DEMO_IDS.sharedCustomer, client))
            .rejects.toMatchObject({ status: 404 });
          await expect(readEligibleContext(partner, DEMO_IDS.sharedCustomer, {}, client))
            .rejects.toMatchObject({ status: 404 });
          await client.query("UPDATE partner_organizations SET active=true WHERE id=$1",
            [DEMO_IDS.partnerOrganization]);
          await client.query("UPDATE memberships SET active=false WHERE id=$1", [partner.membershipId]);
          await expect(readProfile(partner, DEMO_IDS.sharedCustomer, client))
            .rejects.toMatchObject({ status: 401 });
          await expect(readEligibleContext(partner, DEMO_IDS.sharedCustomer, {}, client))
            .rejects.toMatchObject({ status: 401 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorEnvironment; }
  });
  it("keeps partner delivery generation stable after an internal-only accepted write", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const admin = await createProfileTestSession(client, "mcteer");
          const partner = await createProfileTestSession(client, "partner");
          const before = await client.query<{ delivery_generation: string;
            internal_generation: string }>(`SELECT delivery_generation,internal_generation
            FROM customer_profile_state WHERE customer_id=$1`, [DEMO_IDS.sharedCustomer]);
          const text = `Synthetic internal-only ${randomUUID()}`;
          const proposal = await submitProfileCommand(admin, DEMO_IDS.sharedCustomer, {
            action: "propose_record", requestKey: randomUUID(),
            requestedAudience: "internal", dataCategory: "internal_operations",
            payload: { kind: "claim", text, sourceType: "manual" },
          }, client) as { revisionId: string };
          const digest = await client.query<{ content_digest: string }>(
            "SELECT content_digest FROM profile_revisions WHERE id=$1", [proposal.revisionId]);
          await submitProfileCommand(admin, DEMO_IDS.sharedCustomer, {
            action: "accept_revision", requestKey: randomUUID(), revisionId: proposal.revisionId,
            digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
            expectedAcceptedRevisionId: null, rationale: "Synthetic internal review",
          }, client);
          const after = await client.query<{ delivery_generation: string;
            internal_generation: string }>(`SELECT delivery_generation,internal_generation
            FROM customer_profile_state WHERE customer_id=$1`, [DEMO_IDS.sharedCustomer]);
          expect(after.rows[0].delivery_generation).toBe(before.rows[0].delivery_generation);
          expect(Number(after.rows[0].internal_generation)).toBeGreaterThan(
            Number(before.rows[0].internal_generation));
          expect(JSON.stringify(await readProfile(partner, DEMO_IDS.sharedCustomer, client)))
            .not.toContain(text);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = priorEnvironment; }
  });
  it("never revives an old login after a disabled membership is re-enabled", async () => {
    const priorUrl = process.env.DATABASE_URL;
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    const principalId = randomUUID();
    const membershipId = randomUUID();
    const loginId = randomUUID();
    const disabledKey = randomUUID();
    const enabledKey = randomUUID();
    try {
      await withTestDatabase(async (client) => {
        process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
        process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
        const admin = await createProfileTestSession(client, "mcteer");
        await client.query(`INSERT INTO principals(id,login_name,display_name)
          VALUES($1,$2,'Synthetic isolated partner')`, [principalId, `fixture-${principalId}`]);
        await client.query(`INSERT INTO memberships
          (id,principal_id,workspace_id,kind,partner_org_id,role)
          VALUES($1,$2,$3,'partner',$4,'member')`,
        [membershipId, principalId, DEMO_IDS.workspace, DEMO_IDS.partnerOrganization]);
        await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
          VALUES($1,$2,$3,now()+interval '1 hour')`,
        [loginId, principalId, createHash("sha256").update(loginId).digest("hex")]);
        try {
          expect(await setMembershipActive({ actorPrincipalId: admin.principalId,
            actorSessionId: admin.sessionId, membershipId, expectedRevision: 0,
            active: false, requestKey: disabledKey })).toEqual({ revision: 1, active: false });
          const revoked = await client.query<{ revoked_at: Date | null }>(
            "SELECT revoked_at FROM login_sessions WHERE id=$1", [loginId]);
          expect(revoked.rows[0].revoked_at).not.toBeNull();
          expect(await setMembershipActive({ actorPrincipalId: admin.principalId,
            actorSessionId: admin.sessionId, membershipId, expectedRevision: 1,
            active: true, requestKey: enabledKey })).toEqual({ revision: 2, active: true });
          const stillRevoked = await client.query<{ revoked_at: Date | null }>(
            "SELECT revoked_at FROM login_sessions WHERE id=$1", [loginId]);
          expect(stillRevoked.rows[0].revoked_at).not.toBeNull();
        } finally {
          await client.query("DELETE FROM admin_commands WHERE actor_principal_id=$1 AND request_key=ANY($2::uuid[])",
            [admin.principalId, [disabledKey, enabledKey]]);
          await client.query("DELETE FROM access_audit WHERE subject_id=$1", [membershipId]);
          await client.query("DELETE FROM login_sessions WHERE principal_id=$1", [principalId]);
          await client.query("DELETE FROM memberships WHERE id=$1", [membershipId]);
          await client.query("DELETE FROM principals WHERE id=$1", [principalId]);
        }
      });
    } finally {
      process.env.DATABASE_URL = priorUrl;
      process.env.TURAS_ENVIRONMENT_ID = priorEnvironment;
    }
  });
});
