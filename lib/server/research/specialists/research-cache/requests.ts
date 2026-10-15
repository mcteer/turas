import {withTransaction} from "../../../db/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppIdentity } from "../identity";
import { loadResearchContext, researchContextDigest } from "../solution-research/context";
import { customerUpdateReceiptSchema, verifyCustomerUpdate, signCustomerUpdate } from "../solution-research/customer-update-receipt";
import { researchReceiptSchema, verifyResearch, signResearch } from "../solution-research/receipt";
import { storeCustomerUpdateArtifact, storeResearchArtifact, researchReferenceSchema } from "../solution-research/artifacts";
import { evidenceDatabase } from "./database";
import { digest, requestKey, requestScopeSchema, requestTicketSchema, snapshotReferenceSchema, type RequestScope, type RequestTicket, cachePolicy } from "./schema";
import { hasNewPublicSources } from "./public-learning";
import { snapshotDependenciesValid } from "./sources";
import { solutionCitationIssues } from "../solution-research/submission";

const receiptSchema = z.union([customerUpdateReceiptSchema, researchReceiptSchema]);
export const researchProgressSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("available"), reference: researchReferenceSchema, reason: z.string() }).strict(),
  z.object({ status: z.enum(["working", "unavailable"]), reference: z.null(), reason: z.string() }).strict(),
]);
type DurableReceipt = z.infer<typeof receiptSchema>;
const requestRow = z.object({ scope: requestScopeSchema, context_hash: z.string(), lease_id: z.uuid(), lease_until: z.coerce.date(),
  recon_reference: researchReferenceSchema.nullish(), started_at: z.coerce.date(), refresh: z.boolean(), receipt: z.unknown(), dependencies: z.array(snapshotReferenceSchema), refresh_after: z.coerce.date().nullable() });
const principal = (identity: AppIdentity) => [identity.environmentId, identity.workspaceId, identity.userId];

function verifiedDurableReceipt(value: unknown, identity: AppIdentity) {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success) return null;
  const receipt = parsed.data;
  // Cache retention/dependencies are checked separately. This verifies the original
  // signature at issuance, without pretending its expired transport token is valid.
  const issued = Date.parse(receipt.payload.issuedAt);
  const valid = "update" in receipt.payload
    ? verifyCustomerUpdate(customerUpdateReceiptSchema.parse(receipt), identity, issued)
    : verifyResearch(researchReceiptSchema.parse(receipt), identity, issued);
  return valid ? receipt : null;
}
async function reissue(receipt: DurableReceipt, identity: AppIdentity, signal: AbortSignal) {
  const payload = { ...receipt.payload, issuedAt: new Date().toISOString(), reusedFrom: {
    researchedAt: receipt.payload.reusedFrom?.researchedAt ?? receipt.payload.issuedAt,
    originalResearchId: receipt.payload.reusedFrom?.originalResearchId ?? receipt.signature,
  } };
  return "update" in payload
    ? storeCustomerUpdateArtifact(signCustomerUpdate(payload), identity, signal)
    : storeResearchArtifact(signResearch(payload), identity, signal);
}

