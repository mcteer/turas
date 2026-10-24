import { closeRuntimePool, query } from "../lib/server/db/client";
import { getServerConfig } from "../lib/server/config";
import { claimArtifactRun } from "../lib/server/artifacts/jobs";
import { runArtifactJob } from "../lib/server/artifacts/runner";
import { artifactInfrastructureReady, heartbeatArtifactWorker } from "../lib/server/artifacts/worker-readiness";
import { recordArtifactMetric } from "../lib/server/artifacts/telemetry";

let stopping = false;
let working = false;
let healthy = false;
let schemaReady = false;

async function refresh(): Promise<void> {
  if (stopping) return;
  const marker = await query<{ schema_version: number }>(
    "SELECT schema_version FROM turas_environment WHERE environment_id=$1", [getServerConfig().TURAS_ENVIRONMENT_ID]);
  schemaReady = (marker.rows[0]?.schema_version ?? 0) >= 18;
  if (!schemaReady) { healthy = false; return; }
  healthy = await artifactInfrastructureReady();
  if (healthy) await heartbeatArtifactWorker();
}

async function work(): Promise<void> {
  if (stopping || working || !healthy) return;
  working = true;
  try {
    const claim = await claimArtifactRun();
    if (claim) {
      if (claim.queueAgeMs !== undefined) recordArtifactMetric("queue_age_ms",claim.queueAgeMs);
      await runArtifactJob(claim);
    }
  } catch { healthy = false; }
  finally { working = false; }
}

const heartbeatTimer = setInterval(() => { void refresh().catch(() => { healthy = false; schemaReady = false; }); }, 2_000);
const workTimer = setInterval(() => { void work(); }, 2_000);
void refresh().then(work).catch(() => { healthy = false; schemaReady = false; });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    clearInterval(heartbeatTimer);
    clearInterval(workTimer);
    void closeRuntimePool().finally(() => process.exit());
  });
}
