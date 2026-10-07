import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { saveSupportProposal } from "../../lib/server/support/service";
import { withSupportDatabase } from "../fixtures/support/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { createSupportReviewPreview, decideSupportRevision } from "../../lib/server/support/review";
import { readSupportWorkspace } from "../../lib/server/support/projection";
import { createSupportOutcomeEvidence } from "../fixtures/support/outcome";

describe("support action accountability", () => {
  let author: CurrentSession, reviewer: CurrentSession;
  beforeAll(async () => {
    author = await withSupportDatabase(db => createProfileTestSession(db, "panel"));
    reviewer = await withSupportDatabase(db => createProfileTestSession(db, "mcteer"));
  });
  function command() {
    const today = Temporal.Now.plainDateISO("UTC");
    return { contractVersion: "support-v1", operation: "save_action", requestKey: randomUUID(), workloadId: null,
      expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [], content: {
        contractVersion: "support-v1", title: "Confirm operating owner", observationDate: today.toString(),
        nextReviewDate: today.add({ days: 7 }).toString(), timezone: "UTC", desiredOutcome: "Document an accountable role",
        rationale: "No accepted ownership evidence", validationCriterion: "Review the operating responsibility record",
        priority: "normal", owner: { kind: "unassigned", reason: "Confirm the owner" }, disposition: "open", outcomeSourceKeys: [],
      } };
  }
  it("refuses a nonexistent membership owner", async () => {
    const input = command();
    await expect(saveSupportProposal(author, DEMO_IDS.sharedCustomer, { ...input,
      content: { ...input.content, owner: { kind: "membership", membershipId: randomUUID() } } })).rejects.toMatchObject({ status: 422 });
  });
  it("flags an inactive accepted owner without hiding the action or granting authority", async () => {
    const customerId = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic owner eligibility',true)", [customerId, author.workspaceId]));
    const input = command();
    const saved = await saveSupportProposal(author, customerId, { ...input,
      content: { ...input.content, owner: { kind: "membership", membershipId: author.membershipId } } });
    const preview = await createSupportReviewPreview(reviewer, customerId, { workloadId: null, recordId: saved.recordId, revisionId: saved.revisionId });
    await decideSupportRevision(reviewer, customerId, { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(),
      workloadId: null, recordId: saved.recordId, revisionId: saved.revisionId, expectedVersion: preview.expectedVersion,
      sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Reviewed synthetic owner selection" });
    const before = await readSupportWorkspace(reviewer, customerId, null, "delivery", { limit: 20 });
    expect(before.actions[0]?.accepted?.ownerUnavailable).toBe(false);
    await withSupportDatabase(db => db.query("UPDATE memberships SET active=false WHERE id=$1", [author.membershipId]));
    try {
      const after = await readSupportWorkspace(reviewer, customerId, null, "delivery", { limit: 20 });
      expect(after.actions[0]?.accepted?.revisionId).toBe(saved.revisionId);
      expect(after.actions[0]?.accepted?.content).not.toBeNull();
      expect(after.actions[0]?.accepted?.ownerUnavailable).toBe(true);
      expect(after.actions[0]?.accepted?.reviewRequired).toBe(true);
      await expect(readSupportWorkspace(author, customerId, null, "delivery", { limit: 20 })).rejects.toThrow();
    } finally {
      await withSupportDatabase(db => db.query("UPDATE memberships SET active=true WHERE id=$1", [author.membershipId]));
    }
  }, 60_000);
  it("requires a customer-role owner to reference accepted stakeholder evidence", async () => {
    const input = command();
    await expect(saveSupportProposal(author, DEMO_IDS.sharedCustomer, { ...input,
      content: { ...input.content, owner: { kind: "customer_role", label: "Operations", sourceKey: randomUUID() } } })).rejects.toMatchObject({ status: 422 });
  });
  it("cannot create completed actions or substitute a URL for outcome evidence", async () => {
    const input = command();
    await expect(saveSupportProposal(author, DEMO_IDS.sharedCustomer, { ...input,
      content: { ...input.content, disposition: "completed", completedDate: input.content.observationDate } })).rejects.toThrow();
  });
  it("saves explicit discovery actions without granting responsibility or approval", async () => {
    const input = command(), receipt = await saveSupportProposal(author, DEMO_IDS.sharedCustomer, input);
    expect(receipt.outcome).toBe("proposed");
    await withSupportDatabase(async db => expect((await db.query("SELECT accepted_revision_id FROM support_records WHERE id=$1", [receipt.recordId])).rows[0].accepted_revision_id).toBeNull());
  });
  it("keeps accepted open unchanged while a deferred revision awaits exact review", async () => {
    const customerId = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic action transitions',true)", [customerId, author.workspaceId]));
    const input = command(), saved = await saveSupportProposal(author, customerId, input);
    const preview = await createSupportReviewPreview(reviewer, customerId, { workloadId: null, recordId: saved.recordId, revisionId: saved.revisionId });
    await decideSupportRevision(reviewer, customerId, { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(),
      workloadId: null, recordId: saved.recordId, revisionId: saved.revisionId, expectedVersion: preview.expectedVersion,
      sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Discovery action with explicit unknown owner" });
    const deferred = await saveSupportProposal(author, customerId, { ...input, requestKey: randomUUID(), recordId: saved.recordId, expectedVersion: 2,
      content: { ...input.content, disposition: "deferred", revisitDate: input.content.nextReviewDate, dispositionRationale: "Wait for operating review" } });
    const view = await readSupportWorkspace(author, customerId, null, "delivery", { limit: 20 });
    expect(view.actions[0]?.accepted?.disposition).toBe("open");
    expect(view.actions[0]?.proposal?.disposition).toBe("deferred");
    expect(view.actions[0]?.proposal?.revisionId).toBe(deferred.revisionId);
  }, 60_000);
  it("requires reopening rationale and preserves accepted dismissal until exact review", async () => {
    const customerId = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic reopening',true)", [customerId, author.workspaceId]));
    const input = command();
    async function accept(receipt: Awaited<ReturnType<typeof saveSupportProposal>>) {
      const preview = await createSupportReviewPreview(reviewer, customerId, { workloadId: null, recordId: receipt.recordId, revisionId: receipt.revisionId });
      return decideSupportRevision(reviewer, customerId, { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(),
        workloadId: null, recordId: receipt.recordId, revisionId: receipt.revisionId, expectedVersion: preview.expectedVersion,
        sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Human reviewed the exact synthetic disposition" });
    }
    const initial = await saveSupportProposal(author, customerId, input);
    await accept(initial);
    const dismissed = await saveSupportProposal(author, customerId, { ...input, requestKey: randomUUID(), recordId: initial.recordId, expectedVersion: 2,
      content: { ...input.content, disposition: "dismissed", dispositionRationale: "Human determined this discovery action is no longer needed" } });
    await accept(dismissed);
    await expect(saveSupportProposal(author, customerId, { ...input, requestKey: randomUUID(), recordId: initial.recordId, expectedVersion: 4 }))
      .rejects.toMatchObject({ status: 422, code: "reopen_rationale_required" });
    const reopened = await saveSupportProposal(author, customerId, { ...input, requestKey: randomUUID(), recordId: initial.recordId, expectedVersion: 4,
      content: { ...input.content, dispositionRationale: "New human observations require renewed ownership discovery" } });
    const pending = await readSupportWorkspace(author, customerId, null, "delivery", { limit: 20 });
    expect(pending.actions[0]?.accepted?.disposition).toBe("dismissed");
    expect(pending.actions[0]?.proposal?.disposition).toBe("open");
    await accept(reopened);
    const accepted = await readSupportWorkspace(author, customerId, null, "delivery", { limit: 20 });
    expect(accepted.actions[0]?.accepted?.disposition).toBe("open");
  }, 60_000);
  it("accepts a completed revision only after exact review of its dated outcome evidence", async () => {
    const input = command(), customerId = DEMO_IDS.sharedCustomer;
    const source = await createSupportOutcomeEvidence(author, reviewer, customerId);
    const initial = await saveSupportProposal(author, customerId, input);
    async function accept(receipt: Awaited<ReturnType<typeof saveSupportProposal>>) {
      const preview = await createSupportReviewPreview(reviewer, customerId, { workloadId: null, recordId: receipt.recordId, revisionId: receipt.revisionId });
      return decideSupportRevision(reviewer, customerId, { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(),
        workloadId: null, recordId: receipt.recordId, revisionId: receipt.revisionId, expectedVersion: preview.expectedVersion,
        sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Human reviewed the exact dated outcome evidence" });
    }
    await accept(initial);
    const completed = await saveSupportProposal(author, customerId, { ...input, requestKey: randomUUID(), recordId: initial.recordId, expectedVersion: 2,
      sourceRefs: [source.reference], content: { ...input.content, disposition: "completed", completedDate: input.content.observationDate,
        outcomeSourceKeys: [source.reference.id] } });
    const pending = await readSupportWorkspace(author, customerId, null, "delivery", { limit: 50 });
    expect(pending.actions.find(row => row.recordId === initial.recordId)?.accepted?.disposition).toBe("open");
    await accept(completed);
    const view = await readSupportWorkspace(author, customerId, null, "delivery", { limit: 50 });
    expect(view.actions.find(row => row.recordId === initial.recordId)?.accepted?.disposition).toBe("completed");
  }, 60000);
});
