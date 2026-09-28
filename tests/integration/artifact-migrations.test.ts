import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { withTestDatabase } from "../fixtures/database";

const require = createRequire(import.meta.url);

function migration(number: number): { up: (pgm: { sql: (statement: string) => void }) => void } {
  const names: Record<number, string> = {
    1: "identity-foundation", 2: "login-sessions", 3: "customer-access",
    4: "conversations", 5: "conversation-invariants", 6: "native-receipts",
    7: "profile-context", 8: "profile-context-fences", 9: "profile-snapshot-payload",
    10: "profile-injection-receipts", 11: "profile-retraction-versions",
    12: "profile-submission-channel", 13: "profile-audit-metrics",
    14: "artifact-ingestion", 15: "artifact-evidence-context",
    16: "artifact-context-injection",
    17: "artifact-replacement-retirement",
    18: "artifact-tool-budget",
  };
  return require(`../../migrations/${String(number).padStart(3, "0")}-${names[number]}.cjs`) as { up: (pgm: { sql: (statement: string) => void }) => void };
}

async function apply(client: PoolClient, first: number, last: number): Promise<void> {
  for (let number = first; number <= last; number += 1) {
    const statements: string[] = [];
    migration(number).up({ sql: (statement) => statements.push(statement) });
    for (const statement of statements) await client.query(statement);
  }
}

async function constraints(client: PoolClient, table: string): Promise<string[]> {
  const result = await client.query<{ definition: string }>(`
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid=$1::regclass AND contype='c'
  `, [table]);
  return result.rows.map((row) => row.definition);
}

async function rejectsStatement(client: PoolClient, statement: string, values: unknown[]): Promise<void> {
  await client.query("SAVEPOINT artifact_reject");
  try {
    await expect(client.query(statement, values)).rejects.toMatchObject({ code: expect.stringMatching(/^23/) });
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT artifact_reject");
    await client.query("RELEASE SAVEPOINT artifact_reject");
  }
}

async function assertArtifactConstraints(client: PoolClient, environmentId: string): Promise<void> {
  const ids = Array.from({ length: 9 }, () => randomUUID());
  const [workspace, principal, membership, customer, conversation, artifact, batch, intent, version] = ids;
  const digest = "b".repeat(64);
  const objectKey = "c".repeat(64);
  await client.query("INSERT INTO turas_environment(environment_id,schema_version) VALUES ($1,18)", [environmentId]);
  await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic migration workspace')", [workspace]);
  await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic actor')", [principal, `fixture-${principal}`]);
  await client.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin')", [membership, principal, workspace]);
  await client.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic customer',true)", [customer, workspace]);
  await client.query(`INSERT INTO conversations
    (id,environment_id,workspace_id,customer_id,owner_principal_id,creation_operation_id,binding_state,title)
    VALUES($1,$2,$3,$4,$5,$6,'unbound','Synthetic chat')`,
  [conversation, environmentId, workspace, customer, principal, randomUUID()]);
  await client.query(`INSERT INTO artifacts
    (id,environment_id,workspace_id,customer_id,owner_principal_id,origin_conversation_id)
    VALUES($1,$2,$3,$4,$5,$6)`, [artifact, environmentId, workspace, customer, principal, conversation]);
  await client.query(`INSERT INTO artifact_upload_batches
    (id,environment_id,workspace_id,customer_id,owner_principal_id,origin_conversation_id,
     idempotency_key,request_digest,file_count,expected_total_bytes,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,'migration-fixture',$7,1,10,now()+interval '30 minutes')`,
  [batch, environmentId, workspace, customer, principal, conversation, "a".repeat(64)]);
  await client.query(`INSERT INTO artifact_upload_intents
    (id,batch_id,ordinal,environment_id,workspace_id,customer_id,owner_principal_id,
     expected_name,expected_size_bytes,declared_type,rights_note,audience,data_category,expires_at)
    VALUES($1,$2,1,$3,$4,$5,$6,'fixture.txt',10,'text/plain','Synthetic rights','internal','other_internal',now()+interval '30 minutes')`,
  [intent, batch, environmentId, workspace, customer, principal]);
  await rejectsStatement(client, `UPDATE artifact_upload_intents SET state='completed',reservation_state='converted' WHERE id=$1`, [intent]);
  await rejectsStatement(client, `INSERT INTO artifact_versions
    (id,artifact_id,environment_id,workspace_id,customer_id,owner_principal_id,version_number,
     filename,declared_type,actual_size_bytes,sha256_digest,object_key,rights_note,audience,data_category)
    VALUES($1,$2,$3,$4,$5,$6,1,'fixture.txt','text/plain',0,$7,$8,'Synthetic rights','internal','other_internal')`,
  [version, artifact, environmentId, workspace, customer, principal, digest, objectKey]);
  await client.query(`INSERT INTO artifact_versions
    (id,artifact_id,environment_id,workspace_id,customer_id,owner_principal_id,version_number,
     filename,declared_type,actual_size_bytes,sha256_digest,object_key,rights_note,audience,data_category)
    VALUES($1,$2,$3,$4,$5,$6,1,'fixture.txt','text/plain',10,$7,$8,'Synthetic rights','internal','other_internal')`,
  [version, artifact, environmentId, workspace, customer, principal, digest, objectKey]);
  await rejectsStatement(client, "UPDATE artifact_versions SET filename='changed.txt' WHERE id=$1", [version]);
  await rejectsStatement(client, "UPDATE artifact_versions SET customer_id=$2 WHERE id=$1", [version, randomUUID()]);
  await rejectsStatement(client, "UPDATE artifact_versions SET state='ready' WHERE id=$1", [version]);
  await client.query(`UPDATE artifact_upload_intents SET state='completed',reservation_state='converted',
    staged_key=$2,staged_sha256_digest=$3,staged_actual_size_bytes=10,
    finalized_object_key=$4,version_id=$5 WHERE id=$1`,
  [intent, "d".repeat(64), digest, objectKey, version]);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  const runValues = [version, environmentId, workspace, customer, principal, digest, "e".repeat(64), "f".repeat(64)];
  const insertRun = `INSERT INTO artifact_extraction_runs
    (id,version_id,environment_id,workspace_id,customer_id,owner_principal_id,initiating_principal_id,
     lifecycle_generation,original_digest,scan_policy_version,parser_policy_version,parser_image_digest,
     state,scan_receipt,coverage,manifest_digest,published_at)
    VALUES($1,$2,$3,$4,$5,$6,$6,1,$7,'004-v1','004-v1',$8,'published','{}','{}',$9,now())`;
  await client.query(insertRun, [randomUUID(), ...runValues]);
  await rejectsStatement(client, insertRun, [randomUUID(), ...runValues]);
}

