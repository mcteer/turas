import { describe, expect, it } from "vitest";
import { contextPage } from "../../lib/profiles/context-pages";
import { findCustomerAccounts } from "../../lib/server/conversations/customer-accounts";

describe("legacy customer reads", () => {
  it("does not lose records between byte-limited pages", () => {
    const entries = Array.from({ length: 7 }, (_, id) => ({ id, quote: "a".repeat(50) }));
    const pages = Array.from({ length: 4 }, (_, i) => contextPage(entries, i + 1, 20, 160));
    expect(pages.flatMap(page => page.entries)).toEqual(entries);
    expect(pages.map(page => page.hasNextPage)).toEqual([true, true, true, false]);
  });
  it("reports oversized records and continues to later eligible records", () => {
    expect(contextPage(["x".repeat(200), "small"], 1, 20, 100)).toEqual({
      entries: ["small"], hasNextPage: false, oversized: 1,
    });
  });
  it("prefers exact customer names and aliases over workloads, without fuzzy inference", () => {
    const a = { id: "a", name: "Baggu", aliases: ["Baggu Inc"], workloads: [] };
    const b = { id: "b", name: "Other", aliases: [], workloads: ["Baggu"] };
    expect(findCustomerAccounts([a, b], " BAGGU ")).toEqual([a]);
    expect(findCustomerAccounts([a, b], "baggu inc")).toEqual([a]);
    expect(findCustomerAccounts([b], "baggu")).toEqual([b]);
    expect(findCustomerAccounts([a, b], "bagg")).toEqual([]);
    expect(findCustomerAccounts([a, { ...a, id: "c" }], "baggu")).toHaveLength(2);
  });
});
