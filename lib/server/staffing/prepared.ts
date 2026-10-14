import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getServerConfig } from "../config";
import {preparedArtifactImages} from '../artifacts/prepared';
import {executionBackend} from '../jobs/backend';
export type WorkforceImages = { contract: "workforce-table-v1"; environmentId: string;
  parserImage: string; parserDigest: string;
  scannerImage: string; scannerDigest: string;signatureVersion?:string };
export function preparedWorkforceImages(): WorkforceImages {
  if(executionBackend()==='sandbox')return {...preparedArtifactImages(),contract:'workforce-table-v1',environmentId:getServerConfig().TURAS_ENVIRONMENT_ID};
  const root = process.env.TURAS_WORKFORCE_STORE_ROOT;
  if (!root) throw new Error("Workforce preparation required");
  const path = join(root, "runtime-images.json"), stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error("Workforce image attestation invalid");
  const images = JSON.parse(readFileSync(path, "utf8")) as WorkforceImages;
  const parser=process.env.TURAS_PILOT_PARSER_IMAGE??'turas-artifact-parser:007-v1',scanner=process.env.TURAS_PILOT_SCANNER_IMAGE??'turas-artifact-scanner:004-v1';
  if((parser!=='turas-artifact-parser:007-v1'&&!/^sha256:[a-f0-9]{64}$/.test(parser))||(scanner!=='turas-artifact-scanner:004-v1'&&!/^sha256:[a-f0-9]{64}$/.test(scanner)))throw Error('Local workforce image selection must be immutable');
  if (images.contract !== "workforce-table-v1" || images.environmentId !== getServerConfig().TURAS_ENVIRONMENT_ID ||
    images.parserImage !== parser || images.scannerImage !== scanner ||
    !/^[a-f0-9]{64}$/.test(images.parserDigest) || !/^[a-f0-9]{64}$/.test(images.scannerDigest)) throw new Error("Workforce image attestation invalid");
  if(parser.startsWith('sha256:')&&parser!=='sha256:'+images.parserDigest||scanner.startsWith('sha256:')&&scanner!=='sha256:'+images.scannerDigest)throw Error('Local workforce image attestation differs');return images;
}
