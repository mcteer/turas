import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyExecutionSuiteCoverage, verifyExecutionTestReport } from "../../scripts/test-execution";

describe("execution suite coverage", () => {
  it("rejects skipped, missing, duplicate and incorrectly counted assertions", () => {
    const suites = ["tests/unit/execution-probe.test.ts", "tests/integration/execution-probe.test.ts"];
    const passing = () => ({ success: true, numTotalTests: 2, numPassedTests: 2, numFailedTests: 0,
      numPendingTests: 0, testResults: suites.map(name => ({ name, status: "passed",
        assertionResults: [{ status: "passed" }] })) });
    expect(verifyExecutionTestReport(passing(), suites)).toEqual({ suites: 2, passed: 2, failed: 0, skipped: 0 });
    const mutations = [
      (r: ReturnType<typeof passing>) => { r.numPendingTests = 1; },
      (r: ReturnType<typeof passing>) => { r.testResults[0].assertionResults[0].status = "skipped"; },
      (r: ReturnType<typeof passing>) => { r.testResults.pop(); },
      (r: ReturnType<typeof passing>) => { r.testResults[1].name = r.testResults[0].name; },
      (r: ReturnType<typeof passing>) => { r.numTotalTests = 3; r.numPassedTests = 3; },
    ];
    for (const mutate of mutations) { const report = passing(); mutate(report);
      expect(() => verifyExecutionTestReport(report, suites)).toThrow(); }
  });
  it("refuses orphaned or absent suites before opening a database", async () => {
    const root = await mkdtemp(join(tmpdir(), "turas-execution-manifest-"));
    const expected = ["tests/unit/execution-probe.test.ts"];
    try {
      for (const group of ["unit", "contracts", "integration"]) await mkdir(join(root, "tests", group), { recursive: true });
      expect(() => verifyExecutionSuiteCoverage(root, expected)).toThrow("Missing");
      await writeFile(join(root, expected[0]), "synthetic");
      expect(verifyExecutionSuiteCoverage(root, expected)).toEqual(expected);
      expect(() => verifyExecutionSuiteCoverage(root, [...expected, ...expected])).toThrow("Duplicate");
      await writeFile(join(root, "tests/integration/execution-orphan.test.ts"), "synthetic");
      expect(() => verifyExecutionSuiteCoverage(root, expected)).toThrow("Orphaned");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
