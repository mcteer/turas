import { installExpansionNativeFixture } from "../tests/fixtures/expansion/native-install";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, readdir, lstat, chmod, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withExpansionEvalEnvironment } from "./expansion-eval-environment";
import { createExpansionActors } from "../tests/fixtures/expansion/seed";
import { executionUiDiscovery, verifyExecutionUiReport } from "./execution-ui-report";
import { featureSourceDigest } from "./execution-source-digest";
import { supportUiGlobalDiagnostic as expansionUiGlobalDiagnostic, supportUiCaseDiagnostic as expansionUiCaseDiagnostic } from "./support-ui-diagnostic";

async function privateCaptures(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error("Expansion capture symlink refused");
  await chmod(path, stat.isDirectory() ? 0o700 : 0o600);
  if (stat.isDirectory()) for (const entry of await readdir(path)) await privateCaptures(resolve(path, entry));
}

async function main() {
  const projects = ["webkit-desktop-light", "webkit-desktop-dark", "webkit-mobile-light", "webkit-mobile-dark"];
  const advice = process.argv[2] === "--advice";
  const smoke = process.argv[2] === "--smoke";
  const authoring = process.argv[2] === "--authoring";
  const decisions = process.argv[2] === "--decisions";
  const queue = process.argv[2] === "--queue";
  const recovery = process.argv[2] === "--recovery";
  const partner = process.argv[2] === "--partner";
  const focused = recovery||partner;
  if (process.argv.length !== (advice || smoke || authoring || decisions || queue || focused ? 3 : 2)) throw new Error("Expansion UI accepts optional --smoke, --authoring, --decisions, --queue, --recovery or --partner");
  const specs = ["tests/ui/expansion-authoring.spec.ts", "tests/ui/expansion-decisions.spec.ts", "tests/ui/expansion-review-queue.spec.ts", "tests/ui/expansion-advice.spec.ts"];
  const discoveredFiles = (await readdir(resolve("tests/ui"))).filter(file => /^expansion-.*\.spec\.ts$/.test(file)).map(file => `tests/ui/${file}`).sort();
  if (JSON.stringify(discoveredFiles) !== JSON.stringify([...specs].sort())) throw new Error("Expansion UI manifest differs from discovery");
  const recoveryLines=new Set((await readFile(resolve("tests/ui/expansion-authoring.spec.ts"),"utf8")).split('\n').flatMap((line,index)=>(partner?/test\('assigned partner/:/test\('(?:lost save acknowledgement|attributed public source inspection)/).test(line)?[index+1]:[]));
  const isRecovery=(item:{file:string;line:number})=>item.file.endsWith("expansion-authoring.spec.ts")&&recoveryLines.has(item.line);
  if(focused&&recoveryLines.size!==(partner?1:2))throw new Error("Expansion recovery journey definitions differ");
  const sourceDigest = await featureSourceDigest("011");
  await mkdir(resolve("local-artifacts/011"), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/011/ui-"));
  let passed = 0;
  for (const project of projects) {
    const args = ["node_modules/@playwright/test/cli.js", "test", ...specs, `--project=${project}`, "--reporter=json", "--forbid-only", "--retries=0"];
    const discovery = spawnSync(process.execPath, [...args, "--list"], { env: process.env, encoding: "utf8", timeout: 60000, maxBuffer: 10000000 });
    await writeFile(resolve(directory, `${project}-discovery.json`), discovery.stdout, { mode: 0o600 });
    await writeFile(resolve(directory, `${project}-discovery.log`), discovery.stderr, { mode: 0o600 });
    if (discovery.status !== 0) throw new Error("Expansion UI discovery failed");
    const discoveryReport = JSON.parse(discovery.stdout);
    const discoveryDiagnostic = expansionUiGlobalDiagnostic(discoveryReport);
    if (discoveryDiagnostic.globalErrors) console.error(JSON.stringify({ gate: "expansion-ui-runner", phase: "discovery", project, ...discoveryDiagnostic }));
    const cases = executionUiDiscovery(discoveryReport, specs, project);
    if (!smoke && cases.length < 7) throw new Error("Expansion UI full gate requires at least seven journeys per project");
    if(focused&&cases.filter(isRecovery).length!==(partner?1:2))throw new Error("Expansion recovery journeys are missing");
    for (const [index, current] of cases.filter(item => (!advice || item.file.endsWith("expansion-advice.spec.ts")) && (!focused || isRecovery(item)) && (!authoring || item.file.endsWith("expansion-authoring.spec.ts")) && (!decisions || item.file.endsWith("expansion-decisions.spec.ts")) && (!queue || item.file.endsWith("expansion-review-queue.spec.ts"))).entries()) await withExpansionEvalEnvironment(async environment => {
      await createExpansionActors(environment.appRoot);
      const nativeCase = current.file.endsWith("expansion-advice.spec.ts");
      const previousNative = process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY;
      if (nativeCase) {await installExpansionNativeFixture(environment);process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY="1";}
      try {
        await environment.start();
        const output = resolve(directory, `${project}-${index}`);
        const run = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", `${current.file}:${current.line}`, `--project=${project}`,
          "--reporter=json", "--forbid-only", "--retries=0", `--output=${output}`], {
          env: { ...process.env, TURAS_UI_BASE_URL: environment.origin, TURAS_EXPANSION_UI_FIXTURE_READY: "1" },
          encoding: "utf8", timeout: 240000, maxBuffer: 10000000,
        });
        await writeFile(resolve(directory, `${project}-${index}.json`), run.stdout, { mode: 0o600 });
        await writeFile(resolve(directory, `${project}-${index}.log`), run.stderr + environment.privateLogTail(), { mode: 0o600 });
        await privateCaptures(output);
        const report = JSON.parse(run.stdout), diagnostic = expansionUiGlobalDiagnostic(report);
        if (diagnostic.globalErrors) console.error(JSON.stringify({ gate: "expansion-ui-runner", phase: "execution", project, file: current.file, ...diagnostic }));
        const caseDiagnostic = expansionUiCaseDiagnostic(report);
        if (caseDiagnostic.failedResults) console.error(JSON.stringify({ gate: "expansion-ui-case", project,
          file: current.file, line: current.line, ...caseDiagnostic }));
        const counts = verifyExecutionUiReport(report, [current]);
        if (run.status !== 0 || counts.unexpected || counts.skipped || counts.flaky || counts.expected !== 1) throw new Error("Expansion UI case failed");
        passed++;
      } finally {
        await environment.stop();
        if (previousNative === undefined) delete process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY;
        else process.env.TURAS_EXPANSION_NATIVE_FIXTURE_READY = previousNative;
      }
    }, { empty: true, deadlineAt: Date.now() + 360000 });
  }
  if (await featureSourceDigest("011") !== sourceDigest) throw new Error("Expansion UI source changed");
  console.log(JSON.stringify({ gate: advice ? "expansion-ui-advice" : queue ? "expansion-ui-queue" : partner ? "expansion-ui-partner" : recovery ? "expansion-ui-recovery" : decisions ? "expansion-ui-decisions" : authoring ? "expansion-ui-authoring" : smoke ? "expansion-ui-smoke" : "expansion-ui-acceptance", sourceDigest, projects: 4, passed, fullAcceptance: !advice && !smoke && !authoring && !decisions && !queue && !focused }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Expansion UI check failed"); process.exitCode = 1; });
