import { describe, expect, it } from "vitest";
import { staffingUiDiscovery, verifyStaffingUiReport } from "../../scripts/staffing-ui-report";
import { resolve } from "node:path";

/** Synthetic reporter fixtures verify gate rejection; they are not UI execution. */
function reports() {
  const project = "webkit-mobile-dark", files = ["tests/ui/staffing-probe-a.spec.ts", "tests/ui/staffing-probe-b.spec.ts"];
  const specs = files.map((file, index) => ({ file: file.slice("tests/ui/".length), id: `synthetic-case-${index}`, ok: false,
    tests: [{ projectName: project, projectId: project, expectedStatus: "passed", status: "skipped", results: [] as Record<string, unknown>[] }] }));
  const discovery = { config: { rootDir: resolve("tests/ui") }, suites: [{ suites: [{ specs }] }], errors: [], stats: { expected: 0, skipped: 2, unexpected: 0, flaky: 0 } };
  const execution = structuredClone(discovery);
  execution.stats = { expected: 2, skipped: 0, unexpected: 0, flaky: 0 };
  for (const spec of execution.suites[0].suites[0].specs) {
    spec.ok = true; spec.tests[0].status = "expected"; spec.tests[0].results = [{ status: "passed", retry: 0, errors: [] }];
  }
  return { project, files, discovery, execution, specs: execution.suites[0].suites[0].specs };
}
describe("complete staffing UI report evidence", () => {
  it("binds actual nested discovery to exact selected files/project and requires one passing execution per case", () => {
    const f = reports(), cases = staffingUiDiscovery(f.discovery, f.files, f.project);
    expect(cases).toHaveLength(2);
    expect(verifyStaffingUiReport(f.execution, cases)).toEqual({ expected: 2, unexpected: 0, skipped: 0, flaky: 0 });
    expect(() => verifyStaffingUiReport(f.discovery, cases)).toThrow();
  });
  it("rejects missing/duplicate/orphan discovery and authored skipped or expected-failing cases", () => {
    for (const alter of [
      (f: ReturnType<typeof reports>) => f.discovery.suites[0].suites[0].specs.pop(),
      (f: ReturnType<typeof reports>) => { f.discovery.suites[0].suites[0].specs[1] = structuredClone(f.discovery.suites[0].suites[0].specs[0]); },
      (f: ReturnType<typeof reports>) => { f.discovery.suites[0].suites[0].specs[0].file = "other.spec.ts"; },
      (f: ReturnType<typeof reports>) => { f.discovery.suites[0].suites[0].specs[0].tests[0].projectName = "webkit-desktop-light"; },
      (f: ReturnType<typeof reports>) => { f.discovery.suites[0].suites[0].specs[0].tests[0].expectedStatus = "skipped"; },
      (f: ReturnType<typeof reports>) => { f.discovery.suites[0].suites[0].specs[0].tests[0].expectedStatus = "failed"; },
    ]) { const f = reports(); alter(f); expect(() => staffingUiDiscovery(f.discovery, f.files, f.project)).toThrow(); }
  });
  it("rejects incomplete, duplicated, skipped, retried, flaky, expected-failing or falsely counted executions", () => {
    for (const alter of [
      (f: ReturnType<typeof reports>) => { f.specs.pop(); },
      (f: ReturnType<typeof reports>) => { f.specs[1] = structuredClone(f.specs[0]); },
      (f: ReturnType<typeof reports>) => { f.specs[0].id = "different-case"; },
      (f: ReturnType<typeof reports>) => { f.specs[0].ok = false; },
      (f: ReturnType<typeof reports>) => { f.specs[0].tests[0].status = "skipped"; f.specs[0].tests[0].results = []; },
      (f: ReturnType<typeof reports>) => { f.specs[0].tests[0].results[0].retry = 1; },
      (f: ReturnType<typeof reports>) => { f.specs[0].tests[0].results.push({ status: "passed", retry: 1, errors: [] }); },
      (f: ReturnType<typeof reports>) => { f.specs[0].tests[0].results[0].errors = [{ message: "Synthetic error" }]; },
      (f: ReturnType<typeof reports>) => { f.specs[0].tests[0].results[0].error = { message: "Synthetic error" }; },
      (f: ReturnType<typeof reports>) => { f.execution.stats.expected = 3; },
      (f: ReturnType<typeof reports>) => { f.execution.stats.flaky = 1; },
      (f: ReturnType<typeof reports>) => { f.specs[0].tests[0].projectId = "another-project"; },
    ]) { const f = reports(), cases = staffingUiDiscovery(f.discovery, f.files, f.project); alter(f); expect(() => verifyStaffingUiReport(f.execution, cases)).toThrow(); }
  });
});
