import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { unavailableSupportMembershipOwners } from "../../lib/server/support/actions";
import type { SupportActor } from "../../lib/server/support/policy";

describe("support projection owner batch", () => {
  const actor = { workspaceId: randomUUID() } as SupportActor;
  it("does not retrieve memberships for an empty owner selection", async () => {
    const query = vi.fn();
    expect(await unavailableSupportMembershipOwners({ query } as unknown as PoolClient, actor, randomUUID(), [])).toEqual(new Set());
    expect(query).not.toHaveBeenCalled();
  });
  it("deduplicates scoped selections and flags every missing or ineligible owner", async () => {
    const active = randomUUID(), inactive = randomUUID(), missing = randomUUID(), customerId = randomUUID();
    const query = vi.fn(async () => ({ rows: [{ id: active }] }));
    expect(await unavailableSupportMembershipOwners({ query } as unknown as PoolClient, actor, customerId,
      [active, inactive, active, missing])).toEqual(new Set([inactive, missing]));
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]).toEqual([expect.any(String), [[active, inactive, missing], actor.workspaceId, customerId]]);
  });
});
