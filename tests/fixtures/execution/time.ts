import { randomUUID } from "node:crypto";
import { withTransaction } from "../../../lib/server/db/client";
import { createExecutionBaseline } from "./baseline";
import { createResource } from "../../../lib/server/staffing/resources";
import { syntheticResource } from "../staffing/seed";
import { approveCalendar } from "../../../lib/server/staffing/calendars";
import { submitExecutionCommand, readExecutionOverview, readExecutionRecords, previewExecutionCommand } from "../../../lib/server/execution/service";
import { readExecutionTime } from "../../../lib/server/execution/time";
import type { ExecutionActor } from "../../../lib/server/execution/policy";

export const timeCommand = (action: string, expectedVersions: Record<string, number>, payload: unknown) =>
  ({ version: "execution-v1", action, requestKey: randomUUID(), expectedVersions, payload });
export async function timeFixture(options: { calendar?: boolean; linked?: boolean; customerId?: string } = {}) {
  const f = await withTransaction(db => createExecutionBaseline(db, { customerId: options.customerId }));
  const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  // A single current link is reused within this suite; synthetic history remains immutable.
  const existing = options.linked === false ? null : await withTransaction(async db =>
    (await db.query("SELECT id FROM workforce_resources WHERE membership_id=$1", [f.author.membershipId])).rows[0]);
  const resourceId = existing?.id ?? (await createResource(f.reviewer, {
    requestKey: randomUUID(), rationale: "Human reviewed synthetic time subject",
    resource: { ...syntheticResource(), timezone: "UTC", membershipId: options.linked === false ? null : f.author.membershipId },
  })).resourceId!;
  if (options.calendar && !existing) await approveCalendar(f.reviewer, resourceId, {
    requestKey: randomUUID(), rationale: "Human confirmed synthetic historical capacity",
    calendar: { timezone: "UTC", observedAt: new Date(Date.now() - 10000).toISOString(),
      nextReviewAt: new Date(Date.now() + 86400000).toISOString(), fromDate: date, toDate: date,
      days: [{ date, contracted: [{ date, from: `${date}T09:00`, to: `${date}T17:00`, fromOffset: null, toOffset: null }], holidays: [], leave: [], protected: [] }] },
  });
  await submitExecutionCommand(f.author, f.engagementId, timeCommand("setup", { baseline: 1, plan: f.decision.aggregateVersion }, { baselineId: f.baselineId }));
  let view = await readExecutionOverview(f.author, f.engagementId);
  await submitExecutionCommand(f.author, f.engagementId, timeCommand("record.create", { execution: view.version }, { baselineId: f.baselineId, record: {
    kind: "activity", subtype: "work", title: "Synthetic observed work", narrative: "A reviewer checked this synthetic delivery activity.",
    audience: "delivery", eventDate: date, timezone: "UTC", workPackageKey: "proof", milestoneKeys: [],
    ownerMembershipId: null, unknownOwnerReason: "Owner not assigned", references: [],
  } }));
  let activity = (await readExecutionRecords(f.author, f.engagementId, {})).records[0];
  view = await readExecutionOverview(f.author, f.engagementId);
  await submitExecutionCommand(f.author, f.engagementId, timeCommand("record.submit", { execution: view.version, record: activity.version },
    { recordId: activity.id, revisionId: activity.revisionId, contentDigest: activity.contentDigest }));
  activity = (await readExecutionRecords(f.reviewer, f.engagementId, {})).records[0];
  view = await readExecutionOverview(f.reviewer, f.engagementId);
  const candidate = { version: "execution-v1", action: "record.accept", expectedVersions: { execution: view.version, record: activity.version },
    payload: { recordId: activity.id, revisionId: activity.revisionId, contentDigest: activity.contentDigest } };
  await submitExecutionCommand(f.reviewer, f.engagementId, { ...candidate, ...await previewExecutionCommand(f.reviewer, f.engagementId, candidate),
    requestKey: randomUUID(), rationale: "Human reviewed synthetic activity before time" });
  return { ...f, date, resourceId, activity, period: { from: date, to: date }, time: {
    baselineId: f.baselineId, resourceId, workPackageKey: "proof", serviceDate: date, timezone: "UTC",
    minutes: 60, billable: true, activityRevisionId: activity.revisionId, allocationRevisionId: null,
    note: "PRIVATE_TIME_NOTE_SENTINEL", onBehalfRationale: null,
  } };
}
export type TimeFixture = Awaited<ReturnType<typeof timeFixture>>;
export async function draftTime(f: TimeFixture, changes: Record<string, unknown> = {}, actor: ExecutionActor = f.author) {
  const view = await readExecutionOverview(actor, f.engagementId);
  const result = await submitExecutionCommand(actor, f.engagementId, timeCommand("time.create", { execution: view.version }, { time: { ...f.time, ...changes } }));
  return (await readExecutionTime(actor, f.engagementId, { ...f.period, entryId: result.changed[0].id })).entries[0];
}
export async function submitTime(f: TimeFixture, entry: Awaited<ReturnType<typeof draftTime>>, actor: ExecutionActor = f.author) {
  const view = await readExecutionOverview(actor, f.engagementId);
  await submitExecutionCommand(actor, f.engagementId, timeCommand("time.submit", { execution: view.version, time: entry.version },
    { entryId: entry.id, revisionId: entry.revisionId, contentDigest: entry.contentDigest }));
  return (await readExecutionTime(actor, f.engagementId, { ...f.period, entryId: entry.id })).entries[0];
}
export async function timeCandidate(f: TimeFixture, entries: Awaited<ReturnType<typeof draftTime>>[], action = "time.approve", exceptions: Record<string, string> = {
  unplanned: "Human confirms work occurred without a booking", unknown_capacity: "Human confirms UTC for the uncovered historical day",
}) {
  const view = await readExecutionOverview(f.reviewer, f.engagementId);
  return { version: "execution-v1", action, expectedVersions: { execution: view.version }, payload: { entries: entries.map(e => ({
    entryId: e.id, revisionId: action === "time.reverse" ? e.approvedRevisionId : e.revisionId,
    contentDigest: action === "time.reverse" ? e.approvedContentDigest : e.contentDigest, version: e.version, exceptions,
  })) } };
}
export async function decideTime(f: TimeFixture, candidate: Awaited<ReturnType<typeof timeCandidate>>) {
  const preview = await previewExecutionCommand(f.reviewer, f.engagementId, candidate);
  return submitExecutionCommand(f.reviewer, f.engagementId, { ...candidate, previewDigest: preview.previewDigest,
    previewExpiresAt: preview.previewExpiresAt, requestKey: randomUUID(), rationale: "Human verified exact synthetic daily actuals" });
}
