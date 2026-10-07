import { spawnSync } from "node:child_process";
import { supportUiGlobalDiagnostic, supportUiCaseDiagnostic } from "./support-ui-diagnostic";
import { mkdir, mkdtemp, writeFile, chmod, readdir, lstat } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { installExecutionNativeFixture } from "../tests/fixtures/execution/native";
import { withExecutionEvalEnvironment } from "./execution-eval-environment";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { executionUiDiscovery, verifyExecutionUiReport } from "./execution-ui-report";
import { executionSourceDigest } from "./execution-source-digest";

async function privateCaptureTree(path:string):Promise<void>{
  const stat=await lstat(path);if(stat.isSymbolicLink())throw new Error("UI capture symlink refused");
  await chmod(path,stat.isDirectory()?0o700:0o600);
  if(stat.isDirectory())for(const name of await readdir(path))await privateCaptureTree(join(path,name));
}
const allSpecs = ["execution-records", "execution-time", "execution-changes", "execution-handoff", "execution-advisory"];
const discoveredFiles = readdirSync(resolve("tests/ui")).filter(name=>/^execution-.*\.spec\.ts$/.test(name)).sort();
if(JSON.stringify(discoveredFiles)!==JSON.stringify(allSpecs.map(name=>name+".spec.ts").sort()))throw new Error("Execution UI suite manifest differs from discovery");
const projects = ["webkit-desktop-light", "webkit-desktop-dark", "webkit-mobile-light", "webkit-mobile-dark"];
const args = process.argv.slice(2), focusMode = ["--us1", "--us2", "--us3", "--us4", "--us5"].includes(args[0]) ? args[0] : null, focused = !!focusMode;
if (args.length > (focused ? 2 : 1) || args.some((arg, i) => i === 0 && focused ? false : !projects.includes(arg))) {
  throw new Error("Only --us1, --us2, --us3, --us4, --us5 and an optional named WebKit project are supported");
}
const selectedProject = focused ? args[1] : args[0];
const specs = (focused ? [focusMode === "--us1" ? "execution-records" : focusMode === "--us2" ? "execution-time" : focusMode === "--us3" ? "execution-changes" : focusMode === "--us5" ? "execution-advisory" : "execution-handoff"] : allSpecs).map(name => `tests/ui/${name}.spec.ts`);
if (specs.some(file => !existsSync(file))) throw new Error("Missing required execution UI suite; full gate cannot run");
let activeStage = "configuration";
async function main() {
assertDeterministicTestMode();
await mkdir("local-artifacts/008", { recursive: true, mode: 0o700 });
const directory = await mkdtemp(resolve("local-artifacts/008/ui-")), sourceDigest = await executionSourceDigest();
await writeFile(join(directory, "source.json"), JSON.stringify({ sourceDigest,
  projects: selectedProject ? [selectedProject] : projects, specs, status: "started" }), { mode: 0o600, flag: "wx" });
const unchanged = async () => { if (await executionSourceDigest() !== sourceDigest) throw new Error("Execution UI source changed during the recorded run"); };
// Each discovered case owns its database and real admission/rate windows.
// Cases never edit rate counters or share revoked sessions with another case.
const total = { expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
for (const project of selectedProject ? [selectedProject] : projects) {
  activeStage = `discovery-${project}`;
  const captures=join(directory,`${project}-captures`);await mkdir(captures,{mode:0o700});
  const baseArgs = ["node_modules/@playwright/test/cli.js", "test", ...specs, `--project=${project}`,
    "--reporter=json", `--output=${captures}`, "--forbid-only", "--retries=0", "--repeat-each=1"];
  const discovered = spawnSync(process.execPath, [...baseArgs, "--list"], {
    env: { ...process.env, AI_GATEWAY_API_KEY: "", TURAS_ALLOW_LIVE_MODEL_TESTS: "0" },
    encoding: "utf8", timeout: 60_000, maxBuffer: 10_000_000,
  });
  await writeFile(join(directory, `${project}-discovery.json`), discovered.stdout ?? "", { mode: 0o600, flag: "wx" });
  await writeFile(join(directory, `${project}-discovery-stderr.log`), discovered.stderr ?? "", { mode: 0o600, flag: "wx" });
  if (discovered.error || discovered.status !== 0) throw new Error("Execution UI discovery failed");
  const cases = executionUiDiscovery(JSON.parse(discovered.stdout), specs, project);
  await unchanged();
  console.log(JSON.stringify({ gate: "execution-ui-discovery", project, cases: cases.length, executed: 0 }));
  activeStage = `owned-${project}`;
  for (const [caseIndex, testCase] of cases.entries()) {
  await withExecutionEvalEnvironment(async environment => {
  await environment.prepareRuntime();
  const nativeCase = testCase.file.endsWith("execution-advisory.spec.ts");
  if (nativeCase) await installExecutionNativeFixture(environment);
  const priorNativeReady = process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY;
  process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY = nativeCase ? "1" : "0";
  const ownerUrl = process.env.DATABASE_URL!;
  const runtimeUrl = new URL(ownerUrl);
  runtimeUrl.searchParams.set("options", "-c role=turas_runtime");
  process.env.DATABASE_URL = runtimeUrl.toString();
  try { await environment.start(); }
  finally { process.env.DATABASE_URL = ownerUrl; }
  try {
    await unchanged();
    const caseArgs = ["node_modules/@playwright/test/cli.js", "test", `${testCase.file}:${testCase.line}`, `--project=${project}`,
      "--reporter=json", `--output=${captures}/case-${caseIndex}`, "--forbid-only", "--retries=0", "--repeat-each=1"];
    const result = spawnSync(process.execPath, caseArgs, {
      env: { ...process.env, TURAS_UI_BASE_URL: environment.origin, TURAS_UI_FIXTURE_DATABASE_URL: process.env.DATABASE_URL_UNPOOLED,
        AI_GATEWAY_API_KEY: "", TURAS_ALLOW_LIVE_MODEL_TESTS: "0",
        TURAS_EXECUTION_FIXTURE_READY: "1", TURAS_EXECUTION_NATIVE_FIXTURE_READY: !focused || focusMode === "--us5" ? "1" : "0", CI: process.env.CI ?? "" },
      encoding: "utf8", timeout: 1_200_000, maxBuffer: 10_000_000,
    });
    await writeFile(join(directory, `${project}-case-${caseIndex}.json`), result.stdout ?? "", { mode: 0o600, flag: "wx" });
    await writeFile(join(directory, `${project}-case-${caseIndex}-stderr.log`), result.stderr ?? "", { mode: 0o600, flag: "wx" });
    await privateCaptureTree(captures);
    let counts: { expected: number; unexpected: number; skipped: number; flaky: number };
    try {
      const report = JSON.parse(result.stdout);
      const globalDiagnostic = supportUiGlobalDiagnostic(report);
      if (globalDiagnostic.globalErrors) console.error(JSON.stringify({ gate: "execution-ui-runner", project,
        file: testCase.file, ...globalDiagnostic }));
      const caseDiagnostic = supportUiCaseDiagnostic(report, "execution");
      if (caseDiagnostic.failedResults) console.error(JSON.stringify({ gate: "execution-ui-case", project,
        file: testCase.file, line: testCase.line, ...caseDiagnostic }));
      counts = verifyExecutionUiReport(report, [testCase]);
    }
    catch { throw new Error("Execution UI did not produce an auditable report"); }
    console.log(JSON.stringify({ gate: focused ? `focused-${focusMode!.slice(2)}` : "complete-execution", project,
      suites: specs.length, counts, exitCode: result.status }));
    if (result.error || result.status !== 0 || !counts.expected || counts.unexpected || counts.skipped || counts.flaky) {
      throw new Error("Execution UI gate failed or contains skipped/flaky cases");
    }
    await unchanged();
    for (const key of ["expected", "unexpected", "skipped", "flaky"] as const) total[key] += counts[key];
  } finally { await environment.stop(); if(priorNativeReady===undefined) delete process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY; else process.env.TURAS_EXECUTION_NATIVE_FIXTURE_READY=priorNativeReady; }
});
  }
}
await writeFile(join(directory, "completed.json"), JSON.stringify({ sourceDigest, counts: total, status: "passed" }), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ gate: focused ? `focused-${focusMode!.slice(2)}` : "complete-execution", projects: selectedProject ? 1 : 4, suites: specs.length, counts: total }));
}
main().catch(error => {
  const errorCode = error && typeof error === "object" && "code" in error &&
    ["ENOTFOUND", "EAI_AGAIN", "EPERM", "ECONNREFUSED", "ETIMEDOUT"].includes(String(error.code)) ? String(error.code) : "gate_failed";
  console.error(JSON.stringify({ gate: "execution-ui", stage: activeStage, errorCode }));
  console.error("008 UI gate incomplete; inspect the private discovery and execution reports."); process.exitCode = 1;
});
