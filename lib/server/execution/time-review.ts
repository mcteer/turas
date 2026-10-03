import { enqueueExecutionSourceInvalidation } from "./invalidation";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { HttpFailure } from "../../contracts/http";
import { requireExecutionCapability, type ExecutionActor } from "./policy";
import type { ExecutionCommand } from "./schema";
import { requirePastServiceDate, type TimeExceptionCode } from "./time-schema";
import { timeHead, timeRevision, timeDependency } from "./time";
import { lockTimeDependencies } from "./time-inputs";
import { lockExecutionHead, advanceExecution } from "./baselines";
import { assertExecutionPreview } from "./previews";
import { currentActuals, lockActualDays, actualDayTotals, applyActualDays, type ActualContribution } from "./time-ledger";

type TimeReview = Extract<ExecutionCommand, { action: "time.approve" | "time.reject" | "time.reverse" }>;
export async function timeReviewInputs(db: PoolClient, actor: ExecutionActor, customerId: string, engagementId: string,
  command: Pick<TimeReview, "action" | "expectedVersions" | "payload">) {
  requireExecutionCapability(actor, "review");
  const requests = [...command.payload.entries].sort((a,b) => a.entryId.localeCompare(b.entryId));
  const discovered = [];
  for (const request of requests) {
    const head = await timeHead(db, actor, engagementId, request.entryId), revision = await timeRevision(db, head.id, request.revisionId);
    discovered.push({ head, revision, request });
  }
  const oldRows = await currentActuals(db, requests.map(r => r.entryId));
  const dependencies = await lockTimeDependencies(db, actor, customerId, engagementId, discovered.map(r => timeDependency(r.revision)), oldRows.map(r => r.resourceId));
  const execution = await lockExecutionHead(db, actor, engagementId, command.expectedVersions.execution);
  for (const row of discovered) {
    const head = await timeHead(db, actor, engagementId, row.head.id, true);
    const expectedRevision = command.action === "time.reverse" ? head.approved_revision_id : head.current_revision_id;
    if (Number(head.version) !== row.request.version || expectedRevision !== row.revision.id || row.request.contentDigest !== row.revision.content_digest)
      throw new HttpFailure(409, "stale_version", "Time review candidate changed; refresh");
    if (command.action !== "time.reverse" && head.state !== "submitted") throw new HttpFailure(422, "approval_blocked", "Submitted time candidates required");
    row.head = head;
  }
  const newRows: ActualContribution[] = command.action === "time.approve" ? discovered.map(({ revision: r }) => ({
    entryId: r.entry_id, revisionId: r.id, resourceId: r.resource_id, serviceDate: r.service_date, timezone: r.timezone,
    timezoneVersion: r.timezone_version, minutes: r.minutes, baselineId: r.baseline_id, workPackageKey: r.work_package_key, billable: r.billable,
  })) : command.action === "time.reject" ? oldRows : [];
  const locks = await lockActualDays(db, actor, oldRows, newRows), totals = actualDayTotals(locks);
  const exceptions = discovered.map(({ revision: row, request }) => {
    const codes: TimeExceptionCode[] = [];
    if (command.action === "time.approve") {
      requirePastServiceDate(row.service_date, row.timezone);
      const calendar = dependencies.calendars.get(`${row.resource_id}/${row.service_date}`)!;
      const day = locks.days.find(d => d.resourceId === row.resource_id && d.serviceDate === row.service_date)!;
      if (row.on_behalf || row.subject_membership_id !== row.actor_membership_id) codes.push("on_behalf");
      if (!dependencies.planned.get(`${row.activity_revision_id}/${row.resource_id}/${row.service_date}/${row.allocation_revision_id}/${row.billable}`)) codes.push("unplanned");
      if (calendar.capacity === null) codes.push("unknown_capacity");
      else if (totals.find(d => d.resourceId === row.resource_id && d.serviceDate === row.service_date)!.next > calendar.capacity) codes.push("over_capacity");
      if (!dependencies.evidence.get(row.activity_revision_id)?.eligible || execution.current_baseline_id !== row.baseline_id) codes.push("unavailable_source");
      if (execution.closeout_revision_id) codes.push("post_closeout");
      if (day.timezone !== row.timezone || day.timezoneVersion !== row.timezone_version) throw new HttpFailure(409, "source_changed", "Revise the entry to the established resource day timezone");
    }
    return { entryId: request.entryId, revisionId: request.revisionId, codes };
  });
  // Canonical date identity is set by first approval, and survives zeroed actuals.
  for (const { revision: row } of discovered) if (command.action === "time.approve") {
    const established = (await db.query(`SELECT timezone,timezone_version FROM execution_resource_days WHERE environment_id=$1 AND workspace_id=$2 AND resource_id=$3 AND service_date=$4`,
      [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, row.resource_id, row.service_date])).rows[0];
    const calendar = dependencies.calendars.get(`${row.resource_id}/${row.service_date}`)!;
    const timezone = established?.timezone ?? calendar.timezone ?? row.timezone;
    if (timezone !== row.timezone || (established?.timezone_version ?? calendar.timezoneVersion) !== row.timezone_version) throw new HttpFailure(409, "source_changed", "Revise the entry to the resolved resource day timezone");
  }
  const inputs = { action: command.action, expectedVersions: command.expectedVersions, payload: command.payload,
    generation: Number(execution.generation), closeoutRevisionId: execution.closeout_revision_id,
    heads: discovered.map(r => ({ id: r.head.id, version: Number(r.head.version), current: r.head.current_revision_id, approved: r.head.approved_revision_id })),
    evidence: [...dependencies.evidence.values()], calendars: [...dependencies.calendars], planned: [...dependencies.planned], days: locks.days, exceptions };
  return { execution, discovered, locks, inputs, exceptions };
}
export async function reviewTime(db: PoolClient, actor: ExecutionActor, customerId: string, engagementId: string, command: TimeReview) {
  const context = await timeReviewInputs(db, actor, customerId, engagementId, command);
  assertExecutionPreview(actor, context.inputs, command);
  for (const row of context.exceptions) {
    const provided = command.payload.entries.find(r => r.entryId === row.entryId)!.exceptions;
    if (row.codes.some(code => !provided[code])) throw new HttpFailure(422, "approval_blocked", "Every time exception requires its own reviewer rationale");
  }
  if (actualDayTotals(context.locks).some(d => d.next < 0 || d.next > 1440))
    throw new HttpFailure(422, "approval_blocked", "Approved daily effort must remain within 1440 minutes");
  const decisions = new Map<string, string>(), changed = [];
  for (const row of context.discovered) {
    const id = randomUUID(), version = Number(row.head.version) + 1; decisions.set(row.head.id, id);
    await db.query(`INSERT INTO execution_time_decisions(id,environment_id,workspace_id,customer_id,engagement_id,entry_id,revision_id,
      action,request_key,expected_version,preview_digest,actor_membership_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, engagementId, row.head.id, row.revision.id,
      command.action.slice(5), command.requestKey, row.request.version, command.previewDigest, actor.membershipId]);
    await db.query("INSERT INTO execution_time_decision_payloads(decision_id,rationale,exceptions) VALUES($1,$2,$3)", [id, command.rationale, JSON.stringify(row.request.exceptions)]);
    if (command.action === "time.approve") await db.query("UPDATE execution_time_entries SET approved_revision_id=$2,state='approved',version=$3 WHERE id=$1", [row.head.id, row.revision.id, version]);
    else if (command.action === "time.reject") await db.query("UPDATE execution_time_entries SET state='rejected',version=$2 WHERE id=$1", [row.head.id, version]);
    else await db.query("UPDATE execution_time_entries SET approved_revision_id=NULL,state=CASE WHEN current_revision_id=approved_revision_id THEN 'reversed' ELSE state END,version=$2 WHERE id=$1", [row.head.id, version]);
    if(row.head.approved_revision_id && (command.action==="time.reverse" || command.action==="time.approve" && row.head.approved_revision_id!==row.revision.id))
      await enqueueExecutionSourceInvalidation(db,"execution_time",row.head.approved_revision_id);
    changed.push({ id: row.head.id, version });
  }
  if (command.action !== "time.reject") {
    const materialized = await lockActualDays(db, actor, context.locks.oldRows, context.locks.newRows, true);
    await applyActualDays(db, actor, customerId, engagementId, materialized, decisions);
  }
  const next = await advanceExecution(db, context.execution, command.action !== "time.reject");
  return { state: "committed" as const, executionGeneration: next.generation, changed: [...changed, { id: context.execution.id, version: next.version }] };
}
