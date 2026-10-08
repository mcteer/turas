import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../../../lib/server/db/client";
import { createProfileTestSession } from "../profiles";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";
import { supportActionSchema } from "../../../lib/contracts/support";
import { supportDigest } from "../../../lib/server/support/commands";

export const supportBenchmarkShape = { customers: 100, scopes: 500, actions: 5000,
  revisions: 20000, users: 5, warmups: 10, samples: 100 } as const;
type Row = Record<string, unknown>;
async function bulk(db: PoolClient, table: string, rows: Row[]) {
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid owned fixture table");
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250), columns = Object.keys(batch[0]);
    if (columns.some(column => !/^[a-z_]+$/.test(column))) throw new Error("Invalid owned fixture column");
    await db.query(`INSERT INTO ${table}(${columns.join(",")}) SELECT ${columns.join(",")}
      FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`, [JSON.stringify(batch)]);
  }
}

/** Representative synthetic history, not human-approval evidence. Constraints and
 * immutable-history triggers remain enabled. No selected database is modified. */
export async function seedSupportBenchmark() {
  requireOwnedSupportClone();
  return withTransaction(async db => {
    const reviewer = await createProfileTestSession(db, "mcteer");
    const users = [await createProfileTestSession(db, "panel"), reviewer];
    for (let i = 2; i < supportBenchmarkShape.users; i++) {
      const principalId = randomUUID(), membershipId = randomUUID(), sessionId = randomUUID();
      const loginName = `support_load_${randomUUID().slice(0, 8)}`;
      await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic support load user')", [principalId, loginName]);
      await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')", [membershipId, principalId, reviewer.workspaceId]);
      await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '2 hours')", [sessionId, principalId, createHash("sha256").update(sessionId).digest("hex")]);
      users.push({ ...users[0], principalId, membershipId, sessionId, loginName, displayName: "Synthetic support load user", expiresAt: new Date(Date.now() + 7200000), token: "fixture" });
    }
    const observationDate = new Date().toISOString().slice(0, 10);
    const content = supportActionSchema.parse({ contractVersion: "support-v1", title: "Synthetic representative support action",
      observationDate, nextReviewDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), timezone: "UTC",
      desiredOutcome: "Confirm operating ownership", rationale: "Operating evidence is unknown", validationCriterion: "Human reviews operating ownership evidence",
      priority: "normal", owner: { kind: "unassigned", reason: "Owner requires verification" }, disposition: "open", outcomeSourceKeys: [] });
    const contentDigest = supportDigest(content), sourceDigest = supportDigest({ refs: [], engagements: [], dependencyCount: 0 });
    const tables: Record<string, Row[]> = { customer_references: [], customer_workloads: [], support_scopes: [], support_records: [], support_revisions: [], support_payloads: [], support_review_decisions: [], support_decision_payloads: [] };
    const scopes: Array<{ scopeId: string; customerId: string; workloadId: string | null; records: Array<{ recordId: string; revisionId: string }> }> = [];
    for (let c = 0; c < supportBenchmarkShape.customers; c++) {
      const customerId = randomUUID();
      tables.customer_references.push({ id: customerId, workspace_id: reviewer.workspaceId, display_name: `Synthetic support corpus ${c}`, synthetic: true });
      for (let s = 0; s < 5; s++) {
        const workloadId = s === 0 ? null : randomUUID(), scopeId = randomUUID();
        if (workloadId) tables.customer_workloads.push({ id: workloadId, workspace_id: reviewer.workspaceId, customer_id: customerId, display_name: `Synthetic workload ${s}` });
        const scope = { scopeId, customerId, workloadId, records: [] as Array<{ recordId: string; revisionId: string }> };
        scopes.push(scope);
        const identity = { environment_id: process.env.TURAS_ENVIRONMENT_ID, workspace_id: reviewer.workspaceId, customer_id: customerId };
        tables.support_scopes.push({ ...identity, id: scopeId, workload_id: workloadId });
        for (let a = 0; a < 10; a++) {
          const recordId = randomUUID(), author = users[a % users.length];
          tables.support_records.push({ ...identity, id: recordId, scope_id: scopeId, kind: "action", audience: "delivery", author_membership_id: author.membershipId, version: 4, state: "proposed" });
          let revisionId = "";
          for (let ordinal = 1; ordinal <= 4; ordinal++) {
            revisionId = randomUUID();
            tables.support_revisions.push({ id: revisionId, record_id: recordId, scope_id: scopeId, author_membership_id: author.membershipId,
              workspace_id: reviewer.workspaceId, ordinal, content_digest: contentDigest, source_state_digest: sourceDigest, contract_version: "support-v1", disposition: "open" });
            tables.support_payloads.push({ revision_id: revisionId, content_digest: contentDigest, content });
          }
          scope.records.push({ recordId, revisionId });
        }
      }
    }
    for (const [table, rows] of Object.entries(tables)) if (rows.length) await bulk(db, table, rows);
    await db.query(`UPDATE support_records r SET current_revision_id=v.id FROM support_revisions v WHERE v.record_id=r.id AND v.ordinal=4`);
    const counts = (await db.query(`SELECT (SELECT count(*)::int FROM support_scopes) AS scopes,
      (SELECT count(*)::int FROM support_records) AS actions,(SELECT count(*)::int FROM support_revisions) AS revisions`)).rows[0];
    if (counts.scopes !== 500 || counts.actions !== 5000 || counts.revisions !== 20000) throw new Error("Support corpus count mismatch");
    return { reviewer, users, scopes, corpusDigest: supportDigest(scopes), contentDigest };
  });
}
