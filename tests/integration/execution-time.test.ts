import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { timeFixture, draftTime, submitTime, timeCandidate, decideTime, timeCommand } from "../fixtures/execution/time";
import { readExecutionOverview, submitExecutionCommand, previewExecutionCommand, readExecutionRecords } from "../../lib/server/execution/service";
import { readExecutionTime } from "../../lib/server/execution/time";
const total = (id: string) => withTransaction(async db => Number((await db.query("SELECT COALESCE(SUM(minutes),0) AS n FROM execution_actual_days WHERE engagement_id=$1", [id])).rows[0].n));

describe("atomic reviewed daily effort", () => {
  it("requires each independent exception and preserves approved actuals during correction and exactly-once reversal", async () => {
    const f = await timeFixture({ calendar: true });
    let entry = await submitTime(f, await draftTime(f, { minutes: 600 }));
    const absent = await timeCandidate(f, [entry], "time.approve", {});
    const preview = await previewExecutionCommand(f.reviewer, f.engagementId, absent);
    expect("exceptions" in preview ? preview.exceptions[0].codes.sort() : []).toEqual(["over_capacity", "unplanned"]);
    await expect(decideTime(f, absent)).rejects.toMatchObject({ status: 422 });
    await decideTime(f, await timeCandidate(f, [entry], "time.approve", { unplanned: "Unbooked work verified", over_capacity: "Extra work verified independently of planned capacity" }));
    expect(await total(f.engagementId)).toBe(600);
    entry = (await readExecutionTime(f.author, f.engagementId, f.period)).entries[0];
    let view = await readExecutionOverview(f.author, f.engagementId);
    await submitExecutionCommand(f.author, f.engagementId, timeCommand("time.revise", { execution: view.version, time: entry.version },
      { entryId: entry.id, time: { ...f.time, minutes: 120, note: "Corrected synthetic actual" } }));
    expect(await total(f.engagementId)).toBe(600);
    entry = await submitTime(f, (await readExecutionTime(f.author, f.engagementId, f.period)).entries[0]);
    expect(await total(f.engagementId)).toBe(600);
    await decideTime(f, await timeCandidate(f, [entry], "time.approve", { unplanned: "Reviewed actual without booking" }));
    expect(await total(f.engagementId)).toBe(120);
    entry = (await readExecutionTime(f.author, f.engagementId, f.period)).entries[0];
    const reverse = await timeCandidate(f, [entry], "time.reverse", {}), proof = await previewExecutionCommand(f.reviewer, f.engagementId, reverse);
    const command = { ...reverse, previewDigest: proof.previewDigest, previewExpiresAt: proof.previewExpiresAt,
      requestKey: randomUUID(), rationale: "Human verified duplicate source and reversed this exact revision" };
    const receipt = await submitExecutionCommand(f.reviewer, f.engagementId, command);
    expect(await submitExecutionCommand(f.reviewer, f.engagementId, command)).toEqual(receipt);
    expect(await total(f.engagementId)).toBe(0);
    const history = await readExecutionTime(f.author, f.engagementId, { ...f.period, entryId: entry.id, history: "1" });
    expect(history.entries.map(e => e.minutes)).toEqual([600, 120]);
    expect(history.entries.at(-1)?.state).toBe("reversed");
  });
  it("rolls back the complete approval batch after ledger writes fail and preserves numerical history after evidence retracts", async () => {
    const f = await timeFixture({ linked: false });
    const author = f.reviewer, patch = { onBehalfRationale: "Human verified historical unlinked resource" };
    const first = await submitTime(f, await draftTime(f, patch, author), author);
    const second = await submitTime(f, await draftTime(f, { ...patch, minutes: 30 }, author), author);
    const rows = await readExecutionTime(author, f.engagementId, f.period);
    const candidate = await timeCandidate(f, rows.entries, "time.approve", { on_behalf: "Human verified subject", unplanned: "No booking", unknown_capacity: "UTC day confirmed" });
    // A real database failure after the contribution write must roll back decisions,
    // day totals, both entry heads and the command receipt in the same transaction.
    await withTransaction(db => db.query(`CREATE FUNCTION execution_test_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_abort'; END $$;
      CREATE TRIGGER execution_test_abort AFTER INSERT ON execution_actual_days FOR EACH STATEMENT EXECUTE FUNCTION execution_test_abort()`));
    try { await expect(decideTime(f, candidate)).rejects.toThrow(); }
    finally { await withTransaction(db => db.query("DROP TRIGGER execution_test_abort ON execution_actual_days; DROP FUNCTION execution_test_abort()")); }
    expect(await total(f.engagementId)).toBe(0);
    expect((await readExecutionTime(author, f.engagementId, f.period)).entries.every(e => e.state === "submitted")).toBe(true);
    await decideTime(f, candidate); expect(await total(f.engagementId)).toBe(90);
    const activity = (await readExecutionRecords(author, f.engagementId, {})).records[0], view = await readExecutionOverview(author, f.engagementId);
    const retract = { version: "execution-v1", action: "record.retract", expectedVersions: { execution: view.version, record: activity.version },
      payload: { recordId: activity.id, revisionId: activity.revisionId, contentDigest: activity.contentDigest } };
    await submitExecutionCommand(author, f.engagementId, { ...retract, ...await previewExecutionCommand(author, f.engagementId, retract), requestKey: randomUUID(), rationale: "Withdraw activity acceptance" });
    const withheld = await readExecutionTime(author, f.engagementId, f.period);
    expect(withheld.entries.every(e => e.reviewRequired && e.note === null)).toBe(true);
    expect(await total(f.engagementId)).toBe(90);
    expect(withheld.entries.map(e => e.id).sort()).toEqual([first.id, second.id].sort());
  });
});