export async function prepareResearch(identity: AppIdentity, input: RequestScope, signal: AbortSignal, refresh = false, parentSessionId?: string, reconReference?: z.infer<typeof researchReferenceSchema>) {
  let originalQuestion:string|undefined;
  if(identity.responseAttemptId){
    const message=await withTransaction(async db=>(await db.query<{text:string}>(`SELECT sm.text FROM response_attempts a
      JOIN submitted_messages sm ON sm.id=a.message_id JOIN conversations c ON c.id=a.conversation_id
      WHERE a.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4`,
      [identity.responseAttemptId,identity.principalId,identity.workspaceId,identity.environmentId])).rows[0]);
    const text=message?.text.trim();
    // Preserve the legacy bounded-question contract and the user's exact words.
    // A model rephrasing must not invalidate cache reuse or launch another run.
    if(text && text.length>=5 && text.length<=1500)originalQuestion=text;
  }
  const parsed = requestScopeSchema.parse(originalQuestion?{...input,question:originalQuestion}:input);
  const { proposal: _ignoredProposal, ...reconScope } = parsed;
  const parsedScope = parsed.kind === "customer-update" ? reconScope : parsed;
  const context = await loadResearchContext(identity, parsedScope.accountId, signal);
  const product = parsedScope.workload.trim().replace(/\s+/g, " ").toLowerCase();
  const prefix = context.name.trim().toLowerCase() + " ";
  const scope = { ...parsedScope, workload: product.startsWith(prefix) ? product.slice(prefix.length) : product };
  if (context.journalStatus === "unavailable") throw new Error("Current customer authorization/context is unavailable; do not reuse cached context.");
  const contextHash = researchContextDigest(context);
  const key = requestKey(scope, contextHash);
  const sql = await evidenceDatabase();
  signal.throwIfAborted();
  const rows = await sql.query(`SELECT * FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3 AND key=$4
    AND started_at>now()-interval '30 days'`, [...principal(identity), key]);
  const row = rows[0] ? requestRow.parse(rows[0]) : null;
  if (row && !row.receipt && row.lease_until.getTime() > Date.now())
    return { status: "working" as const, key, reference: null, ticket: null, checkedAt: null,
      reason: "Equivalent research is already running for this authorized context. Do not launch another child; check this request again after that task completes." };
  const receipt = row ? verifiedDurableReceipt(row.receipt, identity) : null;
  if (!refresh && receipt && !("brief" in receipt.payload && solutionCitationIssues(receipt.payload.blockers).length) && row?.refresh_after && row.refresh_after.getTime() > Date.now() &&
    researchContextDigest(receipt.payload.context) === researchContextDigest(context) &&
    receipt.payload.context.publicEvidenceVersion === context.publicEvidenceVersion && await snapshotDependenciesValid(identity, row.dependencies, row.scope.accountId) &&
    !await hasNewPublicSources(identity, scope.accountId, receipt.payload.sources.map(source => source.url), receipt.payload.reusedFrom?.researchedAt ?? receipt.payload.issuedAt)) {
    const reference = await reissue(receipt, identity, signal);
    console.info(JSON.stringify({ event: "research_cache.brief", key, outcome: "hit" }));
    return { status: "reused" as const, key, reference, ticket: null,
      checkedAt: receipt.payload.reusedFrom?.researchedAt ?? receipt.payload.issuedAt,
      reason: "Stored evidence reused after current access, customer-context and source-version checks. Load the reference with the normal result tool. Preserve its original research/check dates, gaps and conflicts; this was not a new web investigation." };
  }
  const lease = randomUUID();
  const admission=await withTransaction(async db=>{
    if(parentSessionId){
      // The legacy worker contract admits one matching child per parent/kind.
      // Rephrasing the same question must join that worker, not create an
      // ambiguous second lease while its first model step is running.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[
        ['research-worker-slot',...principal(identity),parentSessionId,scope.kind].join(':')]);
      const running=(await db.query<{key:string}>(`SELECT key FROM turas_research_requests
        WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3 AND parent_session_id=$4
          AND scope->>'kind'=$5 AND receipt IS NULL AND lease_until>now() ORDER BY started_at,key LIMIT 1`,
        [...principal(identity),parentSessionId,scope.kind])).rows[0];
      if(running)return {claimed:[],workingKey:running.key};
    }
    const claimed = await db.query(`INSERT INTO turas_research_requests
    (environment_id,workspace_id,owner_user_id,key,account_id,scope,context_hash,lease_id,lease_until,refresh,parent_session_id,recon_reference)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,now()+interval '10 minutes',$9,$10,$11::jsonb)
    ON CONFLICT(environment_id,workspace_id,owner_user_id,key) DO UPDATE SET scope=excluded.scope,context_hash=excluded.context_hash,
      lease_id=excluded.lease_id,lease_until=excluded.lease_until,refresh=excluded.refresh,parent_session_id=excluded.parent_session_id,worker_session_id=NULL,recon_reference=excluded.recon_reference,started_at=now(),receipt=NULL,completed_at=NULL,
      dependencies='[]'::jsonb,refresh_after=NULL
    WHERE turas_research_requests.receipt IS NOT NULL OR turas_research_requests.lease_until<=now() RETURNING key`,
    [...principal(identity), key, scope.accountId, JSON.stringify(scope), contextHash, lease, refresh, parentSessionId ?? null, reconReference ? JSON.stringify(reconReference) : null]);
    return {claimed:claimed.rows,workingKey:null as string|null};
  });
  if(admission.workingKey)return {status:'working' as const,key:admission.workingKey,reference:null,ticket:null,checkedAt:null,
    reason:"This chat already has a specialist of this kind running. Join the returned key first, then prepare this requested scope if more work is still needed. No second reservation was created."};
  const claimed=admission.claimed;
  signal.throwIfAborted();
  console.info(JSON.stringify({ event: "research_cache.brief", key, outcome: claimed.length ? "miss" : "joined" }));
  return { status: claimed.length ? "research" as const : "working" as const, key, reference: null,
    ticket: claimed.length ? { key, lease } : null, checkedAt: null,
    reason: claimed.length
      ? parentSessionId ? "Research is reserved for this parent session. Launch the specialist with accountId, question and proposal when applicable. Recon is already bound in the reservation. It loads the reservation from authenticated runtime lineage; do not copy the ticket into the message." : `Use the exact ticket ${JSON.stringify({key, lease})}. Consult stored sources first and research missing/changed evidence only.`
      : "Equivalent research was reserved concurrently. Do not launch duplicate research; check this request again after the running task completes." };
}

