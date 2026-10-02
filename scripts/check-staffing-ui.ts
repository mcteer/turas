import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { withStaffingEvalEnvironment } from "./staffing-eval-environment";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";
import { installStaffingNativeFixture } from "../tests/fixtures/staffing/native";
import { staffingUiDiscovery, verifyStaffingUiReport } from "./staffing-ui-report";
import { staffingLiveSourceDigest } from "./staffing-live-source";

const allSpecs = ["staffing-imports", "staffing-matching", "staffing-allocations", "staffing-operations", "staffing-advisory", "staffing-journey"];
const projects = ["webkit-desktop-light", "webkit-desktop-dark", "webkit-mobile-light", "webkit-mobile-dark"];
const args = process.argv.slice(2), focusMode = ["--us1", "--us2", "--us4", "--us5"].includes(args[0]) ? args[0] : null, focused = !!focusMode;
if (args.length > (focused ? 2 : 1) || args.some((arg, i) => i === 0 && focused ? false : !projects.includes(arg))) {
  throw new Error("Only --us1, --us2, --us4, --us5 and an optional named WebKit project are supported");
}
const selectedProject = focused ? args[1] : args[0];
const specs = (focused ? [focusMode === "--us1" ? "staffing-imports" : focusMode === "--us2" ? "staffing-matching" : focusMode === "--us5" ? "staffing-advisory" : "staffing-operations"] : allSpecs).map(name => `tests/ui/${name}.spec.ts`);
if (specs.some(file => !existsSync(file))) throw new Error("Missing required staffing UI suite; full gate cannot run");
let activeStage = "configuration";
async function main() {
assertDeterministicTestMode();
await mkdir("local-artifacts/007", { recursive: true, mode: 0o700 });
const directory = await mkdtemp(resolve("local-artifacts/007/ui-")), sourceDigest = await staffingLiveSourceDigest();
await writeFile(join(directory, "source.json"), JSON.stringify({ sourceDigest,
  projects: selectedProject ? [selectedProject] : projects, specs, status: "started" }), { mode: 0o600, flag: "wx" });
const unchanged = async () => { if (await staffingLiveSourceDigest() !== sourceDigest) throw new Error("Staffing UI source changed during the recorded run"); };
// Each project owns its own history/admission windows. This preserves the real
// five-per-hour limit instead of editing immutable advisory timestamps between
// light/dark/mobile cases. Native tests always use the bounded owned fixture.
const total = { expected: 0, unexpected: 0, skipped: 0, flaky: 0 };
for (const project of selectedProject ? [selectedProject] : projects) {
  activeStage = `discovery-${project}`;
  const baseArgs = ["node_modules/@playwright/test/cli.js", "test", ...specs, `--project=${project}`,
    "--reporter=json", "--forbid-only", "--retries=0", "--repeat-each=1"];
  const discovered = spawnSync(process.execPath, [...baseArgs, "--list"], {
    env: { ...process.env, AI_GATEWAY_API_KEY: "", TURAS_ALLOW_LIVE_MODEL_TESTS: "0" },
    encoding: "utf8", timeout: 60_000, maxBuffer: 10_000_000,
  });
  await writeFile(join(directory, `${project}-discovery.json`), discovered.stdout ?? "", { mode: 0o600, flag: "wx" });
  await writeFile(join(directory, `${project}-discovery-stderr.log`), discovered.stderr ?? "", { mode: 0o600, flag: "wx" });
  if (discovered.error || discovered.status !== 0) throw new Error("Staffing UI discovery failed");
  const cases = staffingUiDiscovery(JSON.parse(discovered.stdout), specs, project);
  await unchanged();
  console.log(JSON.stringify({ gate: "staffing-ui-discovery", project, cases: cases.length, executed: 0 }));
  activeStage = `owned-${project}`;
  await withStaffingEvalEnvironment(async environment => {
  await environment.prepareRuntime();
  if (!focused || focusMode === "--us5") await installStaffingNativeFixture(environment);
  await environment.start();
  try {
    await unchanged();
    const result = spawnSync(process.execPath, baseArgs, {
      env: { ...process.env, TURAS_UI_BASE_URL: environment.origin, TURAS_UI_FIXTURE_DATABASE_URL: process.env.DATABASE_URL_UNPOOLED,
        AI_GATEWAY_API_KEY: "", TURAS_ALLOW_LIVE_MODEL_TESTS: "0",
        TURAS_STAFFING_FIXTURE_READY: "1", TURAS_STAFFING_NATIVE_FIXTURE_READY: !focused || focusMode === "--us5" ? "1" : "0", CI: process.env.CI ?? "" },
      encoding: "utf8", timeout: 1_200_000, maxBuffer: 10_000_000,
    });
    await writeFile(join(directory, `${project}.json`), result.stdout ?? "", { mode: 0o600, flag: "wx" });
    await writeFile(join(directory, `${project}-stderr.log`), result.stderr ?? "", { mode: 0o600, flag: "wx" });
    let counts: { expected: number; unexpected: number; skipped: number; flaky: number };
    try { counts = verifyStaffingUiReport(JSON.parse(result.stdout), cases); }
    catch { throw new Error("Staffing UI did not produce an auditable report"); }
    console.log(JSON.stringify({ gate: focused ? `focused-${focusMode!.slice(2)}` : "complete-staffing", project,
      suites: specs.length, counts, exitCode: result.status }));
    if (result.error || result.status !== 0 || !counts.expected || counts.unexpected || counts.skipped || counts.flaky) {
      throw new Error("Staffing UI gate failed or contains skipped/flaky cases");
    }
    await unchanged();
    for (const key of ["expected", "unexpected", "skipped", "flaky"] as const) total[key] += counts[key];
  } finally { await environment.stop(); }
});
}
await writeFile(join(directory, "completed.json"), JSON.stringify({ sourceDigest, counts: total, status: "passed" }), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ gate: focused ? `focused-${focusMode!.slice(2)}` : "complete-staffing", projects: selectedProject ? 1 : 4, suites: specs.length, counts: total }));
}
main().catch(error => {
  const errorCode = error && typeof error === "object" && "code" in error &&
    ["ENOTFOUND", "EAI_AGAIN", "EPERM", "ECONNREFUSED", "ETIMEDOUT"].includes(String(error.code)) ? String(error.code) : "gate_failed";
  console.error(JSON.stringify({ gate: "staffing-ui", stage: activeStage, errorCode }));
  console.error("007 UI gate incomplete; inspect the private discovery and execution reports."); process.exitCode = 1;
});
