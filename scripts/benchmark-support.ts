import { performance } from "node:perf_hooks";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { withSupportEvalEnvironment } from "./support-eval-environment";
import { featureSourceDigest } from "./execution-source-digest";
import { createSupportActors } from "../tests/fixtures/support/seed";
import { seedSupportBenchmark, supportBenchmarkShape as shape } from "../tests/fixtures/support/load";
import { readSupportWorkspace, readSupportHistory } from "../lib/server/support/projection";
import { createSupportReviewPreview, decideSupportRevision } from "../lib/server/support/review";
import { closeRuntimePool } from "../lib/server/db/client";

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--disposable") throw new Error("Support benchmark requires --disposable with no overrides");
  const sourceDigest = await featureSourceDigest("010");
  await mkdir("local-artifacts/010", { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(resolve("local-artifacts/010/benchmark-"));
  await withSupportEvalEnvironment(async environment => {
    try {
    await createSupportActors(environment.appRoot);
    const fixture = await seedSupportBenchmark(), results: unknown[] = [];
    // Shared privileged identity: five clients do not create five reviewer quotas.
    // Reserve at most 20 operations/minute, leaving room for acknowledgement previews.
    let slots = 0, window = Math.floor(Date.now() / 60000), reservations = Promise.resolve();
    function reserve(cost = 1) {
      const next = reservations.then(async () => {
        if (Math.floor(Date.now() / 60000) !== window) { window = Math.floor(Date.now() / 60000); slots = 0; }
        if (slots + cost > 20) { await new Promise(resolve => setTimeout(resolve, 60050 - Date.now() % 60000)); window = Math.floor(Date.now() / 60000); slots = 0; }
        slots += cost;
      });
      reservations = next;
      return next;
    }
    async function measure<T>(name: string, call: (index: number, client: number, prepared: T) => Promise<void>, prepare?: (index: number, client: number) => Promise<T>) {
      const durations: number[] = [];
      async function invoke(index: number, client: number, measured: boolean) {
        // Acknowledgement preparation creates a separately admitted preview;
        // reserve both production write charges before either request begins.
        await reserve(prepare ? 2 : 1);
        const prepared = await prepare?.(index, client), start = performance.now();
        await call(index, client, prepared as T);
        if (measured) durations.push(performance.now() - start);
      }
      for (let i = 0; i < shape.warmups; i++) await invoke(i, i % shape.users, false);
      await Promise.all(Array.from({ length: shape.users }, async (_, client) => {
        for (let i = shape.warmups + client; i < shape.warmups + shape.samples; i += shape.users) await invoke(i, client, true);
      }));
      durations.sort((a, b) => a - b);
      const result = { name, samples: durations.length, warmups: shape.warmups, clients: shape.users, p95: durations[Math.ceil(durations.length * .95) - 1], correctnessFailures: 0 };
      results.push(result);
      await writeFile(resolve(directory, `${name}.json`), JSON.stringify(result), { mode: 0o600, flag: "wx" });
      console.log(JSON.stringify({ gate: "support-benchmark-class", ...result }));
      check(durations.length === shape.samples && result.p95 <= 2000, "Support benchmark latency gate failed");
    }
    const selected = (index: number) => fixture.scopes[index];
    await measure("list", async (i, client) => {
      const scope = selected(i), result = await readSupportWorkspace(fixture.users[client], scope.customerId, scope.workloadId, "delivery", { limit: 20 });
      check(result.actions.length === (client === 1 ? 10 : 2), "Incorrect governed action list");
    });
    await measure("detail", async (i, client) => {
      const scope = selected(i), record = scope.records[client];
      const result = await readSupportHistory(fixture.users[client], scope.customerId, scope.workloadId, "delivery", record.recordId);
      check(result.recordId === record.recordId && result.revisions.length === 4, "Incorrect governed action history");
    });
    await measure("preview", async i => {
      const scope = selected(i), record = scope.records[0];
      const result = await createSupportReviewPreview(fixture.reviewer, scope.customerId, { workloadId: scope.workloadId, ...record });
      check(result.expectedVersion === 4 && !!result.sourceDigest, "Incorrect exact review preview");
    });
    await measure("acknowledgement", async (i, _client, preview: Awaited<ReturnType<typeof createSupportReviewPreview>>) => {
      const scope = selected(i), record = scope.records[0];
      const result = await decideSupportRevision(fixture.reviewer, scope.customerId, { contractVersion: "support-v1", operation: "review_revision",
        requestKey: randomUUID(), workloadId: scope.workloadId, ...record, expectedVersion: preview.expectedVersion,
        sourceDigest: preview.sourceDigest, decision: "accept", rationale: "Human reviews the exact synthetic benchmark proposal" });
      check(result.outcome === "accepted" && result.revisionId === record.revisionId, "Incorrect review acknowledgement");
    }, async i => {
      const scope = selected(i);
      return createSupportReviewPreview(fixture.reviewer, scope.customerId, { workloadId: scope.workloadId, ...scope.records[0] });
    });
    check(await featureSourceDigest("010") === sourceDigest, "Support source changed during benchmark");
    const evidence = { gate: "support-benchmark", sourceDigest, corpusDigest: fixture.corpusDigest, dataset: shape,
      results, productionRatesPreserved: true, pacingExcludedFromLatency: true, hostedProof: false };
    await writeFile(resolve(directory, "completed.json"), JSON.stringify(evidence), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify(evidence));
    } catch (error) {
      await writeFile(resolve(directory, "failure.json"), JSON.stringify(error instanceof Error ? {
        name: error.name, message: error.message, stack: error.stack,
        ...("code" in error ? { code: error.code } : {}),
      } : { failed: true }), { mode: 0o600, flag: "wx" });
      throw error;
    } finally {
      // End clients before the owned environment terminates/drops its database,
      // including when a correctness assertion or application request fails.
      await closeRuntimePool();
    }
  }, { empty: true, deadlineAt: Date.now() + 2400000 });
}
main().catch(() => { console.error("Support benchmark failed; no completed evidence issued"); process.exitCode = 1; });
