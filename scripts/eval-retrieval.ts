import {insertBoundFixtureSession} from "../tests/fixtures/bound-session";
import { createHash,randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import { Pool } from "pg";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { requireEvaluationSourceDatabase } from "./eval-source-database";

const args = process.argv.slice(2);
function numberArg(name: string,maximum: number): number {
  const index = args.indexOf(name);
  const value = Number(args[index+1]);
  if (index < 0 || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer at most ${maximum}`);
  }
  return value;
}
if (!args.includes("--live")) throw new Error("Explicit --live admission required");
const callLimit = numberArg("--max-embedding-calls",64);
const characterLimit = numberArg("--max-input-characters",1_000_000);
const testUrl = requireEvaluationSourceDatabase();
const environmentId = process.env.TURAS_TEST_ENVIRONMENT_ID!;
const fixture = JSON.parse(readFileSync("evals/fixtures/005-retrieval-governance.json","utf8")) as {
  version: string;answerableQueries: Array<{ id: string;kind: string;query: string;
    relevantPassages: string[] }>;
};
if (fixture.version !== "005-retrieval-governance-v1" ||
    fixture.answerableQueries.length < 40 ||
    fixture.answerableQueries.filter((item) => item.kind === "semantic").length < 8) {
  throw new Error("Fixed judged fixture is incomplete");
}
const pool = new Pool({ connectionString: testUrl,max: 2 });
const marker = await pool.query<{ environment_id: string; schema_version: number }>(
  "SELECT environment_id,schema_version FROM turas_environment");
if (marker.rows.length !== 1 || marker.rows[0].environment_id !== environmentId ||
    marker.rows[0].schema_version < 28) throw new Error("Disposable 005 database required");
await pool.query(`DELETE FROM rate_windows WHERE environment_id=$1
  AND category='retrieval_search'`,[environmentId]);
process.env.DATABASE_URL = testUrl;
process.env.DATABASE_URL_UNPOOLED = testUrl;
process.env.TURAS_ENVIRONMENT_ID = environmentId;
const [{ embedRetrievalTexts },{ searchEvidence },{ resolveRetrievalCitation },
  { closeRuntimePool }] = await Promise.all([
    import("../lib/server/retrieval/embeddings"),
    import("../lib/server/retrieval/search"),
    import("../lib/server/retrieval/citations"),
    import("../lib/server/db/client"),
  ]);
let calls = 0;
let characters = 0;
const sessions: string[] = [];
const record = (texts: readonly string[]) => {
  const count = texts.reduce((sum,item) => sum+Array.from(item).length,0);
  if (calls+1 > callLimit || characters+count > characterLimit) {
    throw new Error("Embedding evaluation budget exceeded");
  }
  calls += 1;characters += count;
};
await mkdir('local-artifacts/005',{recursive:true,mode:0o700});
const captureRoot=await mkdtemp(resolve('local-artifacts/005/retrieval-live-'));
const capture:{contract:string;fixture:string;state:string;queries:unknown[];partnerScope:unknown[];embeddingCalls:number;inputCharacters:number}={contract:'retrieval-independent-review-v1',fixture:fixture.version,state:'incomplete',queries:[],partnerScope:[],embeddingCalls:0,inputCharacters:0};
const persistCapture=async()=>{capture.embeddingCalls=calls;capture.inputCharacters=characters;await writeFile(join(captureRoot,'actual.json'),JSON.stringify(capture,null,2),{mode:0o600});};
await persistCapture();
try {
  const passages = await pool.query<{ id: string; passage_text: string;
    passage_digest: string; source_revision_id: string }>(`
    SELECT p.id,p.passage_text,p.passage_digest,s.source_revision_id
    FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id
    WHERE s.environment_id=$1 AND s.customer_id=$2 AND
      s.source_kind='accepted_profile' AND s.audience='internal'
      AND s.lifecycle_state='current' ORDER BY p.id LIMIT 500`,
  [environmentId,DEMO_IDS.deniedCustomer]);
  if (!passages.rows.length || passages.rows.length >= 500) {
    throw new Error("Synthetic evaluation corpus incomplete or too large");
  }
  const expected = new Map<string,Set<string>>();
  for (const item of fixture.answerableQueries) {
    const ids = new Set(passages.rows.filter((row) =>
      item.relevantPassages.includes(row.passage_text)).map((row) => row.source_revision_id));
    if (!ids.size || ids.size > 5) throw new Error(`Invalid judged source set: ${item.id}`);
    expected.set(item.id,ids);
  }
  for (let offset=0;offset<passages.rows.length;offset += 32) {
    const batch = passages.rows.slice(offset,offset+32);
    record(batch.map((item) => item.passage_text));
    const vectors = await embedRetrievalTexts(batch.map((item) => item.passage_text));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [index,item] of batch.entries()) {
        const updated = await client.query(`UPDATE retrieval_passages p
          SET embedding=$3::public.vector,embedding_state='ready',
            embedding_contract='embedding-v1',embedded_at=now()
          FROM retrieval_sources s WHERE p.id=$1 AND p.passage_digest=$2
            AND s.id=p.source_id AND s.lifecycle_state='current'`,
        [item.id,item.passage_digest,`[${vectors[index].join(",")}]`]);
        if (updated.rowCount !== 1) throw new Error("Evaluation source changed");
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK");throw error; }
    finally { client.release(); }
  }
  const actors = await Promise.all([DEMO_IDS.mcteer,DEMO_IDS.panel,DEMO_IDS.partner]
    .map(async (principalId) => {
    const actor = await pool.query<{ membership_id: string; workspace_id: string;
      kind: "internal" | "partner"; role: "admin" | "member";
      login_name: string;display_name: string }>(`
      SELECT m.id AS membership_id,m.workspace_id,m.kind,m.role,p.login_name,p.display_name
      FROM memberships m JOIN principals p ON p.id=m.principal_id
      WHERE p.id=$1 AND m.workspace_id=$2 AND m.active AND p.active`,[principalId,DEMO_IDS.workspace]);
    if (!actor.rows[0]) throw new Error("Synthetic evaluation actor missing");
    const sessionId = randomUUID();sessions.push(sessionId);
    const sessionClient=await pool.connect();try{await insertBoundFixtureSession(sessionClient,{id:sessionId,principalId,tokenHash:createHash("sha256").update(sessionId).digest("hex"),expiresAt:new Date(Date.now()+3600000),membershipId:actor.rows[0].membership_id,workspaceId:actor.rows[0].workspace_id});}finally{sessionClient.release();}
    return { sessionId,principalId,membershipId: actor.rows[0].membership_id,
      workspaceId: actor.rows[0].workspace_id,kind: actor.rows[0].kind,
      role: actor.rows[0].role,loginName: actor.rows[0].login_name,
      displayName: actor.rows[0].display_name,token: "synthetic-evaluation",
      expiresAt: new Date(Date.now()+3_600_000) };
  }));
  let recall = 0;
  const failures: string[] = [];
  for (const [index,item] of fixture.answerableQueries.entries()) {
    record([item.query]);
    const response = await searchEvidence(actors[index%2],{
      scope: "customer",customerId: DEMO_IDS.deniedCustomer,
      query: item.query,use: "discovery",limit: 5 });
    if (response.mode !== "hybrid") throw new Error(`Live embedding unavailable: ${item.id}`);
    const found = new Set(response.results.map((result) => result.sourceRevisionId));
    const relevant = expected.get(item.id)!;
    const hit = [...relevant].filter((id) => found.has(id)).length/relevant.size;
    recall += hit;
    if (hit < 1) failures.push(item.id);
    const client = await pool.connect();
    const citations:unknown[]=[];
    capture.queries.push({caseId:item.id,query:item.query,kind:item.kind,actor:{loginName:actors[index%2].loginName,kind:actors[index%2].kind},scope:{customerId:DEMO_IDS.deniedCustomer,use:'discovery',limit:5},expectedSourceRevisionIds:[...relevant],supportingPassages:passages.rows.filter(row=>item.relevantPassages.includes(row.passage_text)),response,citations,recallAt5:hit});
    await persistCapture();
    try {
      for (const result of response.results) {
        const citation = await resolveRetrievalCitation(client,actors[index%2],result.citationId);
        citations.push({citationId:result.citationId,resolved:citation});
        if (citation.text !== result.text || !citation.locators.length) {
          throw new Error(`Citation mismatch: ${item.id}`);
        }
      }
    } finally { client.release(); }
    await persistCapture();
  }
  record(["Juniper deployment review workflow"]);
  const cedar = await searchEvidence(actors[2],{
    scope: "customer",customerId: DEMO_IDS.sharedCustomer,
    query: "Juniper deployment review workflow",use: "discovery",limit: 5 });
  capture.partnerScope.push({kind:'assigned-customer-sentinel',actor:{loginName:actors[2].loginName,kind:actors[2].kind},customerId:DEMO_IDS.sharedCustomer,query:'Juniper deployment review workflow',response:cedar});await persistCapture();
  if (cedar.mode !== "hybrid" || cedar.results.length) {
    throw new Error("Cross-customer sentinel appeared in assigned partner scope");
  }
  let denied = false;
  try {
    const unexpected=await searchEvidence(actors[2],{
      scope: "customer",customerId: DEMO_IDS.deniedCustomer,
      query: "Juniper deployment review workflow",use: "discovery",limit: 5 });
    capture.partnerScope.push({kind:'unassigned-customer-denial',customerId:DEMO_IDS.deniedCustomer,denied:false,response:unexpected});await persistCapture();
  } catch (error) {
    denied = Boolean(error && typeof error === "object" && "status" in error &&
      (error.status === 403 || error.status === 404));
    capture.partnerScope.push({kind:'unassigned-customer-denial',customerId:DEMO_IDS.deniedCustomer,status:error&&typeof error==='object'&&'status' in error?error.status:null,denied});await persistCapture();
  }
  if (!denied) throw new Error("Unassigned partner customer scope was not denied");
  const recallAt5 = recall/fixture.answerableQueries.length;
  capture.state=recallAt5>=0.85?'captured-awaiting-independent-review':'failed-recall';await persistCapture();
  console.log(JSON.stringify({ fixture: fixture.version,queries: fixture.answerableQueries.length,
    semanticQueries: fixture.answerableQueries.filter((item) => item.kind === "semantic").length,
    recallAt5: Number(recallAt5.toFixed(3)),allCitationsExact: true,
    partnerSentinelDenied: true,
    embeddingCalls: calls,inputCharacters: characters,model: "openai/text-embedding-3-small",
    failedCaseIds: failures }));
  if (recallAt5 < 0.85) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Retrieval evaluation failed");
  process.exitCode = 1;
} finally {
  await persistCapture();
  if (sessions.length) await pool.query("DELETE FROM login_sessions WHERE id=ANY($1::uuid[])",
    [sessions]).catch(() => undefined);
  await closeRuntimePool();
  await pool.end();
}
