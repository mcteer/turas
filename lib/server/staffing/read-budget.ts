import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure } from "../../contracts/http";
import { staffingIdSchema } from "../../contracts/staffing";
import { getServerConfig } from "../config";
import { parseStaffing, staffingSha256 } from "./commands";
import { staffingContextCharge } from "./model-budget";
import type { boundStaffingToolActor } from "./tool-actor";
import { staffingReadDependencySchema as dependencySchema, mergeStaffingDependencies } from "../../staffing/dependencies";
import type { StaffingReadDependency } from "../../staffing/dependencies";
export type { StaffingReadDependency } from "../../staffing/dependencies";
export type StaffingReadTool = "read_staffing_demand" | "match_staffing_resources" | "read_staffing_capacity" | "read_staffing_scenario";
type Bound = Awaited<ReturnType<typeof boundStaffingToolActor>>;
const unavailable = () => new HttpFailure(409, "staffing_context_changed", "Staffing explanation inputs changed");
async function requireReadClock(db: PoolClient, bound: Bound) {
  const now = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  if (now.getTime() >= bound.deadlineAt.getTime() || now.getTime() >= bound.actor.expiresAt.getTime()) throw unavailable();
}

/** Commit this admission transaction before executing the domain read. A crash
 * leaves its reservation durable; absence of a payload is unconfirmed and must
 * never automatically execute a second read under the same native call key. */
