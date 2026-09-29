import { spawnSync } from "node:child_process";
import { createHash,randomUUID } from "node:crypto";
import { mkdir,writeFile } from "node:fs/promises";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { withTransaction } from "../lib/server/db/client";
import { materializeCurrentProjection } from "../lib/server/retrieval/projections";
import { runRetrievalWorkerTick } from "./retrieval-worker";
import { withRetrievalEvalEnvironment } from "./retrieval-eval-environment";

const specs = ["tests/ui/retrieval.spec.ts","tests/ui/knowledge.spec.ts",
  "tests/ui/research.spec.ts"];
const filter = process.argv.slice(2);
const projectOption = /^--project=webkit-(?:desktop|mobile)-(?:light|dark)$/;
if (filter.length && !(filter.length >= 2 && filter.length <= 3 &&
    filter[0] === "--grep" && filter[1].length <= 100 &&
    (filter.length === 2 || projectOption.test(filter[2])))) {
  throw new Error("Only a bounded --grep and optional WebKit project filter are supported");
}
await mkdir("local-artifacts/005",{ recursive: true,mode: 0o700 });
await withRetrievalEvalEnvironment(async () => {
  const text = "Synthetic deployment product supports a fictional public web workflow.";
  const revisionId = randomUUID();
  await withTransaction(async (db) => {
    const recordId = randomUUID();
    await db.query(`INSERT INTO profile_records
      (id,workspace_id,customer_id,kind,canonical_key,created_by)
      VALUES($1,$2,$3,'product_use',$4,$5)`,
    [recordId,DEMO_IDS.workspace,DEMO_IDS.deniedCustomer,
      `synthetic-ui-${recordId}`,DEMO_IDS.mcteerMembership]);
    await db.query(`INSERT INTO profile_revisions
      (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
       payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
      VALUES($1,$2,$3,$4,1,'profile-v1',$5,$6,$7,'manual',
        'internal','internal_operations',$8)`,
    [revisionId,recordId,DEMO_IDS.workspace,DEMO_IDS.deniedCustomer,
      JSON.stringify({ kind: "product_use",productKey: "synthetic-deployment",
        displayName: "Synthetic deployment product",state: "actual",
        usageDescription: text,observedAt: new Date().toISOString(),
        evidenceRevisionIds: [] }),
      JSON.stringify({ rubricVersion: "evidence-quality-v1",R: 4,D: 4,C: 0,
        reliabilityRationale: "Synthetic UI fixture",
        directnessRationale: "Exact synthetic product passage",
        corroborationRationale: "No independent corroboration",
        informationType: "account_status",dateBasis: "observation" }),
      DEMO_IDS.mcteerMembership,createHash("sha256").update(text).digest("hex")]);
    await db.query(`INSERT INTO profile_review_decisions
      (revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
      VALUES($1,'accept',$2,'Synthetic UI review',$3)`,
    [revisionId,DEMO_IDS.mcteerMembership,randomUUID()]);
    await db.query(`UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1`,
      [recordId,revisionId]);
    await materializeCurrentProjection(db,"accepted_profile",revisionId,"internal");
  });
  const indexedAt = Date.now();
  let ready = false;
  while (Date.now()-indexedAt < 30_000) {
    await runRetrievalWorkerTick();
    ready = await withTransaction(async (db) => {
      const found = await db.query(`SELECT 1 FROM retrieval_sources source
        JOIN retrieval_passages passage ON passage.source_id=source.id
        WHERE source.source_revision_id=$1 AND passage.embedding_state='ready'`,
      [revisionId]);
      return Boolean(found.rowCount);
    });
    if (ready) break;
    await new Promise((wait) => setTimeout(wait,500));
  }
  if (!ready) throw new Error("Synthetic UI citation source did not index");
  const result = spawnSync(process.execPath,
    ["node_modules/@playwright/test/cli.js","test",...specs,...filter],{
      env: { ...process.env,TURAS_UI_BASE_URL: process.env.TURAS_APP_ORIGIN,
        TURAS_UI_FIXTURE_DATABASE_URL: process.env.DATABASE_URL_UNPOOLED,
        TURAS_PROFILE_FIXTURE_READY: "1",
        CI: "" },encoding: "utf8",timeout: 240_000,maxBuffer: 5_000_000 });
  await writeFile("local-artifacts/005/ui-check.log",
    `${result.stdout ?? ""}\n${result.stderr ?? ""}`,{ mode: 0o600 });
  console.log(JSON.stringify({ projects: 4,specFiles: specs.length,
    exitCode: result.status,logPath: "local-artifacts/005/ui-check.log" }));
  if (result.error || result.status !== 0) process.exitCode = 1;
});
