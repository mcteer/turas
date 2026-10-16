import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../fixtures/identities";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { listWorkspaceReview } from "../../lib/server/profiles/workspace-review";

it("counts only authorized customer proposals and includes denied revisions without accepting them", async () => {
  const prior = process.env.TURAS_ENVIRONMENT_ID;
  process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
  try {
    await withTestDatabase(async client => {
      await client.query("BEGIN");
      try {
        const admin = await createProfileTestSession(client, "mcteer");
        const member = await createProfileTestSession(client, "panel");
        const partner = await createProfileTestSession(client, "partner");
        const customerId = DEMO_IDS.sharedCustomer;
        await client.query(`INSERT INTO customer_profile_state(customer_id,workspace_id)
          VALUES($1,$2) ON CONFLICT DO NOTHING`, [customerId, DEMO_IDS.workspace]);
        await client.query("DELETE FROM customer_stewards WHERE membership_id=$1", [member.membershipId]);
        const candidate = await submitProfileCommand(member, customerId, {
          action: "propose_record", requestKey: randomUUID(),
          payload: { kind: "claim", text: "Pending workspace review regression", sourceType: "manual" },
        }, client) as { recordId: string; revisionId: string };
        expect((await listWorkspaceReview(member, { countOnly: "true" }, client)).total).toBe(0);
        await expect(listWorkspaceReview(partner, {}, client)).rejects.toMatchObject({ status: 403 });
        const pending = await listWorkspaceReview(admin, {}, client);
        expect(pending.items?.map(row => row.id)).toContain(candidate.revisionId);
        expect((await listWorkspaceReview(admin, { countOnly: "true" }, client)).total).toBe(pending.total);
        await submitProfileCommand(admin, customerId, {
          action: "reject_revision", requestKey: randomUUID(), revisionId: candidate.revisionId,
          expectedRecordVersion: 0, rationale: "Evidence is not established",
        }, client);
        const after = await listWorkspaceReview(admin, { countOnly: "true" }, client);
        expect(after.total).toBe(pending.total - 1);
        const denied = await listWorkspaceReview(admin, { includeDenied: "true" }, client);
        expect("items" in denied && denied.items).toContainEqual(expect.objectContaining({
          id: candidate.revisionId, state: "denied", customerId,
        }));
        const accepted = await client.query("SELECT current_accepted_revision_id FROM profile_records WHERE id=$1", [candidate.recordId]);
        expect(accepted.rows[0].current_accepted_revision_id).toBeNull();
      } finally { await client.query("ROLLBACK"); }
    });
  } finally { process.env.TURAS_ENVIRONMENT_ID = prior; }
});
