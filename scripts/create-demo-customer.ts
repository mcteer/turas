import { randomUUID } from "node:crypto";
import { DEMO_IDS } from "../lib/server/bootstrap-ids.ts";
import { query } from "../lib/server/db/client.ts";
import { getServerConfig } from "../lib/server/config.ts";
import { hashSessionToken, issueSession, revokeSession, type CurrentSession } from "../lib/server/auth/sessions.ts";
import { createCustomerAnchor } from "../lib/server/profiles/customer-create.ts";

const nameFlag = process.argv.indexOf("--name");
const name = nameFlag >= 0 ? process.argv[nameFlag + 1]?.trim() : undefined;
if (!name || name.length > 200) throw new Error("Provide --name with 1–200 characters");
async function main(): Promise<void> {
  const config = getServerConfig();
  const marker = await query<{ environment_id: string; schema_version: number }>(
    "SELECT environment_id,schema_version FROM turas_environment LIMIT 1",
  );
  if (marker.rows[0]?.environment_id !== config.TURAS_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < 8) {
    throw new Error("Profile schema is unavailable or database environment marker mismatches");
  }
  const admin = await query<{ login_name: string; display_name: string }>(
    `SELECT p.login_name,p.display_name FROM principals p
     JOIN memberships m ON m.principal_id=p.id
     WHERE p.id=$1 AND m.id=$2 AND m.workspace_id=$3
       AND p.active AND m.active AND m.kind='internal' AND m.role='admin'`,
    [DEMO_IDS.mcteer, DEMO_IDS.mcteerMembership, DEMO_IDS.workspace],
  );
  const identity = admin.rows[0];
  if (!identity) throw new Error("Demo admin is unavailable");
  const sessionIdentity = { principalId: DEMO_IDS.mcteer, membershipId: DEMO_IDS.mcteerMembership,
    workspaceId: DEMO_IDS.workspace, kind: "internal" as const, role: "admin" as const,
    loginName: identity.login_name, displayName: identity.display_name };
  const session = await issueSession(sessionIdentity);
  let sessionId: string | null = null;
  try {
    const found = await query<{ id: string }>(
      "SELECT id FROM login_sessions WHERE principal_id=$1 AND token_hash=$2",
      [DEMO_IDS.mcteer, hashSessionToken(session.token)],
    );
    if (!found.rows[0]) throw new Error("Session was not created");
    sessionId = found.rows[0].id;
    const actor: CurrentSession = { ...sessionIdentity, sessionId,
      token: session.token, expiresAt: session.expiresAt };
    const result = await createCustomerAnchor(actor, {
      requestKey: randomUUID(), details: { kind: "customer_details", displayName: name },
    });
    console.log(`Created synthetic customer ${result.data.customerId} with a pending name review`);
  } finally {
    if (sessionId) await revokeSession(sessionId);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Customer creation failed");
  process.exitCode = 1;
});
