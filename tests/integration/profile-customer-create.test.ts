import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCustomerAnchor } from "../../lib/server/profiles/customer-create";
import { withTestDatabase } from "../fixtures/database";
import { createProfileTestSession } from "../fixtures/profiles";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { readProfile } from "../../lib/server/profiles/read";

describe("customer anchor creation", () => {
  it("creates a neutral synthetic anchor and a pending manual identity only for an admin", async () => {
    const priorEnvironment = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const admin = await createProfileTestSession(client, "mcteer");
        const panel = await createProfileTestSession(client, "panel");
        const key = randomUUID();
        const input = { requestKey: key, details: { kind: "customer_details", displayName: "New synthetic account" } };
        await expect(createCustomerAnchor(panel, { ...input, requestKey: randomUUID() }, client))
          .rejects.toMatchObject({ status: 403 });
        const created = await createCustomerAnchor(admin, input, client);
        expect(created.status).toBe(201);
        const replay = await createCustomerAnchor(admin, input, client);
        expect(replay).toMatchObject({ replayed: true, data: created.data });
        await expect(createCustomerAnchor(admin, { ...input,
          details: { kind: "customer_details", displayName: "Another account" } }, client))
          .rejects.toMatchObject({ status: 409 });
        const customer = await client.query<{ display_name: string }>(
          "SELECT display_name FROM customer_references WHERE id=$1", [created.data.customerId]);
        expect(customer.rows[0]?.display_name).toBe("Pending customer");
        const record = await client.query<{ current_accepted_revision_id: string | null; origin: string }>(`
          SELECT r.current_accepted_revision_id,v.origin FROM profile_records r
          JOIN profile_revisions v ON v.record_id=r.id
          WHERE r.id=$1 AND v.id=$2`,
        [created.data.recordId, created.data.revisionId]);
        expect(record.rows[0]).toMatchObject({ current_accepted_revision_id: null, origin: "manual" });
        const digest = await client.query<{ content_digest: string }>(
          "SELECT content_digest FROM profile_revisions WHERE id=$1", [created.data.revisionId]);
        await submitProfileCommand(admin, created.data.customerId, {
          action: "accept_revision", requestKey: randomUUID(), revisionId: created.data.revisionId,
          digest: digest.rows[0].content_digest, expectedRecordVersion: 0,
          expectedAcceptedRevisionId: null, rationale: "Synthetic identity review",
        }, client);
        const named = await client.query<{ display_name: string }>(
          "SELECT display_name FROM customer_references WHERE id=$1", [created.data.customerId]);
        expect(named.rows[0]?.display_name).toBe("New synthetic account");
        const profile = await readProfile(panel, created.data.customerId, client);
        expect(profile.customer.displayName).toBe("New synthetic account");
        expect(profile.acceptedFacts).toContainEqual(expect.objectContaining({
          kind: "customer_details", payload: expect.objectContaining({ displayName: "New synthetic account" }),
        }));
      } finally {
        await client.query("ROLLBACK");
      }
      });
    } finally {
      process.env.TURAS_ENVIRONMENT_ID = priorEnvironment;
    }
  });
});
