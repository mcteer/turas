import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArtifactStoreConfig } from "../config";

export type PreparedArtifactImages = {
  contract: "artifact-intake-v1";
  parserImage: "turas-artifact-parser:004-v1";
  parserDigest: string;
  scannerImage: "turas-artifact-scanner:004-v1";
  scannerDigest: string;
};

/** Local preparation writes image IDs here; workers independently compare Docker IDs. */
export function preparedArtifactImages(): PreparedArtifactImages {
  const root = parseArtifactStoreConfig(process.env).root;
  const path = resolve(root, "runtime-images.json");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error("Artifact image attestation is unsafe");
  }
  const value = JSON.parse(readFileSync(path, "utf8")) as PreparedArtifactImages;
  if (value.contract !== "artifact-intake-v1" ||
      value.parserImage !== "turas-artifact-parser:004-v1" ||
      value.scannerImage !== "turas-artifact-scanner:004-v1" ||
      !/^[a-f0-9]{64}$/.test(value.parserDigest) || !/^[a-f0-9]{64}$/.test(value.scannerDigest)) {
    throw new Error("Artifact image attestation is invalid");
  }
  return value;
}
