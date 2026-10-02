import { staffingDeliveryContextIdentity } from "../../lib/staffing/context-fingerprint";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertStaffingDependencySnapshot, mergeStaffingDependencies, type StaffingReadDependency } from "../../lib/staffing/dependencies";
const dependency = (kind: StaffingReadDependency["kind"] = "resource"): StaffingReadDependency => ({
  kind, inputId: randomUUID(), revisionId: randomUUID(), generation: 1, contentDigest: "a".repeat(64),
});
describe("complete consumed staffing dependency identity union", () => {
  it("deduplicates exact heads and accepts reordered complete current metadata", () => {
    const a = dependency("demand"), b = dependency("manual_source");
    expect(mergeStaffingDependencies([a], [b, a])).toHaveLength(2);
    expect(() => assertStaffingDependencySnapshot([a, b], [b, a])).not.toThrow();
    for (const patch of [{ revisionId: randomUUID() }, { generation: 2 }, { contentDigest: "b".repeat(64) }]) {
      expect(() => mergeStaffingDependencies([a], [{ ...a, ...patch }])).toThrow();
      expect(() => assertStaffingDependencySnapshot([a], [{ ...a, ...patch }])).toThrow();
    }
  });
  it("rejects an omitted withdrawn source, duplicate resolver rows, substituted identity or extra unverified prefix", () => {
    const a = dependency("resource"), b = dependency("import_source");
    for (const current of [[a], [a, a], [a, dependency("import_source")], [a, b, dependency("capacity")]]) {
      expect(() => assertStaffingDependencySnapshot([a, b], current)).toThrow();
    }
    expect(() => assertStaffingDependencySnapshot([a, a], [a, a])).toThrow();
  });
  it("enforces the full two-hundred identity union without truncating or charging an exact duplicate twice", () => {
    const consumed = Array.from({ length: 200 }, () => dependency());
    expect(mergeStaffingDependencies(consumed, [consumed[0]])).toHaveLength(200);
    expect(() => mergeStaffingDependencies(consumed, [dependency()])).toThrow();
    expect(() => assertStaffingDependencySnapshot(consumed, consumed)).not.toThrow();
  });
  it("rejects untyped dependency kinds, private fields, invalid identities and unsafe generations", () => {
    const a = dependency();
    for (const patch of [{ kind: "private_file" }, { evidence: "PRIVATE_SYNTHETIC_DEPENDENCY_SENTINEL" },
      { inputId: "other-customer" }, { generation: 0 }, { generation: 1.5 }, { generation: Number.MAX_SAFE_INTEGER + 1 }, { contentDigest: "unverified" }]) {
      expect(() => mergeStaffingDependencies([], [{ ...a, ...patch } as StaffingReadDependency])).toThrow();
    }
  });
});

 describe("staffing customer authority clocks", () => {
  it("allows a refreshed assessment clock while retaining source payload and time-triggered quality changes", () => {
    const snapshot = { contextVersion: "2", customer: { id: randomUUID(), displayName: "Synthetic customer", synthetic: true },
      complete: true, entries: [{ citationId: randomUUID(), payload: { asOf: "2026-09-30", text: "Synthetic accepted architecture" },
        quality: { asOf: "2026-10-01T00:00:00.000Z", validUntil: "2026-10-02T00:00:00.000Z", freshness: "Recent", Q: 90 } }] };
    const identity = staffingDeliveryContextIdentity(snapshot, null), refreshed = structuredClone(snapshot);
    refreshed.entries[0].quality.asOf = "2026-10-01T00:00:01.000Z";
    refreshed.entries[0].quality.validUntil = "2026-10-02T00:00:01.000Z";
    expect(staffingDeliveryContextIdentity(refreshed, null)).toEqual(identity);
    refreshed.entries[0].quality.freshness = "Aging";
    expect(staffingDeliveryContextIdentity(refreshed, null)).not.toEqual(identity);
    const changedPayload = structuredClone(snapshot); changedPayload.entries[0].payload.asOf = "2026-10-01";
    expect(staffingDeliveryContextIdentity(changedPayload, null)).not.toEqual(identity);
    expect(staffingDeliveryContextIdentity({ ...snapshot, entries: [] }, null)).not.toEqual(identity);
    expect(staffingDeliveryContextIdentity(snapshot, randomUUID())).not.toEqual(identity);
  });
 });
