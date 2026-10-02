import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getServerConfig } from "../config";
export type WorkforceImages = { contract: "workforce-table-v1"; environmentId: string;
  parserImage: "turas-artifact-parser:007-v1"; parserDigest: string;
  scannerImage: "turas-artifact-scanner:004-v1"; scannerDigest: string };
export function preparedWorkforceImages(): WorkforceImages {
  const root = process.env.TURAS_WORKFORCE_STORE_ROOT;
  if (!root) throw new Error("Workforce preparation required");
  const path = join(root, "runtime-images.json"), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error("Workforce image attestation invalid");
  const images = JSON.parse(readFileSync(path, "utf8")) as WorkforceImages;
  if (images.contract !== "workforce-table-v1" || images.environmentId !== getServerConfig().TURAS_ENVIRONMENT_ID ||
    images.parserImage !== "turas-artifact-parser:007-v1" || images.scannerImage !== "turas-artifact-scanner:004-v1" ||
    !/^[a-f0-9]{64}$/.test(images.parserDigest) || !/^[a-f0-9]{64}$/.test(images.scannerDigest)) throw new Error("Workforce image attestation invalid");
  return images;
}
