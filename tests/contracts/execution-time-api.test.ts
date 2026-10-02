import { createResource, revisePartnerEligibility } from "../../lib/server/staffing/resources";
import { syntheticResource } from "../fixtures/staffing/seed";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { executionHttpActor, executionHttpRequest, executionHttpContext } from "../fixtures/execution/http";
import { timeFixture, draftTime, submitTime, timeCandidate, decideTime, timeCommand } from "../fixtures/execution/time";
import { GET } from "../../app/api/execution/engagements/[engagementId]/time/route";
import { POST } from "../../app/api/execution/engagements/[engagementId]/commands/route";
import { readExecutionOverview, submitExecutionCommand, previewExecutionCommand } from "../../lib/server/execution/service";
import { readExecutionTime } from "../../lib/server/execution/time";

describe("private daily time contracts", () => {
  it("enforces strict date/minute/subject boundaries before accepting any revision", async () => {
    const f = await timeFixture(), actor = await executionHttpActor("panel"), context = executionHttpContext(f.engagementId);
    const view = await readExecutionOverview(actor, f.engagementId);
    for (const patch of [{ minutes: 0 }, { minutes: 1441 }, { minutes: 1.5 }, { serviceDate: "2026-02-30" },
      { timezone: "+04:00" }, { approved: true }, { authorMembershipId: randomUUID() }, { note: " " }]) {
      const response = await POST(executionHttpRequest(actor, `/engagements/${f.engagementId}/commands`,
        timeCommand("time.create", { execution: view.version }, { time: { ...f.time, ...patch } })), context);
      expect(response.status).toBe(400); expect(await response.text()).not.toContain("PRIVATE_TIME_NOTE_SENTINEL");
    }
    await expect(draftTime(f, { serviceDate: "2999-01-01" })).rejects.toMatchObject({ status: 422 });
    await expect(draftTime(f, { onBehalfRationale: "Pretend to be a reviewer" })).rejects.toMatchObject({ status: 403 });
    const entry = await draftTime(f, { minutes: 1440 });
    expect(entry.minutes).toBe(1440);
    expect(entry.authorMembershipId).toBe(f.author.membershipId);
    expect(entry.subjectMembershipId).toBe(f.author.membershipId);
    expect(entry.timezoneVersion).toMatch(/node=.*;icu=.*;tz=.*;temporal=0\.5\.1/);
  });
  it("isolates raw history, reviewer queue and identities and rechecks authority on replay", async () => {
    const f = await timeFixture(), partner = await executionHttpActor("partner"), panel = await executionHttpActor("panel");
    const entry = await submitTime(f, await draftTime(f)), candidate = await timeCandidate(f, [entry]);
    await expect(previewExecutionCommand(panel, f.engagementId, candidate)).rejects.toMatchObject({ status: 403 });
    const context = executionHttpContext(f.engagementId), path = `/engagements/${f.engagementId}/time`;
    const hidden = await GET(executionHttpRequest(partner, `${path}?from=${f.date}&to=${f.date}`), context);
    expect(hidden.status).toBe(200); expect((await hidden.json()).data.entries).toEqual([]);
    const detail = await GET(executionHttpRequest(partner, `${path}?from=${f.date}&to=${f.date}&entryId=${entry.id}`), context);
    expect(detail.status).toBe(404); expect(await detail.text()).not.toMatch(/PRIVATE_TIME|revisionId|resourceId/);
    expect((await GET(executionHttpRequest(panel, `${path}?from=${f.date}&to=${f.date}&review=1`), context)).status).toBe(403);
    const preview = await previewExecutionCommand(f.reviewer, f.engagementId, candidate);
    const command = { ...candidate, previewDigest: preview.previewDigest, previewExpiresAt: preview.previewExpiresAt,
      requestKey: randomUUID(), rationale: "Human reviewed exact private actuals" };
    const saved = await submitExecutionCommand(f.reviewer, f.engagementId, command);
    expect(JSON.stringify(saved)).not.toMatch(/PRIVATE_TIME|note|rationale|resourceId/);
    expect(await submitExecutionCommand(f.reviewer, f.engagementId, command)).toEqual(saved);
    await withTransaction(db => db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [f.reviewer.sessionId]));
    await expect(submitExecutionCommand(f.reviewer, f.engagementId, command)).rejects.toMatchObject({ status: 401 });
  });
  it("requires attributable reviewer on-behalf entry for an inactive unlinked subject", async () => {
    const f = await timeFixture({ linked: false });
    await withTransaction(db => db.query("UPDATE workforce_resources SET active=false WHERE id=$1", [f.resourceId]));
    await expect(draftTime(f)).rejects.toMatchObject({ status: 403 });
    await expect(draftTime(f, {}, f.reviewer)).rejects.toMatchObject({ status: 403 });
    const row = await submitTime(f, await draftTime(f, { onBehalfRationale: "Reviewer transcribes documented prior work for inactive subject" }, f.reviewer), f.reviewer);
    expect(row.authorMembershipId).toBe(f.reviewer.membershipId); expect(row.subjectMembershipId).toBeNull();
    const candidate = await timeCandidate(f, [row], "time.approve", { on_behalf: "Reviewed inactive subject attribution", unplanned: "No booking exists", unknown_capacity: "UTC historical day confirmed" });
    await decideTime(f, candidate);
    expect((await readExecutionTime(f.reviewer, f.engagementId, f.period)).entries[0].state).toBe("approved");
  });
});

