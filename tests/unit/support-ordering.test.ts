import { describe, expect, it } from "vitest";
import { compareSupportActions } from "../../lib/support/ordering";
import { decodeSupportCursor, encodeSupportCursor } from "../../lib/server/support/cursor";

describe("stable support ordering and scoped cursors", () => {
  it("puts overdue before priority and breaks ties by creation and identity", () => {
    const base = { createdAt: "2026-10-01", priority: "high" as const, overdue: false };
    const sorted = [{ ...base, id: "b" }, { ...base, id: "a" },
      { ...base, id: "c", overdue: true, priority: "low" as const }].sort(compareSupportActions);
    expect(sorted.map(row => row.id)).toEqual(["c", "a", "b"]);
  });
  it("rejects changed actors, filters, generations, signatures and expiry", () => {
    const binding = "a".repeat(64), generation = "b".repeat(64);
    const cursor = encodeSupportCursor(binding, generation, 20, 1000);
    expect(decodeSupportCursor(cursor, binding, generation, 2000)).toBe(20);
    expect(() => decodeSupportCursor(cursor, "c".repeat(64), generation, 2000)).toThrow();
    expect(() => decodeSupportCursor(cursor, binding, "c".repeat(64), 2000)).toThrow();
    expect(() => decodeSupportCursor(cursor + "x", binding, generation, 2000)).toThrow();
    expect(() => decodeSupportCursor(cursor, binding, generation, 901000)).toThrow();
  });
});
