import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { withTestDatabase } from "../fixtures/database";
import { applyRetrievalMigrations, checkDefinitions, rejectsCheck, withIsolatedRetrievalSchema } from "../fixtures/retrieval";

describe("005 retrieval foundation", () => {
  it("installs the scoped pgvector projection schema at 019", async () => {
    await withTestDatabase(async (client) => {
      await withIsolatedRetrievalSchema(client, async (schema) => {
        await applyRetrievalMigrations(client, 19, 19);
        const vector = await client.query<{ extversion: string }>(
          "SELECT extversion FROM pg_extension WHERE extname='vector'");
        expect(vector.rows[0]?.extversion).toBe("0.8.6");
        const passages = await client.query<{ type: string }>(`
          SELECT format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
          WHERE a.attrelid='retrieval_passages'::regclass AND a.attname='embedding'`);
        expect(passages.rows[0]?.type).toContain("vector(1536)");
        const scopeChecks = await checkDefinitions(client, "retrieval_sources");
        expect(scopeChecks).toContain("shared");
        expect(scopeChecks).toContain("customer");
        const jobs = await checkDefinitions(client, "retrieval_jobs");
        expect(jobs).toContain("00:00:30");
        const tables = await client.query<{ name: string }>(`
          SELECT tablename AS name FROM pg_tables WHERE schemaname=$1
            AND tablename IN ('retrieval_sources','retrieval_passages',
              'retrieval_jobs','retrieval_embedding_operations')`, [schema]);
        expect(tables.rows).toHaveLength(4);
      });
    });
  });

  it("upgrades only an isolated schema from 018 to 022 with vector 0.8.6", async () => {
    await withTestDatabase(async (client) => {
      await withIsolatedRetrievalSchema(client, async (schema) => {
        await applyRetrievalMigrations(client, 19, 22);
        const vector = await client.query<{ extversion: string }>(
          "SELECT extversion FROM pg_extension WHERE extname='vector'");
        expect(vector.rows[0]?.extversion).toBe("0.8.6");
        const tables = await client.query<{ name: string }>(`
          SELECT tablename AS name FROM pg_tables WHERE schemaname=$1
            AND tablename IN ('retrieval_sources','retrieval_passages','retrieval_jobs',
              'retrieval_embedding_operations','knowledge_contributions',
              'knowledge_revisions','knowledge_publications','knowledge_lineage',
              'knowledge_decisions','research_requests','research_runs',
              'research_operations','research_observations','research_evidence_links',
              'research_refresh_observations','evidence_conflict_targets',
              'retrieval_receipts','retrieval_receipt_sources',
              'session_evidence_dependencies')`, [schema]);
        expect(tables.rows).toHaveLength(19);
        const dimension = await client.query<{ type: string }>(`
          SELECT format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
          WHERE a.attrelid='retrieval_passages'::regclass AND a.attname='embedding'`);
        expect(dimension.rows[0]?.type).toContain("vector(1536)");
      });
    });
  });

  it("encodes C01–C10 scope, length, state, version and retention limits", async () => {
    await withTestDatabase(async (client) => {
      await withIsolatedRetrievalSchema(client, async () => {
        await applyRetrievalMigrations(client, 19, 22);
        const checks: Array<[string, string[]]> = [
          ["retrieval_sources", ["customer", "shared", "source_generation", "content_digest"]],
          ["retrieval_passages", ["2000", "embedding", "passage_digest"]],
          ["retrieval_jobs", ["index", "invalidate", "cleanup", "30", "attempts"]],
          ["retrieval_embedding_operations", ["reserved", "dispatched", "unconfirmed"]],
          ["knowledge_contributions", ["draft", "submitted", "rejected", "closed"]],
          ["knowledge_revisions", ["revision_number", "content_digest", "idempotency_key"]],
          ["knowledge_revision_payloads", ["20480", "turas_knowledge_payload_valid"]],
          ["knowledge_publications", ["published", "suspended", "withdrawn"]],
          ["knowledge_lineage", ["accepted_profile", "verified_research", "rights_basis"]],
          ["knowledge_decisions", ["idempotency_key", "sanitization_rationale", "rights_attested"]],
          ["research_requests", ["recon", "practices", "fit", "idempotency_key"]],
          ["research_runs", ["completed", "partial", "cancelled", "unconfirmed"]],
          ["research_operations", ["reserved", "dispatched", "unconfirmed"]],
          ["research_observations", ["independent_discovery", "user_submission", "2048", "100000"]],
          ["research_refresh_observations", ["unchanged", "source_revision_id"]],
          ["evidence_conflict_targets", ["accepted_profile", "verified_research", "published_shared"]],
          ["retrieval_receipts", ["10", "valid_until", "citation_ids"]],
          ["retrieval_receipt_sources", ["source_revision_id", "passage_digest", "locators"]],
          ["session_evidence_dependencies", ["session_id", "source_generation", "source_revision_id"]],
        ];
        for (const [table, fragments] of checks) {
          const definition = (await checkDefinitions(client, table)).toLowerCase();
          const columns = await client.query<{ column_name: string }>(`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema=current_schema() AND table_name=$1`, [table]);
          const surface = definition + " " + columns.rows.map((row) => row.column_name).join(" ");
          for (const fragment of fragments) expect(surface, `${table} misses ${fragment}`).toContain(fragment.toLowerCase());
        }
        const types = await client.query<{ table_name: string; column_name: string; data_type: string }>(`
          SELECT table_name,column_name,data_type FROM information_schema.columns
          WHERE table_schema=current_schema() AND
            (table_name,column_name) IN (('retrieval_sources','id'),
              ('retrieval_receipts','as_of'),('retrieval_receipts','valid_until'),
              ('knowledge_revisions','created_at'),('research_operations','dispatched_at'))`);
        expect(types.rows).toEqual(expect.arrayContaining([
          expect.objectContaining({ table_name: "retrieval_sources", column_name: "id", data_type: "uuid" }),
          expect.objectContaining({ table_name: "retrieval_receipts", column_name: "as_of", data_type: "timestamp with time zone" }),
          expect.objectContaining({ table_name: "retrieval_receipts", column_name: "valid_until", data_type: "timestamp with time zone" }),
        ]));
        const indexes = await client.query<{ tablename: string; indexdef: string }>(`
          SELECT tablename,indexdef FROM pg_indexes WHERE schemaname=current_schema()
            AND tablename IN ('retrieval_jobs','knowledge_decisions','research_requests',
              'research_operations','session_evidence_dependencies')`);
        const indexText = indexes.rows.map((row) => row.indexdef).join(" ").toLowerCase();
        for (const key of ["idempotency_key", "source_generation", "contract_digest", "operation_key", "session_id"]) {
          expect(indexText).toContain(key);
        }
      });
    });
  });

  it("rejects invalid source scope, generation, digest, passage and vector dimension", async () => {
    await withTestDatabase(async (client) => {
      await withIsolatedRetrievalSchema(client, async (schema) => {
        await applyRetrievalMigrations(client, 19, 19);
        const environmentId = `test-retrieval-${schema}`;
        const workspaceId = randomUUID();
        const customerId = randomUUID();
        await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic retrieval workspace')", [workspaceId]);
        await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
          VALUES($1,$2,'Synthetic retrieval customer',true)`, [customerId, workspaceId]);
        const sourceId = randomUUID();
        const sourceRevisionId = randomUUID();
        const digest = "a".repeat(64);
        const insertSource = `INSERT INTO retrieval_sources
          (id,environment_id,workspace_id,customer_id,scope,source_kind,source_revision_id,
            audience,projection_contract,contract_digest,source_generation,content_digest)
          VALUES($1,$2,$3,$4,$5,'accepted_profile',$6,'internal','embedding-v1',$7,$8,$9)`;
        const good = [sourceId,environmentId,workspaceId,customerId,"customer",sourceRevisionId,digest,1,digest];
        await client.query(insertSource, good);
        await rejectsCheck(client, insertSource, [randomUUID(),environmentId,workspaceId,customerId,"shared",randomUUID(),digest,1,digest]);
        await rejectsCheck(client, insertSource, [randomUUID(),environmentId,workspaceId,customerId,"customer",randomUUID(),digest,0,digest]);
        await rejectsCheck(client, insertSource, [randomUUID(),environmentId,workspaceId,customerId,"customer",randomUUID(),"ABC",1,digest]);
        const insertPassage = `INSERT INTO retrieval_passages
          (id,source_id,ordinal,passage_digest,passage_text,locators,embedding_state,
            embedding,embedding_contract,embedded_at)
          VALUES($1,$2,1,$3,$4,'[{"kind":"profile_field","fieldPath":"text"}]'::jsonb,
            'ready',$5::vector,'embedding-v1',now())`;
        const validVector = `[1,${Array(1_535).fill(0).join(",")}]`;
        await rejectsCheck(client, insertPassage, [randomUUID(),sourceId,digest,"",validVector]);
        await rejectsCheck(client, insertPassage, [randomUUID(),sourceId,digest,"x".repeat(2_001),validVector]);
        await rejectsCheck(client, insertPassage, [randomUUID(),sourceId,digest,"Synthetic", "[0,1]"]);
        await client.query(insertPassage, [randomUUID(),sourceId,digest,"Synthetic",validVector]);
        const search = await client.query<{ searchable: boolean }>(`
          SELECT search_vector IS NOT NULL AS searchable FROM retrieval_passages
          WHERE source_id=$1`, [sourceId]);
        expect(search.rows[0]?.searchable).toBe(true);
      });
    });
  });

  it("requires a reviewed exact payload and 1–20 restricted sources before publication at 020", async () => {
    await withTestDatabase(async (client) => {
      await withIsolatedRetrievalSchema(client, async (schema) => {
        await applyRetrievalMigrations(client, 19, 20);
        const environmentId = `test-retrieval-${schema}`;
        const workspaceId = randomUUID();
        const customerId = randomUUID();
        const principalId = randomUUID();
        const membershipId = randomUUID();
        const contributionId = randomUUID();
        const revisionId = randomUUID();
        const digest = "b".repeat(64);
        await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic knowledge workspace')", [workspaceId]);
        await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic publisher')",
          [principalId, `publisher-${principalId}`]);
        await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
          VALUES($1,$2,$3,'internal','admin')`, [membershipId,principalId,workspaceId]);
        await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
          VALUES($1,$2,'Synthetic source',true)`, [customerId,workspaceId]);
        await client.query(`INSERT INTO knowledge_contributions
          (id,environment_id,workspace_id,customer_id,author_membership_id,idempotency_key,request_digest)
          VALUES($1,$2,$3,$4,$5,'create-1',$6)`,
        [contributionId,environmentId,workspaceId,customerId,membershipId,digest]);
        await client.query(`INSERT INTO knowledge_revisions
          (id,contribution_id,revision_number,content_digest,author_membership_id,idempotency_key,request_digest)
          VALUES($1,$2,1,$3,$4,'revision-1',$3)`,
        [revisionId,contributionId,digest,membershipId]);
        const fields = ["title","productVersion","problem","prerequisites","solution",
          "reasoning","applicability","limitations","validation"];
        const valid = Object.fromEntries(fields.map((field) => [field,"Synthetic public practice"]));
        await rejectsCheck(client, `INSERT INTO knowledge_revision_payloads(revision_id,payload)
          VALUES($1,$2::jsonb)`, [revisionId,JSON.stringify({ title: "Only a name" })]);
        await client.query(`INSERT INTO knowledge_revision_payloads(revision_id,payload)
          VALUES($1,$2::jsonb)`, [revisionId,JSON.stringify(valid)]);
        const publicationId = randomUUID();
        const publish = `INSERT INTO knowledge_publications
          (id,environment_id,contribution_id,revision_id,head_generation,state,public_quality,published_at)
          VALUES($1,$2,$3,$4,1,'published','{}'::jsonb,now())`;
        await rejectsCheck(client,publish,[publicationId,environmentId,contributionId,revisionId]);
        await client.query(`INSERT INTO knowledge_lineage
          (id,contribution_id,revision_id,ordinal,source_kind,source_revision_id,
            source_generation,source_digest,rights_basis)
          VALUES($1,$2,$3,1,'accepted_profile',$4,1,$5,'Synthetic reuse rights')`,
        [randomUUID(),contributionId,revisionId,randomUUID(),digest]);
        await client.query(publish,[publicationId,environmentId,contributionId,revisionId]);
        await rejectsCheck(client,"UPDATE knowledge_revisions SET content_digest=$2 WHERE id=$1",
          [revisionId,"c".repeat(64)]);
      });
    });
  });

  it("adds bounded research admission, receipts, refresh and typed conflicts at 021", async () => {
    await withTestDatabase(async (client) => {
      await withIsolatedRetrievalSchema(client, async (schema) => {
        await applyRetrievalMigrations(client, 19, 21);
        const tables = await client.query<{ name: string }>(`
          SELECT tablename AS name FROM pg_tables WHERE schemaname=$1 AND tablename IN
            ('research_requests','research_runs','research_operations','research_observations',
             'research_observation_payloads','research_evidence_links',
             'research_refresh_observations','evidence_conflict_targets')`, [schema]);
        expect(tables.rows).toHaveLength(8);
        const queries = await client.query<{ valid: boolean; too_long: boolean; too_many: boolean }>(`
          SELECT turas_research_queries_valid('["public product"]'::jsonb) AS valid,
            turas_research_queries_valid(to_jsonb(ARRAY[repeat('x',501)])) AS too_long,
            turas_research_queries_valid(to_jsonb(ARRAY['a','b','c','d','e'])) AS too_many`);
        expect(queries.rows[0]).toEqual({ valid: true, too_long: false, too_many: false });
        const conflicts = await checkDefinitions(client, "evidence_conflict_targets");
        expect(conflicts).toContain("published_shared");
        expect(conflicts).toContain("period_end");
        const rawBody = await checkDefinitions(client, "research_observation_payloads");
        expect(rawBody).toContain("24:00:00");
      });
    });
  });

  it("keeps runtime DDL denied and immutable review/audit rows append-only", async () => {
    await withTestDatabase(async (client) => {
      await withIsolatedRetrievalSchema(client, async (schema) => {
        await applyRetrievalMigrations(client, 19, 22);
        await client.query("CREATE TABLE turas_migrations(name text PRIMARY KEY)");
        const grants = readFileSync(resolve("scripts/db-role-setup.sql"), "utf8")
          .replace(/\bpublic\b/g, schema);
        await client.query(grants);
        const privileges = await client.query<{ create_allowed: boolean; decisions_update: boolean; lineage_delete: boolean }>(`
          SELECT has_schema_privilege('turas_runtime',$1,'CREATE') AS create_allowed,
            has_table_privilege('turas_runtime',$2,'UPDATE') AS decisions_update,
            has_table_privilege('turas_runtime',$3,'DELETE') AS lineage_delete`,
        [schema, `${schema}.knowledge_decisions`, `${schema}.knowledge_lineage`]);
        expect(privileges.rows[0]).toEqual({ create_allowed: false,
          decisions_update: false, lineage_delete: false });
      });
    });
  });
});
