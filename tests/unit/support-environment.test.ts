import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { requireOwnedSupportClone } from "../../scripts/support-eval-environment";
import { verifySupportSuiteCoverage, SUPPORT_SUITES } from "../../scripts/test-support";

describe("support disposable ownership guard", () => {
  it("permits the marked CI source only when it is distinct from application selection", () => {
    const source = "postgres://postgres:postgres@127.0.0.1:5432/turas_test_support";
    const application = "postgres://postgres:postgres@127.0.0.1:5432/turas_support_app_not_selected";
    const env = { TURAS_TEST_DATABASE_URL: source, TURAS_TEST_ENVIRONMENT_ID: "test-ci-support",
      DATABASE_URL: application, DATABASE_URL_UNPOOLED: application };
    expect(requireTestDatabaseUrl(env)).toBe(source);
    expect(() => requireTestDatabaseUrl({ ...env, DATABASE_URL: source })).toThrow("Test database must differ");
    expect(() => requireTestDatabaseUrl({ ...env, DATABASE_URL_UNPOOLED: source })).toThrow("Test database must differ");
  });
  it("bootstraps the referenced runtime role before fresh CI migrations for both support jobs", () => {
    const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    const support = workflow.split("\n  support-deterministic:\n")[1]?.split(/\n  [a-zA-Z][\w-]*:/)[0];
    expect(support).toBeDefined();
    expect(support).toContain("[deterministic, webkit]");
    const role = support!.indexOf("CREATE ROLE turas_runtime NOLOGIN");
    const migrate = support!.indexOf("npm run db:init");
    expect(role).toBeGreaterThanOrEqual(0);
    expect(migrate).toBeGreaterThan(role);
    expect(support!.indexOf("npm run db:roles")).toBeGreaterThan(migrate);
    const isolation = support!.indexOf("Separate application placeholders from the marked test source");
    expect(isolation).toBeGreaterThan(support!.indexOf("npm run db:roles"));
    expect(support!.indexOf("npm run test:support")).toBeGreaterThan(isolation);
    expect(support!.slice(isolation)).toContain('DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/turas_support_app_not_selected');
    expect(support!.slice(isolation)).toContain('DATABASE_URL_UNPOOLED=postgres://postgres:postgres@127.0.0.1:5432/turas_support_app_not_selected');
  });
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
