import { describe,expect,it } from "vitest";
import { conflictFlagSchema,conflictDecisionSchema } from "../../lib/contracts/conflicts";

const first = { kind: "accepted_profile",revisionId: "00000000-0000-4000-8000-000000000001" };
const second = { kind: "published_shared",revisionId: "00000000-0000-4000-8000-000000000002" };
describe("typed conflict scope",() => {
  it("allows a customer/shared pair while keeping global conflicts shared only",() => {
    const flag = { idempotencyKey: "conflict-1",scope: "customer",
      customerId: "00000000-0000-4000-8000-000000000003",first,second,
      periodStart: "2026-01-01",periodEnd: "2026-09-28",rationale: "Synthetic contradiction" };
    expect(conflictFlagSchema.safeParse(flag).success).toBe(true);
    expect(conflictFlagSchema.safeParse({ ...flag,scope: "shared",customerId: undefined })
      .success).toBe(false);
    expect(conflictFlagSchema.safeParse({ ...flag,scope: "shared",customerId: undefined,
      first: second,second: { ...second,
        revisionId: "00000000-0000-4000-8000-000000000004" } }).success).toBe(true);
    expect(conflictFlagSchema.safeParse({ ...flag,periodStart: "2027-01-01" }).success)
      .toBe(false);
    expect(conflictDecisionSchema.safeParse({ idempotencyKey: "resolve-1",
      expectedVersion: 2,action: "resolve",rationale: "Source withdrawn" }).success).toBe(true);
  });
});
