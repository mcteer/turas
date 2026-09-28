import { Client } from "pg";
import { getServerConfig } from "../lib/server/config.ts";
import { DEMO_IDS } from "../lib/server/bootstrap-ids.ts";

const config = getServerConfig();
const client = new Client({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 5_000 });

async function main(): Promise<void> {
  await client.connect();
  try {
    await client.query("BEGIN");
    const marker = await client.query<{ environment_id: string; schema_version: number }>(
      "SELECT environment_id, schema_version FROM turas_environment LIMIT 1",
    );
    if (marker.rowCount !== 1 || marker.rows[0]?.environment_id !== config.TURAS_ENVIRONMENT_ID ||
        marker.rows[0]?.schema_version < 1) {
      throw new Error("Wrong or uninitialized environment");
    }

    await client.query(
      "INSERT INTO workspaces (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [DEMO_IDS.workspace, "Turas synthetic demo"],
    );
    const principals = [
      [DEMO_IDS.mcteer, "mcteer", "mcteer"],
      [DEMO_IDS.panel, "panel", "panel"],
      [DEMO_IDS.partner, "partner", "partner"],
    ];
    for (const [id, loginName, displayName] of principals) {
      await client.query(
        "INSERT INTO principals (id, login_name, display_name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
        [id, loginName, displayName],
      );
      const existing = await client.query<{ login_name: string }>(
        "SELECT login_name FROM principals WHERE id = $1", [id],
      );
      if (existing.rows[0]?.login_name !== loginName) throw new Error("Stable demo principal identity mismatch");
    }
    await client.query(
      "INSERT INTO partner_organizations (id, workspace_id, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
      [DEMO_IDS.partnerOrganization, DEMO_IDS.workspace, "Synthetic delivery partner"],
    );
    const memberships = [
      [DEMO_IDS.mcteerMembership, DEMO_IDS.mcteer, "internal", null, "admin"],
      [DEMO_IDS.panelMembership, DEMO_IDS.panel, "internal", null, "member"],
      [DEMO_IDS.partnerMembership, DEMO_IDS.partner, "partner", DEMO_IDS.partnerOrganization, "member"],
    ];
    for (const [id, principalId, kind, partnerOrgId, role] of memberships) {
      await client.query(
        `INSERT INTO memberships (id, principal_id, workspace_id, kind, partner_org_id, role)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [id, principalId, DEMO_IDS.workspace, kind, partnerOrgId, role],
      );
    }
    for (const [id, name] of [
      [DEMO_IDS.sharedCustomer, "Cedar (synthetic)"],
      [DEMO_IDS.deniedCustomer, "Juniper (synthetic)"],
    ]) {
      await client.query(
        `INSERT INTO customer_references (id, workspace_id, display_name, synthetic)
         VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING`,
        [id, DEMO_IDS.workspace, name],
      );
    }
    await client.query(
      `INSERT INTO customer_grants (id, membership_id, workspace_id, customer_id, state, revision, granted_by)
       VALUES ($1, $2, $3, $4, 'active', 1, $5)
       ON CONFLICT (membership_id, customer_id) DO NOTHING`,
      [DEMO_IDS.partnerSharedGrant, DEMO_IDS.partnerMembership, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer, DEMO_IDS.mcteer],
    );
    if (marker.rows[0].schema_version >= 7) {
      for (const customerId of [DEMO_IDS.sharedCustomer, DEMO_IDS.deniedCustomer]) {
        await client.query(`INSERT INTO customer_profile_state(customer_id, workspace_id)
          VALUES ($1,$2) ON CONFLICT (customer_id) DO NOTHING`,
        [customerId, DEMO_IDS.workspace]);
        await client.query(`INSERT INTO customer_stewards
          (customer_id,workspace_id,membership_id,assigned_by)
          VALUES ($1,$2,$3,$4) ON CONFLICT (customer_id,membership_id) DO NOTHING`,
        [customerId, DEMO_IDS.workspace, DEMO_IDS.mcteerMembership, DEMO_IDS.mcteer]);
      }
    }
    await client.query("COMMIT");
    console.log("Synthetic demo identities initialized without altering existing access decisions");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed");
  process.exitCode = 1;
});
