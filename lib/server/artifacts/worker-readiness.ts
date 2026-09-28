import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getServerConfig, parseArtifactStoreConfig } from "../config";
import { preparedArtifactImages } from "./prepared";
import { assertFreshArtifactSignatures } from "./scan";

const heartbeatFile = "worker-heartbeat.json";

export async function artifactInfrastructureReady(): Promise<boolean> {
  try {
    const root = parseArtifactStoreConfig(process.env).root;
    preparedArtifactImages();
    await assertFreshArtifactSignatures(join(root, "signatures"));
    await lstat(join(root, "assets", "eng.traineddata"));
    return true;
  } catch { return false; }
}

export async function heartbeatArtifactWorker(): Promise<void> {
  const root = parseArtifactStoreConfig(process.env).root;
  await writeFile(join(root, heartbeatFile), JSON.stringify({
    environmentId: getServerConfig().TURAS_ENVIRONMENT_ID, at: new Date().toISOString(),
  }), { mode: 0o600 });
}

export async function artifactWorkerReady(): Promise<boolean> {
  if (!(await artifactInfrastructureReady())) return false;
  try {
    const root = parseArtifactStoreConfig(process.env).root;
    const path = join(root, heartbeatFile);
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o077) !== 0 ||
        Date.now() - file.mtimeMs > 15_000) return false;
    const payload = JSON.parse(await readFile(path, "utf8")) as { environmentId?: string; at?: string };
    return payload.environmentId === getServerConfig().TURAS_ENVIRONMENT_ID &&
      typeof payload.at === "string" && Date.now() - Date.parse(payload.at) <= 15_000;
  } catch { return false; }
}
