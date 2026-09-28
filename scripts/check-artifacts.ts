import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { requireTestDatabaseUrl } from "../tests/fixtures/database";
import { parseArtifactStoreConfig } from "../lib/server/config";
import { preparedArtifactImages } from "../lib/server/artifacts/prepared";
import { artifactInfrastructureReady } from "../lib/server/artifacts/worker-readiness";
import { artifactContainerInvocation } from "../lib/server/artifacts/containers";
import { runArtifactContainer } from "../lib/server/artifacts/scan";

requireTestDatabaseUrl();
const started = Date.now();
process.env.TURAS_ARTIFACT_STORE_ROOT ??= join(process.cwd(),"local-artifacts/004/store");
process.env.TURAS_ENVIRONMENT_ID ??= "local-002";
parseArtifactStoreConfig(process.env);
const images = preparedArtifactImages();
for (const [image,expected] of [[images.parserImage,images.parserDigest],
  [images.scannerImage,images.scannerDigest]]) {
  const current = execFileSync("docker",["image","inspect","--format","{{.Id}}",image],
    { encoding: "utf8",timeout: 10_000 }).trim().replace(/^sha256:/,"");
  if (current !== expected) throw new Error("Prepared artifact image changed");
}
if (!await artifactInfrastructureReady()) throw new Error("Artifact signatures or OCR assets are unavailable");
const fixture = join(process.cwd(),"local-artifacts/004/fixtures/simple.txt");
const privateRoot = parseArtifactStoreConfig(process.env).root;
const probe = artifactContainerInvocation({ kind: "parse",image: images.parserImage,
  originalPath: fixture,ocrAssetsPath: join(privateRoot,"assets") });
probe.args.splice(probe.args.length-1,0,"--entrypoint","node");
const proof = await runArtifactContainer({ ...probe,deadlineMs: 10_000,maxOutputBytes: 4096 },[
  "-e",`const f=require('node:fs');let denied=false;try{f.writeFileSync('/probe','x')}catch(e){denied=['EROFS','EACCES'].includes(e.code)};
  console.log(JSON.stringify({uid:process.getuid(),rootWriteDenied:denied,
  networks:f.readdirSync('/sys/class/net'),memory:f.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),
  input:f.readFileSync('/input','utf8').includes('Juniper API'),assets:f.existsSync('/assets'),
  signatures:f.existsSync('/signatures')}))`,
]);
if (proof.exitCode !== 0) throw new Error("Parser isolation probe failed");
const isolation = JSON.parse(proof.stdout.toString("utf8")) as {
  uid: number; rootWriteDenied: boolean; networks: string[]; memory: string;
  input: boolean; assets: boolean; signatures: boolean;
};
if (isolation.uid !== 65_532 || !isolation.rootWriteDenied ||
    isolation.networks.some((name) => name !== "lo") ||
    isolation.memory !== String(1024**3) || !isolation.input ||
    !isolation.assets || isolation.signatures) {
  throw new Error("Parser container isolation differs from the worker contract");
}
const timed = artifactContainerInvocation({ kind: "parse",image: images.parserImage,
  originalPath: fixture,ocrAssetsPath: join(privateRoot,"assets") });
timed.args.splice(timed.args.length-1,0,"--entrypoint","node");
let timedOut = false;
try {
  await runArtifactContainer({ ...timed,deadlineMs: 250,maxOutputBytes: 4096 },
    ["-e","setInterval(()=>{},1000)"]);
} catch (error) { timedOut = error instanceof Error && error.message === "artifact_container_timeout"; }
if (!timedOut) throw new Error("Parser container deadline did not stop a hanging process");
const exhausted = spawnSync("docker",["run","--rm","--network","none","--read-only",
  "--memory","128m","--memory-swap","128m","--pids-limit","64",
  "--entrypoint","node",images.parserImage,"-e",
  "const bytes=Buffer.alloc(512*1024*1024,1);console.log(bytes.length)"],
{ encoding: "utf8",timeout: 10_000,maxBuffer: 4096 });
if (exhausted.error || exhausted.status !== 137) {
  throw new Error("Parser memory limit did not terminate the exhausted process");
}
const result = spawnSync(process.execPath,["--env-file-if-exists=.env.local",
  "node_modules/vitest/vitest.mjs","run",
  "tests/unit/artifact-container-policy.test.ts",
  "tests/integration/artifact-extraction.test.ts",
  "tests/contracts/artifact-upload.test.ts"],
{ stdio: "inherit",env: process.env,timeout: 120_000 });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (Date.now()-started > 120_000) throw new Error("Synthetic artifact check exceeded 120 seconds");
console.info(JSON.stringify({ kind: "artifact_fixture_check",result: "passed",
  durationMs: Date.now()-started,parserImage: images.parserImage,
  scannerImage: images.scannerImage }));
