import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { query, withTransaction } from "../../lib/server/db/client";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { prepareExecutionAdvice } from "../../lib/server/execution/advisory";
import { readExecutionOverview } from "../../lib/server/execution/service";
import { settleDueExecutionAdvisories, claimExecutionCleanup, finishExecutionCleanup, runExecutionCleanupTick } from "../../lib/server/execution/maintenance";
import { registerFixture } from "../fixtures/execution/registers";

it("expires only due reservations and preserves unknown native usage through disabled metadata maintenance", async () => {
  const f = await registerFixture(), view = await readExecutionOverview(f.author, f.engagementId);
  const reserve = async () => {
    const chat = await createOwnedConversation(f.author, { customerId:f.customerId,requestKey:randomUUID(),title:"Lifecycle fixture" });
    return prepareExecutionAdvice(f.author,f.engagementId,{requestKey:randomUUID(),conversationId:chat.conversation.id,
      expectedGeneration:view.generation,from:"2026-10-02",to:"2026-10-02"});
  };
  const due = await reserve(), fresh = await reserve(), unknown = await reserve();
  await query("UPDATE execution_advice_attempts SET created_at=clock_timestamp()-interval '6 minutes' WHERE id=$1",[due.attemptId]);
  // Metadata fixture, not a native transport proof. Native restart is exercised
  // separately using the actual Eve provider receipt and selected owned stores.
  await query(`UPDATE execution_advice_attempts SET state='running',dispatch_at=clock_timestamp()-interval '121 seconds',deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1`,[unknown.attemptId]);
  const disabledBefore = process.env.TURAS_008_DISABLED;
  process.env.TURAS_008_DISABLED = "1";
  try {
    await query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1",[f.author.sessionId]);
    expect(await settleDueExecutionAdvisories()).toBe(2);
    expect(await settleDueExecutionAdvisories()).toBe(0);
    const states = (await query("SELECT id,state,failure_code FROM execution_advice_attempts WHERE id=ANY($1::uuid[])",[[due.attemptId,fresh.attemptId,unknown.attemptId]])).rows;
    expect(states.find(r=>r.id===due.attemptId)).toMatchObject({state:"expired",failure_code:"request_expired"});
    expect(states.find(r=>r.id===fresh.attemptId)).toMatchObject({state:"prepared"});
    expect(states.find(r=>r.id===unknown.attemptId)).toMatchObject({state:"unconfirmed",failure_code:"native_completion_unconfirmed"});
    expect((await query("SELECT count(*)::int AS n FROM execution_advice_usage")).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM response_attempts")).rows[0].n).toBe(0);
  } finally { if (disabledBefore === undefined) delete process.env.TURAS_008_DISABLED; else process.env.TURAS_008_DISABLED=disabledBefore; }
});

import { timeFixture, draftTime, submitTime, decideTime, timeCandidate } from "../fixtures/execution/time";
import { readExecutionRecords } from "../../lib/server/execution/service";
import { saveRegister, submitRegister, reviewRegister } from "../fixtures/execution/registers";
import { enqueueExecutionSourceInvalidation } from "../../lib/server/execution/invalidation";

it("retains withdrawn payloads for 30 days, fences lease replacement and preserves newer text plus numerical actuals", async () => {
  const f = await timeFixture();
  const entry = await submitTime(f,await draftTime(f));
  await decideTime(f,await timeCandidate(f,[entry]));
  const activity = (await readExecutionRecords(f.reviewer,f.engagementId,{recordId:f.activity.id})).records[0];
  const current = await saveRegister(f,{...activity.content!,title:"New reviewed activity"},{id:activity.id,version:activity.version});
  const submitted = await submitRegister(f,current); await reviewRegister(f,submitted);
  const jobs = (await query("SELECT * FROM execution_cleanup_jobs WHERE engagement_id=$1",[f.engagementId])).rows;
  expect(jobs.map(j=>j.payload_kind)).toEqual(expect.arrayContaining(["record","review","time","time_decision"]));
  expect(jobs.every(j=>j.due_at.getTime()-j.ineligible_at.getTime()>=30*86400000)).toBe(true);
  expect(await claimExecutionCleanup()).toEqual([]);
  const decisionsBefore=(await query("SELECT to_jsonb(d) AS row FROM execution_time_decisions d WHERE revision_id=$1 ORDER BY created_at,id",[entry.revisionId])).rows;
  const before = (await query("SELECT to_jsonb(d) AS row FROM execution_actual_days d WHERE engagement_id=$1",[f.engagementId])).rows;
  await query("UPDATE execution_cleanup_jobs SET ineligible_at=now()-interval '31 days',due_at=now()-interval '1 day' WHERE engagement_id=$1",[f.engagementId]);
  const first = await claimExecutionCleanup();
  expect(first.length).toBe(jobs.length);
  await query("UPDATE execution_cleanup_jobs SET lease_until=now()-interval '1 second' WHERE engagement_id=$1",[f.engagementId]);
  const replacement = await claimExecutionCleanup();
  for (const old of first) expect(await finishExecutionCleanup(old)).toBe(false);
  for (const live of replacement) expect(await finishExecutionCleanup(live)).toBe(true);
  expect((await query("SELECT 1 FROM execution_record_payloads WHERE revision_id=$1",[activity.revisionId])).rowCount).toBe(0);
  expect((await query("SELECT content->>'title' AS title FROM execution_record_payloads WHERE revision_id=$1",[submitted.revisionId])).rows[0].title).toBe("New reviewed activity");
  expect((await query("SELECT 1 FROM execution_time_payloads WHERE revision_id=$1",[entry.revisionId])).rowCount).toBe(0);
  expect((await query("SELECT to_jsonb(d) AS row FROM execution_actual_days d WHERE engagement_id=$1",[f.engagementId])).rows).toEqual(before);
  expect((await query("SELECT minutes FROM execution_time_revisions WHERE id=$1",[entry.revisionId])).rows[0].minutes).toBe(60);
  expect((await query("SELECT to_jsonb(d) AS row FROM execution_time_decisions d WHERE revision_id=$1 ORDER BY created_at,id",[entry.revisionId])).rows).toEqual(decisionsBefore);
  expect(await runExecutionCleanupTick()).toMatchObject({claimed:0,purged:0});
});

it("rechecks a current cause and rejects wrong digest or generation even with a live lease", async () => {
  const f=await timeFixture();
  // A queued notification is not proof of ineligibility: the source is current.
  await withTransaction(db=>enqueueExecutionSourceInvalidation(db,"execution_record",f.activity.revisionId));
  await query("UPDATE execution_cleanup_jobs SET ineligible_at=now()-interval '31 days',due_at=now()-interval '1 day' WHERE engagement_id=$1",[f.engagementId]);
  const [job]=await claimExecutionCleanup(); expect(job).toBeDefined();
  expect(await finishExecutionCleanup({...job,payload_digest:"0".repeat(64)})).toBe(false);
  expect(await finishExecutionCleanup({...job,source_generation:String(Number(job.source_generation)+1)})).toBe(false);
  expect(await finishExecutionCleanup(job)).toBe(false);
  expect((await query("SELECT 1 FROM execution_record_payloads WHERE revision_id=$1",[f.activity.revisionId])).rowCount).toBe(1);
});

it("claims at most 100 due jobs per tick with disjoint concurrent leases", async()=>{
  const f=await timeFixture();
  await withTransaction(db=>enqueueExecutionSourceInvalidation(db,"execution_record",f.activity.revisionId));
  await query(`INSERT INTO execution_cleanup_jobs(id,environment_id,workspace_id,customer_id,engagement_id,payload_kind,revision_id,payload_digest,
    source_generation,cause_kind,cause_revision_id,cause_digest,ineligible_at,due_at)
    SELECT gen_random_uuid(),environment_id,workspace_id,customer_id,engagement_id,payload_kind,revision_id,
      encode(sha256(convert_to(n::text,'UTF8')),'hex'),source_generation,cause_kind,cause_revision_id,cause_digest,
      now()-interval '31 days',now()-interval '1 day' FROM execution_cleanup_jobs CROSS JOIN generate_series(1,101) n
      WHERE engagement_id=$1 AND payload_kind='record'`,[f.engagementId]);
  const [a,b]=await Promise.all([claimExecutionCleanup(),claimExecutionCleanup()]);
  expect(a.length).toBeLessThanOrEqual(100);expect(b.length).toBeLessThanOrEqual(100);
  expect(new Set([...a,...b].map(j=>j.id)).size).toBe(101);
  for(const j of [...a,...b])expect(await finishExecutionCleanup(j)).toBe(false);
  expect((await query("SELECT 1 FROM execution_record_payloads WHERE revision_id=$1",[f.activity.revisionId])).rowCount).toBe(1);
});

import {replaceBaseline} from "../fixtures/execution/registers";
it("enqueues implicit baseline dependencies when 006 accepts a replacement",async()=>{
  const f=await timeFixture();const time=await draftTime(f);
  await replaceBaseline(f,{...f.content,title:"Reviewed replacement baseline"});
  const jobs=(await query("SELECT payload_kind,revision_id,cause_kind,cause_revision_id FROM execution_cleanup_jobs WHERE engagement_id=$1",[f.engagementId])).rows;
  expect(jobs).toEqual(expect.arrayContaining([
    expect.objectContaining({payload_kind:"record",revision_id:f.activity.revisionId,cause_kind:"milestone_baseline",cause_revision_id:f.baselineId}),
    expect.objectContaining({payload_kind:"time",revision_id:time.revisionId,cause_kind:"milestone_baseline",cause_revision_id:f.baselineId}),
  ]));
});
