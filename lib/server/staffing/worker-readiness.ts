import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WorkforceStore } from "./store";
import { getServerConfig, parseArtifactStoreConfig } from "../config";
import { preparedWorkforceImages } from "./prepared";
import { assertFreshArtifactSignatures } from "../artifacts/scan";
export async function workforceInfrastructureReady() {
  try {
    await new WorkforceStore().assertReady(); preparedWorkforceImages();
    await assertFreshArtifactSignatures(join(parseArtifactStoreConfig(process.env).root, "signatures"));
    return true;
  } catch { return false; }
}
export async function heartbeatWorkforceWorker() {
  const store = new WorkforceStore(); await store.assertReady();
  const temp = join(store.root, `heartbeat-${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify({ environmentId: getServerConfig().TURAS_ENVIRONMENT_ID,
    at: new Date().toISOString(), infrastructureReady: await workforceInfrastructureReady() }), { mode: 0o600, flag: "wx" });
  await rename(temp, join(store.root, "worker-heartbeat.json"));
}
export async function workforceWorkerReady() {
  try {
    if (!await workforceInfrastructureReady()) return false;
    const store = new WorkforceStore(); const path = join(store.root, "worker-heartbeat.json"), stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || Date.now() - stat.mtimeMs > 15_000) return false;
    const value = JSON.parse(await readFile(path, "utf8"));
    return value.environmentId === getServerConfig().TURAS_ENVIRONMENT_ID && value.infrastructureReady === true &&
      typeof value.at === "string" && Date.parse(value.at) <= Date.now() && Date.now() - Date.parse(value.at) <= 15_000;
  } catch { return false; }
}