it("permits a linked granted partner's own time, then withholds reads and replay after grant revocation without deleting actuals", async () => {
  const f = await timeFixture({ linked: false }), partner = await executionHttpActor("partner");
  const resource = await createResource(f.reviewer, { requestKey: randomUUID(), rationale: "Reviewed linked partner identity",
    resource: { ...syntheticResource(), timezone: "UTC", kind: "partner", membershipId: partner.membershipId, partnerOrganizationId: DEMO_IDS.partnerOrganization } });
  await revisePartnerEligibility(f.reviewer, resource.resourceId, { requestKey: randomUUID(), rationale: "Reviewed dated delivery assignment",
    revisionId: resource.revisionId, contentDigest: resource.contentDigest, expectedAggregateVersion: resource.aggregateVersion,
    customerId: f.customerId, fromDate: f.date, toDate: f.date, state: "active" });
  const view = await readExecutionOverview(partner,f.engagementId), body = timeCommand("time.create", { execution: view.version },
    { time: { ...f.time, resourceId: resource.resourceId } });
  const saved = await submitExecutionCommand(partner,f.engagementId,body);
  const own = (await readExecutionTime(partner,f.engagementId,f.period)).entries[0];
  expect(own.note).toBe("PRIVATE_TIME_NOTE_SENTINEL");
  const pending = await submitTime(f,own,partner);
  await decideTime(f,await timeCandidate(f,[pending]));
  await revisePartnerEligibility(f.reviewer,resource.resourceId,{requestKey:randomUUID(),rationale:"Reviewed assignment withdrawn",
    revisionId:resource.revisionId,contentDigest:resource.contentDigest,expectedAggregateVersion:resource.aggregateVersion!+1,
    customerId:f.customerId,fromDate:f.date,toDate:f.date,state:"retracted"});
  expect((await readExecutionTime(partner,f.engagementId,f.period)).entries).toEqual([]);
  await expect(readExecutionTime(partner,f.engagementId,{...f.period,entryId:own.id})).rejects.toMatchObject({status:404});
  await expect(submitExecutionCommand(partner,f.engagementId,body)).rejects.toMatchObject({status:404});
  await withTransaction(db=>db.query("UPDATE customer_grants SET state='revoked' WHERE customer_id=$1 AND membership_id=$2",[f.customerId,partner.membershipId]));
  await expect(readExecutionTime(partner,f.engagementId,f.period)).rejects.toMatchObject({ status:404 });
  await expect(submitExecutionCommand(partner,f.engagementId,body)).rejects.toMatchObject({ status:404 });
  expect(await withTransaction(async db=>Number((await db.query("SELECT minutes FROM execution_actual_days WHERE entry_id=$1",[saved.changed[0].id])).rows[0].minutes))).toBe(60);
});
