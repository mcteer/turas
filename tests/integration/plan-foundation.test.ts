import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import { Client } from "pg";
import { withTransaction } from "../../lib/server/db/client";
import { withPlanEvalEnvironment } from "../../scripts/plan-eval-environment";
import { submitPlanCommand } from "../../lib/server/plans/commands";
import { createProfileTestSession } from "../fixtures/profiles";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../fixtures/plans/seed";

function requireOwnedClone() {
  const selected = process.env.DATABASE_URL;
  const direct = process.env.DATABASE_URL_UNPOOLED;
  const marker = process.env.TURAS_ENVIRONMENT_ID;
  if (!selected || !direct || !marker?.startsWith("test-") ||
      selected !== direct || selected !== process.env.TURAS_TEST_DATABASE_URL ||
      !/^\/turas_test_006_eval_[a-f0-9]{12}$/.test(new URL(selected).pathname)) {
    throw new Error("006 integration checks require the owned disposable clone");
  }
}

describe("delivery plan foundation on isolated Postgres",() => {
  it("initializes schema 031 in a separate empty disposable database",async()=>{
    requireOwnedClone();
    const sourceDatabaseUrl=process.env.TURAS_TEST_SOURCE_DATABASE_URL;
    expect(sourceDatabaseUrl).toBeTruthy();
    await withPlanEvalEnvironment(async()=>{
      const client=new Client({connectionString:process.env.DATABASE_URL_UNPOOLED});
      await client.connect();
      try {
        const result=await client.query<{environment_id:string;schema_version:number}>(
          "SELECT environment_id,schema_version FROM turas_environment");
        expect(result.rows[0]?.environment_id).toBe(process.env.TURAS_TEST_ENVIRONMENT_ID);
        expect(result.rows[0]?.schema_version).toBeGreaterThanOrEqual(31);
      } finally {await client.end();}
    },{empty:true,sourceDatabaseUrl});
  },60_000);

  it("has schema 031, scoped tables and immutable revision guards",async () => {
    requireOwnedClone();
    await withTransaction(async (db) => {
      const environment = await db.query<{environment_id:string;schema_version:number}>(
        "SELECT environment_id,schema_version FROM turas_environment");
      expect(environment.rows[0]?.environment_id).toBe(process.env.TURAS_TEST_ENVIRONMENT_ID);
      expect(environment.rows[0]?.schema_version).toBeGreaterThanOrEqual(31);
      const tables = await db.query<{tablename:string}>(`SELECT tablename FROM pg_tables
        WHERE schemaname='public' AND tablename LIKE 'plan_%'`);
      const names = tables.rows.map((row) => row.tablename);
      expect(names).toEqual(expect.arrayContaining([
        "plan_revisions","plan_revision_payloads","plan_source_dependencies",
        "plan_review_previews","plan_decisions","plan_command_receipts",
      ]));
      const guards = await db.query<{tgname:string}>(`SELECT tgname FROM pg_trigger
        WHERE tgrelid='plan_revisions'::regclass AND NOT tgisinternal`);
      expect(guards.rows.length).toBeGreaterThan(0);
      const scoped = await db.query<{count:string}>(`SELECT count(*)::text AS count
        FROM pg_constraint WHERE conrelid='delivery_plans'::regclass
        AND contype='f'`);
      expect(Number(scoped.rows[0].count)).toBeGreaterThan(0);
      const grants = await db.query<{revision_update:boolean;payload_delete:boolean;
        cleanup_execute:boolean}>(`SELECT
        has_table_privilege('turas_runtime','plan_revisions','UPDATE') AS revision_update,
        has_table_privilege('turas_runtime','plan_revision_payloads','DELETE') AS payload_delete,
        has_function_privilege('turas_runtime',
          'turas_purge_plan_revision_payload(uuid)','EXECUTE') AS cleanup_execute`);
      expect(grants.rows[0]).toMatchObject({revision_update:false,
        payload_delete:false,cleanup_execute:true});
    });
  });

  it("returns one receipt for the same request and conflicts on changed replay",async () => {
    requireOwnedClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT fixture");
      try {
        const author = await createProfileTestSession(db,"panel");
        const draft = syntheticPlanContent();
        draft.assertions = [];
        draft.sourceDependencies = [];
        const input = {action:"create" as const,requestKey:`plan_${randomUUID()}`,
          customerId:PLAN_FIXTURE_SCOPE.customerId,
          workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
          workloadId:null,audience:"internal" as const,
          ownerMembershipId:PLAN_FIXTURE_SCOPE.memberId,content:draft};
        const first = await submitPlanCommand(author,input,db);
        expect(await submitPlanCommand(author,input,db)).toEqual(first);
        await expect(submitPlanCommand(author,{...input,
          content:{...draft,title:"A different synthetic plan"}},db))
          .rejects.toMatchObject({status:409});
        await db.query("SAVEPOINT immutable_probe");
        await expect(db.query("UPDATE plan_revisions SET content_digest=$2 WHERE id=$1",
          [first.revisionId,"b".repeat(64)])).rejects.toMatchObject({code:"23514"});
        await db.query("ROLLBACK TO SAVEPOINT immutable_probe");
      } finally { await db.query("ROLLBACK TO SAVEPOINT fixture"); }
    });
  });

  it("rejects a cross-scope plan and an unresolvable factual source",async () => {
    requireOwnedClone();
    await withTransaction(async (db) => {
      await db.query("SAVEPOINT fixture");
      try {
        const author = await createProfileTestSession(db,"panel");
        const crossScopeId = randomUUID();
        await db.query("SAVEPOINT cross_scope_probe");
        await expect(db.query(`INSERT INTO delivery_plans
          (id,environment_id,workspace_id,customer_id,audience,
           owner_membership_id,created_by_membership_id)
          VALUES($1,$2,$3,$4,'internal',$5,$5)`,
        [crossScopeId,process.env.TURAS_TEST_ENVIRONMENT_ID,randomUUID(),
          PLAN_FIXTURE_SCOPE.customerId,PLAN_FIXTURE_SCOPE.memberId]))
          .rejects.toMatchObject({code:"23503"});
        await db.query("ROLLBACK TO SAVEPOINT cross_scope_probe");
        const planCount = await db.query<{count:string}>(`SELECT count(*)::text AS count
          FROM delivery_plans WHERE customer_id=$1`,[PLAN_FIXTURE_SCOPE.customerId]);
        const forged = syntheticPlanContent();
        await expect(submitPlanCommand(author,{action:"create",
          requestKey:`plan_${randomUUID()}`,customerId:PLAN_FIXTURE_SCOPE.customerId,
          workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,workloadId:null,
          audience:"internal",ownerMembershipId:PLAN_FIXTURE_SCOPE.memberId,
          content:forged},db)).rejects.toMatchObject({status:409,
            code:"plan_source_changed"});
        const after = await db.query<{count:string}>(`SELECT count(*)::text AS count
          FROM delivery_plans WHERE customer_id=$1`,[PLAN_FIXTURE_SCOPE.customerId]);
        expect(after.rows[0].count).toBe(planCount.rows[0].count);
      } finally { await db.query("ROLLBACK TO SAVEPOINT fixture"); }
    });
  });
});
