import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { HttpFailure, hiddenRecord } from "../../contracts/http";
import { executionTransaction, executionDigest } from "./commands";
import { executionCustomer, chargeExecutionRate } from "./locks";
import { isExecutionReviewer, lockExecutionActor, requireExecutionSubject, type ExecutionActor } from "./policy";
import { lockExecutionHead, advanceExecution } from "./baselines";
import { executionId, executionListSchema, executionPeriodSchema, type ExecutionCommand } from "./schema";
import { requirePastServiceDate, type TimeInput } from "./time-schema";
import { lockTimeDependencies } from "./time-inputs";
import { executionCursor, readExecutionCursor } from "./previews";

export type TimeHead = { id: string; author_membership_id: string; current_revision_id: string; approved_revision_id: string | null; state: string; version: string; created_at: Date };
export type TimeRevision = { id: string; entry_id: string; resource_id: string; author_membership_id: string; subject_membership_id: string | null;
  actor_membership_id: string; revision_number: string; baseline_id: string; work_package_key: string; service_date: string;
  timezone: string; timezone_version: string; minutes: number; billable: boolean; activity_revision_id: string;
  allocation_revision_id: string | null; content_digest: string; on_behalf: boolean; created_at: Date };
export async function timeHead(db: PoolClient, actor: ExecutionActor, engagementId: string, entryId: string, lock = false): Promise<TimeHead> {
  const row = (await db.query<TimeHead>(`SELECT * FROM execution_time_entries WHERE id=$1 AND environment_id=$2 AND workspace_id=$3
    AND engagement_id=$4 ${lock ? "FOR UPDATE" : ""}`, [entryId, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, engagementId])).rows[0];
  if (!row) throw hiddenRecord(); return row;
}
export async function timeRevision(db: PoolClient, entryId: string, revisionId: string): Promise<TimeRevision> {
  const row = (await db.query<TimeRevision>(`SELECT v.*,v.service_date::text,COALESCE(p.exception_proposals ? 'on_behalf',false) AS on_behalf
    FROM execution_time_revisions v LEFT JOIN execution_time_payloads p ON p.revision_id=v.id
    WHERE v.id=$1 AND v.entry_id=$2`, [revisionId, entryId])).rows[0];
  if (!row) throw hiddenRecord(); return row;
}
export function timeDependency(row: TimeRevision) {
  return { baselineId: row.baseline_id, resourceId: row.resource_id, workPackageKey: row.work_package_key, serviceDate: row.service_date,
    timezone: row.timezone, billable: row.billable, activityRevisionId: row.activity_revision_id, allocationRevisionId: row.allocation_revision_id };
}
function visible(actor: ExecutionActor, head: TimeHead, row: TimeRevision) {
  return isExecutionReviewer(actor) || head.author_membership_id === actor.membershipId || row.subject_membership_id === actor.membershipId;
}
export async function saveTime(db: PoolClient, actor: ExecutionActor, customerId: string, engagementId: string,
  command: Extract<ExecutionCommand, { action: "time.create" | "time.revise" }>) {
  const input = command.payload.time;
  requirePastServiceDate(input.serviceDate, input.timezone);
  if (input.onBehalfRationale && !isExecutionReviewer(actor)) throw new HttpFailure(403, "forbidden", "Only the reviewer can enter on behalf of a subject");
  const prior = command.action === "time.revise" ? await timeHead(db, actor, engagementId, command.payload.entryId) : null;
  const oldRevision = prior ? await timeRevision(db, prior.id, prior.current_revision_id) : null;
  if (prior && !isExecutionReviewer(actor) && prior.author_membership_id !== actor.membershipId) throw hiddenRecord();
  if (oldRevision && oldRevision.resource_id !== input.resourceId && !input.onBehalfRationale)
    throw new HttpFailure(403, "forbidden", "Changing a subject requires attributed reviewer entry");
  const dependencies = await lockTimeDependencies(db, actor, customerId, engagementId, [input], oldRevision ? [oldRevision.resource_id] : []);
  const subject = await requireExecutionSubject(db, actor, input.resourceId, { onBehalf: !!input.onBehalfRationale, customerId, serviceDate: input.serviceDate });
  const head = await lockExecutionHead(db, actor, engagementId, command.expectedVersions.execution);
  if (head.closeout_revision_id && !isExecutionReviewer(actor)) throw new HttpFailure(403, "forbidden", "Closed work requires reviewer entry");
  if (head.current_baseline_id !== input.baselineId && !isExecutionReviewer(actor)) throw new HttpFailure(409, "source_changed", "Current bound baseline required");
  let version = 1, id = prior?.id ?? randomUUID();
  if (prior && command.action === "time.revise") {
    const locked = await timeHead(db, actor, engagementId, id, true);
    if (Number(locked.version) !== command.expectedVersions.time || locked.current_revision_id !== prior.current_revision_id)
      throw new HttpFailure(409, "stale_version", "Time entry changed; refresh");
    if (["submitted", "reversed"].includes(locked.state)) throw new HttpFailure(422, "approval_blocked", "Time entry cannot be revised in this state");
    version = Number(locked.version) + 1;
  } else await db.query(`INSERT INTO execution_time_entries(id,environment_id,workspace_id,customer_id,engagement_id,author_membership_id)
    VALUES($1,$2,$3,$4,$5,$6)`, [id, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, engagementId, actor.membershipId]);
  const revisionId = randomUUID(), authorId = prior?.author_membership_id ?? actor.membershipId;
  const number = Number((await db.query("SELECT COALESCE(MAX(revision_number),0)+1 AS n FROM execution_time_revisions WHERE entry_id=$1", [id])).rows[0].n);
  const day = (await db.query(`SELECT timezone,timezone_version FROM execution_resource_days
    WHERE environment_id=$1 AND workspace_id=$2 AND resource_id=$3 AND service_date=$4`,
  [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, input.resourceId, input.serviceDate])).rows[0];
  const calendar = dependencies.calendars.get(`${input.resourceId}/${input.serviceDate}`)!;
  const timezoneVersion = day?.timezone === input.timezone ? day.timezone_version : calendar.timezoneVersion;
  const digest = executionDigest({ ...input, authorMembershipId: authorId, subjectMembershipId: subject.membershipId, timezoneVersion });
  await db.query(`INSERT INTO execution_time_revisions(id,environment_id,workspace_id,customer_id,engagement_id,entry_id,resource_id,author_membership_id,subject_membership_id,
    revision_number,baseline_id,work_package_key,service_date,timezone,timezone_version,minutes,billable,activity_revision_id,allocation_revision_id,content_digest,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
  [revisionId, process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, customerId, engagementId, id, input.resourceId, authorId, subject.membershipId,
    number, input.baselineId, input.workPackageKey, input.serviceDate, input.timezone, timezoneVersion, input.minutes, input.billable,
    input.activityRevisionId, input.allocationRevisionId, digest, actor.membershipId]);
  await db.query("INSERT INTO execution_time_payloads(revision_id,note,exception_proposals) VALUES($1,$2,$3)",
    [revisionId, input.note, JSON.stringify(input.onBehalfRationale ? { on_behalf: input.onBehalfRationale } : {})]);
  await db.query("UPDATE execution_time_entries SET current_revision_id=$2,version=$3,state='draft' WHERE id=$1", [id, revisionId, version]);
  const next = await advanceExecution(db, head);
  return { state: "committed" as const, executionGeneration: next.generation, changed: [{ id, version }, { id: head.id, version: next.version }] };
}
export async function submitTime(db: PoolClient, actor: ExecutionActor, customerId: string, engagementId: string,
  command: Extract<ExecutionCommand, { action: "time.submit" }>) {
  const prior = await timeHead(db, actor, engagementId, command.payload.entryId), row = await timeRevision(db, prior.id, command.payload.revisionId);
  if (!isExecutionReviewer(actor) && (prior.author_membership_id !== actor.membershipId || row.actor_membership_id !== actor.membershipId)) throw hiddenRecord();
  await lockTimeDependencies(db, actor, customerId, engagementId, [timeDependency(row)]);
  await requireExecutionSubject(db, actor, row.resource_id, { onBehalf: isExecutionReviewer(actor) && row.on_behalf, customerId, serviceDate: row.service_date });
  const execution = await lockExecutionHead(db, actor, engagementId, command.expectedVersions.execution), head = await timeHead(db, actor, engagementId, prior.id, true);
  if (Number(head.version) !== command.expectedVersions.time || head.current_revision_id !== row.id || row.content_digest !== command.payload.contentDigest)
    throw new HttpFailure(409, "stale_version", "Time entry changed; refresh");
  if (head.state !== "draft") throw new HttpFailure(422, "approval_blocked", "Only a draft time revision can be submitted");
  requirePastServiceDate(row.service_date, row.timezone);
  const version = Number(head.version) + 1;
  await db.query("UPDATE execution_time_entries SET state='submitted',version=$2 WHERE id=$1", [head.id, version]);
  await db.query(`INSERT INTO execution_time_decisions(id,environment_id,workspace_id,customer_id,engagement_id,entry_id,revision_id,action,request_key,expected_version,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,'submit',$8,$9,$10)`, [randomUUID(), process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId,
    customerId, engagementId, head.id, row.id, command.requestKey, command.expectedVersions.time, actor.membershipId]);
  const next = await advanceExecution(db, execution);
  return { state: "committed" as const, executionGeneration: next.generation, changed: [{ id: head.id, version }, { id: execution.id, version: next.version }] };
}
const listSchema = z.object({ ...executionPeriodSchema.shape, ...executionListSchema.shape,
  entryId: executionId.optional(), resourceId: executionId.optional(), review: z.literal("1").optional(), history: z.literal("1").optional() }).strict()
  .refine(v => executionPeriodSchema.safeParse({ from: v.from, to: v.to }).success)
  .refine(v => !v.history || !!v.entryId);
export async function readExecutionTime(actor: ExecutionActor, engagementId: string, raw: unknown) {
  const parsed = listSchema.safeParse(raw); if (!parsed.success) throw new HttpFailure(400, "invalid_input", "Invalid time filters");
  const input = parsed.data;
  return executionTransaction(async db => {
    const customerId = await executionCustomer(db, actor, engagementId);
    await lockExecutionActor(db, actor, customerId, "read"); await chargeExecutionRate(db, actor, "read");
    if ((input.review || input.resourceId) && !isExecutionReviewer(actor)) throw new HttpFailure(403, "forbidden", "Reviewer access required");
    const execution = (await db.query<{id:string;generation:string}>("SELECT id,generation FROM execution_workspaces WHERE engagement_id=$1 AND environment_id=$2 AND workspace_id=$3",
      [engagementId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0];
    if (!execution) throw hiddenRecord();
    const scope = { environment: process.env.TURAS_ENVIRONMENT_ID, workspace: actor.workspaceId, member: actor.membershipId,
      session: actor.sessionId, engagementId, generation: Number(execution.generation), ...input, cursor: undefined };
    const cursor = readExecutionCursor(input.cursor, scope);
    const ids = (await db.query<{ entry_id: string; revision_id: string; created_at: Date }>(`SELECT h.id AS entry_id,v.id AS revision_id,v.created_at
      FROM execution_time_entries h JOIN execution_time_revisions v ON v.entry_id=h.id
      WHERE h.environment_id=$1 AND h.workspace_id=$2 AND h.engagement_id=$3
        AND ($4 OR h.author_membership_id=$5 OR EXISTS(SELECT 1 FROM workforce_resources subject WHERE subject.id=v.resource_id AND subject.membership_id=$5))
        AND ($6::uuid IS NULL OR h.id=$6) AND ($7::uuid IS NULL OR v.resource_id=$7)
        AND ($8 OR v.id=h.current_revision_id) AND (NOT $9 OR h.state='submitted')
        AND (NOT $15 OR EXISTS(SELECT 1 FROM workforce_resources subject JOIN memberships member ON member.id=subject.membership_id
          WHERE subject.id=v.resource_id AND subject.membership_id=$5 AND subject.active AND subject.kind='partner'
            AND member.partner_org_id=subject.partner_organization_id
            AND EXISTS(SELECT 1 FROM workforce_partner_eligibility eligibility WHERE eligibility.id=(
              SELECT id FROM workforce_partner_eligibility WHERE resource_id=subject.id AND customer_id=h.customer_id
                AND from_date<=v.service_date AND to_date>=v.service_date ORDER BY revision_number DESC LIMIT 1) AND eligibility.state='active')))
        AND v.service_date BETWEEN $10 AND $11 AND ($12::timestamptz IS NULL OR (v.created_at,v.id)>($12,$13::uuid))
      ORDER BY v.created_at,v.id LIMIT $14`, [process.env.TURAS_ENVIRONMENT_ID, actor.workspaceId, engagementId, isExecutionReviewer(actor), actor.membershipId,
      input.entryId ?? null, input.resourceId ?? null, !!input.history, !!input.review, input.from, input.to, cursor?.lastAt ?? null, cursor?.lastId ?? null, input.limit + 1, actor.kind==="partner"])).rows;
    if (input.entryId && !ids.length) throw hiddenRecord();
    const selected = ids.slice(0, input.limit), entries = [];
    const metadata = [];
    for (const id of selected) metadata.push(await timeRevision(db,id.entry_id,id.revision_id));
    const dependencies = metadata.length ? await lockTimeDependencies(db,actor,customerId,engagementId,metadata.map(timeDependency)) : null;
    const locked = await lockExecutionHead(db,actor,engagementId);
    if (locked.generation !== execution.generation) throw new HttpFailure(409,"source_changed","Time list changed; refresh");
    for (const id of selected) {
      const head = await timeHead(db, actor, engagementId, id.entry_id), row = await timeRevision(db, head.id, id.revision_id);
      if (!visible(actor, head, row)) throw hiddenRecord();
      if(actor.kind==="partner")await requireExecutionSubject(db,actor,row.resource_id,{customerId,serviceDate:row.service_date});
      const eligible = dependencies?.evidence.get(row.activity_revision_id)?.eligible &&
        dependencies.resources.find(r=>r.id===row.resource_id)?.active;
      const baselineCurrent = (await db.query("SELECT active_baseline_id=$2 AS current FROM engagements WHERE id=$1", [engagementId, row.baseline_id])).rows[0]?.current;
      const payload = eligible && baselineCurrent ? (await db.query("SELECT note,exception_proposals FROM execution_time_payloads WHERE revision_id=$1", [row.id])).rows[0] : null;
      const approved = head.approved_revision_id ? await timeRevision(db, head.id, head.approved_revision_id) : null;
      const wasApproved = (await db.query("SELECT 1 FROM execution_time_decisions WHERE revision_id=$1 AND action='approve'", [row.id])).rowCount;
      const state = row.id === head.approved_revision_id ? "approved" : row.id === head.current_revision_id ? head.state : wasApproved ? "superseded" : "draft";
      entries.push({ id: head.id, revisionId: row.id, contentDigest: row.content_digest, version: Number(head.version), revisionNumber: Number(row.revision_number),
        state: row.id === head.current_revision_id ? head.state : state, approvedRevisionId: head.approved_revision_id, approvedContentDigest: approved?.content_digest ?? null,
        authorMembershipId: row.author_membership_id, subjectMembershipId: row.subject_membership_id, actorMembershipId: row.actor_membership_id,
        resourceId: row.resource_id, baselineId: row.baseline_id, workPackageKey: row.work_package_key, serviceDate: row.service_date,
        timezone: row.timezone, timezoneVersion: row.timezone_version, minutes: row.minutes, billable: row.billable,
        activityRevisionId: row.activity_revision_id, allocationRevisionId: row.allocation_revision_id,
        note: payload?.note as string | null ?? null, onBehalfRationale: payload?.exception_proposals?.on_behalf as string | null ?? null,
        reviewRequired: !eligible || !baselineCurrent || !payload, canRevise: (isExecutionReviewer(actor) || head.author_membership_id === actor.membershipId) && !["submitted", "reversed"].includes(head.state),
        canSubmit: row.actor_membership_id === actor.membershipId && (isExecutionReviewer(actor) || head.author_membership_id === actor.membershipId) && head.state === "draft", canReview: isExecutionReviewer(actor) && head.state === "submitted", canReverse: isExecutionReviewer(actor) && !!head.approved_revision_id });
    }
    const last = selected.at(-1);
    return { entries, generation: Number(execution.generation), nextCursor: ids.length > input.limit && last ? executionCursor(scope, last.created_at.toISOString(), last.revision_id) : null };
  });
}

/** Receipt identity never grants continuing subject authority. */
export async function authorizeTimeReceipt(db: PoolClient, actor: ExecutionActor, customerId: string, engagementId: string,
  action: string, entryId: string) {
  if (["time.approve", "time.reject", "time.reverse"].includes(action)) {
    if (!isExecutionReviewer(actor)) throw new HttpFailure(403, "forbidden", "Reviewer access required");
    return;
  }
  const head = await timeHead(db, actor, engagementId, entryId), row = await timeRevision(db, head.id, head.current_revision_id);
  if (!isExecutionReviewer(actor) && head.author_membership_id !== actor.membershipId) throw hiddenRecord();
  await requireExecutionSubject(db, actor, row.resource_id, { customerId, serviceDate: row.service_date,
    onBehalf: isExecutionReviewer(actor) && (row.on_behalf || row.subject_membership_id !== row.actor_membership_id) });
}

export async function readExecutionTimeOptions(actor: ExecutionActor, engagementId: string, raw: unknown) {
  const parsed = z.object({ date: executionPeriodSchema.shape.from, query: z.string().trim().max(100).default(""), resourceId: executionId.optional() }).strict().safeParse(raw);
  if (!parsed.success) throw new HttpFailure(400,"invalid_input","Invalid time selection filters");
  const input = parsed.data;
  return executionTransaction(async db => {
    const customerId = await executionCustomer(db,actor,engagementId);
    await lockExecutionActor(db,actor,customerId,"read"); await chargeExecutionRate(db,actor,"read");
    const reviewer = isExecutionReviewer(actor);
    const rows = (await db.query(`SELECT r.id,r.membership_id,r.active,p.display_name,p.timezone FROM workforce_resources r
      JOIN workforce_resource_payloads p ON p.revision_id=r.current_revision_id
      WHERE r.environment_id=$1 AND r.workspace_id=$2 AND ($3 OR (r.active AND r.membership_id=$4))
        AND ($5='' OR p.display_name ILIKE '%' || replace(replace(replace($5,'\\','\\\\'),'%','\\%'),'_','\\_') || '%')
        AND ($3 OR r.kind='internal' OR EXISTS(SELECT 1 FROM workforce_partner_eligibility e WHERE e.id=(
          SELECT id FROM workforce_partner_eligibility WHERE resource_id=r.id AND customer_id=$6 AND from_date<=$7 AND to_date>=$7 ORDER BY revision_number DESC LIMIT 1) AND e.state='active'))
      ORDER BY p.display_name,r.id LIMIT 51`, [process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,reviewer,actor.membershipId,input.query,customerId,input.date])).rows;
    if(rows.length>50)throw new HttpFailure(422,"scope_too_large","Narrow the subject search to at most 50 identities");
    if(input.resourceId&&!rows.some(r=>r.id===input.resourceId))throw hiddenRecord();
    const allocations = input.resourceId ? (await db.query(`SELECT day.revision_id,day.minutes,day.billable,r.work_package_key,r.baseline_id
      FROM staffing_allocation_days day JOIN staffing_allocations a ON a.id=day.allocation_id
      JOIN staffing_allocation_revisions v ON v.id=day.revision_id JOIN staffing_demand_revisions r ON r.id=v.demand_revision_id
      JOIN staffing_demands d ON d.id=v.demand_id JOIN engagements e ON e.id=r.engagement_id
      WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.customer_id=$3 AND r.engagement_id=$4 AND day.resource_id=$5
        AND day.service_date=$6 AND a.state='confirmed' AND a.confirmed_revision_id=v.id AND d.current_revision_id=r.id
        AND d.state='qualified' AND e.active_baseline_id=r.baseline_id ORDER BY r.work_package_key,day.revision_id LIMIT 51`,
      [process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,input.resourceId,input.date])).rows : [];
    if(allocations.length>50)throw new HttpFailure(422,"scope_too_large","Allocation selection exceeds the view limit");
    return { subjects:rows.map(r=>({id:r.id as string,label:r.display_name as string,active:r.active as boolean,
      own:r.membership_id===actor.membershipId,timezone:r.timezone as string})), allocations:allocations.map(r=>({revisionId:r.revision_id as string,
      minutes:r.minutes as number,billable:r.billable as boolean,workPackageKey:r.work_package_key as string,baselineId:r.baseline_id as string})) };
  });
}
