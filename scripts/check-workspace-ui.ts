import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { withStaffingEvalEnvironment } from "./staffing-eval-environment";

// Native model execution is outside this presentation/interaction check.
process.env.AI_GATEWAY_API_KEY = "";
process.env.TURAS_ALLOW_LIVE_MODEL_TESTS = "0";
const projects = ["webkit-desktop-light", "webkit-desktop-dark", "webkit-mobile-light", "webkit-mobile-dark"];
const [project, ...extra] = process.argv.slice(2);
if (extra.length || project && !projects.includes(project)) throw new Error("Expected an optional named WebKit project");
await mkdir("local-artifacts/workspace-ui", { recursive: true, mode: 0o700 });
const directory = await mkdtemp(resolve("local-artifacts/workspace-ui/run-"));
const captures = join(directory, "captures");
await mkdir(captures, { mode: 0o700 });
await withStaffingEvalEnvironment(async environment => {
  await environment.start();
  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
      const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test",
        "--config=playwright.workspace.config.ts", "--reporter=json", "--forbid-only", "--retries=0",
        ...(project ? [`--project=${project}`] : [])], {
        env: { ...process.env, CI: "true", TURAS_UI_BASE_URL: environment.origin,
          TURAS_UI_FIXTURE_DATABASE_URL: process.env.DATABASE_URL_UNPOOLED,
          TURAS_PLAN_FIXTURE_READY: "1", TURAS_UI_CAPTURE_ROOT: captures },
        stdio: ["ignore", "pipe", "pipe"], timeout: 1_000_000,
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk.toString(); });
      child.stderr.on("data", chunk => { stderr += chunk.toString(); });
      child.on("error", reject);
      child.on("close", code => done({ code, stdout, stderr }));
    });
    await writeFile(join(directory, "report.json"), result.stdout, { mode: 0o600 });
    await writeFile(join(directory, "stderr.log"), result.stderr, { mode: 0o600 });
    const report = JSON.parse(result.stdout) as {
      stats: { expected: number; unexpected: number; skipped: number; flaky: number }; errors: unknown[];
    };
    console.log(JSON.stringify({ gate: "workspace-ui", projects: project ? 1 : 4, ...report.stats }));
    if (result.code !== 0 || report.errors.length || !report.stats.expected || report.stats.unexpected ||
        report.stats.skipped || report.stats.flaky) throw new Error("Workspace UI failed; inspect private reports");
  } finally { await environment.stop(); }
}, { deadlineAt: Date.now() + 1_200_000 });
