import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArtifactStoreConfig } from "../config";
import {z} from 'zod';
import {executionBackend} from '../jobs/backend';

export type PreparedArtifactImages = {
  contract: "artifact-intake-v1";
  parserImage: string;
  parserDigest: string;
  scannerImage: string;
  scannerDigest: string;
  signatureVersion?:string;
};

/** Local preparation writes image IDs here; workers independently compare Docker IDs. */
export function preparedArtifactImages(): PreparedArtifactImages {
  if(executionBackend()==='sandbox'){
    const parser=process.env.TURAS_PILOT_PARSER_IMAGE,scanner=process.env.TURAS_PILOT_SCANNER_IMAGE;
    const pinned=/^vcr\.vercel\.com\/[a-zA-Z0-9_/-]+@sha256:[a-f0-9]{64}$/;
    if(!parser||!scanner||!pinned.test(parser)||!pinned.test(scanner))throw Error('Explicit hosted image provenance required');
    const raw=process.env.TURAS_PILOT_SCANNER_SIGNATURE_JSON;if(!raw||Buffer.byteLength(raw)>4096)throw Error('Hosted scanner provenance unavailable');
    const signature=z.strictObject({version:z.string().regex(/^\d+$/),builtAt:z.iso.datetime({offset:true}),snapshotDigest:z.string().regex(/^[a-f0-9]{64}$/),scannerDigest:z.string().regex(/^[a-f0-9]{64}$/)}).parse(JSON.parse(raw));
    const age=Date.now()-Date.parse(signature.builtAt);if(age< -60000||age>7*86400000||signature.scannerDigest!==scanner.split('@sha256:')[1])throw Error('scan_stale');
    return {contract:'artifact-intake-v1',parserImage:parser,parserDigest:parser.split('@sha256:')[1],scannerImage:scanner,scannerDigest:signature.scannerDigest,signatureVersion:signature.version};
  }
  const root = parseArtifactStoreConfig(process.env).root;
  const path = resolve(root, "runtime-images.json");
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error("Artifact image attestation is unsafe");
  }
  const value = JSON.parse(readFileSync(path, "utf8")) as PreparedArtifactImages;
  const parser=process.env.TURAS_PILOT_PARSER_IMAGE??"turas-artifact-parser:004-v1";
  const scanner=process.env.TURAS_PILOT_SCANNER_IMAGE??"turas-artifact-scanner:004-v1";
  if((parser!=="turas-artifact-parser:004-v1"&&!/^sha256:[a-f0-9]{64}$/.test(parser))||
     (scanner!=="turas-artifact-scanner:004-v1"&&!/^sha256:[a-f0-9]{64}$/.test(scanner)))throw Error("Local image selection must be immutable");
  if (value.contract !== "artifact-intake-v1" ||
      value.parserImage !== parser ||
      value.scannerImage !== scanner ||
      !/^[a-f0-9]{64}$/.test(value.parserDigest) || !/^[a-f0-9]{64}$/.test(value.scannerDigest)) {
    throw new Error("Artifact image attestation is invalid");
  }
  if((parser.startsWith("sha256:")&&parser!=="sha256:"+value.parserDigest)||
     (scanner.startsWith("sha256:")&&scanner!=="sha256:"+value.scannerDigest))throw Error("Local image selection disagrees with attestation");
  return value;
}
