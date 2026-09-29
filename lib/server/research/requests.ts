import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ZodError, z } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { researchPreviewInputSchema, researchRevisionSchema,
  researchStartSchema, researchCancelSchema, researchLimits,
  researchRunReceiptSchema, type ResearchPreviewInput } from "../../contracts/research";
import { governedIdSchema } from "../../contracts/retrieval";
import type { CurrentSession } from "../auth/sessions";
import { getServerConfig } from "../config";
import { prepareAttempt } from "../conversations/dispatch";
import { lockResearchOwner, renderResearchQueries,
  researchQueryTemplate } from "./policy";
import { authorizeRetrievalScope } from "../retrieval/policy";
import { readResearchFindings } from "./read";

function parse<T>(schema: z.ZodType<T>,input: unknown): T {
  try { return schema.parse(input); }
  catch (error) {
    if (error instanceof ZodError) throw new HttpFailure(422,"invalid_input","Invalid research request");
    throw error;
  }
}
const digest = (value: unknown) => createHash("sha256")
  .update(JSON.stringify(value)).digest("hex");
function nativeRequestKey(requestId: string,key: string): string {
  const bytes = createHash("sha256").update(`research-turn-v1:${requestId}:${key}`).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
type RequestRow = { id: string; environment_id: string; workspace_id: string;
  customer_id: string; actor_membership_id: string; actor_principal_id: string;
  login_session_id: string; conversation_id: string; mode: "recon" | "practices" | "fit";
  state: string; revision_number: number; public_fields: Record<string,unknown>;
  rendered_queries: string[]; admitted_digest: string | null;
  admission_deadline: Date | null; idempotency_key: string };

function publicFields(input: ResearchPreviewInput) {
  if (input.mode === "recon") return { publicName: input.publicName,
    publicDomain: input.publicDomain,identityConfirmed: true,
    submittedUrls: input.submittedUrls,
    ...(input.refreshSourceRevisionId ? { refreshSourceRevisionId: input.refreshSourceRevisionId } : {}) };
  if (input.mode === "practices") return { product: input.product,
    version: input.version,topic: input.topic,submittedUrls: input.submittedUrls,
    ...(input.refreshSourceRevisionId ? { refreshSourceRevisionId: input.refreshSourceRevisionId } : {}) };
  return { evidenceReceiptIds: input.evidenceReceiptIds,submittedUrls: [] };
}

function revisionDigest(input: ResearchPreviewInput,queries: string[]) {
  return digest({ template: researchQueryTemplate,mode: input.mode,
    publicFields: publicFields(input),queries });
}

async function requestRow(client: PoolClient,actor: CurrentSession,id: string,
  lock = true): Promise<RequestRow> {
  if (!governedIdSchema.safeParse(id).success) throw hiddenRecord();
  const found = await client.query<RequestRow>(`SELECT * FROM research_requests
    WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
      AND actor_membership_id=$4 AND actor_principal_id=$5
    ${lock ? "FOR UPDATE" : ""}`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,
    actor.membershipId,actor.principalId]);
  if (!found.rows[0]) throw hiddenRecord();
  await lockResearchOwner(client,actor,found.rows[0].customer_id,
    found.rows[0].conversation_id);
  return found.rows[0];
}

async function assertFitReceipts(client: PoolClient,actor: CurrentSession,
  customerId: string,input: ResearchPreviewInput) {
  if (input.mode !== "fit") return;
  for (const id of input.evidenceReceiptIds) {
    const receipt = await client.query(`SELECT 1 FROM retrieval_receipts
      WHERE id=$1 AND environment_id=$2 AND actor_membership_id=$3
        AND (scope='shared' OR customer_id=$4) AND valid_until>now()`,
    [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,customerId]);
    if (!receipt.rowCount) throw hiddenRecord();
  }
}

