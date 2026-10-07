import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, readdir, lstat, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { withSupportEvalEnvironment } from "./support-eval-environment";
import { createSupportActors } from "../tests/fixtures/support/seed";
import { executionUiDiscovery, verifyExecutionUiReport } from "./execution-ui-report";
import { featureSourceDigest } from "./execution-source-digest";
import { installSupportNativeFixture } from "../tests/fixtures/support/native";
import { supportUiGlobalDiagnostic, supportUiCaseDiagnostic } from "./support-ui-diagnostic";

async function privateCaptures(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error("Support capture symlink refused");
  await chmod(path, stat.isDirectory() ? 0o700 : 0o600);
  if (stat.isDirectory()) for (const entry of await readdir(path)) await privateCaptures(resolve(path, entry));
}

async function main() {
  const projects = ["webkit-desktop-light", "webkit-desktop-dark", "webkit-mobile-light", "webkit-mobile-dark"];
  const smoke = process.argv[2] === "--smoke";
  if (process.argv.length !== (smoke ? 3 : 2)) throw new Error("Support UI accepts only optional --smoke");
  const specs = ["tests/ui/support-readiness.spec.ts", "tests/ui/support-advice.spec.ts"];
  const discoveredFiles = (await readdir(resolve("tests/ui"))).filter(file => /^support-.*\.spec\.ts$/.test(file)).map(file => `tests/ui/${file}`).sort();
  if (JSON.stringify(discoveredFiles) !== JSON.stringify([...specs].sort())) throw new Error("Support UI manifest differs from discovery");
  const sourceDigest = await featureSourceDigest("010");
  await mkdir(resolve("local-artifacts/010"), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/010/ui-"));
  let passed = 0;
  for (const project of projects) {
    const args = ["node_modules/@playwright/test/cli.js", "test", ...specs, `--project=${project}`, "--reporter=json", "--forbid-only", "--retries=0"];
    const discovery = spawnSync(process.execPath, [...args, "--list"], { env: process.env, encoding: "utf8", timeout: 60000, maxBuffer: 10000000 });
    await writeFile(resolve(directory, `${project}-discovery.json`), discovery.stdout, { mode: 0o600 });
    await writeFile(resolve(directory, `${project}-discovery.log`), discovery.stderr, { mode: 0o600 });
    if (discovery.status !== 0) throw new Error("Support UI discovery failed");
    const discoveryReport = JSON.parse(discovery.stdout);
    const discoveryDiagnostic = supportUiGlobalDiagnostic(discoveryReport);
    if (discoveryDiagnostic.globalErrors) console.error(JSON.stringify({ gate: "support-ui-runner", phase: "discovery", project, ...discoveryDiagnostic }));
    const cases = executionUiDiscovery(discoveryReport, specs, project);
    if (!smoke && cases.length < 7) throw new Error("Support UI full gate requires at least seven journeys per project");
    for (const [index, current] of cases.entries()) await withSupportEvalEnvironment(async environment => {
      await createSupportActors(environment.appRoot);
      const nativeCase = current.file.endsWith("support-advice.spec.ts");
      const previousNative = process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY;
      if (nativeCase) { await installSupportNativeFixture(environment); process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY = "1"; }
      try {
        await environment.start();
        const output = resolve(directory, `${project}-${index}`);
        const run = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", `${current.file}:${current.line}`, `--project=${project}`,
          "--reporter=json", "--forbid-only", "--retries=0", `--output=${output}`], {
          env: { ...process.env, TURAS_UI_BASE_URL: environment.origin, TURAS_SUPPORT_UI_FIXTURE_READY: "1" },
          encoding: "utf8", timeout: 240000, maxBuffer: 10000000,
        });
        await writeFile(resolve(directory, `${project}-${index}.json`), run.stdout, { mode: 0o600 });
        await writeFile(resolve(directory, `${project}-${index}.log`), run.stderr + environment.privateLogTail(), { mode: 0o600 });
        await privateCaptures(output);
        const report = JSON.parse(run.stdout), diagnostic = supportUiGlobalDiagnostic(report);
        if (diagnostic.globalErrors) console.error(JSON.stringify({ gate: "support-ui-runner", phase: "execution", project, file: current.file, ...diagnostic }));
        const caseDiagnostic = supportUiCaseDiagnostic(report);
        if (caseDiagnostic.failedResults) console.error(JSON.stringify({ gate: "support-ui-case", project,
          file: current.file, line: current.line, ...caseDiagnostic }));
        const counts = verifyExecutionUiReport(report, [current]);
        if (run.status !== 0 || counts.unexpected || counts.skipped || counts.flaky || counts.expected !== 1) throw new Error("Support UI case failed");
        passed++;
      } finally {
        await environment.stop();
        if (previousNative === undefined) delete process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY;
        else process.env.TURAS_SUPPORT_NATIVE_FIXTURE_READY = previousNative;
      }
    }, { empty: true, deadlineAt: Date.now() + 360000 });
  }
  if (await featureSourceDigest("010") !== sourceDigest) throw new Error("Support UI source changed");
  console.log(JSON.stringify({ gate: smoke ? "support-ui-smoke" : "support-ui-acceptance", sourceDigest, projects: 4, passed, fullAcceptance: !smoke }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Support UI check failed"); process.exitCode = 1; });