it("requires revised timezone identity and keeps the canonical day even after reversal", async () => {
  const f = await timeFixture({ linked:false }), author=f.reviewer;
  const patch={onBehalfRationale:"Reviewer confirms prior work",minutes:1};
  const first=await submitTime(f,await draftTime(f,patch,author),author);
  const reasons={on_behalf:"Attribution checked",unplanned:"Unbooked work",unknown_capacity:"UTC date confirmed"};
  await decideTime(f,await timeCandidate(f,[first],"time.approve",reasons));
  const approved=(await readExecutionTime(author,f.engagementId,f.period)).entries[0];
  await decideTime(f,await timeCandidate(f,[approved],"time.reverse",{}));
  const second=await submitTime(f,await draftTime(f,{...patch,timezone:"America/Denver"},author),author);
  await expect(previewExecutionCommand(author,f.engagementId,await timeCandidate(f,[second],"time.approve",reasons))).rejects.toMatchObject({status:409});
  expect(await total(f.engagementId)).toBe(0);
  expect(await withTransaction(async db=>(await db.query("SELECT timezone,approved_minutes FROM execution_resource_days WHERE resource_id=$1 AND service_date=$2",[f.resourceId,f.date])).rows[0])).toEqual({timezone:"UTC",approved_minutes:0});
  const candidate=await timeCandidate(f,[second],"time.reject",{});
  await expect(previewExecutionCommand(author,f.engagementId,{...candidate,payload:{entries:[...candidate.payload.entries,...candidate.payload.entries]}})).rejects.toMatchObject({status:400});
});

it("isolates withdrawn evidence per row and approves only numerical actuals with an explicit source exception", async () => {
  const f=await timeFixture();
  const original=(await readExecutionRecords(f.author,f.engagementId,{})).records[0];
  let view=await readExecutionOverview(f.author,f.engagementId);
  const created=await submitExecutionCommand(f.author,f.engagementId,timeCommand("record.create",{execution:view.version},
    {baselineId:f.baselineId,record:{...original.content,title:"Independent valid activity"}}));
  let other=(await readExecutionRecords(f.author,f.engagementId,{})).records.find(r=>r.id===created.changed[0].id)!;
  view=await readExecutionOverview(f.author,f.engagementId);
  await submitExecutionCommand(f.author,f.engagementId,timeCommand("record.submit",{execution:view.version,record:other.version},
    {recordId:other.id,revisionId:other.revisionId,contentDigest:other.contentDigest}));
  other=(await readExecutionRecords(f.reviewer,f.engagementId,{})).records.find(r=>r.id===other.id)!;
  view=await readExecutionOverview(f.reviewer,f.engagementId);
  const accept={version:"execution-v1",action:"record.accept",expectedVersions:{execution:view.version,record:other.version},
    payload:{recordId:other.id,revisionId:other.revisionId,contentDigest:other.contentDigest}};
  await submitExecutionCommand(f.reviewer,f.engagementId,{...accept,...await previewExecutionCommand(f.reviewer,f.engagementId,accept),requestKey:randomUUID(),rationale:"Independent human review"});
  const first=await submitTime(f,await draftTime(f));
  const second=await submitTime(f,await draftTime(f,{activityRevisionId:other.revisionId,note:"Independently eligible note"}));
  view=await readExecutionOverview(f.reviewer,f.engagementId);
  const retract={version:"execution-v1",action:"record.retract",expectedVersions:{execution:view.version,record:original.version},
    payload:{recordId:original.id,revisionId:original.revisionId,contentDigest:original.contentDigest}};
  await submitExecutionCommand(f.reviewer,f.engagementId,{...retract,...await previewExecutionCommand(f.reviewer,f.engagementId,retract),requestKey:randomUUID(),rationale:"Source no longer accepted"});
  const rows=(await readExecutionTime(f.reviewer,f.engagementId,f.period)).entries;
  expect(rows.find(r=>r.id===first.id)).toMatchObject({note:null,reviewRequired:true});
  expect(rows.find(r=>r.id===second.id)).toMatchObject({note:"Independently eligible note",reviewRequired:false});
  const candidate=await timeCandidate(f,rows),preview=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
  expect("exceptions" in preview && preview.exceptions.find(r=>r.entryId===first.id)?.codes).toContain("unavailable_source");
  expect("exceptions" in preview && preview.exceptions.find(r=>r.entryId===second.id)?.codes).not.toContain("unavailable_source");
  await expect(decideTime(f,candidate)).rejects.toMatchObject({status:422});
  candidate.payload.entries.find(r=>r.entryId===first.id)!.exceptions.unavailable_source="Human confirms numerical work only; withdrawn prose remains unavailable";
  await decideTime(f,candidate);
  expect(await total(f.engagementId)).toBe(120);
  expect((await readExecutionTime(f.reviewer,f.engagementId,f.period)).entries.find(r=>r.id===first.id)).toMatchObject({note:null,reviewRequired:true,state:"approved"});
});
