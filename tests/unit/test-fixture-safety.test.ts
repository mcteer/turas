import { describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { assertDeterministicTestMode } from "../fixtures/runtime";

describe("test isolation", () => {
  it("rejects an application database even with a test marker", () => {
    expect(() => requireTestDatabaseUrl({
      TURAS_TEST_DATABASE_URL: "postgres://localhost/turas_test",
      TURAS_TEST_ENVIRONMENT_ID: "test-002",
      DATABASE_URL: "postgres://localhost/turas_test",
    })).toThrow("must differ");
  });

  it("rejects remote and non-test database names", () => {
    expect(() => requireTestDatabaseUrl({
      TURAS_TEST_DATABASE_URL: "postgres://example.com/turas_test",
      TURAS_TEST_ENVIRONMENT_ID: "test-002",
    })).toThrow("local turas_test");
    expect(() => requireTestDatabaseUrl({
      TURAS_TEST_DATABASE_URL: "postgres://localhost/turas",
      TURAS_TEST_ENVIRONMENT_ID: "test-002",
    })).toThrow("local turas_test");
  });

  it("keeps deterministic checks from making live model calls", () => {
    expect(() => assertDeterministicTestMode({ TURAS_ALLOW_LIVE_MODEL_TESTS: "1" })).toThrow();
  });
});
