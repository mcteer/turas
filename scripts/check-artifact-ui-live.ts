import { spawnSync } from "node:child_process";
import { withArtifactEvalEnvironment } from "./artifact-eval-environment";

await withArtifactEvalEnvironment(async () => {
  const run = spawnSync(process.execPath,["node_modules/@playwright/test/cli.js","test",
    "tests/ui/artifact-upload-live.spec.ts","--project=webkit-desktop-light"],{
    stdio: "inherit",timeout: 180_000,
    env: { ...process.env,TURAS_UI_BASE_URL: process.env.TURAS_APP_ORIGIN,
      TURAS_UI_ARTIFACT_LIVE: "1" },
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`Isolated artifact browser journey failed (${run.status})`);
});
