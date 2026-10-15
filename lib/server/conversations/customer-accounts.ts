import type { PoolClient } from "pg";
import type { CurrentSession } from "../auth/sessions";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { getServerConfig } from "../config";
import { readGeneralAttemptContext } from "./general-context";
import { boundToolActor } from "../profiles/tool-actor";
import { lockProfileActor, lockWorkspaceActor } from "../profiles/policy";
import { readEligibleContext } from "../profiles/context";
import { unsupportedProfileRevisionIds } from "../profiles/eligibility";
import { retrievalSourceHasMaterialConflict } from "../retrieval/search";
import { authorizeRetrievalScope } from "../retrieval/policy";
import { assertRetrievalDependenciesCurrent } from "../retrieval/fences";

type Principal = Parameters<typeof boundToolActor>[1];
type Account = { id: string; name: string; aliases: string[]; workloads: string[] };

/** Legacy findPublicAccounts: exact names/aliases win over exact documented
 * workload names. No fuzzy account inference or connection discovery. */
export function findCustomerAccounts(accounts: readonly Account[], name: string): Account[] {
  const normalized = name.trim().toLocaleLowerCase("en-US");
  const named = accounts.filter(account => [account.name, ...account.aliases]
    .some(alias => alias.toLocaleLowerCase("en-US") === normalized));
  if (named.length) return named;
  return accounts.filter(account => account.workloads.some(workload =>
    workload.toLocaleLowerCase("en-US") === normalized));
}

export async function customerQuestionActor(db: PoolClient, principal: Principal) {
  const attemptId = principal?.attributes?.turasAttemptId;
  if (!principal?.principalId || typeof attemptId !== "string") throw hiddenRecord();
  const general = await readGeneralAttemptContext(db, attemptId, principal.principalId);
  if (!general) return { ...await boundToolActor(db, principal), general: false as const };
  const row = (await db.query(`SELECT r.login_session_id,r.membership_id,r.workspace_id,
    r.owner_principal_id,s.expires_at,p.login_name,p.display_name,m.kind,m.role
    FROM ordinary_chat_authorities r JOIN login_sessions s ON s.id=r.login_session_id
    JOIN principals p ON p.id=r.owner_principal_id JOIN memberships m ON m.id=r.membership_id
    WHERE r.attempt_id=$1 AND r.owner_principal_id=$2`, [attemptId, principal.principalId])).rows[0];
  if (!row) throw hiddenRecord();
  const actor: CurrentSession = { sessionId: row.login_session_id, token: "",
    expiresAt: row.expires_at, principalId: row.owner_principal_id,
    membershipId: row.membership_id, workspaceId: row.workspace_id,
    loginName: row.login_name, displayName: row.display_name, kind: row.kind, role: row.role };
  await lockWorkspaceActor(db, actor, undefined, true);
  const marker = (await db.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0];
  if (marker?.schema_version < 56) throw new HttpFailure(503, "unavailable", "Customer lookup is unavailable");
  return { actor, attemptId, general: true as const };
}

export async function resolveCustomerAccount(db: PoolClient, principal: Principal, name: string) {
  const scope = await customerQuestionActor(db, principal);
  const result = await db.query<Account>(`SELECT c.id,c.display_name AS name,
    ARRAY(SELECT alias FROM customer_reference_aliases a WHERE a.customer_id=c.id AND a.kind='name') AS aliases,
    ARRAY(SELECT alias FROM customer_reference_aliases a WHERE a.customer_id=c.id AND a.kind='documented_workload'
      UNION SELECT w.display_name FROM customer_workloads w WHERE w.customer_id=c.id
      AND ($3='internal' OR EXISTS(SELECT 1 FROM profile_records r
       JOIN profile_revisions v ON v.id=r.current_accepted_revision_id
       WHERE r.workload_id=w.id AND v.audience='delivery' AND v.data_category='delivery_context'))) AS workloads
    FROM customer_references c WHERE c.workspace_id=$1 AND NOT c.synthetic
      AND ($3='internal' OR EXISTS(SELECT 1 FROM customer_grants g
        WHERE g.customer_id=c.id AND g.membership_id=$2 AND g.state='active'))
      AND ($4::uuid IS NULL OR c.id=$4) ORDER BY c.display_name,c.id LIMIT 1001`,
  [scope.actor.workspaceId, scope.actor.membershipId, scope.actor.kind,
    scope.general ? null : scope.customerId]);
  if (result.rows.length > 1000) throw new HttpFailure(503, "incomplete", "Customer inventory exceeds the lookup limit");
  const matches = findCustomerAccounts(result.rows, name);
  const reference = (account: Account) => ({ id: account.id, name: account.name,
    synthetic: false, sourceKind: "current_customer_knowledge" as const });
  if (matches.length > 1) return { status: "ambiguous" as const, candidates: matches.map(reference) };
  if (!matches.length) return { status: "not_found" as const,
    reason: "No exact customer, alias or documented workload match in your accessible inventory. Ask for the name; do not guess or initiate connector setup." };
  return { status: "resolved" as const, synthetic: false, account: reference(matches[0]) };
}

type Context = { customer: { id: string; displayName: string }; contextVersion: string;
  entries: Array<{ type: string; citationId: string }>; [key: string]: unknown };

