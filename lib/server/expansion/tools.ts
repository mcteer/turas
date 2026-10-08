import {failExpansionNativeAttempt} from "./native-failure";
import { randomUUID } from "node:crypto";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { EXPANSION_ADVICE_LIMITS, expansionHypothesesToolSchema, expansionEvidenceToolSchema } from "../../expansion/advice";
import { expansionSkillMarkdown } from "../../expansion/skill-text";
import type { FeaturePrincipal } from "../conversations/feature";
import { expansionTransaction } from "./service";
import { boundExpansionToolActor } from "./tool-actor";
import { expansionReadSchemas } from "./model-budget";
import { expansionHash } from "./commands";
import { decodeExpansionCursor, encodeExpansionCursor } from "./advice-cursor";

export async function runExpansionRead(principal: FeaturePrincipal, tool: keyof typeof expansionReadSchemas, raw: unknown, callId: string) {
  if (!callId || callId.length > 200 || !Object.hasOwn(expansionReadSchemas, tool)) throw hiddenRecord();
  const parsed = expansionReadSchemas[tool].safeParse(raw);
  if (!parsed.success) {await failExpansionNativeAttempt(principal,"invalid_tool_input");throw new HttpFailure(400, "invalid_tool_input", "Invalid bound expansion read");}
  const requestDigest = expansionHash({ tool, request: parsed.data });
  try{return await expansionTransaction(async db => {
    const bound = await boundExpansionToolActor(db, principal);
    const prior = (await db.query(`SELECT r.request_digest,p.payload FROM expansion_advice_reads r
      LEFT JOIN expansion_advice_read_payloads p ON p.receipt_id=r.id WHERE r.attempt_id=$1 AND r.call_id=$2`, [bound.attemptId, callId])).rows[0];
    if (prior) {
      if (prior.request_digest !== requestDigest) throw new HttpFailure(409, "key_conflict", "Tool call identity changed");
      if (!prior.payload) throw new HttpFailure(409, "expansion_read_unconfirmed", "The prior read is not retained");
      return prior.payload;
    }
    if (bound.counters.readCalls >= EXPANSION_ADVICE_LIMITS.reads) throw new HttpFailure(429, "expansion_read_budget", "Expansion read limit reached");
    let result: unknown;
    if (tool === "load_skill") result = expansionSkillMarkdown;
    else if (tool === "expansion_summary") {
      const { hypotheses: _hypotheses, evidence: _evidence, ...summary } = bound.snapshot;
      result = summary;
    } else if (tool === "expansion_hypotheses") {
      const input = expansionHypothesesToolSchema.parse(parsed.data);
      const binding = expansionHash({ attempt: bound.attemptId, disposition: input.disposition ?? null, limit: input.limit });
      const generation = expansionHash(bound.snapshot);
      const offset = input.cursor ? decodeExpansionCursor(input.cursor, binding, generation) : 0;
      const rows=bound.snapshot.hypotheses.filter((row:{disposition:string})=>!input.disposition||row.disposition===input.disposition);
      result={hypotheses:rows.slice(offset,offset+input.limit),nextCursor:rows.length>offset+input.limit?encodeExpansionCursor(binding,generation,offset+input.limit):null};
    } else {
      const input = expansionEvidenceToolSchema.parse(parsed.data), evidence = [];
      for (const key of input.sourceKeys) {
        const ref = bound.refs.find(ref => ref.id === key);
        if (!ref) throw new HttpFailure(403, "expansion_source_denied", "Only selected expansion evidence is available");
        // boundExpansionToolActor has just rechecked original-source eligibility
        // and the exact captured fence. Reuse that retained passage, rather than
        // discovering a different chunk or losing its original dates/quality.
        const captured = bound.snapshot.evidence?.find((item: { citationKey: string }) => item.citationKey === key);
        if (!captured) throw new HttpFailure(409, "expansion_context_changed", "Selected evidence is no longer retained");
        evidence.push(captured);
      }
      result = { evidence };
    }
    const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    if (bound.counters.contextBytes + bytes > EXPANSION_ADVICE_LIMITS.contextBytes)
      throw new HttpFailure(429, "expansion_context_budget", "Expansion context limit reached; facts were not truncated");
    const receiptId = randomUUID();
    await db.query(`INSERT INTO expansion_advice_reads(id,attempt_id,call_id,tool_name,ordinal,request_digest,context_bytes)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [receiptId, bound.attemptId, callId, tool, bound.counters.readCalls + 1, requestDigest, bytes]);
    await db.query("INSERT INTO expansion_advice_read_payloads(receipt_id,payload) VALUES($1,$2::jsonb)", [receiptId, JSON.stringify(result)]);
    await db.query("UPDATE expansion_advice_attempts SET read_calls=read_calls+1,context_bytes=context_bytes+$2 WHERE id=$1", [bound.attemptId, bytes]);
    return result;
  });}catch(error){await failExpansionNativeAttempt(principal,error instanceof HttpFailure?error.code:"invalid_native_read");throw error;}
}