async function assertRefreshTarget(client: PoolClient,actor: CurrentSession,
  customerId: string,input: ResearchPreviewInput) {
  if (input.mode === "fit" || !input.refreshSourceRevisionId) return;
  const found = await client.query<{ location: string }>(`
    SELECT v.location FROM evidence_source_revisions v
    JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
    JOIN research_checks checks ON checks.source_revision_id=v.id
    WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
      AND (v.audience='delivery' OR $4='internal')
      AND checks.identity_result AND checks.scope_result
      AND checks.integrity_result AND checks.content_result
      AND NOT EXISTS (SELECT 1 FROM evidence_source_events event
        WHERE event.source_revision_id=v.id AND event.event_type IN ('withdraw','supersede'))
    FOR UPDATE OF v,s`,
  [input.refreshSourceRevisionId,actor.workspaceId,customerId,actor.kind]);
  if (!found.rows[0] || !input.submittedUrls.includes(found.rows[0].location)) {
    throw hiddenRecord();
  }
}

function preview(row: RequestRow,contentDigest: string) {
  return { id: row.id,mode: row.mode,state: row.state,
    customerId: row.customer_id,conversationId: row.conversation_id,
    revision: row.revision_number,digest: contentDigest,
    publicFields: row.public_fields,queries: row.rendered_queries,
    discoveryProvider: row.mode === "fit" ? null : "Context.dev",
    destination: row.mode === "fit" ? "none" : "public research provider",
    fetchScope: "public HTTPS/443 with per-URL validation",
    limits: { searches: row.mode === "fit" ? 0 : researchLimits.searches,
      fetchAttempts: row.mode === "fit" ? 0 : researchLimits.fetchAttempts,
      wallSeconds: researchLimits.runMs/1_000 },
    admissionDeadline: row.admission_deadline?.toISOString() ?? null };
}

export async function createResearchPreview(client: PoolClient,actor: CurrentSession,
  raw: unknown) {
  const input = parse(researchPreviewInputSchema,raw);
  await lockResearchOwner(client,actor,input.customerId,input.conversationId);
  const queries = renderResearchQueries(input);
  await assertFitReceipts(client,actor,input.customerId,input);
  await assertRefreshTarget(client,actor,input.customerId,input);
  const requestDigest = digest(input);
  const contentDigest = revisionDigest(input,queries);
  const prior = await client.query<{ id: string; request_digest: string }>(`
    SELECT id,request_digest FROM research_requests
    WHERE environment_id=$1 AND actor_membership_id=$2 AND idempotency_key=$3`,
  [getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,input.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    }
    return readResearchPreview(client,actor,prior.rows[0].id);
  }
  const id = randomUUID();
  const fields = publicFields(input);
  const inserted = await client.query<{ id: string }>(`INSERT INTO research_requests
    (id,environment_id,workspace_id,customer_id,actor_membership_id,actor_principal_id,
     login_session_id,conversation_id,mode,public_fields,rendered_queries,
     idempotency_key,request_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (environment_id,actor_membership_id,idempotency_key) DO NOTHING RETURNING id`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,input.customerId,
    actor.membershipId,actor.principalId,actor.sessionId,input.conversationId,
    input.mode,JSON.stringify(fields),JSON.stringify(queries),input.idempotencyKey,requestDigest]);
  if (!inserted.rows[0]) {
    const replay = await client.query<{ id: string; request_digest: string }>(`
      SELECT id,request_digest FROM research_requests WHERE environment_id=$1
        AND actor_membership_id=$2 AND idempotency_key=$3`,
    [getServerConfig().TURAS_ENVIRONMENT_ID,actor.membershipId,input.idempotencyKey]);
    if (replay.rows[0]?.request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    }
    return readResearchPreview(client,actor,replay.rows[0].id);
  }
  await client.query(`INSERT INTO research_request_revisions
    (id,request_id,revision_number,content_digest,public_fields,rendered_queries,
     actor_membership_id,idempotency_key,request_digest)
    VALUES($1,$2,1,$3,$4,$5,$6,$7,$8)`,
  [randomUUID(),id,contentDigest,JSON.stringify(fields),JSON.stringify(queries),
    actor.membershipId,input.idempotencyKey,requestDigest]);
  return preview({ id,environment_id: getServerConfig().TURAS_ENVIRONMENT_ID,
    workspace_id: actor.workspaceId,customer_id: input.customerId,
    actor_membership_id: actor.membershipId,actor_principal_id: actor.principalId,
    login_session_id: actor.sessionId,conversation_id: input.conversationId,
    mode: input.mode,state: "draft",revision_number: 1,public_fields: fields,
    rendered_queries: queries,admitted_digest: null,admission_deadline: null,
    idempotency_key: input.idempotencyKey },contentDigest);
}

