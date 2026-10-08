import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeFile, rename, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { withPlanEvalEnvironment, type PlanEvalEnvironment } from "./plan-eval-environment";

export function requireOwnedSupportClone(environment: Record<string, string | undefined> = process.env): string {
  const raw = environment.DATABASE_URL;
  if (!raw || raw !== environment.DATABASE_URL_UNPOOLED || raw !== environment.TURAS_TEST_DATABASE_URL ||
    !environment.TURAS_ENVIRONMENT_ID?.startsWith("test-") ||
    environment.TURAS_ENVIRONMENT_ID !== environment.TURAS_TEST_ENVIRONMENT_ID)
    throw new Error("Support checks require an owned disposable clone");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Invalid owned support clone identity"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !/^\/turas_test_010_eval_[a-f0-9]{12}$/.test(url.pathname))
    throw new Error("Support checks require an owned disposable clone");
  return raw;
}

export async function withSupportEvalEnvironment<T>(run: (environment: PlanEvalEnvironment & {
  workflowRoot: string; rootAgentDigest: string;
  upgradeToCurrent: () => Promise<void>;
}) => Promise<T>, options: { empty?: boolean; deadlineAt?: number; priorSchema?: 41 } = {}): Promise<T> {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Support checks require Node 24");
  const agentPath = join(process.cwd(), "agent/agent.ts");
  const digest = async () => createHash("sha256").update(await readFile(agentPath)).digest("hex");
  const rootAgentDigest = await digest();
  let fullManifest: string | undefined;
  let futureFiles: string[] = [];
  try {
    return await withPlanEvalEnvironment(async environment => {
      requireOwnedSupportClone();
      return run({ ...environment, rootAgentDigest, workflowRoot: join(environment.appRoot, ".eve", ".workflow-data"),
        upgradeToCurrent: async () => {
          requireOwnedSupportClone();
          if (!fullManifest) throw new Error("An owned prior-schema fixture is required for upgrade");
          for (const file of futureFiles) await rename(join(environment.appRoot, "support-future-migrations", file),
            join(environment.appRoot, "migrations", file));
          await writeFile(join(environment.appRoot, "migrations/manifest.json"), fullManifest, { mode: 0o600 });
          futureFiles = [];
          fullManifest = undefined;
          for (const script of ["scripts/db-migrate.ts", "scripts/db-roles.ts"]) {
            const result = spawnSync(process.execPath, ["--experimental-strip-types", script], {
              cwd: environment.appRoot, env: process.env, encoding: "utf8", timeout: 30_000, maxBuffer: 1_000_000,
            });
            if (result.error || result.status !== 0) throw new Error("Owned support schema upgrade failed");
          }
        },
      });
    }, { empty: options.empty, deadlineAt: options.deadlineAt, feature: "010",
      prepare: options.priorSchema === 41 ? async ({ appRoot }) => {
        const manifestPath = join(appRoot, "migrations/manifest.json");
        fullManifest = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(fullManifest) as {
          version: number; migrations: Array<{ file: string; sha256: string }>;
        };
        manifest.version = 41;
        futureFiles = manifest.migrations.filter(entry => Number(entry.file.slice(0, 3)) > 41).map(entry => entry.file);
        await mkdir(join(appRoot, "support-future-migrations"), { mode: 0o700 });
        for (const file of futureFiles) {
          if (!/^\d{3}-[a-z0-9-]+\.cjs$/.test(file)) throw new Error("Invalid owned migration identity");
          await rename(join(appRoot, "migrations", file), join(appRoot, "support-future-migrations", file));
        }
        manifest.migrations = manifest.migrations.filter(entry => Number(entry.file.slice(0, 3)) <= 41);
        if (manifest.migrations.length !== 41) throw new Error("Committed schema 041 fixture is incomplete");
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
        return {};
      } : undefined,
    });
  } finally {
    if (await digest() !== rootAgentDigest) throw new Error("Root agent changed during support verification");
  }
}
