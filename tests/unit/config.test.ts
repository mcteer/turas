import { describe, expect, it } from "vitest";
import { parseArtifactStoreConfig, parseServerConfig } from "../../lib/server/config";
import { chmodSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const valid = {
  DATABASE_URL: "postgres://localhost/turas_local",
  DATABASE_URL_UNPOOLED: "postgres://localhost/turas_local",
  TURAS_ENVIRONMENT_ID: "local-002",
  TURAS_APP_ORIGIN: "http://localhost:3000",
  TURAS_DEMO_USERNAME: "mcteer",
  TURAS_DEMO_PASSWORD: "synthetic",
  PANEL_USERNAME: "panel",
  PANEL_PASSWORD: "synthetic",
  PARTNER_USERNAME: "partner",
  PARTNER_PASSWORD: "synthetic",
  TURAS_MAINTENANCE_SECRET: "0".repeat(32),
};

describe("server configuration", () => {
  it("uses the exact generated Preview origin without changing Production", () => {
    const hosted = { ...valid, VERCEL_ENV: "preview", VERCEL_URL: "turas-preview.vercel.app" };
    expect(parseServerConfig(hosted).TURAS_APP_ORIGIN).toBe("https://turas-preview.vercel.app");
    expect(parseServerConfig({ ...hosted, VERCEL_ENV: "production" }).TURAS_APP_ORIGIN).toBe(valid.TURAS_APP_ORIGIN);
    expect(() => parseServerConfig({ ...hosted, VERCEL_URL: "attacker.example/path" })).toThrow("VERCEL_URL");
  });
  it("accepts complete explicit configuration", () => {
    expect(parseServerConfig(valid).TURAS_ENVIRONMENT_ID).toBe("local-002");
  });

  it("fails closed without a partner credential or signing secret", () => {
    const { PARTNER_PASSWORD: _password, TURAS_MAINTENANCE_SECRET: _secret, ...incomplete } = valid;
    expect(() => parseServerConfig(incomplete)).toThrow("PARTNER_PASSWORD");
    expect(() => parseServerConfig(incomplete)).toThrow("TURAS_MAINTENANCE_SECRET");
  });

  it("rejects an alternate demo principal and unsafe origin path", () => {
    expect(() => parseServerConfig({ ...valid, PARTNER_USERNAME: "another" })).toThrow("PARTNER_USERNAME");
    expect(() => parseServerConfig({ ...valid, TURAS_APP_ORIGIN: "http://localhost:3000/path" })).toThrow("TURAS_APP_ORIGIN");
  });
});

describe("artifact store configuration", () => {
  it("accepts only a private root marked for the matching environment", () => {
    const root = mkdtempSync(join(tmpdir(), "turas-artifact-config-"));
    try {
      chmodSync(root, 0o700);
      const marker = join(root, ".turas-artifact-store.json");
      writeFileSync(marker, JSON.stringify({ environmentId: "test-004" }), { mode: 0o600 });
      const config = { TURAS_ARTIFACT_STORE_ROOT: root, TURAS_ENVIRONMENT_ID: "test-004" };
      expect(parseArtifactStoreConfig(config).root).toBe(realpathSync(root));
      expect(() => parseArtifactStoreConfig({ ...config, TURAS_ENVIRONMENT_ID: "other" })).toThrow("different environment");
      chmodSync(marker, 0o644);
      expect(() => parseArtifactStoreConfig(config)).toThrow("permissions");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a root inside public", () => {
    const root = join(process.cwd(), "public", "artifact-config-test");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    try {
      expect(() => parseArtifactStoreConfig({ TURAS_ARTIFACT_STORE_ROOT: root, TURAS_ENVIRONMENT_ID: "test-004" })).toThrow("public");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
