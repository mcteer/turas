import { describe, expect, it, vi } from "vitest";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { requireUiFixtureDatabaseUrl } from "../fixtures/ui";
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
    })).toThrow("Neon test database requires explicit Preview and Production references");
    expect(() => requireTestDatabaseUrl({
      TURAS_TEST_DATABASE_URL: "postgres://localhost/turas",
      TURAS_TEST_ENVIRONMENT_ID: "test-002",
    })).toThrow("Tests require a turas_test database");
  });

  it("keeps deterministic checks from making live model calls", () => {
    expect(() => assertDeterministicTestMode({ TURAS_ALLOW_LIVE_MODEL_TESTS: "1" })).toThrow();
  });

  it("allows CI UI fixture writes only on its selected local test database", () => {
    const testUrl = "postgres://localhost/turas_test";
    for (const [key,value] of Object.entries({
      CI: "true",DATABASE_URL: testUrl,DATABASE_URL_UNPOOLED: testUrl,
      TURAS_TEST_DATABASE_URL: testUrl,TURAS_UI_FIXTURE_DATABASE_URL: testUrl,
      TURAS_UI_BASE_URL: "http://127.0.0.1:3000",
      TURAS_ENVIRONMENT_ID: "test-ci-002",TURAS_TEST_ENVIRONMENT_ID: "test-ci-002",
    })) vi.stubEnv(key,value);
    try {
      expect(requireUiFixtureDatabaseUrl()).toBe(testUrl);
      vi.stubEnv("DATABASE_URL","postgres://localhost/turas_ci");
      expect(() => requireUiFixtureDatabaseUrl()).toThrow("Unsupported UI fixture database identity");
    } finally { vi.unstubAllEnvs(); }
  });
});
