import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { createResource } from "../../lib/server/staffing/resources";
import { syntheticResource } from "../fixtures/staffing/seed";
import { timeFixture, draftTime, submitTime, timeCandidate, decideTime, timeCommand } from "../fixtures/execution/time";
import { readExecutionOverview, submitExecutionCommand, previewExecutionCommand } from "../../lib/server/execution/service";
import { readExecutionTime } from "../../lib/server/execution/time";
async function prepared(f: Awaited<ReturnType<typeof timeFixture>>, candidate: Awaited<ReturnType<typeof timeCandidate>>) {
  const proof = await previewExecutionCommand(f.reviewer, f.engagementId, candidate);
  return { ...candidate, previewDigest: proof.previewDigest, previewExpiresAt: proof.previewExpiresAt,
    requestKey: randomUUID(), rationale: "Human verified exact concurrent time review" };
}
const totals = (resourceId: string) => withTransaction(async db => (await db.query(`SELECT service_date::text,approved_minutes,timezone
  FROM execution_resource_days WHERE resource_id=$1 ORDER BY service_date`, [resourceId])).rows);

describe("time ledger concurrency", () => {
  it("invalidates a cross-customer preview when another approval and reversal restore the same daily total",async()=>{
    const a=await timeFixture({linked:false}),b=await timeFixture({linked:false,customerId:DEMO_IDS.deniedCustomer});
    const patch={resourceId:a.resourceId,onBehalfRationale:"Human transcribes historical subject time"},reasons={on_behalf:"Human confirms attribution",unplanned:"Historical unbooked work",unknown_capacity:"Human confirms UTC date"};
    const ea=await submitTime(a,await draftTime(a,patch,a.reviewer),a.reviewer),eb=await submitTime(b,await draftTime(b,patch,b.reviewer),b.reviewer);
    const stale=await prepared(a,await timeCandidate(a,[ea],"time.approve",reasons));
    await decideTime(b,await timeCandidate(b,[eb],"time.approve",reasons));
    const approved=(await readExecutionTime(b.reviewer,b.engagementId,b.period)).entries[0];
    await decideTime(b,await timeCandidate(b,[approved],"time.reverse",{}));
    expect((await totals(a.resourceId))[0].approved_minutes).toBe(0);
    await expect(submitExecutionCommand(a.reviewer,a.engagementId,stale)).rejects.toMatchObject({status:409});
    expect(await withTransaction(async db=>(await db.query("SELECT 1 FROM execution_command_receipts WHERE request_key=$1",[stale.requestKey])).rowCount)).toBe(0);
    await decideTime(a,await timeCandidate(a,[ea],"time.approve",reasons));
    expect(await withTransaction(async db=>(await db.query("SELECT generation FROM execution_resource_days WHERE resource_id=$1 AND service_date=$2",[a.resourceId,a.date])).rows[0].generation)).toBe("3");
  });
  it("serializes first approvals across customers and enforces 1440 without a partial receipt or contribution", async () => {
    const a = await timeFixture(), b = await timeFixture({ customerId: DEMO_IDS.deniedCustomer });
    expect(a.resourceId).toBe(b.resourceId);
    const ea = await submitTime(a, await draftTime(a, { minutes: 720 }));
    const eb = await submitTime(b, await draftTime(b, { minutes: 721 }));
    const ca = await prepared(a, await timeCandidate(a, [ea])), cb = await prepared(b, await timeCandidate(b, [eb]));
    const settled = await Promise.allSettled([submitExecutionCommand(a.reviewer, a.engagementId, ca), submitExecutionCommand(b.reviewer, b.engagementId, cb)]);
    expect(settled.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(r => r.status === "rejected")).toHaveLength(1);
    const resourceDays = await totals(a.resourceId);
    expect(resourceDays).toHaveLength(1); expect([720, 721]).toContain(resourceDays[0].approved_minutes);
    await withTransaction(async db => {
      expect(Number((await db.query("SELECT SUM(minutes) AS n FROM execution_actual_days WHERE resource_id=$1", [a.resourceId])).rows[0].n)).toBe(resourceDays[0].approved_minutes);
      expect((await db.query("SELECT 1 FROM execution_command_receipts WHERE request_key=ANY($1::uuid[])", [[ca.requestKey, cb.requestKey]])).rowCount).toBe(1);
    });
    const loser = settled[0].status === "rejected" ? a : b;
    let row = (await readExecutionTime(loser.author, loser.engagementId, loser.period)).entries[0];
    await expect(decideTime(loser, await timeCandidate(loser, [row]))).rejects.toMatchObject({ status: 422 });
    // Reject the pending candidate, explicitly revise it, then fill the exact boundary.
    await decideTime(loser, await timeCandidate(loser, [row], "time.reject", {}));
    row = (await readExecutionTime(loser.author, loser.engagementId, loser.period)).entries[0];
    const view = await readExecutionOverview(loser.author, loser.engagementId);
    await submitExecutionCommand(loser.author, loser.engagementId, timeCommand("time.revise", { execution: view.version, time: row.version },
      { entryId: row.id, time: { ...loser.time, minutes: 1440 - resourceDays[0].approved_minutes } }));
    row = await submitTime(loser, (await readExecutionTime(loser.author, loser.engagementId, loser.period)).entries[0]);
    await decideTime(loser, await timeCandidate(loser, [row]));
    expect((await totals(a.resourceId))[0].approved_minutes).toBe(1440);
  });
  it("moves a correction between resource/date keys atomically and rejects stale approval or reversal", async () => {
    const f = await timeFixture({ linked: false });
    const other = await createResource(f.reviewer, { requestKey: randomUUID(), rationale: "Reviewed second subject",
      resource: { ...syntheticResource(), timezone: "UTC" } });
    const exceptions = { on_behalf: "Human verified subject identity", unplanned: "Historical unbooked effort", unknown_capacity: "UTC historical date confirmed" };
    let entry = await submitTime(f, await draftTime(f, { minutes: 1440, onBehalfRationale: "Reviewer entered historical unlinked work" }, f.reviewer), f.reviewer);
    await decideTime(f, await timeCandidate(f, [entry], "time.approve", exceptions));
    entry = (await readExecutionTime(f.reviewer, f.engagementId, f.period)).entries[0];
    const oldReverse = await prepared(f, await timeCandidate(f, [entry], "time.reverse", {}));
    const movedDate = new Date(Date.parse(f.date) - 86400000).toISOString().slice(0, 10), view = await readExecutionOverview(f.reviewer, f.engagementId);
    await submitExecutionCommand(f.reviewer, f.engagementId, timeCommand("time.revise", { execution: view.version, time: entry.version },
      { entryId: entry.id, time: { ...f.time, resourceId: other.resourceId, serviceDate: movedDate, minutes: 1440, onBehalfRationale: "Human corrected both date and subject" } }));
    const range = { from: movedDate, to: f.date };
    entry = await submitTime({ ...f, period: range }, (await readExecutionTime(f.reviewer, f.engagementId, range)).entries[0], f.reviewer);
    const approve = await prepared(f, await timeCandidate(f, [entry], "time.approve", exceptions));
    const results = await Promise.allSettled([submitExecutionCommand(f.reviewer, f.engagementId, approve), submitExecutionCommand(f.reviewer, f.engagementId, oldReverse)]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1].status).toBe("rejected");
    expect((await totals(f.resourceId))[0].approved_minutes).toBe(0);
    expect(await totals(other.resourceId!)).toEqual([{ service_date: movedDate, approved_minutes: 1440, timezone: "UTC" }]);
    const current = (await readExecutionTime(f.reviewer, f.engagementId, range)).entries[0];
    expect(current.authorMembershipId).toBe(f.reviewer.membershipId); expect(current.resourceId).toBe(other.resourceId);
    await expect(submitExecutionCommand(f.reviewer, f.engagementId, { ...approve, requestKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
  });
});