describe("artifact schema migrations", () => {
  for (const mode of ["fresh", "upgrade-from-013"] as const) {
    it(`applies ${mode} and preserves exclusive scoped evidence support`, async () => {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const schema = `artifact_check_${randomUUID().replaceAll("-", "")}`;
          await client.query(`CREATE SCHEMA "${schema}"`);
          await client.query(`SET LOCAL search_path TO "${schema}"`);
          if (mode === "fresh") await apply(client, 1, 18);
          else {
            await apply(client, 1, 13);
            expect((await constraints(client, "profile_evidence_links")).join(" ")).toContain("source_revision_id");
            await apply(client, 14, 18);
          }
          const intent = (await constraints(client, "artifact_upload_intents")).join(" ");
          expect(intent).toContain("completed");
          expect(intent).toContain("version_id");
          expect(intent).toContain("reservation_state");
          const evidence = (await constraints(client, "profile_evidence_links")).join(" ");
          expect(evidence).toContain("num_nonnulls");
          expect(evidence).toContain("artifact_selection_id");
          const channel = (await constraints(client, "profile_revisions")).join(" ");
          expect(channel).toContain("artifact_share");
          const index = await client.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM pg_indexes WHERE schemaname=current_schema()
              AND indexname IN ('artifact_one_published_run_idx','artifact_one_leased_environment_idx')
          `);
          expect(Number(index.rows[0].count)).toBe(2);
          await client.query("CREATE TABLE turas_migrations(name text PRIMARY KEY)");
          const grants = readFileSync(resolve("scripts/db-role-setup.sql"), "utf8").replace(/\bpublic\b/g, schema);
          await client.query(grants);
          const permissions = await client.query<{ lifecycle_update: boolean; dependency_delete: boolean; payload_update: boolean; payload_delete: boolean }>(`
            SELECT has_table_privilege('turas_runtime',$1,'UPDATE') AS lifecycle_update,
              has_table_privilege('turas_runtime',$2,'DELETE') AS dependency_delete,
              has_table_privilege('turas_runtime',$3,'UPDATE') AS payload_update,
              has_table_privilege('turas_runtime',$3,'DELETE') AS payload_delete
          `, [`${schema}.artifact_lifecycle_events`, `${schema}.conversation_artifact_dependencies`,
            `${schema}.artifact_evidence_payloads`]);
          expect(permissions.rows[0]).toEqual({ lifecycle_update: false, dependency_delete: false,
            payload_update: false, payload_delete: true });
          if (mode === "fresh") await assertArtifactConstraints(client, `test-artifact-${randomUUID()}`);
        } finally { await client.query("ROLLBACK"); }
      });
    });
  }
});
