import { execFileSync } from "node:child_process";
import { createHash,randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import type { CurrentSession } from "../lib/server/auth/sessions";
import { withTransaction,closeRuntimePool } from "../lib/server/db/client";
import { createResearchPreview,startResearch } from "../lib/server/research/requests";
import { consumeResearchRun,executeResearchSearch,executeResearchFetch,
  finishResearchRun } from "../lib/server/research/execution";
import { ingestCheckedObservation } from "../lib/server/research/ingest";
import { recheckRetrievalSource } from "../lib/server/retrieval/policy";
import { runRetrievalWorkerTick } from "./retrieval-worker";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";

const args = process.argv.slice(2);
const disposable = args[0] === "--live" && args[1] === "--disposable" &&
  (args.length === 2 || (args.length === 4 && args[2] === "--mode" &&
    ["recon","practices"].includes(args[3])));
const local = args[0] === "--live" && args[1] === "--container" &&
  [3,5].includes(args.length) &&
  /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(args[2]) &&
  (args.length === 3 || (args[3] === "--mode" &&
    ["recon","practices"].includes(args[4])));
if (!disposable && !local) {
  throw new Error("Use --live --disposable [--mode recon|practices] or --live --container <local-postgres-container> [--mode recon|practices]");
}
const mode = (disposable ? args[3] : args[4]) === "recon" ? "recon" : "practices";
if (!process.env.CONTEXT_API_KEY?.trim()) throw new Error("Context.dev key unavailable");
const sourceUrl = new URL(requireTestDatabaseUrl());
const neon = sourceUrl.hostname.endsWith(".neon.tech");
if (disposable !== neon) throw new Error("Disposable mode must match the selected Neon test database");
const sourceName = decodeURIComponent(sourceUrl.pathname.slice(1));
const user = decodeURIComponent(sourceUrl.username || "postgres");
if (!/^turas_test_[a-z0-9_]+$/.test(sourceName) ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) {
  throw new Error("Unsupported disposable database identity");
}
const marker = process.env.TURAS_TEST_ENVIRONMENT_ID!;
const cloneName = `turas_test_005_research_${randomUUID().replaceAll("-","").slice(0,8)}`;
const cloneUrl = new URL(sourceUrl);
cloneUrl.pathname = `/${cloneName}`;
const adminUrl = neon ? new URL(process.env.DATABASE_URL_UNPOOLED ?? "") : null;
if (adminUrl && (adminUrl.hostname !== sourceUrl.hostname ||
    adminUrl.username !== sourceUrl.username ||
    adminUrl.password !== sourceUrl.password ||
    adminUrl.pathname === sourceUrl.pathname)) {
  throw new Error("Neon clone requires the selected Preview owner endpoint");
}
const docker = (input: string[],data?: Buffer) => execFileSync("docker",input,{
  input: data,maxBuffer: 100*1024*1024,stdio: ["pipe","pipe","pipe"] });
let created = false;
try {
  if (adminUrl) {
    const admin = new Client({ connectionString: adminUrl.toString() });
    await admin.connect();
    try {
      for (let attempt = 0;attempt < 20;attempt += 1) {
        try {
          await admin.query(`CREATE DATABASE ${cloneName} TEMPLATE ${sourceName}`);
          created = true;
          break;
        } catch (error) {
          if ((error as { code?: string }).code !== "55006" || attempt === 19) throw error;
          await new Promise((wait) => setTimeout(wait,500));
        }
      }
    } finally { await admin.end(); }
  } else {
    docker(["exec",args[2],"createdb","-U",user,cloneName]);
    created = true;
    const dump = docker(["exec",args[2],"pg_dump","-U",user,"-d",sourceName,
      "-Fc","--no-owner","--no-acl"]);
    docker(["exec","-i",args[2],"pg_restore","-U",user,"-d",cloneName,
      "--no-owner","--no-acl"],dump);
  }
  const check = new Client({ connectionString: cloneUrl.toString() });
  await check.connect();
  try {
    const result = await check.query<{ environment_id: string;schema_version: number }>(
      "SELECT environment_id,schema_version FROM turas_environment");
    if (result.rows.length !== 1 || result.rows[0].environment_id !== marker ||
        result.rows[0].schema_version < 28) throw new Error("Research clone is not ready");
    // The clone can contain queued fixture projections; this smoke measures only
    // work caused by its newly attributed public observation.
    await check.query(`UPDATE retrieval_jobs
      SET state='failed',last_error_code='disposable_smoke_excluded'
      WHERE state='queued'`);
  } finally { await check.end(); }
  process.env.DATABASE_URL = cloneUrl.toString();
  process.env.DATABASE_URL_UNPOOLED = cloneUrl.toString();
  process.env.TURAS_ENVIRONMENT_ID = marker;
  const workspace = randomUUID();
  const customer = randomUUID();
  const principal = randomUUID();
  const membership = randomUUID();
  const sessionId = randomUUID();
  const conversation = randomUUID();
  const actor: CurrentSession = { sessionId,principalId: principal,membershipId: membership,
    workspaceId: workspace,kind: "internal",role: "member",token: "synthetic",
    loginName: "synthetic",displayName: "Researcher",
    expiresAt: new Date(Date.now()+3_600_000) };
  const admission = await withTransaction(async (client) => {
    await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic live research')",[workspace]);
    await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Researcher')",
      [principal,`research-${principal}`]);
    await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
      VALUES($1,$2,$3,'internal','member')`,[membership,principal,workspace]);
    await client.query(`INSERT INTO login_sessions(id,principal_id,token_hash,expires_at)
      VALUES($1,$2,$3,now()+interval '1 hour')`,
    [sessionId,principal,createHash("sha256").update(sessionId).digest("hex")]);
    await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
      VALUES($1,$2,'Synthetic public identity',true)`,[customer,workspace]);
    await client.query(`INSERT INTO conversations
      (id,environment_id,workspace_id,customer_id,owner_principal_id,
       eve_session_id,creation_operation_id,binding_state,title,
       context_snapshot_schema,context_login_session_id,context_membership_id,
       context_audience,context_generation,context_valid_until)
      VALUES($1,$2,$3,$4,$5,$6,$7,'bound','Synthetic research',
        'customer-context-v1',$8,$9,'internal',0,now()+interval '1 hour')`,
    [conversation,marker,workspace,customer,principal,
      `wrun_${randomUUID().replaceAll("-","")}`,randomUUID(),sessionId,membership]);
    await client.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at)
      VALUES($1,$2,now())`,
    [marker,`synthetic-${randomUUID()}`]);
    const preview = await createResearchPreview(client,actor,{
      idempotencyKey: randomUUID(),customerId: customer,conversationId: conversation,
      submittedUrls: [],...(mode === "recon" ?
        { mode: "recon" as const,publicName: "Vercel",
          publicDomain: "vercel.com",identityConfirmed: true } :
        { mode: "practices" as const,product: "Vercel",version: "2026",
          topic: "build cache" }) });
    const started = await startResearch(client,actor,preview.id,{
      idempotencyKey: randomUUID(),expectedRevision: preview.revision,
      expectedDigest: preview.digest });
    return started;
  });
  await withTransaction((client) => consumeResearchRun(client,actor,admission.attemptId));
  const urls = await executeResearchSearch(actor,admission.runId,0);
  if (!urls.length) throw new Error("Live discovery returned no admitted public URLs");
  let attributed = false;
  let attributedRevisionId: string | null = null;
  let fetchAttempts = 0;
  for (const url of urls.slice(0,5)) {
    const index = fetchAttempts++;
    try {
      const observationId = await executeResearchFetch(actor,admission.runId,index,url);
      if (!observationId) continue;
      const result = await withTransaction((client) =>
        ingestCheckedObservation(client,actor,observationId));
      attributed = result.attributed;
      attributedRevisionId = result.sourceRevisionId;
      if (attributed) break;
    } catch { /* The bounded run may try the next discovered public URL. */ }
  }
  await withTransaction((client) => finishResearchRun(client,actor,admission.runId,1));
  let projectionConvergenceMs: number | null = null;
  let immediateWithdrawalDenialMs: number | null = null;
  if (attributedRevisionId) {
    const eligibleAt = performance.now();
    while (performance.now()-eligibleAt < 60_000) {
      await runRetrievalWorkerTick();
      const ready = await withTransaction(async (client) => {
        const status = await client.query<{ total: string; ready: string }>(`
          SELECT count(DISTINCT source.id)::text AS total,
            count(DISTINCT source.id) FILTER (WHERE passage.embedding_state='ready')::text AS ready
          FROM retrieval_sources source
          JOIN retrieval_passages passage ON passage.source_id=source.id
          WHERE source.source_kind='verified_research' AND source.source_revision_id=$1
            AND source.lifecycle_state='current'`,[attributedRevisionId]);
        return status.rows[0];
      });
      if (Number(ready.total) === 2 && Number(ready.ready) === 2) {
        projectionConvergenceMs = performance.now()-eligibleAt;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve,500));
    }
    if (projectionConvergenceMs === null) throw new Error("Live projection convergence failed");
    const denialStarted = performance.now();
    const denied = await withTransaction(async (client) => {
      const projection = await client.query<{ id: string;source_generation: string;
        content_digest: string;projection_contract: string }>(`
        SELECT id,source_generation,content_digest,projection_contract
        FROM retrieval_sources WHERE source_kind='verified_research'
          AND source_revision_id=$1 AND audience='internal'`,[attributedRevisionId]);
      const row = projection.rows[0];
      if (!row) throw new Error("Internal projection missing");
      const source = { id: row.id,kind: "verified_research",revisionId: attributedRevisionId,
        generation: Number(row.source_generation),audience: "internal",
        contentDigest: row.content_digest,projectionContract: row.projection_contract };
      const scope = { environmentId: marker,workspaceId: workspace,customerId: customer,
        audience: "internal" as const,includeShared: false };
      if (!await recheckRetrievalSource(client,source,scope)) {
        throw new Error("Current projection was denied before withdrawal");
      }
      await client.query(`INSERT INTO evidence_source_events
        (id,source_revision_id,lifecycle_version,event_type,rationale)
        VALUES($1,$2,1,'withdraw','Synthetic live withdrawal')`,
      [randomUUID(),attributedRevisionId]);
      return !await recheckRetrievalSource(client,source,scope);
    });
    immediateWithdrawalDenialMs = performance.now()-denialStarted;
    if (!denied) throw new Error("Withdrawn projection remained readable");
  }
  const receipt = await withTransaction(async (client) => {
    const run = await client.query<{ state: string;searches_used: number;
      fetches_used: number }>(`SELECT state,searches_used,fetches_used
      FROM research_runs WHERE id=$1`,[admission.runId]);
    const evidence = await client.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM research_evidence_links l
      JOIN research_observations o ON o.id=l.observation_id
      WHERE o.run_id=$1 AND l.linkage_state='attributed'`,[admission.runId]);
    return { state: run.rows[0]?.state,searchesUsed: run.rows[0]?.searches_used,
      fetchesUsed: run.rows[0]?.fetches_used,attributed: Number(evidence.rows[0]?.count) > 0 };
  });
  console.log(JSON.stringify({ live: true,disposable: true,mode,provider: "Context.dev",
    discoveryCount: urls.length,fetchAttempts,...receipt,
    projectionConvergenceMs: projectionConvergenceMs === null ? null :
      Math.round(projectionConvergenceMs),
    immediateWithdrawalDenialMs: immediateWithdrawalDenialMs === null ? null :
      Math.round(immediateWithdrawalDenialMs),
    selectedApplicationResourcesTouched: false }));
  if (!attributed || !receipt.attributed || projectionConvergenceMs === null ||
      projectionConvergenceMs > 60_000 || immediateWithdrawalDenialMs === null) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error && "code" in error ?
    String(error.code) : "Live research workflow check failed");
  process.exitCode = 1;
} finally {
  await closeRuntimePool();
  if (created) {
    try {
      if (adminUrl) {
        const admin = new Client({ connectionString: adminUrl.toString() });
        await admin.connect();
        try { await admin.query(`DROP DATABASE ${cloneName} WITH (FORCE)`); }
        finally { await admin.end(); }
      } else {
        docker(["exec",args[2],"dropdb","-U",user,"--if-exists",cloneName]);
      }
    }
    catch { process.exitCode = 1; }
  }
}
