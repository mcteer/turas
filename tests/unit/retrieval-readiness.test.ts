import { describe, expect, it,vi } from "vitest";
import { assertRetrievalReady } from "../../lib/server/retrieval/policy";

function reader(overrides: Record<string, unknown> = {}) {
  return { query: async () => ({ rowCount: 1, rows: [{
    environment_id: "test-005", schema_version: 28,
    vector_version: "0.8.6", dimensions: "vector(1536)",
    sources: "retrieval_sources", receipts: "retrieval_receipts", ...overrides,
  }] }) } as never;
}

describe("005 readiness", () => {
  it("admits an exact 028/vector environment", async () => {
    await expect(assertRetrievalReady(reader(), "test-005")).resolves.toBeUndefined();
  });

  it("closes 005 intake with the rollback switch before querying a database",async () => {
    vi.stubEnv("TURAS_005_DISABLED","1");
    try {
      await expect(assertRetrievalReady({ query: async () => {
        throw new Error("Database should not be contacted");
      } } as never,"test-005")).rejects.toMatchObject({ status: 503 });
    } finally { vi.unstubAllEnvs(); }
  });

  it.each([
    { schema_version: 21 }, { vector_version: null },
    { dimensions: "vector(768)" }, { receipts: null },
    { environment_id: "other" },
  ])("denies a missing 005 prerequisite: %j", async (change) => {
    await expect(assertRetrievalReady(reader(change), "test-005"))
      .rejects.toMatchObject({ status: 503 });
  });
});
