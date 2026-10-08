import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { requireTestDatabaseUrl } from "../fixtures/database";
import { supportUiGlobalDiagnostic, supportUiCaseDiagnostic } from "../../scripts/support-ui-diagnostic";
import { requireOwnedSupportClone } from "../../scripts/support-eval-environment";
import { verifySupportSuiteCoverage, SUPPORT_SUITES } from "../../scripts/test-support";

describe("support disposable ownership guard", () => {
  it("classifies browser case failures without returning private titles, messages or arbitrary statuses", () => {
    const report = { suites: [{ specs: [{ title: "SYNTHETIC_PRIVATE_TEXT", tests: [{ results: [
      { status: "passed" }, { status: "timedOut", errors: [{ message: "Test timeout of 180000ms exceeded SYNTHETIC_PRIVATE_TEXT" }] },
      { status: "failed", errors: [{ message: "expect(locator).toBeVisible() SYNTHETIC_PRIVATE_TEXT",
        stack: "SYNTHETIC_PRIVATE_TEXT /private/customer/tests/ui/support-readiness.spec.ts:43:10" }] },
      { status: "SYNTHETIC_PRIVATE_TEXT", errors: [{ message: "SYNTHETIC_PRIVATE_TEXT" }] },
    ] }] }] }] };
    expect(supportUiCaseDiagnostic(report)).toEqual({ failedResults: 3, statuses: ["failed", "timedOut", "unknown"],
      categories: ["case_error", "case_timeout", "locator_assertion"], locations: ["tests/ui/support-readiness.spec.ts:43:10"] });
    expect(JSON.stringify(supportUiCaseDiagnostic(report))).not.toContain("SYNTHETIC_PRIVATE_TEXT");
    expect(supportUiCaseDiagnostic(null)).toEqual({ failedResults: 0, statuses: [], categories: [], locations: [] });
    expect(supportUiCaseDiagnostic({ tests: [{ results: [{ status: "failed", error: { message: "Private assertion",
      location: { file: "/private/customer/tests/ui/support-advice.spec.ts", line: 50, column: 80 } } }] }] }).locations)
      .toEqual(["tests/ui/support-advice.spec.ts:50:80"]);
    expect(supportUiCaseDiagnostic({ tests: [{ results: [{ status: "failed", error: { message: "Private assertion",
      location: { file: "/private/customer/secret.ts", line: 50, column: 80 } } }] }] }).locations).toEqual([]);
  });
  it("reports only bounded public error categories without leaking child messages or stacks", () => {
    expect(supportUiGlobalDiagnostic({ errors: [
      { message: "Synthetic server is already used; set reuseExistingServer", stack: "SYNTHETIC_PRIVATE_TEXT" },
      { message: "Cannot find module SYNTHETIC_PRIVATE_TEXT" },
      { message: "SYNTHETIC_PRIVATE_TEXT" },
    ] })).toEqual({ globalErrors: 3, categories: ["module_unavailable", "owned_server_conflict", "runner_global_error"] });
    expect(supportUiGlobalDiagnostic(null)).toEqual({ globalErrors: 0, categories: [] });
    expect(supportUiGlobalDiagnostic({ errors: [{ message: "browserType.launch: missing executable" }, { message: "SyntaxError: Unexpected token" }, { message: "test timed out" }] }))
      .toEqual({ globalErrors: 3, categories: ["browser_unavailable", "runner_timeout", "transform_failure"] });
  });
  it("never launches a second app when the support runner already owns the CI server", async () => {
    vi.stubEnv("CI", "true");
    vi.stubEnv("TURAS_SUPPORT_UI_FIXTURE_READY", "1");
    vi.stubEnv("TURAS_EXECUTION_FIXTURE_READY", "0");
    vi.stubEnv("TURAS_REPORT_UI_READY", "0");
    try {
      vi.resetModules();
      const configuration = (await import("../../playwright.config")).default;
      expect(configuration.webServer).toBeUndefined();
      expect(configuration.projects).toHaveLength(4);
      vi.stubEnv("TURAS_SUPPORT_UI_FIXTURE_READY", "0");
      vi.resetModules();
      const ordinary = (await import("../../playwright.config")).default;
      expect(ordinary.webServer).toMatchObject({ command: "npm run dev", reuseExistingServer: false });
    } finally { vi.unstubAllEnvs(); }
  });
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
