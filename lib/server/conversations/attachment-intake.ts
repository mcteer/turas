import { createHash } from "node:crypto";
import type { CurrentSession } from "../auth/sessions";
import { withTransaction } from "../db/client";
import { getServerConfig } from "../config";
import { hiddenRecord, HttpFailure } from "../../contracts/http";
import { parseAttachmentMessage } from "../../conversations/attachment-text";
import {nativeMessageText} from "../../conversations/native-message";
import {parseOrdinaryNativeMessage} from "./native-message";
import { conversationFeature } from "./feature";
import { lockWorkspaceActor } from "../profiles/policy";
import { submitProfileCommandDetailed } from "../profiles/service";

const contextIntent = /\b(customer|account|engagement|context|profile|workload|scope|pilot|proposal)\b/i;
function requestUuid(value: string) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Legacy automatic draft intake, bound to the actual immutable user send.
 * Its separate transaction preserves the profile writer's lock prefix. No
 * accepted fact or embedding is created from supplied document content. */
export async function intakeOrdinaryAttachmentContext(actor: CurrentSession, conversationId: string, attemptId: string) {
  return withTransaction(async db => {
    await lockWorkspaceActor(db, actor);
    const marker=(await db.query('SELECT schema_version FROM turas_environment WHERE environment_id=$1',[getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if(Number(marker?.schema_version??0)<71 || process.env.TURAS_ORDINARY_ATTACHMENTS_DISABLED==='1')
      throw new HttpFailure(503,'attachments_unavailable','Document messages are temporarily unavailable');
    const row = (await db.query(`SELECT c.customer_id,c.live_customer_context,m.id AS message_id,m.text,m.created_at AS message_created_at,to_jsonb(m)->'ordinary_native_parts' AS native_parts
      FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
      JOIN submitted_messages m ON m.id=a.message_id AND m.conversation_id=c.id
      WHERE c.id=$1 AND a.id=$2 AND c.owner_principal_id=$3 AND c.workspace_id=$4
        AND c.environment_id=$5 AND a.dispatch_state='prepared'`,
    [conversationId, attemptId, actor.principalId, actor.workspaceId, getServerConfig().TURAS_ENVIRONMENT_ID])).rows[0];
    if (!row) throw hiddenRecord();
    const parsed = parseAttachmentMessage(row.native_parts?nativeMessageText(parseOrdinaryNativeMessage(row.native_parts)):row.text);
    if (!parsed || (await conversationFeature(db, conversationId)).kind !== "normal") return { drafts: 0, unresolved: 0 };
    const customers = (await db.query(`SELECT c.id,c.display_name AS name,
      ARRAY(SELECT alias FROM customer_reference_aliases a WHERE a.customer_id=c.id AND a.kind='name') AS aliases,
      ARRAY[]::text[] AS workloads FROM customer_references c WHERE c.workspace_id=$1
        AND NOT c.synthetic AND ($2::uuid IS NULL OR c.id=$2)
        AND ($3='internal' OR EXISTS(SELECT 1 FROM customer_grants g WHERE g.customer_id=c.id
          AND g.membership_id=$4 AND g.state='active')) ORDER BY c.display_name,c.id LIMIT 1001`,
    [actor.workspaceId, row.live_customer_context ? null : row.customer_id, actor.kind, actor.membershipId])).rows;
    if (customers.length > 1000) return { drafts: 0, unresolved: parsed.documents.length };
    let drafts = 0, unresolved = 0;
    for (const [index, document] of parsed.documents.entries()) {
      const requestKey = requestUuid(`ordinary-attachment-v1:${row.message_id}:${index}`);
      // A retry keeps its original customer and dates even if aliases change.
      const prior = await db.query(`SELECT 1 FROM profile_command_receipts
        WHERE workspace_id=$1 AND actor_membership_id=$2 AND request_key=$3`,
      [actor.workspaceId, actor.membershipId, requestKey]);
      if (prior.rowCount) { drafts++; continue; }
      const supplied = `${parsed.prompt}\n${document.filename}\n${document.text}`;
      if (!contextIntent.test(supplied)) continue;
      const normalized = supplied.toLocaleLowerCase("en-US");
      // Same name/alias mention lookup as legacy's attachment intake. An
      // ambiguous or inaccessible account never receives a draft.
      const matches = customers.filter(customer => [customer.name, ...customer.aliases].some(alias => normalized.includes(alias.toLocaleLowerCase("en-US"))));
      if (matches.length !== 1) { unresolved++; continue; }
      const customer = matches[0], sourceExcerpt = document.text.slice(0, 12_000).trim();
      const excerpt=sourceExcerpt.slice(0,8_000).trim();
      if (!excerpt) { unresolved++; continue; }
      const observedAt = new Date(row.message_created_at).toISOString().slice(0, 10);
      const summary = `The user supplied ${document.filename} as customer context for ${customer.name}. The source and claims require steward review before they become account facts.${document.truncated?' Text extraction was partial.':''}`;
      const context = { title: `User-supplied attachment: ${document.filename}`.slice(0, 160), summary,
        scope: "User-supplied customer context", kind: "note", stage: null, observedAt,
        reviewAfter: new Date(new Date(row.message_created_at).getTime() + 30 * 86_400_000).toISOString().slice(0, 10), confidence: "low",
        source: { kind: "attachment", reference: document.filename, url: "", excerpt: sourceExcerpt }, impact: null };
      await submitProfileCommandDetailed(actor, customer.id, { action: "propose_record",
        requestKey,
        requestedAudience: actor.kind === "partner" ? "delivery" : "internal",
        dataCategory: actor.kind === "partner" ? "delivery_context" : "other_internal",
        payload: { kind: "claim", title: context.title, text: summary, sourceType: "manual", legacyJourney: context,
          sourceMessageId: row.message_id, sourceExcerpt: excerpt,
          sourceSpanDigest: createHash("sha256").update(excerpt).digest("hex") } }, db, { submissionChannel: "agent_proposal" });
      drafts++;
    }
    return { drafts, unresolved };
  });
}
