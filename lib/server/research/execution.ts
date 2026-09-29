import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { researchLimits } from "../../contracts/research";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { lockResearchOwner } from "./policy";
import type { ContextSearchTransport } from "./discovery";
import { discoverContext, discoveryInScope } from "./discovery";
import { fetchPublicDocument, type PublicFetchTransport,
  type PublicResolver } from "./fetch";
import { exactPublicPassage, normalizePublicDocument,
  passageSupportsResearchScope } from "./normalize";
import { withTransaction } from "../db/client";

type Run = { id: string; request_id: string; conversation_attempt_id: string;
  state: string; mode: "recon" | "practices" | "fit";
  run_deadline: Date | null; admission_deadline: Date;
  actor_membership_id: string; login_session_id: string;
  customer_id: string; conversation_id: string; public_fields: Record<string,unknown>;
  rendered_queries: string[]; searches_used: number; fetches_used: number;
  bytes_used: string; admitted_digest: string; revision_number: number };

async function runRow(client: PoolClient,runId: string,lock = true): Promise<Run> {
  const found = await client.query<Run>(`SELECT run.id,run.request_id,
    run.conversation_attempt_id,run.state,run.mode,run.run_deadline,
    req.admission_deadline,run.actor_membership_id,req.login_session_id,
    run.customer_id,req.conversation_id,req.public_fields,req.rendered_queries,
    run.searches_used,run.fetches_used,run.bytes_used,req.admitted_digest,
    req.revision_number
    FROM research_runs run JOIN research_requests req ON req.id=run.request_id
    WHERE run.id=$1 AND run.environment_id=$2 ${lock ? "FOR UPDATE OF run,req" : ""}`,
  [runId,getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!found.rows[0]) throw hiddenRecord();
  return found.rows[0];
}

async function assertActiveRun(client: PoolClient,run: Run,actor: CurrentSession): Promise<void> {
  if (run.actor_membership_id !== actor.membershipId ||
      run.login_session_id !== actor.sessionId) throw hiddenRecord();
  await lockResearchOwner(client,actor,run.customer_id,run.conversation_id);
  if (run.state !== "running") throw new HttpFailure(409,"research_not_running","Research is no longer running");
  if (!run.run_deadline || run.run_deadline.getTime() <= Date.now()) {
    throw new HttpFailure(409,"deadline_exceeded","Research deadline exceeded");
  }
}

export async function consumeResearchRun(client: PoolClient,actor: CurrentSession,
  attemptId: string) {
  const found = await client.query<{ id: string }>(`
    SELECT id FROM research_runs WHERE conversation_attempt_id=$1
      AND actor_membership_id=$2 AND environment_id=$3`,
  [attemptId,actor.membershipId,getServerConfig().TURAS_ENVIRONMENT_ID]);
  if (!found.rows[0]) throw hiddenRecord();
  const run = await runRow(client,found.rows[0].id);
  if (run.login_session_id !== actor.sessionId) throw hiddenRecord();
  await lockResearchOwner(client,actor,run.customer_id,run.conversation_id);
  if (run.state === "queued") {
    if (run.admission_deadline.getTime() <= Date.now()) {
      throw new HttpFailure(409,"admission_expired","Research admission expired");
    }
    const started = new Date();
    const deadline = new Date(started.getTime()+researchLimits.runMs);
    await client.query(`UPDATE research_requests SET state='consumed',updated_at=now()
      WHERE id=$1 AND state='admitted'`,[run.request_id]);
    await client.query(`UPDATE research_runs SET state='running',started_at=$2,
      run_deadline=$3,updated_at=now() WHERE id=$1 AND state='queued'`,
    [run.id,started,deadline]);
    run.state = "running";run.run_deadline = deadline;
  }
  await assertActiveRun(client,run,actor);
  const current = await client.query<{ content_digest: string }>(`
    SELECT content_digest FROM research_request_revisions
    WHERE request_id=$1 AND revision_number=$2`,[run.request_id,run.revision_number]);
  if (current.rows[0]?.content_digest !== run.admitted_digest) {
    throw new HttpFailure(409,"research_scope_changed","Research scope changed");
  }
  return { id: run.id,requestId: run.request_id,mode: run.mode,
    deadline: run.run_deadline!.toISOString(),queries: run.rendered_queries,
    publicFields: run.public_fields };
}

type Operation = { id: string; state: string; deadline: Date;
  requestText: string; kind: "search" | "fetch" };
const operationDigest = (value: string) => createHash("sha256")
  .update(value).digest("hex");

export async function hasSubmittedContentOrigin(client: PoolClient,
  identity: { environmentId: string; workspaceId: string; customerId: string },
  content: { bodyDigest: string; passageDigest: string;
    normalizedDigest: string; normalizedText: string }): Promise<boolean> {
  const prior = await client.query(`SELECT 1 FROM research_observations observation
    JOIN research_runs prior_run ON prior_run.id=observation.run_id
    LEFT JOIN research_observation_payloads payload
      ON payload.observation_id=observation.id
    WHERE prior_run.environment_id=$1 AND prior_run.workspace_id=$2
      AND prior_run.customer_id=$3 AND observation.origin='user_submission'
      AND (observation.body_digest=$4 OR observation.passage_digest=$5
        OR observation.normalized_digest=$6 OR payload.normalized_text=$7)
    LIMIT 1`,
  [identity.environmentId,identity.workspaceId,identity.customerId,
    content.bodyDigest,content.passageDigest,content.normalizedDigest,
    content.normalizedText]);
  return Boolean(prior.rowCount);
}

export async function reserveResearchOperation(client: PoolClient,actor: CurrentSession,
  runId: string,kind: "search" | "fetch",index: number,text: string): Promise<Operation> {
  const run = await runRow(client,runId);
  await assertActiveRun(client,run,actor);
  const stepKey = `${kind}:${index}`;
  const key = operationDigest(text);
  const prior = await client.query<{ id: string; state: string; operation_key: string;
    deadline: Date }>(`SELECT id,state,operation_key,deadline FROM research_operations
    WHERE run_id=$1 AND step_key=$2 FOR UPDATE`,[runId,stepKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].operation_key !== key) {
      throw new HttpFailure(409,"research_scope_changed","Research scope changed");
    }
    if (prior.rows[0].state === "dispatched") {
      await client.query(`UPDATE research_operations SET state='unconfirmed',
        safe_error_code='dispatched_replay',finished_at=now() WHERE id=$1`,[prior.rows[0].id]);
      await client.query(`UPDATE research_runs SET state='unconfirmed',finished_at=now(),
        safe_reason_code='provider_outcome_unconfirmed',updated_at=now() WHERE id=$1`,[runId]);
      return { id: prior.rows[0].id,state: "unconfirmed",
        deadline: prior.rows[0].deadline,requestText: text,kind };
    }
    if (prior.rows[0].state !== "reserved" && prior.rows[0].state !== "succeeded") {
      throw new HttpFailure(409,"research_step_terminal","Research step is terminal");
    }
    return { id: prior.rows[0].id,state: prior.rows[0].state,
      deadline: prior.rows[0].deadline,requestText: text,kind };
  }
  if (kind === "search") {
    if (run.mode === "fit" || run.rendered_queries[index] !== text ||
        index >= researchLimits.searches || run.searches_used >= researchLimits.searches) {
      throw new HttpFailure(409,"research_budget","Research search budget exhausted");
    }
  } else {
    if (run.mode === "fit" || index >= researchLimits.fetchAttempts ||
        run.fetches_used >= researchLimits.fetchAttempts) {
      throw new HttpFailure(409,"research_budget","Research fetch budget exhausted");
    }
    const discovered = await client.query(`SELECT 1 FROM research_discovery_results
      WHERE run_id=$1 AND public_url=$2 LIMIT 1`,[runId,text]);
    const submitted = Array.isArray(run.public_fields.submittedUrls) &&
      run.public_fields.submittedUrls.includes(text);
    if (!discovered.rowCount && !submitted) {
      throw new HttpFailure(409,"research_scope_changed","Public URL was not admitted");
    }
    const inflight = await client.query<{ count: string; bytes: string }>(`
      SELECT count(*)::text AS count,coalesce(sum(reserved_bytes),0)::text AS bytes
      FROM research_operations WHERE run_id=$1 AND kind='fetch'
        AND state IN ('reserved','dispatched')`,[runId]);
    if (Number(inflight.rows[0].count) >= researchLimits.concurrentFetches ||
        Number(run.bytes_used)+Number(inflight.rows[0].bytes)+
          researchLimits.bytesPerDocument > researchLimits.bytesPerRun) {
      throw new HttpFailure(429,"research_budget","Research fetch capacity exhausted");
    }
  }
  const id = randomUUID();
  const deadline = new Date(Math.min(run.run_deadline!.getTime(),
    Date.now()+(kind === "search" ? researchLimits.searchTimeoutMs :
      researchLimits.fetchTimeoutMs)));
  await client.query(`INSERT INTO research_operations
    (id,run_id,step_key,operation_key,kind,state,reserved_bytes,deadline)
    VALUES($1,$2,$3,$4,$5,'reserved',$6,$7)`,
  [id,runId,stepKey,key,kind,kind === "fetch" ? researchLimits.bytesPerDocument : 0,deadline]);
  await client.query(`UPDATE research_runs SET ${kind === "search" ?
    "searches_used=searches_used+1" : "fetches_used=fetches_used+1"},updated_at=now()
    WHERE id=$1`,[runId]);
  return { id,state: "reserved",deadline,requestText: text,kind };
}