export async function readResearchPreview(client: PoolClient,actor: CurrentSession,id: string) {
  const row = await requestRow(client,actor,id,false);
  const current = await client.query<{ content_digest: string }>(`
    SELECT content_digest FROM research_request_revisions
    WHERE request_id=$1 AND revision_number=$2`,[id,row.revision_number]);
  if (!current.rows[0]) throw new HttpFailure(503,"unavailable","Research unavailable");
  return preview(row,current.rows[0].content_digest);
}

export async function reviseResearchPreview(client: PoolClient,actor: CurrentSession,
  id: string,raw: unknown) {
  const command = parse(researchRevisionSchema,raw);
  const row = await requestRow(client,actor,id);
  if (row.state !== "draft" || row.login_session_id !== actor.sessionId ||
      command.input.customerId !== row.customer_id ||
      command.input.conversationId !== row.conversation_id ||
      command.input.mode !== row.mode) throw new HttpFailure(409,"request_changed","Research preview changed");
  const requestDigest = digest(command);
  const prior = await client.query<{ request_id: string; request_digest: string;
    revision_number: number; content_digest: string }>(`
    SELECT request_id,request_digest,revision_number,content_digest
    FROM research_request_revisions WHERE actor_membership_id=$1 AND idempotency_key=$2`,
  [actor.membershipId,command.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].request_id !== id || prior.rows[0].request_digest !== requestDigest) {
      throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    }
    return { ...preview(row,prior.rows[0].content_digest),revision: prior.rows[0].revision_number,
      digest: prior.rows[0].content_digest };
  }
  const current = await client.query<{ content_digest: string }>(`
    SELECT content_digest FROM research_request_revisions
    WHERE request_id=$1 AND revision_number=$2`,[id,row.revision_number]);
  if (row.revision_number !== command.expectedRevision ||
      current.rows[0]?.content_digest !== command.expectedDigest) {
    throw new HttpFailure(409,"request_changed","Research preview changed");
  }
  const queries = renderResearchQueries(command.input);
  await assertFitReceipts(client,actor,row.customer_id,command.input);
  await assertRefreshTarget(client,actor,row.customer_id,command.input);
  const fields = publicFields(command.input);
  const contentDigest = revisionDigest(command.input,queries);
  const next = row.revision_number+1;
  await client.query(`INSERT INTO research_request_revisions
    (id,request_id,revision_number,content_digest,public_fields,rendered_queries,
     actor_membership_id,idempotency_key,request_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [randomUUID(),id,next,contentDigest,JSON.stringify(fields),JSON.stringify(queries),
    actor.membershipId,command.idempotencyKey,requestDigest]);
  await client.query(`UPDATE research_requests SET revision_number=$2,public_fields=$3,
    rendered_queries=$4,updated_at=now() WHERE id=$1`,
  [id,next,JSON.stringify(fields),JSON.stringify(queries)]);
  return preview({ ...row,revision_number: next,public_fields: fields,
    rendered_queries: queries },contentDigest);
}

export async function startResearch(client: PoolClient,actor: CurrentSession,
  id: string,raw: unknown) {
  const command = parse(researchStartSchema,raw);
  const row = await requestRow(client,actor,id);
  if (row.login_session_id !== actor.sessionId) throw hiddenRecord();
  const requestDigest = digest(command);
  const requestKey = nativeRequestKey(id,command.idempotencyKey);
  const existing = await client.query<{ id: string; start_idempotency_key: string;
    start_request_digest: string; conversation_attempt_id: string }>(`
    SELECT id,start_idempotency_key,start_request_digest,conversation_attempt_id
    FROM research_runs WHERE request_id=$1`,[id]);
  if (existing.rows[0]) {
    if (existing.rows[0].start_idempotency_key !== command.idempotencyKey ||
        existing.rows[0].start_request_digest !== requestDigest) {
      throw new HttpFailure(409,"request_changed","Research already started");
    }
    return { runId: existing.rows[0].id,attemptId: existing.rows[0].conversation_attempt_id,
      requestKey,message: `Run admitted research request ${id}.`,
      replayed: true };
  }
  if (row.state !== "draft" || row.revision_number !== command.expectedRevision) {
    throw new HttpFailure(409,"request_changed","Research preview changed");
  }
  const current = await client.query<{ content_digest: string }>(`
    SELECT content_digest FROM research_request_revisions
    WHERE request_id=$1 AND revision_number=$2`,[id,row.revision_number]);
  if (current.rows[0]?.content_digest !== command.expectedDigest) {
    throw new HttpFailure(409,"request_changed","Research preview changed");
  }
  const admittedInput = researchPreviewInputSchema.parse({
    idempotencyKey: row.idempotency_key,customerId: row.customer_id,
    conversationId: row.conversation_id,mode: row.mode,
    ...row.public_fields,
  });
  await assertRefreshTarget(client,actor,row.customer_id,admittedInput);
  if (row.mode !== "fit" && !process.env.CONTEXT_API_KEY?.trim()) {
    throw new HttpFailure(503,"research_unavailable","Public research provider unavailable");
  }
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",
    [`research:${getServerConfig().TURAS_ENVIRONMENT_ID}:${actor.workspaceId}`]);
  const counts = await client.query<{ principal_active: string; workspace_active: string;
    principal_hour: string; workspace_hour: string }>(`
    SELECT
      (SELECT count(*) FROM research_runs WHERE actor_membership_id=$1
        AND state IN ('queued','running')) AS principal_active,
      (SELECT count(*) FROM research_runs WHERE environment_id=$2 AND workspace_id=$3
        AND state IN ('queued','running')) AS workspace_active,
      (SELECT count(*) FROM research_runs WHERE actor_membership_id=$1
        AND created_at>now()-interval '1 hour') AS principal_hour,
      (SELECT count(*) FROM research_runs WHERE environment_id=$2 AND workspace_id=$3
        AND created_at>now()-interval '1 hour') AS workspace_hour`,
  [actor.membershipId,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId]);
  const usage = counts.rows[0];
  if (Number(usage.principal_active) >= researchLimits.activePerPrincipal ||
      Number(usage.workspace_active) >= researchLimits.activePerWorkspace ||
      Number(usage.principal_hour) >= researchLimits.hourlyPerPrincipal ||
      Number(usage.workspace_hour) >= researchLimits.hourlyPerWorkspace) {
    throw new HttpFailure(429,"research_limit","Research limit reached",60);
  }
  const message = `Run admitted research request ${id}.`;
  const bound = await lockResearchOwner(client,actor,row.customer_id,row.conversation_id);
  const prepared = await prepareAttempt(actor,row.conversation_id,bound.eve_session_id!,
    requestKey,message,[],client);
  if (!prepared.created) throw new HttpFailure(409,"request_changed","Research turn already exists");
  const runId = randomUUID();
  const admissionDeadline = new Date(Date.now()+researchLimits.admissionLifetimeMs);
  await client.query(`INSERT INTO research_runs
    (id,request_id,environment_id,workspace_id,customer_id,actor_membership_id,
     conversation_attempt_id,mode,start_idempotency_key,start_request_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
  [runId,id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,row.customer_id,
    actor.membershipId,prepared.attemptId,row.mode,command.idempotencyKey,requestDigest]);
  await client.query(`UPDATE research_requests SET state='admitted',admitted_digest=$2,
    admission_deadline=$3,updated_at=now() WHERE id=$1`,
  [id,current.rows[0].content_digest,admissionDeadline]);
  return { runId,attemptId: prepared.attemptId,requestKey,
    message,replayed: false };
}