// Runtime lineage, not model-copied identifiers, binds a new child to admission.
// A second worker cannot claim the same lease, and ambiguous reservations fail closed.
export async function loadSessionResearchRequest(identity: AppIdentity, parentSessionId: string, workerSessionId: string,
  accountId: string, kind: RequestScope["kind"], signal: AbortSignal) {
  const sql = await evidenceDatabase();
  signal.throwIfAborted();
  const rows = await sql.query(`WITH candidates AS MATERIALIZED (
      SELECT key FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3
        AND parent_session_id=$4 AND account_id=$6 AND scope->>'kind'=$7 AND lease_until>now() AND receipt IS NULL
    ) UPDATE turas_research_requests r SET worker_session_id=$5
    WHERE r.environment_id=$1 AND r.workspace_id=$2 AND r.owner_user_id=$3
      AND r.key IN (SELECT key FROM candidates) AND (SELECT count(*) FROM candidates)=1
      AND (r.worker_session_id IS NULL OR r.worker_session_id=$5)
    RETURNING r.*`, [...principal(identity), parentSessionId, workerSessionId, accountId, kind]);
  if (rows.length !== 1) throw new Error("No unique, authorized research reservation is available for this parent and worker.");
  const row = requestRow.extend({ key: z.string() }).parse(rows[0]);
  return { ...row, ticket: requestTicketSchema.parse({ key: row.key, lease: row.lease_id }) };
}

export async function loadResearchRequest(identity: AppIdentity, ticket: RequestTicket, accountId: string, kind: RequestScope["kind"], signal: AbortSignal) {
  const checked = requestTicketSchema.parse(ticket);
  const sql = await evidenceDatabase();
  signal.throwIfAborted();
  const rows = await sql.query(`SELECT * FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3
    AND key=$4 AND lease_id=$5 AND account_id=$6 AND lease_until>now() AND receipt IS NULL`,
    [...principal(identity), checked.key, checked.lease, accountId]);
  if (!rows[0]) throw new Error("Research reservation expired or is outside this caller/account.");
  const row = requestRow.parse(rows[0]);
  if (row.scope.kind !== kind) throw new Error("Research purpose differs from its reservation.");
  return { ...row, ticket: checked };
}

