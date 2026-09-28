import { describe, expect, it } from "vitest";
import { withTestDatabase } from "../fixtures/database";
import { DEMO_IDS } from "../fixtures/identities";
import { createProfileTestSession } from "../fixtures/profiles";
import {
  lockArtifactWorkerAuthority,
  requireArtifactDestructiveAuthority,
  requireArtifactSourceReader,
} from "../../lib/server/artifacts/policy";

describe("artifact authorization uses current domain scope", () => {
  it("keeps worker consent independent of login expiry but requires current partner grants", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const partner = await createProfileTestSession(client, "partner");
          const scope = { environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID!,
            workspaceId: partner.workspaceId, customerId: DEMO_IDS.sharedCustomer,
            ownerPrincipalId: partner.principalId };
          await client.query(`UPDATE login_sessions SET created_at=now()-interval '2 days',
            expires_at=now()-interval '1 day' WHERE id=$1`, [partner.sessionId]);
          expect(await lockArtifactWorkerAuthority(client, scope, partner.principalId)).toBe(true);
          await client.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",
            [scope.customerId, partner.membershipId]);
          expect(await lockArtifactWorkerAuthority(client, scope, partner.principalId)).toBe(false);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });

  it("keeps private drafts owner-only and permits current internal review only after submission", async () => {
    const old = process.env.TURAS_ENVIRONMENT_ID;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const partner = await createProfileTestSession(client, "partner");
          const admin = await createProfileTestSession(client, "mcteer");
          const scope = { environmentId: process.env.TURAS_TEST_ENVIRONMENT_ID!,
            workspaceId: partner.workspaceId, customerId: DEMO_IDS.sharedCustomer,
            ownerPrincipalId: partner.principalId, submittedAt: null as Date | null };
          await expect(requireArtifactSourceReader(client, admin, scope)).rejects.toMatchObject({ status: 404 });
          await expect(requireArtifactSourceReader(client, partner, scope)).resolves.toBeUndefined();
          await expect(requireArtifactDestructiveAuthority(client, admin, scope)).rejects.toMatchObject({ status: 404 });
          scope.submittedAt = new Date();
          await expect(requireArtifactSourceReader(client, admin, scope)).resolves.toBeUndefined();
          await expect(requireArtifactDestructiveAuthority(client, admin, scope)).resolves.toBeUndefined();
          await expect(requireArtifactDestructiveAuthority(client, partner, scope)).rejects.toMatchObject({ status: 403 });
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { process.env.TURAS_ENVIRONMENT_ID = old; }
  });
});