export async function readResearchRun(client: PoolClient,actor: CurrentSession,id: string) {
  if (!governedIdSchema.safeParse(id).success) throw hiddenRecord();
  const found = await client.query<{ id: string; request_id: string; state: string;
    mode: string; started_at: Date | null; run_deadline: Date | null;
    admission_deadline: Date | null;
    searches_used: number; fetches_used: number; safe_reason_code: string | null;
    customer_id: string; conversation_id: string }>(`
    SELECT run.id,run.request_id,run.state,run.mode,run.started_at,
      run.run_deadline,req.admission_deadline,run.searches_used,run.fetches_used,run.safe_reason_code,
      run.customer_id,req.conversation_id
    FROM research_runs run JOIN research_requests req ON req.id=run.request_id
    WHERE run.id=$1 AND run.environment_id=$2 AND run.workspace_id=$3
      AND run.actor_membership_id=$4 AND req.actor_principal_id=$5`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,
    actor.membershipId,actor.principalId]);
  const row = found.rows[0];
  if (!row) throw hiddenRecord();
  await authorizeRetrievalScope(client,actor,"customer",row.customer_id);
  const findings = await readResearchFindings(client,actor,id);
  return researchRunReceiptSchema.parse({ version: "research-v1",id: row.id,
    requestId: row.request_id,state: row.state,mode: row.mode,
    startedAt: row.started_at?.toISOString() ?? null,
    deadline: (row.run_deadline ?? row.admission_deadline ?? new Date())
      .toISOString(),safeReasonCode: row.safe_reason_code,
    searchesUsed: row.searches_used,fetchesUsed: row.fetches_used,
    retainedCitationIds: findings.map((item) => item.observationId) });
}

