import { createHash } from "node:crypto";
import { lstat, realpath, readFile } from "node:fs/promises";
import { resolve, join, dirname, relative, sep } from "node:path";
import { query } from "../../../lib/server/db/client";
import { requireOwnedStaffingClone, type StaffingEvalEnvironment } from "../../../scripts/staffing-eval-environment";

/** Private restart evidence. Root device/inode identity detects replacement of
 * the owned workflow/store directories without freezing legitimate journal writes.
 * Database URLs, credentials and workflow contents are never returned. */
export async function readOwnedStaffingPair(environment: StaffingEvalEnvironment) {
  requireOwnedStaffingClone();
  const owner = await realpath(dirname(environment.appRoot));
  const allowed = await realpath(resolve("local-artifacts/007"));
  if (!owner.startsWith(`${allowed}/eval-`) || new URL(process.env.DATABASE_URL!).pathname !== `/${environment.databaseName}`)
    throw new Error("Owned restart pair required");
  const directories = [environment.appRoot, environment.storeRoot, environment.workforceRoot, environment.workflowRoot];
  const identities = [];
  for (const path of directories) {
    const canonical = await realpath(path), within = relative(owner, canonical), info = await lstat(path);
    if (canonical !== resolve(path) || !within || within === ".." || within.startsWith(`..${sep}`) ||
      !info.isDirectory() || info.isSymbolicLink()) throw new Error("Owned restart directory identity unavailable");
    identities.push({ kind: directories.indexOf(path), device: info.dev, inode: info.ino });
  }
  if (process.env.TURAS_ARTIFACT_STORE_ROOT !== environment.storeRoot || process.env.TURAS_WORKFORCE_STORE_ROOT !== environment.workforceRoot)
    throw new Error("Owned restart store selection changed");
  const digest = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
  const manifest = JSON.parse(await readFile(resolve("migrations/manifest.json"), "utf8")) as { version: number };
  const marker = (await query("SELECT current_database() AS database,environment_id,schema_version FROM turas_environment")).rows;
  if (marker.length !== 1 || marker[0].database !== environment.databaseName || marker[0].environment_id !== process.env.TURAS_ENVIRONMENT_ID ||
    marker[0].schema_version !== manifest.version) throw new Error("Owned restart database marker changed");
  return { database: marker[0].database, environmentId: marker[0].environment_id, schemaVersion: marker[0].schema_version,
    directories: identities, artifactMarker: await digest(join(environment.storeRoot, ".turas-artifact-store.json")),
    workforceMarker: await digest(join(environment.workforceRoot, ".turas-workforce-store.json")) };
}