export async function dispatchResearchOperation(client: PoolClient,actor: CurrentSession,
  runId: string,operation: Operation): Promise<void> {
  const run = await runRow(client,runId);
  await assertActiveRun(client,run,actor);
  const changed = await client.query(`UPDATE research_operations SET state='dispatched',
    dispatched_at=now() WHERE id=$1 AND run_id=$2 AND state='reserved'`,
  [operation.id,runId]);
  if (!changed.rowCount) throw new HttpFailure(409,"research_step_terminal","Research step changed");
}

async function failOperation(client: PoolClient,runId: string,operationId: string,
  code: string,unconfirmed: boolean): Promise<void> {
  await client.query(`UPDATE research_operations SET state=$2,safe_error_code=$3,
    finished_at=now(),reserved_bytes=0 WHERE id=$1 AND state='dispatched'`,
  [operationId,unconfirmed ? "unconfirmed" : "failed",code]);
  if (unconfirmed) await client.query(`UPDATE research_runs SET state='unconfirmed',
    finished_at=now(),safe_reason_code=$2,updated_at=now()
    WHERE id=$1 AND state='running'`,[runId,code]);
}

export async function executeResearchSearch(actor: CurrentSession,runId: string,index: number,
  options: { transport?: ContextSearchTransport } = {}) {
  const scope = await withTransaction(async (client) => {
    const run = await runRow(client,runId);
    await assertActiveRun(client,run,actor);
    const query = run.rendered_queries[index];
    if (!query) throw new HttpFailure(409,"research_scope_changed","Query not admitted");
    const operation = await reserveResearchOperation(client,actor,runId,"search",index,query);
    if (operation.state === "unconfirmed") return { operation,query,mode: run.mode,
      fields: run.public_fields,skip: true };
    if (operation.state === "succeeded") return { operation,query,mode: run.mode,
      fields: run.public_fields,skip: true };
    await dispatchResearchOperation(client,actor,runId,operation);
    return { operation,query,mode: run.mode,fields: run.public_fields,skip: false };
  });
  if (scope.operation.state === "unconfirmed") {
    throw new HttpFailure(409,"provider_unconfirmed","Provider outcome unconfirmed");
  }
  if (scope.skip) return withTransaction(async (client) => {
    const rows = await client.query<{ public_url: string }>(`
      SELECT public_url FROM research_discovery_results WHERE operation_id=$1 ORDER BY ordinal`,
    [scope.operation.id]);
    return rows.rows.map((row) => row.public_url);
  });
  try {
    const key = process.env.CONTEXT_API_KEY;
    if (!key) throw new HttpFailure(503,"provider_unconfirmed","Public discovery outcome unconfirmed");
    const discovery = await discoverContext(scope.query,key,{
      transport: options.transport,deadline: scope.operation.deadline });
    const inScope = discovery.results.filter((result) =>
      discoveryInScope(scope.mode === "fit" ? "practices" : scope.mode,
        scope.fields,result.url));
    await withTransaction(async (client) => {
      const run = await runRow(client,runId);
      await assertActiveRun(client,run,actor);
      for (const [ordinal,result] of inScope.entries()) {
        await client.query(`INSERT INTO research_discovery_results
          (id,operation_id,run_id,ordinal,public_url,title,publication_at,provider_receipt_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(),scope.operation.id,runId,ordinal+1,result.url,result.title,
          result.publishedDate && !Number.isNaN(Date.parse(result.publishedDate)) ?
            new Date(result.publishedDate) : null,discovery.requestId]);
      }
      await client.query(`UPDATE research_operations SET state='succeeded',
        provider_receipt_id=$2,finished_at=now() WHERE id=$1 AND state='dispatched'`,
      [scope.operation.id,discovery.requestId]);
    });
    return inScope.map((result) => result.url);
  } catch (error) {
    const code = error instanceof HttpFailure ? error.code : "provider_unconfirmed";
    await withTransaction((client) => failOperation(client,runId,scope.operation.id,
      code,code === "provider_unconfirmed"));
    throw error;
  }
}

export async function executeResearchFetch(actor: CurrentSession,runId: string,index: number,
  url: string,options: { resolve?: PublicResolver; transport?: PublicFetchTransport } = {}) {
  const operation = await withTransaction(async (client) => {
    const reserved = await reserveResearchOperation(client,actor,runId,"fetch",index,url);
    if (reserved.state === "unconfirmed") return reserved;
    if (reserved.state === "succeeded") return reserved;
    await dispatchResearchOperation(client,actor,runId,reserved);
    return reserved;
  });
  if (operation.state === "unconfirmed") {
    throw new HttpFailure(409,"provider_unconfirmed","Provider outcome unconfirmed");
  }
  if (operation.state === "succeeded") return withTransaction(async (client) => {
    const found = await client.query<{ id: string }>(`
      SELECT id FROM research_observations WHERE operation_id=$1 LIMIT 1`,[operation.id]);
    return found.rows[0]?.id ?? null;
  });
  try {
    const fetched = await fetchPublicDocument(url,{ ...options,deadline: operation.deadline });
    const normalized = normalizePublicDocument(fetched.text,fetched.contentType);
    const scope = await withTransaction((client) => runRow(client,runId,false));
    const passage = exactPublicPassage(normalized.text,scope.mode === "recon" ?
      String(scope.public_fields.publicName ?? "") :
      String(scope.public_fields.topic ?? ""));
    const submitted = Array.isArray(scope.public_fields.submittedUrls) &&
      scope.public_fields.submittedUrls.some((item) => typeof item === "string" &&
        [fetched.requestedUrl,fetched.canonicalUrl,...fetched.aliases].includes(item));
    const refreshTarget = typeof scope.public_fields.refreshSourceRevisionId === "string" ?
      await withTransaction(async (client) => {
        const current = await client.query(`SELECT 1 FROM evidence_source_revisions v
          JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
          WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
            AND v.location=$4 AND NOT EXISTS (SELECT 1 FROM evidence_source_events event
              WHERE event.source_revision_id=v.id AND event.event_type IN ('withdraw','supersede'))`,
        [scope.public_fields.refreshSourceRevisionId,actor.workspaceId,scope.customer_id,
          fetched.canonicalUrl]);
        return Boolean(current.rowCount);
      }) : false;
    const identity = scope.mode !== "recon" ||
      discoveryInScope("recon",scope.public_fields,fetched.canonicalUrl);
    const hasTopic = passageSupportsResearchScope(passage.text,scope.mode,scope.public_fields);
    const checked = identity && hasTopic;
    const observationId = randomUUID();
    await withTransaction(async (client) => {
      const current = await runRow(client,runId);
      await assertActiveRun(client,current,actor);
      if (Number(current.bytes_used)+fetched.bytes > researchLimits.bytesPerRun) {
        throw new HttpFailure(413,"research_budget","Research content budget exhausted");
      }
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,
        [`${getServerConfig().TURAS_ENVIRONMENT_ID}:${actor.workspaceId}:${current.customer_id}`]);
      const copiedSubmission = await hasSubmittedContentOrigin(client,{
        environmentId: getServerConfig().TURAS_ENVIRONMENT_ID,
        workspaceId: actor.workspaceId,customerId: current.customer_id,
      },{ bodyDigest: fetched.bodyDigest,passageDigest: passage.digest,
        normalizedDigest: normalized.digest,normalizedText: normalized.text });
      const origin = (submitted && !refreshTarget) || copiedSubmission ?
        "user_submission" : "independent_discovery";
      if (!checked && origin === "independent_discovery") {
        throw new HttpFailure(422,"source_unverified","Public source did not match admitted scope");
      }
      await client.query(`INSERT INTO research_observations
        (id,run_id,operation_id,origin,requested_url,canonical_url,redirect_aliases,
         identity_checked,scope_checked,integrity_checked,content_checked,
         body_digest,passage_digest,passage_text,normalized_characters,
         retrieval_at,date_provenance,content_type,normalized_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [observationId,runId,operation.id,origin,fetched.requestedUrl,
        fetched.canonicalUrl,JSON.stringify(fetched.aliases),identity,checked,checked,
        fetched.bodyDigest,passage.digest,passage.text,normalized.text.length,
        fetched.retrievedAt,JSON.stringify({ retrieval: "server_clock" }),fetched.contentType,
        normalized.digest]);
      await client.query(`INSERT INTO research_observation_payloads
        (observation_id,normalized_text,raw_body,raw_body_expires_at)
        VALUES($1,$2,$3,now()+interval '24 hours')`,
      [observationId,normalized.text,Buffer.from(fetched.rawBody)]);
      await client.query(`UPDATE research_operations SET state='succeeded',
        reserved_bytes=0,finished_at=now() WHERE id=$1 AND state='dispatched'`,[operation.id]);
      await client.query(`UPDATE research_runs SET bytes_used=bytes_used+$2,
        updated_at=now() WHERE id=$1`,[runId,fetched.bytes]);
    });
    return observationId;
  } catch (error) {
    const code = error instanceof HttpFailure ? error.code : "fetch_unavailable";
    await withTransaction((client) => failOperation(client,runId,operation.id,code,false));
    throw error;
  }
}

export async function finishResearchRun(client: PoolClient,actor: CurrentSession,
  runId: string,plannedFetches: number): Promise<void> {
  const run = await runRow(client,runId);
  await lockResearchOwner(client,actor,run.customer_id,run.conversation_id);
  if (run.state !== "running") return;
  const operation = await client.query<{ failed: string; unconfirmed: string;
    pending: string; fetches: string }>(`
    SELECT count(*) FILTER (WHERE state='failed')::text AS failed,
      count(*) FILTER (WHERE state='unconfirmed')::text AS unconfirmed,
      count(*) FILTER (WHERE state IN ('reserved','dispatched'))::text AS pending,
      count(*) FILTER (WHERE kind='fetch')::text AS fetches
    FROM research_operations WHERE run_id=$1`,[runId]);
  const state = Number(operation.rows[0].unconfirmed) ? "unconfirmed" :
    Number(operation.rows[0].pending) ? "partial" :
      Number(operation.rows[0].failed) || Number(operation.rows[0].fetches) < plannedFetches ?
        "partial" : "completed";
  await client.query(`UPDATE research_runs SET state=$2,finished_at=now(),
    safe_reason_code=$3,updated_at=now() WHERE id=$1 AND state='running'`,
  [runId,state,state === "completed" ? null : "incomplete_public_research"]);
}
