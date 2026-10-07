import { randomUUID } from "node:crypto";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { SUPPORT_ADVICE_LIMITS, supportActionsToolSchema, supportEvidenceToolSchema } from "../../support/advice";
import { supportSkillMarkdown } from "../../support/skill-text";
import type { FeaturePrincipal } from "../conversations/feature";
import { supportTransaction } from "./service";
import { boundSupportToolActor } from "./tool-actor";
import { supportReadSchemas } from "./model-budget";
import { supportDigest } from "./commands";
import { decodeSupportCursor, encodeSupportCursor } from "./cursor";

export async function runSupportRead(principal: FeaturePrincipal, tool: keyof typeof supportReadSchemas, raw: unknown, callId: string) {
  if (!callId || callId.length > 200 || !Object.hasOwn(supportReadSchemas, tool)) throw hiddenRecord();
  const parsed = supportReadSchemas[tool].safeParse(raw);
  if (!parsed.success) throw new HttpFailure(400, "invalid_tool_input", "Invalid bound support read");
  const requestDigest = supportDigest({ tool, request: parsed.data });
  return supportTransaction(async db => {
    const bound = await boundSupportToolActor(db, principal);
    const prior = (await db.query(`SELECT r.request_digest,p.payload FROM support_advice_reads r
      LEFT JOIN support_advice_read_payloads p ON p.receipt_id=r.id WHERE r.attempt_id=$1 AND r.call_id=$2`, [bound.attemptId, callId])).rows[0];
    if (prior) {
      if (prior.request_digest !== requestDigest) throw new HttpFailure(409, "key_conflict", "Tool call identity changed");
      if (!prior.payload) throw new HttpFailure(409, "support_read_unconfirmed", "The prior read is not retained");
      return prior.payload;
    }
    if (bound.counters.readCalls >= SUPPORT_ADVICE_LIMITS.reads) throw new HttpFailure(429, "support_read_budget", "Support read limit reached");
    let result: unknown;
    if (tool === "load_skill") result = supportSkillMarkdown;
    else if (tool === "support_summary") {
      const { actions: _actions, ...summary } = bound.snapshot;
      result = summary;
    } else if (tool === "support_actions") {
      const input = supportActionsToolSchema.parse(parsed.data);
      const binding = supportDigest({ attempt: bound.attemptId, disposition: input.disposition ?? null, limit: input.limit });
      const generation = supportDigest(bound.snapshot);
      const offset = input.cursor ? decodeSupportCursor(input.cursor, binding, generation) : 0;
      const rows = (bound.snapshot.actions as { recordId: string; revision: { content: { disposition?: string } | null } }[])
        .filter(row => row.revision.content && (!input.disposition || row.revision.content.disposition === input.disposition));
      result = { actions: rows.slice(offset, offset + input.limit), nextCursor: rows.length > offset + input.limit
        ? encodeSupportCursor(binding, generation, offset + input.limit) : null };
    } else {
      const input = supportEvidenceToolSchema.parse(parsed.data), evidence = [];
      for (const key of input.sourceKeys) {
        const ref = bound.refs.find(ref => ref.id === key);
        if (!ref) throw new HttpFailure(403, "support_source_denied", "Only selected support evidence is available");
        // boundSupportToolActor has just rechecked original-source eligibility
        // and the exact captured fence. Reuse that retained passage, rather than
        // discovering a different chunk or losing its original dates/quality.
        const captured = bound.snapshot.evidence?.find((item: { citationKey: string }) => item.citationKey === key);
        if (!captured) throw new HttpFailure(409, "support_context_changed", "Selected evidence is no longer retained");
        evidence.push(captured);
      }
      result = { evidence };
    }
    const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    if (bound.counters.contextBytes + bytes > SUPPORT_ADVICE_LIMITS.contextBytes)
      throw new HttpFailure(429, "support_context_budget", "Support context limit reached; facts were not truncated");
    const receiptId = randomUUID();
    await db.query(`INSERT INTO support_advice_reads(id,attempt_id,call_id,tool_name,ordinal,request_digest,context_bytes)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [receiptId, bound.attemptId, callId, tool, bound.counters.readCalls + 1, requestDigest, bytes]);
    await db.query("INSERT INTO support_advice_read_payloads(receipt_id,payload) VALUES($1,$2::jsonb)", [receiptId, JSON.stringify(result)]);
    await db.query("UPDATE support_advice_attempts SET read_calls=read_calls+1,context_bytes=context_bytes+$2 WHERE id=$1", [bound.attemptId, bytes]);
    return result;
  });
}
