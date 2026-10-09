import { readdirSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { withPartnerEnvironment } from "./partners-environment";
import { featureSourceDigest } from "./execution-source-digest";

export function verifyPartnerSuiteCoverage(root = process.cwd(), expected?: readonly string[]) {
  const manifest = expected ?? JSON.parse(readFileSync(resolve(root, "scripts/partners-suites.json"), "utf8")) as string[];
  const actual = ["unit", "contracts", "integration"].flatMap(group =>
    readdirSync(resolve(root, "tests", group)).filter(name => /^partner-.*\.test\.ts$/.test(name)).map(name => `tests/${group}/${name}`));
  if (!manifest.length || new Set(manifest).size !== manifest.length || actual.length !== manifest.length || actual.some(p => !manifest.includes(p)))
    throw Error("Partner suite manifest is missing, duplicated or orphaned");
  return [...manifest];
}
export type PartnerTestReport = { success?: boolean; numFailedTests?: number; numPendingTests?: number;
  testResults?: Array<{ name: string; assertionResults?: Array<{ status: string }> }> };
export function verifyPartnerTestReport(report: PartnerTestReport, expected: readonly string[]) {
  if (!expected.length || new Set(expected).size !== expected.length || !report.success || report.numFailedTests || report.numPendingTests || report.testResults?.length !== expected.length)
    throw Error("Partner acceptance report failed or has skipped/missing suites");
  let passed = 0;
  for (const path of expected) {
    const file = report.testResults.find(f => f.name.endsWith(path));
    if (!file?.assertionResults?.length || file.assertionResults.some(t => t.status !== "passed")) throw Error("Partner acceptance has missing/skipped assertions");
    passed += file.assertionResults.length;
  }
  return passed;
}
export function runPartnerProcess(args: string[], options: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv;signal?:AbortSignal } = {}) {
  return new Promise<void>((done, reject) => {
    const child = spawn(process.execPath, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: "inherit" });
    let stopped = false;
    let escalation:NodeJS.Timeout|undefined;const stop = () => { stopped = true; child.kill("SIGTERM");escalation??=setTimeout(()=>child.kill("SIGKILL"),5000); };
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    options.signal?.addEventListener("abort",stop,{once:true});if(options.signal?.aborted)stop();
    const timer = setTimeout(() => { stopped = true; child.kill("SIGKILL"); }, options.timeoutMs ?? 240000);
    child.once("error", error=>{clearTimeout(timer);clearTimeout(escalation);options.signal?.removeEventListener("abort",stop);process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);reject(error);});
    child.once("exit", code => { clearTimeout(timer);clearTimeout(escalation);options.signal?.removeEventListener("abort",stop); process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
      if (code === 0 && !stopped) done(); else reject(Error("Partner check failed or interrupted")); });
  });
}
export function capturePartnerProcess(args:string[],timeoutMs:number,signal?:AbortSignal){return new Promise<{status:number|null;stdout:string;stderr:string;error:boolean}>(done=>{
 const child=spawn(process.execPath,args,{env:process.env,stdio:["ignore","pipe","pipe"]});let stdout="",stderr="",failed=false,finished=false,escalation:NodeJS.Timeout|undefined;const stop=()=>{failed=true;child.kill("SIGTERM");escalation??=setTimeout(()=>child.kill("SIGKILL"),5000);},kill=setTimeout(()=>{failed=true;child.kill("SIGKILL");},timeoutMs);process.once("SIGINT",stop);process.once("SIGTERM",stop);signal?.addEventListener("abort",stop,{once:true});if(signal?.aborted)stop();
 const finish=(status:number|null)=>{if(finished)return;finished=true;clearTimeout(kill);clearTimeout(escalation);signal?.removeEventListener("abort",stop);process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop);done({status,stdout,stderr,error:failed});};
 child.stdout?.on("data",data=>{stdout+=data.toString();if(stdout.length>20000000)stop();});child.stderr?.on("data",data=>{stderr=(stderr+data.toString()).slice(-1000000);});child.once("error",()=>{failed=true;finish(null);});child.once("exit",finish);
});}
export async function runPartnerSuites(suites: readonly string[], reportPath: string) {
  await withPartnerEnvironment(async environment => {
    await runPartnerProcess(["node_modules/vitest/vitest.mjs", "run", ...suites, "--reporter=default", "--reporter=json", `--outputFile=${reportPath}`],{signal:environment.signal});
  }, { deadlineMs: 300000 });
  return verifyPartnerTestReport(JSON.parse(await readFile(reportPath, "utf8")), suites);
}
export async function testPartners() {
  const development = process.argv[2] === "--development";
  if (process.argv.length !== 2 && !development) throw Error("Partner acceptance accepts no path/database overrides");
  const suites = development ? process.argv.slice(3) : verifyPartnerSuiteCoverage();
  if (!suites.length || suites.some(p => !/^tests\/(unit|contracts|integration)\/partner-[a-z-]+\.test\.ts$/.test(p))) throw Error("Invalid development suites");
  const digest = await featureSourceDigest("013");
  await mkdir(resolve("local-artifacts/013"), { recursive: true, mode: 0o700 });
  const reportPath = resolve("local-artifacts/013", `tests-${randomUUID()}.json`);
  const passed = await runPartnerSuites(suites, reportPath);
  if (await featureSourceDigest("013") !== digest) throw Error("Partner source changed during acceptance");
  const summary = { sourceDigest: digest, suites: suites.length, passed, failed: 0, skipped: 0, acceptance: !development };
  await writeFile(`${reportPath}.summary.json`, JSON.stringify(summary), { mode: 0o600 });
  console.log(JSON.stringify(summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) testPartners().catch(() => {
  console.error("Partner acceptance failed; inspect synthetic local evidence"); process.exitCode = 1;
});