export async function researchRequestProgress(identity: AppIdentity, key: string, signal: AbortSignal) {
  const sql = await evidenceDatabase();
  signal.throwIfAborted();
  const rows = await sql.query(`SELECT * FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3
    AND key=$4 AND started_at>now()-interval '30 days'`, [...principal(identity), key]);
  if (!rows[0]) return { status: "unavailable" as const, reference: null, reason: "Research reservation is missing or outside this caller." };
  const row = requestRow.parse(rows[0]);
  if (!row.receipt) return row.lease_until.getTime() > Date.now()
    ? { status: "working" as const, reference: null, reason: "The existing research is still running." }
    : { status: "unavailable" as const, reference: null, reason: "Research did not publish before its reservation expired. Do not automatically retry the whole investigation." };
  const current = await loadResearchContext(identity, row.scope.accountId, signal);
  const receipt = verifiedDurableReceipt(row.receipt, identity);
  if (!receipt || researchContextDigest(current) !== row.context_hash || receipt.payload.context.publicEvidenceVersion !== current.publicEvidenceVersion || !await snapshotDependenciesValid(identity, row.dependencies, row.scope.accountId) || (receipt && await hasNewPublicSources(identity, row.scope.accountId, receipt.payload.sources.map(source => source.url), receipt.payload.reusedFrom?.researchedAt ?? receipt.payload.issuedAt)))
    return { status: "unavailable" as const, reference: null, reason: "Completed research is no longer eligible for reuse. Customer context or evidence changed." };
  return { status: "available" as const, reference: await reissue(receipt, identity, signal), reason: "The shared research completed. Load this signed reference using the normal result tool; preserve its original check dates and gaps." };
}

export async function finishResearchRequest(identity: AppIdentity, ticket: RequestTicket | undefined, receipt: DurableReceipt, signal: AbortSignal) {
  if (!ticket) return;
  const sql = await evidenceDatabase();
  const prior = await sql.query(`SELECT receipt FROM turas_research_requests WHERE environment_id=$1 AND workspace_id=$2
    AND owner_user_id=$3 AND key=$4 AND lease_id=$5 AND receipt IS NOT NULL`, [...principal(identity), ticket.key, ticket.lease]);
  const completed = prior[0] ? verifiedDurableReceipt(prior[0].receipt, identity) : null;
  if (completed?.signature === receipt.signature) return;
  const kind = "update" in receipt.payload ? "customer-update" : "solution";
  const request = await loadResearchRequest(identity, ticket, receipt.payload.context.accountId, kind, signal);
  const current = await loadResearchContext(identity, receipt.payload.context.accountId, signal);
  if (researchContextDigest(current) !== request.context_hash || researchContextDigest(current) !== researchContextDigest(receipt.payload.context))
    throw new Error("Customer context changed during research. Do not publish a reusable brief.");
  if (!verifiedDurableReceipt(receipt, identity)) throw new Error("Unverified research cannot enter the durable cache.");
  const dependencies = receipt.payload.sources.flatMap(source => source.cache ? [source.cache] : []);
  // Legacy/untracked sources can still complete a signed handoff, but cannot
  // qualify the result for cross-chat reuse without source-version dependencies.
  const tracked = dependencies.length === receipt.payload.sources.length && dependencies.length > 0;
  const refreshAfter = new Date(tracked ? Math.min(Date.now() + cachePolicy.recheckMs, ...dependencies.map(d => Date.parse(d.refreshAfter))) : Date.now());
  const rows = await sql.query(`UPDATE turas_research_requests SET receipt=$6::jsonb,dependencies=$7::jsonb,refresh_after=$8,
    completed_at=now(),lease_until=now() WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3 AND key=$4 AND lease_id=$5
    AND lease_until>now() AND receipt IS NULL RETURNING key`,
    [...principal(identity), ticket.key, ticket.lease, JSON.stringify(receipt), JSON.stringify(dependencies), refreshAfter.toISOString()]);
  if (!rows.length) throw new Error("Research lease expired before publication.");
}

export async function finishPracticeResearch(identity: AppIdentity, ticket: RequestTicket | undefined, sourceCount: number, signal: AbortSignal) {
  if (!ticket) return;
  signal.throwIfAborted();
  const sql = await evidenceDatabase();
  const rows = await sql.query(`UPDATE turas_research_requests SET receipt=$6::jsonb,dependencies='[]'::jsonb,completed_at=now(),lease_until=now(),refresh_after=now()+interval '30 days'
    WHERE environment_id=$1 AND workspace_id=$2 AND owner_user_id=$3 AND key=$4 AND lease_id=$5 AND scope->>'kind'='best-practices' AND lease_until>now() AND receipt IS NULL RETURNING key`,
    [...principal(identity), ticket.key, ticket.lease, JSON.stringify({ kind: "best-practices", sourceCount, completedAt: new Date().toISOString() })]);
  if (!rows.length) throw new Error("Practice research reservation expired.");
}
