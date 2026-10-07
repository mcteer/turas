import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { withSupportEvalEnvironment } from "./support-eval-environment";
import { featureSourceDigest } from "./execution-source-digest";
import { createSupportActors } from "../tests/fixtures/support/seed";
import { createSupportRecoveryFixture } from "../tests/fixtures/support/recovery";
import { assertDeterministicTestMode } from "../tests/fixtures/runtime";

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--disposable") throw new Error("Support recovery requires --disposable with no overrides");
  assertDeterministicTestMode();
  const sourceDigest = await featureSourceDigest("010");
  await mkdir(resolve("local-artifacts/010"), { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/010/recovery-"));
  const result = await withSupportEvalEnvironment(async environment => {
    await createSupportActors(environment.appRoot);
    const fixture = await createSupportRecoveryFixture(environment.workflowRoot);
    try {
      await environment.start();
      const before = await fixture.verify();
      await environment.restart();
      const after = await fixture.verify();
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Owned recovery state mismatch");
       const dependentPurgeVerified = await fixture.purgeDependent();
       await fixture.verify();
       return { ...after, dependentPurgeVerified };
    } catch (error) {
      await writeFile(resolve(directory, "runtime.log"), environment.privateLogTail(), { mode: 0o600 });
      throw error;
    } finally { await environment.stop(); }
  }, { empty: true, deadlineAt: Date.now() + 300000 });
  if (await featureSourceDigest("010") !== sourceDigest) throw new Error("Support source changed during recovery");
  const evidence = { gate: "support-preserved-restart", sourceDigest, ...result,
    hostedProof: false, nativeUncertainDispatchVerified: false };
  await writeFile(resolve(directory, "restart.json"), JSON.stringify(evidence), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
}
main().catch(() => { console.error("Support restart check failed; inspect private evidence"); process.exitCode = 1; });
