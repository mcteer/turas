import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { createExecutionBaseline } from "../fixtures/execution/baseline";
import { submitExecutionCommand, readExecutionOverview, readExecutionRecords, previewExecutionCommand } from "../../lib/server/execution/service";
const activity = () => ({ kind: "activity", subtype: "work", title: "Synthetic observed delivery", narrative: "The reviewer inspected an actual synthetic test result.",
  audience: "delivery", eventDate: new Date().toISOString().slice(0,10), timezone: "UTC", workPackageKey: "proof", milestoneKeys: ["proof_done"],
  ownerMembershipId: null, unknownOwnerReason: "Assignment remains unknown", references: [] });
const command = (action: string, expectedVersions: Record<string,number>, payload: unknown) => ({ version: "execution-v1", action, requestKey: randomUUID(), expectedVersions, payload });
describe("reviewed execution records", () => {
  it("sets up once, retains acceptance while a correction is pending, and rejects stale exact review", async () => {
    const f = await withTransaction(db => createExecutionBaseline(db));
    const setup = command("setup", { baseline: 1, plan: f.decision.aggregateVersion }, { baselineId: f.baselineId });
    const before=await readExecutionOverview(f.author,f.engagementId);expect(before.initialized).toBe(false);
    await withTransaction(async db=>expect((await db.query('SELECT 1 FROM execution_workspaces WHERE engagement_id=$1',[f.engagementId])).rowCount).toBe(0));
    const initial = await submitExecutionCommand(f.author, f.engagementId, setup);
    const repeated=await submitExecutionCommand(f.author,f.engagementId,{...setup,requestKey:randomUUID()});
    expect(repeated.changed).toEqual(initial.changed);expect(repeated.commandId).not.toBe(initial.commandId);
    await withTransaction(async db=>expect((await db.query('SELECT 1 FROM execution_workspaces WHERE engagement_id=$1',[f.engagementId])).rowCount).toBe(1));
    expect(await submitExecutionCommand(f.author, f.engagementId, setup)).toEqual(initial);
    let overview = await readExecutionOverview(f.author, f.engagementId);
    expect(overview.milestones).toHaveLength(2);
    const created = await submitExecutionCommand(f.author, f.engagementId, command("record.create", { execution: overview.version }, { baselineId: f.baselineId, record: activity() }));
    let rows = await readExecutionRecords(f.author, f.engagementId, {});
    const draft = rows.records.find(r => r.id === created.changed[0].id)!;
    overview = await readExecutionOverview(f.author, f.engagementId);
    await submitExecutionCommand(f.author, f.engagementId, command("record.submit", { execution: overview.version, record: draft.version }, { recordId: draft.id, revisionId: draft.revisionId, contentDigest: draft.contentDigest }));
    rows = await readExecutionRecords(f.reviewer, f.engagementId, {}); const submitted = rows.records.find(r => r.id === draft.id)!;
    overview = await readExecutionOverview(f.reviewer, f.engagementId);
    const accept = command("record.accept", { execution: overview.version, record: submitted.version }, { recordId: submitted.id, revisionId: submitted.revisionId, contentDigest: submitted.contentDigest });
    const {requestKey: _requestKey,...candidate}=accept;
    const preview = await previewExecutionCommand(f.reviewer, f.engagementId, candidate);
    await expect(submitExecutionCommand(f.author, f.engagementId, { ...accept, ...preview, rationale: "Attempted contributor acceptance" })).rejects.toMatchObject({ status: 403 });
    const accepted = await submitExecutionCommand(f.reviewer, f.engagementId, { ...accept, ...preview, rationale: "Human inspected synthetic delivery evidence" });
    expect(accepted.state).toBe("committed");
    overview = await readExecutionOverview(f.author, f.engagementId);
    const current = (await readExecutionRecords(f.author, f.engagementId, {})).records.find(r => r.id === draft.id)!;
    await submitExecutionCommand(f.author, f.engagementId, command("record.revise", { execution: overview.version, record: current.version },
      { recordId: current.id, record: { ...activity(), narrative: "A pending revised observation" } }));
    const partner = await withTransaction(async db => (await import("../fixtures/profiles")).createProfileTestSession(db, "partner"));
    const publicRecord = (await readExecutionRecords(partner, f.engagementId, {})).records.find(r => r.id === draft.id)!;
    expect(publicRecord.revisionId).toBe(current.revisionId);
    expect(publicRecord.content).not.toEqual({ narrative: "A pending revised observation" });
    await expect(submitExecutionCommand(f.reviewer, f.engagementId, { ...accept, requestKey: randomUUID(), ...preview, rationale: "Stale review" })).rejects.toMatchObject({ status: 409 });
  });
  it("denies hidden drafts, unknown payload authority and future observations", async () => {
    const f = await withTransaction(db => createExecutionBaseline(db));
    await submitExecutionCommand(f.author, f.engagementId, command("setup", { baseline: 1, plan: f.decision.aggregateVersion }, { baselineId: f.baselineId }));
    const view = await readExecutionOverview(f.author, f.engagementId);
    await expect(submitExecutionCommand(f.author, f.engagementId, command("record.create", { execution: view.version },
      { baselineId: f.baselineId, record: { ...activity(), eventDate: "2999-01-01" } }))).rejects.toMatchObject({ status: 422 });
    await expect(submitExecutionCommand(f.author, f.engagementId, command("record.create", { execution: view.version },
      { baselineId: f.baselineId, record: { ...activity(), accepted: true } }))).rejects.toMatchObject({ status: 400 });
  });
});