export async function readCustomerAccountEvidence(db: PoolClient, principal: Principal,
  customerId: string, options: { query?: string; page?: number } = {}) {
  const scope = await customerQuestionActor(db, principal);
  if (!scope.general && scope.customerId !== customerId) throw hiddenRecord();
  await lockProfileActor(db, scope.actor, customerId, undefined, true);
  const context = await readEligibleContext(scope.actor, customerId,
    { ...options, limit: 20, shareActorRows: true }, db) as Context;
  if (scope.general) {
    await db.query(`INSERT INTO general_customer_read_scopes
      (attempt_id,customer_id,audience,generation,citation_ids)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(attempt_id,customer_id) DO UPDATE SET
       generation=EXCLUDED.generation,citation_ids=CASE WHEN general_customer_read_scopes.generation=EXCLUDED.generation THEN ARRAY(SELECT DISTINCT unnest(
         general_customer_read_scopes.citation_ids||EXCLUDED.citation_ids)) ELSE EXCLUDED.citation_ids END,checked_at=clock_timestamp()`,
    [scope.attemptId, customerId, scope.actor.kind === "internal" ? "internal" : "delivery",
      context.contextVersion, context.entries.map(entry => `${entry.type}:${entry.citationId}`)]);
  }
  return context;
}

/** Recheck named reads on every paid step and stream release, just as scoped
 * customer context does. Naming an account never grants access to its data. */
export async function assertCustomerQuestionReads(db: PoolClient, actor: CurrentSession,
  conversationId: string, attemptId?: string,validateSources=true) {
  const marker = (await db.query("SELECT schema_version FROM turas_environment LIMIT 1")).rows[0];
  if (marker?.schema_version < 56) return;
  // Retrieval dependencies survive turns. Recheck access to every consumed
  // customer before validating source lineage; a name never bypasses a grant.
  const retrievalScopes = (await db.query(`SELECT DISTINCT r.scope,r.customer_id
    FROM session_evidence_dependencies d JOIN retrieval_receipts r ON r.id=d.receipt_id
    JOIN conversations c ON c.id=d.conversation_id
    WHERE c.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3 AND c.environment_id=$4`,
    [conversationId,actor.principalId,actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
  // This validates reads; upgrading shared identity locks to UPDATE here makes
  // concurrent ordinary chats deadlock on the same membership. Shared locks
  // still fence revocation and source mutations until this transaction ends.
  for (const scope of retrievalScopes) await authorizeRetrievalScope(db,actor,scope.scope,scope.customer_id,undefined,true);
  if(validateSources)await assertRetrievalDependenciesCurrent(db,conversationId);
  const reads = (await db.query(`SELECT s.* FROM general_customer_read_scopes s
    JOIN response_attempts a ON a.id=s.attempt_id JOIN conversations c ON c.id=a.conversation_id
    WHERE c.id=$1 AND c.owner_principal_id=$2 AND c.workspace_id=$3
      AND c.environment_id=$4
    ORDER BY s.customer_id,s.checked_at DESC,a.created_at DESC`, [conversationId, actor.principalId, actor.workspaceId,
      getServerConfig().TURAS_ENVIRONMENT_ID])).rows;
  const validated = new Set<string>();
  for (const read of reads) {
    await lockProfileActor(db, actor, read.customer_id, undefined, true);
    // A profile generation is an inventory revision, not a revocation. New
    // independent research must not invalidate an otherwise authorized thread.
    // Recheck the exact consumed claims and the current audience instead.
    if(read.audience !== (actor.kind === "internal" ? "internal" : "delivery")) throw hiddenRecord();
    if(!validateSources || validated.has(read.customer_id))continue;
    validated.add(read.customer_id);
    const manual = read.citation_ids.filter((id: string) => id.startsWith("accepted_manual:")).map((id: string) => id.slice(16));
    if ((await unsupportedProfileRevisionIds(db, manual, true)).size) throw hiddenRecord();
    for (const citation of read.citation_ids as string[]) {
      if (!citation.startsWith("attributed_research:")) continue;
      const id = citation.slice(20);
      const found = await db.query<{head_id:string}>(`SELECT (SELECT head.id FROM evidence_source_revisions head WHERE head.source_id=v.source_id ORDER BY head.version DESC LIMIT 1) AS head_id FROM evidence_source_revisions v
        JOIN evidence_sources s ON s.id=v.source_id AND s.origin='independent_research'
        JOIN research_checks checks ON checks.source_revision_id=v.id
        WHERE v.id=$1 AND v.workspace_id=$2 AND v.customer_id=$3
         AND ($4='internal' OR v.audience='delivery') AND checks.identity_result
         AND checks.scope_result AND checks.integrity_result AND checks.content_result
         AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type='withdraw')
         AND (NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type='supersede')
           OR EXISTS(SELECT 1 FROM evidence_source_revisions current
             JOIN research_checks proof ON proof.source_revision_id=current.id
             WHERE current.source_id=v.source_id
               AND current.version=(SELECT max(head.version) FROM evidence_source_revisions head WHERE head.source_id=v.source_id)
               AND current.passage_digest=v.passage_digest AND current.supported_claim=v.supported_claim
               AND proof.identity_result AND proof.scope_result AND proof.integrity_result AND proof.content_result
               AND strpos(proof.rationale,'"retainedPreviousClaim":true')>0
               AND NOT EXISTS(SELECT 1 FROM evidence_source_events removed WHERE removed.source_revision_id=current.id
                 AND removed.event_type IN('withdraw','supersede'))))`,
      [id, actor.workspaceId, read.customer_id, actor.kind]);
      if (!found.rowCount || await retrievalSourceHasMaterialConflict(db,
        { source_kind: "verified_research", source_revision_id: id }, actor,
        { scope: "customer", customerId: read.customer_id }) || found.rows[0].head_id!==id && await retrievalSourceHasMaterialConflict(db,
        {source_kind:'verified_research',source_revision_id:found.rows[0].head_id},actor,
        {scope:'customer',customerId:read.customer_id})) throw hiddenRecord();
    }
  }
}
