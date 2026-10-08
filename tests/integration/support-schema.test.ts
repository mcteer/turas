import { describe, expect, it } from "vitest";
import { withSupportDatabase } from "../fixtures/support/environment";
import { createHash, randomUUID } from "node:crypto";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";

describe("support additive storage", () => {
  it("installs scoped heads and distinct immutable/purgeable storage", async () => {
    await withSupportDatabase(async db => {
      for (const table of ["support_scopes", "support_records", "support_revisions", "support_payloads",
        "support_source_dependencies", "support_review_decisions", "support_decision_payloads",
        "support_command_receipts", "support_expired_command_keys", "support_cleanup_jobs"]) {
        const row = (await db.query("SELECT to_regclass($1) AS name", [`public.${table}`])).rows[0];
        expect(row.name, table).not.toBeNull();
      }
      expect(Number((await db.query("SELECT schema_version FROM turas_environment")).rows[0].schema_version)).toBeGreaterThanOrEqual(42);
    });
  });
  it("denies runtime payload mutation and broad history deletion", async () => {
    await withSupportDatabase(async db => {
      for (const table of ["support_payloads", "support_decision_payloads", "support_revisions",
        "support_review_decisions", "support_command_receipts", "support_expired_command_keys"])
        for (const privilege of ["UPDATE", "DELETE"]) {
          const row = (await db.query("SELECT has_table_privilege('turas_runtime',$1,$2) AS allowed", [table, privilege])).rows[0];
          expect(row.allowed, `${table}:${privilege}`).toBe(false);
        }
      expect((await db.query("SELECT has_function_privilege('turas_runtime','turas_purge_support_payload(uuid,uuid)','EXECUTE') AS allowed")).rows[0].allowed).toBe(true);
    });
  });
  it("makes nullable workload scope identities unique and audience immutable", async () => {
    await withSupportDatabase(async db => {
      const scopeId = randomUUID(), recordId = randomUUID();
      await db.query(`INSERT INTO support_scopes(id,environment_id,workspace_id,customer_id)
        VALUES($1,$2,$3,$4)`, [scopeId, process.env.TURAS_ENVIRONMENT_ID, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer]);
      await expect(db.query(`INSERT INTO support_scopes(id,environment_id,workspace_id,customer_id)
        VALUES($1,$2,$3,$4)`, [randomUUID(), process.env.TURAS_ENVIRONMENT_ID, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer])).rejects.toMatchObject({ code: "23505" });
      await db.query(`INSERT INTO support_records(id,scope_id,environment_id,workspace_id,customer_id,kind,audience,author_membership_id)
        VALUES($1,$2,$3,$4,$5,'assessment','delivery',$6)`,
      [recordId, scopeId, process.env.TURAS_ENVIRONMENT_ID, DEMO_IDS.workspace, DEMO_IDS.sharedCustomer, DEMO_IDS.panelMembership]);
      await expect(db.query("UPDATE support_records SET audience='internal' WHERE id=$1", [recordId])).rejects.toMatchObject({ code: "23514" });
    });
  });
  it("purges only an invalidated exact payload under the current due lease", async () => {
    await withSupportDatabase(async db => {
      const customerId = randomUUID(), scopeId = randomUUID(), recordId = randomUUID();
      const revisionId = randomUUID(), newerId = randomUUID(), jobId = randomUUID(), lease = randomUUID();
      const digest = createHash("sha256").update("{}").digest("hex");
      await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic cleanup customer',true)", [customerId, DEMO_IDS.workspace]);
      await db.query("INSERT INTO support_scopes(id,environment_id,workspace_id,customer_id) VALUES($1,$2,$3,$4)",
        [scopeId, process.env.TURAS_ENVIRONMENT_ID, DEMO_IDS.workspace, customerId]);
      await db.query(`INSERT INTO support_records(id,scope_id,environment_id,workspace_id,customer_id,kind,audience,author_membership_id)
        VALUES($1,$2,$3,$4,$5,'action','delivery',$6)`,
      [recordId, scopeId, process.env.TURAS_ENVIRONMENT_ID, DEMO_IDS.workspace, customerId, DEMO_IDS.panelMembership]);
      for (const [index, id] of [revisionId, newerId].entries()) {
        await db.query(`INSERT INTO support_revisions(id,record_id,scope_id,author_membership_id,workspace_id,ordinal,content_digest,source_state_digest,contract_version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$7,'support-v1')`,
        [id, recordId, scopeId, DEMO_IDS.panelMembership, DEMO_IDS.workspace, index + 1, digest]);
        await db.query("INSERT INTO support_payloads(revision_id,content_digest,content) VALUES($1,$2,'{}'::jsonb)", [id, digest]);
      }
      await db.query("INSERT INTO support_invalidations(revision_id,cause_generation) VALUES($1,1)", [revisionId]);
      await db.query(`INSERT INTO support_cleanup_jobs(id,revision_id,payload_kind,content_digest,cause_generation,due_at,state,lease_token,lease_until)
        VALUES($1,$2,'revision',$3,1,now()-interval '1 second','leased',$4,now()+interval '1 minute')`, [jobId, revisionId, digest, lease]);
      expect((await db.query("SELECT turas_purge_support_payload($1,$2) AS purged", [jobId, randomUUID()])).rows[0].purged).toBe(false);
      expect((await db.query("SELECT turas_purge_support_payload($1,$2) AS purged", [jobId, lease])).rows[0].purged).toBe(true);
      expect((await db.query("SELECT revision_id FROM support_payloads WHERE revision_id=ANY($1::uuid[])", [[revisionId, newerId]])).rows.map(r => r.revision_id)).toEqual([newerId]);
      expect((await db.query("SELECT turas_purge_support_payload($1,$2) AS purged", [jobId, lease])).rows[0].purged).toBe(false);
    });
  });
});
