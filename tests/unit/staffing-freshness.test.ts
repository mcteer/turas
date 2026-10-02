import { describe, expect, it } from "vitest";
import { competencyFreshness, availabilityFreshness } from "../../lib/staffing/freshness";
import { staffingPartnerEligible, type StaffingPartnerAuthority } from "../../lib/server/staffing/partner-authority";
describe("observed evidence review windows", () => {
  it("uses exact 90/180 day edges and the earlier business-date review cutoff", () => {
    const observation = { assessmentDate: "2026-01-01", nextReviewDate: "2026-12-31" };
    expect(competencyFreshness(observation, "2026-04-01").freshness).toBe("recent");
    expect(competencyFreshness(observation, "2026-04-02").freshness).toBe("aging");
    expect(competencyFreshness(observation, "2026-06-30").freshness).toBe("aging");
    expect(competencyFreshness(observation, "2026-07-01").freshness).toBe("stale");
    expect(competencyFreshness({ ...observation, nextReviewDate: "2026-03-01" }, "2026-03-01").freshness).toBe("recent");
    expect(competencyFreshness({ ...observation, nextReviewDate: "2026-03-01" }, "2026-03-02").freshness).toBe("stale");
  });
  it("requires competency validity through the work date without refreshing assessment age", () => {
    const observation = { assessmentDate: "2026-01-01", nextReviewDate: "2026-05-01" };
    expect(competencyFreshness(observation, "2026-03-01", "2026-05-01").validThrough).toBe(true);
    expect(competencyFreshness(observation, "2026-03-01", "2026-05-02").validThrough).toBe(false);
    expect(competencyFreshness(null, "2026-03-01").freshness).toBe("unknown");
    expect(competencyFreshness({ ...observation, assessmentDate: "2026-03-02" }, "2026-03-01").freshness).toBe("unknown");
  });
  it("checks availability at decision time while permitting certified future dates", () => {
    const observation = { observedAt: "2026-09-01T12:00:00Z", nextReviewAt: "2026-09-30T12:00:00Z" };
    expect(availabilityFreshness(observation, "2026-09-08T12:00:00Z").freshness).toBe("recent");
    expect(availabilityFreshness(observation, "2026-09-08T12:00:01Z").freshness).toBe("aging");
    expect(availabilityFreshness(observation, "2026-09-15T12:00:00Z").freshness).toBe("aging");
    expect(availabilityFreshness(observation, "2026-09-15T12:00:01Z").freshness).toBe("stale");
    expect(availabilityFreshness({ ...observation, nextReviewAt: "2026-09-05T12:00:00Z" }, "2026-09-06T12:00:00Z").freshness).toBe("stale");
    // A recent observation can certify a future schedule; age is not evaluated in December.
    expect(availabilityFreshness(observation, "2026-09-02T12:00:00Z").validThrough).toBe(true);
  });
});

describe("current assigned partner eligibility", () => {
  const head = { kind: "partner" as const, membership_id: "member", partner_organization_id: "organization" };
  const authority: StaffingPartnerAuthority = { members: [{ id: "member", principal_id: "principal", active: true,
    kind: "partner", partner_org_id: "organization" }], principals: [{ id: "principal", active: true }],
    organizations: [{ id: "organization", active: true }], grants: [{ id: "grant", membership_id: "member", state: "active", revision: "1" }] };
  it("requires explicit coverage for every future service day", () => {
    expect(staffingPartnerEligible(head, authority, [{ state: "active" }], 1)).toBe(true);
    expect(staffingPartnerEligible(head, authority, [{ state: "active" }, { state: null }], 2)).toBeNull();
    expect(staffingPartnerEligible(head, authority, [{ state: "active" }], 2)).toBeNull();
    expect(staffingPartnerEligible(head, authority, [], 0)).toBeNull();
    expect(staffingPartnerEligible(head, authority, [{ state: "retracted" }], 1)).toBe(false);
  });
  it("denies each current authority loss even when all declarations are active", () => {
    for (const changed of [
      { ...authority, organizations: [] },
      { ...authority, organizations: [{ id: "organization", active: false }] },
      { ...authority, members: [] },
      { ...authority, members: [{ ...authority.members[0], active: false }] },
      { ...authority, members: [{ ...authority.members[0], kind: "internal" }] },
      { ...authority, members: [{ ...authority.members[0], partner_org_id: "other" }] },
      { ...authority, principals: [{ id: "principal", active: false }] },
      { ...authority, grants: [] },
      { ...authority, grants: [{ ...authority.grants[0], state: "revoked" }] },
    ]) expect(staffingPartnerEligible(head, changed, [{ state: "active" }], 1)).toBe(false);
  });
  it("allows external partner identities only with current organization and dated coverage", () => {
    const external = { ...head, membership_id: null };
    expect(staffingPartnerEligible(external, { ...authority, members: [], principals: [], grants: [] }, [{ state: "active" }], 1)).toBe(true);
    expect(staffingPartnerEligible(external, { ...authority, organizations: [] }, [{ state: "active" }], 1)).toBe(false);
    expect(staffingPartnerEligible({ ...head, kind: "internal", partner_organization_id: null }, authority, [], 1)).toBeNull();
  });
});
