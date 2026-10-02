import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyStaffingSuiteCoverage, verifyStaffingTestReport } from "../../scripts/test-staffing";

describe("staffing suite coverage gate", () => {
  it("refuses skipped, missing, duplicate or falsely counted execution even when success is true", () => {
    const suites = ["tests/unit/staffing-probe-a.test.ts", "tests/integration/staffing-probe-b.test.ts"];
    const actual = () => ({ success: true, numTotalTests: 3, numPassedTests: 3, numFailedTests: 0, numPendingTests: 0,
      testResults: [{ name: suites[0], status: "passed", assertionResults: [{ status: "passed" }] },
        { name: suites[1], status: "passed", assertionResults: [{ status: "passed" }, { status: "passed" }] }] });
    expect(verifyStaffingTestReport(actual(), suites)).toEqual({ suites: 2, passed: 3, failed: 0, skipped: 0 });
    for (const mutate of [
      (report: ReturnType<typeof actual>) => { report.numPendingTests = 1; },
      (report: ReturnType<typeof actual>) => { report.testResults[1].assertionResults[0].status = "skipped"; },
      (report: ReturnType<typeof actual>) => { report.testResults.pop(); },
      (report: ReturnType<typeof actual>) => { report.testResults[1].name = report.testResults[0].name; },
      (report: ReturnType<typeof actual>) => { report.numTotalTests = 4; report.numPassedTests = 4; },
      (report: ReturnType<typeof actual>) => { report.testResults[0].status = "failed"; },
    ]) { const report = actual(); mutate(report); expect(() => verifyStaffingTestReport(report, suites)).toThrow(); }
  });
  it("rejects missing, orphaned and duplicate suites before any database operation", async () => {
    const root = await mkdtemp(join(tmpdir(), "turas-staffing-manifest-"));
    const expected = ["tests/unit/staffing-probe.test.ts"];
    try {
      for (const group of ["unit", "contracts", "integration"]) {
        await mkdir(join(root, "tests", group), { recursive: true });
      }
      expect(() => verifyStaffingSuiteCoverage(root, expected)).toThrow("Missing planned");
      await writeFile(join(root, expected[0]), "synthetic test");
      expect(verifyStaffingSuiteCoverage(root, expected)).toEqual(expected);
      expect(() => verifyStaffingSuiteCoverage(root, [...expected, ...expected])).toThrow("Duplicate");
      await writeFile(join(root, "tests/integration/staffing-orphan.test.ts"), "synthetic test");
      expect(() => verifyStaffingSuiteCoverage(root, expected)).toThrow("Orphaned");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
