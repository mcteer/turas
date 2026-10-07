import { describe, expect, it } from "vitest";
import { supportDigest, supportKeyHashes } from "../../lib/server/support/commands";

describe("support command identities", () => {
  it("normalizes object order without normalizing source/content changes", () => {
    expect(supportDigest({ a: 1, b: { c: 2, d: 3 } })).toBe(supportDigest({ b: { d: 3, c: 2 }, a: 1 }));
    expect(supportDigest([1, 2])).not.toBe(supportDigest([2, 1]));
    expect(supportDigest({ title: "old" })).not.toBe(supportDigest({ title: "new" }));
  });
  it("preserves expired-key lookup across a retained key rotation", () => {
    const identity = ["test-support", "workspace", "actor", "request"];
    const oldKey = "a".repeat(32), newKey = "b".repeat(32);
    const old = supportKeyHashes(identity, [oldKey])[0];
    expect(supportKeyHashes(identity, [newKey, oldKey])).toContain(old);
    expect(supportKeyHashes([...identity.slice(0, 3), "another"], [oldKey])[0]).not.toBe(old);
    expect(supportKeyHashes(identity, [oldKey, oldKey])).toHaveLength(1);
  });
  it("fails closed for absent or short keys", () => {
    expect(() => supportKeyHashes(["test"], [])).toThrow();
    expect(() => supportKeyHashes(["test"], ["too-short"])).toThrow();
  });
});
