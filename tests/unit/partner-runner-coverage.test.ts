import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync,existsSync } from "node:fs";
import {spawnSync} from "node:child_process";
import { resolve, join } from "node:path";
import { verifyPartnerSuiteCoverage, verifyPartnerTestReport,capturePartnerProcess } from "../../scripts/test-partners";
import { requireOwnedPartnerDatabase } from "../../scripts/partners-environment";

describe("partner owned acceptance", () => {
 it("drains an interrupted child and removes only its owned runtime copy and container",async()=>{
  const code=`import {withPartnerEnvironment} from './scripts/partners-environment.ts';import {runPartnerProcess} from './scripts/test-partners.ts';try{await withPartnerEnvironment(async e=>{console.log(JSON.stringify({appRoot:e.appRoot,token:e.databaseName.slice(-12)}));const work=runPartnerProcess(['-e','setInterval(()=>{},1000)'],{signal:e.signal});process.kill(process.pid,'SIGTERM');await work;});}catch{process.exitCode=1;}`;
  const run=await capturePartnerProcess(["--import","tsx","--input-type=module","-e",code],60000);expect(run.status).toBe(1);const marker=JSON.parse(run.stdout.trim());expect(marker.token).toMatch(/^[a-f0-9]{12}$/);expect(marker.appRoot).toMatch(/\/local-artifacts\/013\/owned-[^/]+\/app$/);expect(existsSync(resolve(marker.appRoot,".."))).toBe(false);const inspected=spawnSync("docker",["inspect","turas-013-check-"+marker.token],{encoding:"utf8",timeout:10000});expect(inspected.status).not.toBe(0);expect(inspected.stderr).toMatch(/No such (?:object|container)/i);
 },90000);
  it("rejects selected hosted, unmarked and mismatched database environments", () => {
    for (const env of [{}, { DATABASE_URL: "postgresql://u:p@host.example/production", TURAS_PARTNERS_OWNED: "1", TURAS_ENVIRONMENT_ID: "test-partner-a", TURAS_TEST_ENVIRONMENT_ID: "test-partner-a" },
      { DATABASE_URL: "postgresql://u:p@127.0.0.1/turas_test_013_eval_123456789abc", TURAS_PARTNERS_OWNED: "1", TURAS_ENVIRONMENT_ID: "production", TURAS_TEST_ENVIRONMENT_ID: "production" }])
      expect(() => requireOwnedPartnerDatabase({ NODE_ENV: "test", ...env })).toThrow();
  });
  it("requires exact nonempty manifests and detects orphan files", () => {
    const parent = resolve("local-artifacts/013"); mkdirSync(parent, { recursive: true });
    const root = mkdtempSync(join(parent, "manifest-test-"));
    try {
      for (const group of ["unit", "contracts", "integration"]) mkdirSync(join(root, "tests", group), { recursive: true });
      const file = "tests/unit/partner-example.test.ts"; writeFileSync(join(root, file), "fixture");
      expect(verifyPartnerSuiteCoverage(root, [file])).toEqual([file]);
      expect(() => verifyPartnerSuiteCoverage(root, [])).toThrow();
      expect(() => verifyPartnerSuiteCoverage(root, [file, file])).toThrow();
      writeFileSync(join(root, "tests/contracts/partner-orphan.test.ts"), "fixture");
      expect(() => verifyPartnerSuiteCoverage(root, [file])).toThrow();
    } finally { rmSync(root, { recursive: true }); }
  });
  it("rejects successful reports with skipped, missing or empty assertions", () => {
    const path = "tests/unit/partner-example.test.ts", report = { success: true, numFailedTests: 0, numPendingTests: 0,
      testResults: [{ name: `/repo/${path}`, assertionResults: [{ status: "passed" }] }] };
    expect(verifyPartnerTestReport(report, [path])).toBe(1);
    expect(() => verifyPartnerTestReport({ ...report, numPendingTests: 1 }, [path])).toThrow();
    expect(() => verifyPartnerTestReport({ ...report, testResults: [] }, [path])).toThrow();
    expect(() => verifyPartnerTestReport({ ...report, testResults: [{ name: path, assertionResults: [] }] }, [path])).toThrow();
  });
});
