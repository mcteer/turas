import { describe, expect, it } from "vitest";
import { visibleExecutionRevision, requireExecutionTimeVisibility } from "../../lib/server/execution/projection";
import { executionSourcesSchema } from "../../lib/server/execution/sources";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import type { ExecutionActor } from "../../lib/server/execution/policy";
const author = { membershipId: DEMO_IDS.panelMembership, principalId: DEMO_IDS.panel, kind: "internal", role: "member" } as ExecutionActor;
const reviewer = { ...author, principalId: DEMO_IDS.mcteer, membershipId: DEMO_IDS.mcteerMembership, role: "admin" } as ExecutionActor;
const other = { ...author, membershipId: DEMO_IDS.partnerMembership, kind: "partner" } as ExecutionActor;
const record = { id: DEMO_IDS.sharedCustomer, author_membership_id: author.membershipId, current_revision_id: "pending", accepted_revision_id: "accepted", version: "4", state: "submitted", kind: "activity", baseline_id: "baseline" };
describe("execution projection isolation", () => {
  it("keeps pending revision identities with author/reviewer while acceptance remains visible", () => {
    expect(visibleExecutionRevision(author, record)).toBe("pending");
    expect(visibleExecutionRevision(reviewer, record)).toBe("pending");
    expect(visibleExecutionRevision(other, record)).toBe("accepted");
    expect(visibleExecutionRevision(other, { ...record, accepted_revision_id: null })).toBeNull();
  });
  it("denies other contributor time even when customer access exists", () => {
    const entry = { author_membership_id: author.membershipId, subject_membership_id: author.membershipId };
    expect(() => requireExecutionTimeVisibility(other, entry)).toThrow();
    expect(() => requireExecutionTimeVisibility(author, entry)).not.toThrow();
    expect(() => requireExecutionTimeVisibility(reviewer, entry)).not.toThrow();
  });
  it("requires exact unique source identities and rejects asserted authority", () => {
    const source = { id: DEMO_IDS.panel, kind: "execution_record", sourceRevisionId: DEMO_IDS.sharedCustomer, generation: 1, contentDigest: "a".repeat(64) };
    expect(executionSourcesSchema.safeParse([source]).success).toBe(true);
    expect(executionSourcesSchema.safeParse([source, source]).success).toBe(false);
    expect(executionSourcesSchema.safeParse([{ ...source, accepted: true }]).success).toBe(false);
  });
});
