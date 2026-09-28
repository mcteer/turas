import { z } from "zod";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const credential = z.string().min(1);
const databaseUrl = z.string().url().refine((value) => {
  const url = new URL(value);
  return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.slice(1));
}, "A Postgres database URL is required");

const schema = z.object({
  DATABASE_URL: databaseUrl,
  DATABASE_URL_UNPOOLED: databaseUrl,
  TURAS_ENVIRONMENT_ID: z.string().min(1),
  TURAS_APP_ORIGIN: z.string().url().refine((value) => new URL(value).origin === value, "An exact application origin is required"),
  TURAS_DEMO_USERNAME: z.literal("mcteer"),
  TURAS_DEMO_PASSWORD: credential,
  PANEL_USERNAME: z.literal("panel"),
  PANEL_PASSWORD: credential,
  PARTNER_USERNAME: z.literal("partner"),
  PARTNER_PASSWORD: credential,
  TURAS_MAINTENANCE_SECRET: z.string().min(32),
});

export type ServerConfig = z.infer<typeof schema>;

export function parseServerConfig(environment: Record<string, string | undefined>): ServerConfig {
  if (typeof window !== "undefined") throw new Error("Server configuration cannot run in a browser");
  const parsed = schema.safeParse(environment);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean);
    throw new Error(`Turas configuration invalid: ${[...new Set(names)].join(", ")}`);
  }
  return parsed.data;
}

export function getServerConfig(): ServerConfig {
  return parseServerConfig(process.env);
}

const artifactRootMarker = ".turas-artifact-store.json";

export type ArtifactStoreConfig = {
  root: string;
  environmentId: string;
};

/** A store must be explicitly marked for one environment before any artifact IO. */
export function parseArtifactStoreConfig(
  environment: Record<string, string | undefined>,
  repositoryRoot = process.cwd(),
): ArtifactStoreConfig {
  if (typeof window !== "undefined") throw new Error("Artifact store configuration is server-only");
  const configured = environment.TURAS_ARTIFACT_STORE_ROOT;
  const environmentId = environment.TURAS_ENVIRONMENT_ID;
  if (!configured || !environmentId) throw new Error("Artifact store root and environment are required");
  if (!isAbsolute(configured)) throw new Error("Artifact store root must be absolute");
  const root = resolve(configured);
  const repo = realpathSync(repositoryRoot);
  const publicRoot = resolve(repo, "public");
  const insidePublic = relative(publicRoot, root);
  if (!insidePublic.startsWith(`..${sep}`) && insidePublic !== "..") {
    throw new Error("Artifact store cannot be public");
  }
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("Artifact store root must be a private directory");
  const canonical = realpathSync(root);
  const canonicalPublic = relative(publicRoot, canonical);
  if (!canonicalPublic.startsWith(`..${sep}`) && canonicalPublic !== "..") {
    throw new Error("Artifact store cannot resolve into public");
  }
  const markerStat = lstatSync(resolve(canonical, artifactRootMarker));
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) throw new Error("Artifact store marker is invalid");
  const marker = JSON.parse(readFileSync(resolve(canonical, artifactRootMarker), "utf8")) as unknown;
  if (typeof marker !== "object" || marker === null || !("environmentId" in marker) || marker.environmentId !== environmentId) {
    throw new Error("Artifact store belongs to a different environment");
  }
  if ((rootStat.mode & 0o077) !== 0 || (markerStat.mode & 0o077) !== 0) {
    throw new Error("Artifact store permissions are too broad");
  }
  return { root: canonical, environmentId };
}
