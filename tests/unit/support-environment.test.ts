import { describe, expect, it } from "vitest";
import { requireOwnedSupportClone } from "../../scripts/support-eval-environment";
import { verifySupportSuiteCoverage, SUPPORT_SUITES } from "../../scripts/test-support";

describe("support disposable ownership guard", () => {
  const raw = "postgres://localhost/turas_test_010_eval_012345abcdef";
  const owned = () => ({ DATABASE_URL: raw, DATABASE_URL_UNPOOLED: raw, TURAS_TEST_DATABASE_URL: raw,
    TURAS_ENVIRONMENT_ID: "test-support", TURAS_TEST_ENVIRONMENT_ID: "test-support" });
  it("accepts only the exact owned clone association", () => {
    expect(requireOwnedSupportClone(owned())).toBe(raw);
  });
  it("denies selected app databases and another feature clone", () => {
    expect(() => requireOwnedSupportClone({ ...owned(), TURAS_TEST_DATABASE_URL: "postgres://localhost/turas_test_other" })).toThrow();
    const other = raw.replace("010", "008");
    expect(() => requireOwnedSupportClone({ ...owned(), DATABASE_URL: other, DATABASE_URL_UNPOOLED: other, TURAS_TEST_DATABASE_URL: other })).toThrow();
  });
  it("denies absent or mismatched markers and non-database protocols", () => {
    expect(() => requireOwnedSupportClone({ ...owned(), TURAS_ENVIRONMENT_ID: "production" })).toThrow();
    expect(() => requireOwnedSupportClone({})).toThrow();
    const other = raw.replace("postgres:", "https:");
    expect(() => requireOwnedSupportClone({ ...owned(), DATABASE_URL: other, DATABASE_URL_UNPOOLED: other, TURAS_TEST_DATABASE_URL: other })).toThrow();
  });
  it("rejects missing, duplicate, empty and orphaned suite manifests", () => {
    expect(verifySupportSuiteCoverage()).toHaveLength(SUPPORT_SUITES.length);
    expect(() => verifySupportSuiteCoverage(process.cwd(), [])).toThrow();
    expect(() => verifySupportSuiteCoverage(process.cwd(), SUPPORT_SUITES.slice(1))).toThrow();
    expect(() => verifySupportSuiteCoverage(process.cwd(), [...SUPPORT_SUITES, SUPPORT_SUITES[0]])).toThrow();
    expect(() => verifySupportSuiteCoverage(process.cwd(), [...SUPPORT_SUITES.slice(1), "tests/unit/support-missing.test.ts"])).toThrow();
  });
});