export async function cancelResearchRun(client: PoolClient,actor: CurrentSession,
  id: string,raw: unknown) {
  const command = parse(researchCancelSchema,raw);
  if (!governedIdSchema.safeParse(id).success) throw hiddenRecord();
  const locked = await client.query<{ customer_id: string;conversation_id: string }>(`
    SELECT run.customer_id,request.conversation_id FROM research_runs run
    JOIN research_requests request ON request.id=run.request_id
    WHERE run.id=$1 AND run.environment_id=$2 AND run.workspace_id=$3
      AND run.actor_membership_id=$4 FOR UPDATE OF run`,
  [id,getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId]);
  if (!locked.rows[0]) throw hiddenRecord();
  await lockResearchOwner(client,actor,locked.rows[0].customer_id,
    locked.rows[0].conversation_id);
  const receipt = await readResearchRun(client,actor,id);
  const prior = await client.query<{ id: string; run_id: string }>(`
    SELECT id,run_id FROM research_cancel_receipts
    WHERE actor_membership_id=$1 AND idempotency_key=$2`,
  [actor.membershipId,command.idempotencyKey]);
  if (prior.rows[0]) {
    if (prior.rows[0].run_id !== id) throw new HttpFailure(409,"idempotency_conflict","Request key reused");
    return { runId: id,state: "cancelled" as const,replayed: true };
  }
  if (!["queued","running"].includes(receipt.state)) {
    throw new HttpFailure(409,"research_not_running","Research is already terminal");
  }
  await client.query(`INSERT INTO research_cancel_receipts
    (id,run_id,actor_membership_id,idempotency_key) VALUES($1,$2,$3,$4)`,
  [randomUUID(),id,actor.membershipId,command.idempotencyKey]);
  const changed = await client.query(`UPDATE research_runs SET state='cancelled',cancelled_at=now(),
    finished_at=now(),safe_reason_code='cancelled_by_owner',updated_at=now()
    WHERE id=$1 AND state IN ('queued','running')`,[id]);
  if (!changed.rowCount) throw new HttpFailure(409,"research_not_running","Research is already terminal");
  await client.query(`UPDATE research_requests SET state='cancelled',updated_at=now()
    WHERE id=$1 AND state IN ('admitted','consumed')`,[receipt.requestId]);
  await client.query(`UPDATE response_attempts SET dispatch_state='rejected',
    response_state='cancelled',last_error_code='research_cancelled',
    revision=revision+1,updated_at=now()
    WHERE id=(SELECT conversation_attempt_id FROM research_runs WHERE id=$1)
      AND dispatch_state='prepared' AND response_state='pending'`,[id]);
  await client.query(`UPDATE response_attempts SET response_state='stopping',
    last_error_code='research_cancelled',revision=revision+1,updated_at=now()
    WHERE id=(SELECT conversation_attempt_id FROM research_runs WHERE id=$1)
      AND dispatch_state<>'prepared' AND response_state IN ('pending','running')`,[id]);
  return { runId: id,state: "cancelled" as const,replayed: false };
}
