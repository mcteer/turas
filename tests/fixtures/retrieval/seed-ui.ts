import { Pool } from "pg";
import { requireTestDatabaseUrl } from "../database";
import { DEMO_IDS } from "../../../lib/server/bootstrap-ids";
import { materializeCurrentProjection } from "../../../lib/server/retrieval/projections";

const pool = new Pool({ connectionString: requireTestDatabaseUrl(),max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const marker = await client.query<{ environment_id: string; schema_version: number }>(`
    SELECT environment_id,schema_version FROM turas_environment`);
  if (marker.rows.length !== 1 ||
      marker.rows[0].environment_id !== process.env.TURAS_TEST_ENVIRONMENT_ID ||
      marker.rows[0].schema_version < 28) throw new Error("Disposable 005 schema required");
  const customer = await client.query<{ synthetic: boolean }>(`
    SELECT synthetic FROM customer_references WHERE id=$1`,[DEMO_IDS.deniedCustomer]);
  if (!customer.rows[0]?.synthetic) throw new Error("Synthetic customer required");
  const revisions = await client.query<{ id: string; audience: string }>(`
    SELECT v.id,v.audience FROM profile_revisions v
    JOIN profile_records r ON r.id=v.record_id AND r.current_accepted_revision_id=v.id
    WHERE v.customer_id=$1 ORDER BY v.id LIMIT 100`,[DEMO_IDS.deniedCustomer]);
  let projections = 0;
  for (const revision of revisions.rows) {
    if (await materializeCurrentProjection(client,"accepted_profile",revision.id,"internal")) {
      projections += 1;
    }
    if (revision.audience === "delivery" &&
        await materializeCurrentProjection(client,"accepted_profile",revision.id,"delivery")) {
      projections += 1;
    }
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ syntheticRevisions: revisions.rows.length,projections }));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally { client.release();await pool.end(); }