export async function reserveStaffingDomainRead(db: PoolClient, bound: Bound,
  input: { requestKey: string; tool: StaffingReadTool; request: unknown }) {
  const requestKey = parseStaffing(z.string().min(1).max(200), input.requestKey);
  const tool = parseStaffing(z.enum(["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "read_staffing_scenario"]), input.tool);
  if (!bound.consumedDependenciesFenced) throw unavailable();
  if (tool === "read_staffing_scenario" && (bound.scope.mode !== "finance" || !bound.scope.scenarioId)) {
    throw new HttpFailure(403, "staffing_tool_denied", "No finance scenario is bound to this explanation");
  }
  const requestDigest = staffingSha256({ tool, request: input.request });
  const prior = (await db.query(`SELECT id,request_digest,tool_name FROM staffing_advisory_read_receipts WHERE attempt_id=$1 AND request_key=$2`,
    [bound.attemptId, requestKey])).rows[0];
  if (prior) {
    if (prior.request_digest !== requestDigest || prior.tool_name !== tool) throw new HttpFailure(409, "request_key_conflict", "Staffing read identity already used");
    const payload = (await db.query("SELECT result FROM staffing_advisory_read_payloads WHERE receipt_id=$1 FOR SHARE", [prior.id])).rows[0];
    await requireReadClock(db, bound);
    // The caller's boundStaffingToolActor fence must revalidate the complete
    // consumed dependency union before exposing this already stored result.
    return payload ? { state: "replayed" as const, receiptId: prior.id as string, result: payload.result as unknown }
      : { state: "unconfirmed" as const, receiptId: prior.id as string };
  }
  const budget = staffingContextCharge(bound.counters, { bytes: 0, read: true, dependencyCount: bound.counters.dependencyCount });
  await requireReadClock(db, bound);
  const receiptId = randomUUID();
  await db.query(`INSERT INTO staffing_advisory_read_receipts(id,environment_id,workspace_id,attempt_id,ordinal,request_key,request_digest,tool_name)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [receiptId, getServerConfig().TURAS_ENVIRONMENT_ID, bound.actor.workspaceId,
    bound.attemptId, budget.readCalls, requestKey, requestDigest, tool]);
  await db.query("UPDATE staffing_advisory_attempts SET read_calls=$2,updated_at=clock_timestamp() WHERE id=$1", [bound.attemptId, budget.readCalls]);
  return { state: "admitted" as const, receiptId };
}

/** Call only after current source/dependency fencing and the attempt mutex in
 * boundStaffingToolActor. This helper does not retrieve arbitrary row JSON or
 * decide authorization. It durably reserves the exact result before release. */
export async function storeStaffingDomainRead(db: PoolClient, bound: Bound,
  input: { receiptId: string; requestKey: string; tool: StaffingReadTool; request: unknown; result: unknown; dependencies: StaffingReadDependency[] }) {
  const receiptId = parseStaffing(staffingIdSchema, input.receiptId);
  const requestKey = parseStaffing(z.string().min(1).max(200), input.requestKey);
  const tool = parseStaffing(z.enum(["read_staffing_demand", "match_staffing_resources", "read_staffing_capacity", "read_staffing_scenario"]), input.tool);
  if (!bound.consumedDependenciesFenced) throw unavailable();
  if (tool === "read_staffing_scenario" && (bound.scope.mode !== "finance" || !bound.scope.scenarioId)) {
    throw new HttpFailure(403, "staffing_tool_denied", "No finance scenario is bound to this explanation");
  }
  const dependencies = parseStaffing(z.array(dependencySchema).max(200), input.dependencies);
  const requestDigest = staffingSha256({ tool, request: input.request });
  const prior = (await db.query(`SELECT id,request_digest,tool_name FROM staffing_advisory_read_receipts WHERE attempt_id=$1 AND request_key=$2`,
    [bound.attemptId, requestKey])).rows[0];
  const consumed = (await db.query(`SELECT kind,input_id,revision_id,generation,content_digest FROM staffing_advisory_dependencies
    WHERE attempt_id=$1 ORDER BY kind,input_id,revision_id`, [bound.attemptId])).rows.map(row => dependencySchema.parse({ kind: row.kind,
      inputId: row.input_id, revisionId: row.revision_id, generation: Number(row.generation), contentDigest: row.content_digest }));
  if (consumed.length !== bound.counters.dependencyCount) throw unavailable();
  // Once consumed, an identity cannot silently acquire a new head or digest in
  // the same explanation. Authoritative fencing is still required for all old
  // identities, including those not mentioned by the current read.
  const union = mergeStaffingDependencies(consumed, dependencies);
  if (!prior || prior.id !== receiptId || prior.request_digest !== requestDigest || prior.tool_name !== tool) throw unavailable();
  const payload = (await db.query("SELECT result FROM staffing_advisory_read_payloads WHERE receipt_id=$1 FOR SHARE", [receiptId])).rows[0];
  if (payload) throw new HttpFailure(409, "staffing_read_already_settled", "Read result is already stored; reauthorize its receipt");
  const serialized = JSON.stringify(input.result);
  if (typeof serialized !== "string") throw unavailable();
  const budget = staffingContextCharge(bound.counters, { bytes: Buffer.byteLength(serialized, "utf8"), read: false, dependencyCount: union.length });
  const clock = (await db.query("SELECT clock_timestamp() AS now")).rows[0].now as Date;
  if (clock.getTime() >= bound.deadlineAt.getTime() || clock.getTime() >= bound.actor.expiresAt.getTime()) throw unavailable();
  const env = getServerConfig().TURAS_ENVIRONMENT_ID;
  const existing = new Set(consumed.map(dep => `${dep.kind}/${dep.inputId}/${dep.revisionId}`));
  for (const dep of union) if (!existing.has(`${dep.kind}/${dep.inputId}/${dep.revisionId}`)) await db.query(`INSERT INTO staffing_advisory_dependencies
    (id,environment_id,workspace_id,attempt_id,kind,input_id,revision_id,generation,content_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), env, bound.actor.workspaceId, bound.attemptId, dep.kind, dep.inputId, dep.revisionId, dep.generation, dep.contentDigest]);
  await db.query("INSERT INTO staffing_advisory_read_payloads(receipt_id,result) VALUES($1,$2)", [receiptId, serialized]);
  await db.query(`UPDATE staffing_advisory_attempts SET read_calls=$2,context_bytes=$3,dependency_count=$4,updated_at=clock_timestamp() WHERE id=$1`,
    [bound.attemptId, budget.readCalls, budget.contextBytes, budget.dependencyCount]);
  await requireReadClock(db, bound);
  return input.result;
}
