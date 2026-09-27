import { describe, expect, it } from "vitest";
import { parseServerConfig } from "../../lib/server/config";
import { verifyConfiguredCredentials } from "../../lib/server/auth/credentials";
import { createSessionToken, hashSessionToken, sessionExpiresAt } from "../../lib/server/auth/sessions";
import { checkMutationOrigin } from "../../lib/server/auth/csrf";
import { loginBlocked } from "../../lib/server/auth/rate-limit";
import { DEMO_IDS } from "../fixtures/identities";

const config = parseServerConfig({
  DATABASE_URL: "postgres://localhost/turas_test",
  DATABASE_URL_UNPOOLED: "postgres://localhost/turas_test",
  TURAS_ENVIRONMENT_ID: "test-auth",
  TURAS_APP_ORIGIN: "http://localhost:3000",
  TURAS_DEMO_USERNAME: "mcteer",
  TURAS_DEMO_PASSWORD: "synthetic-admin-secret",
  PANEL_USERNAME: "panel",
  PANEL_PASSWORD: "synthetic-panel-secret",
  PARTNER_USERNAME: "partner",
  PARTNER_PASSWORD: "synthetic-partner-secret",
  TURAS_MAINTENANCE_SECRET: "0".repeat(32),
});

describe("demo authentication primitives", () => {
  it("resolves exactly the three configured accounts to stable principal IDs", () => {
    expect(verifyConfiguredCredentials("panel", "synthetic-panel-secret", config)).toBe(DEMO_IDS.panel);
    expect(verifyConfiguredCredentials("mcteer", "synthetic-admin-secret", config)).toBe(DEMO_IDS.mcteer);
    expect(verifyConfiguredCredentials("partner", "synthetic-partner-secret", config)).toBe(DEMO_IDS.partner);
    expect(verifyConfiguredCredentials("unknown", "synthetic-panel-secret", config)).toBeNull();
    expect(verifyConfiguredCredentials("panel", "wrong", config)).toBeNull();
    expect(verifyConfiguredCredentials("panel", "replacement-password", {
      ...config, PANEL_PASSWORD: "replacement-password",
    })).toBe(DEMO_IDS.panel);
  });

  it("issues independent opaque tokens and hashes only their bytes", () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(hashSessionToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(first)).not.toBe(first);
  });

  it("uses an absolute eight-hour expiry and exact mutation origin", () => {
    const created = new Date("2026-09-27T00:00:00.000Z");
    expect(sessionExpiresAt(created).toISOString()).toBe("2026-09-27T08:00:00.000Z");
    expect(() => checkMutationOrigin(new Request("http://localhost:3000/api/auth/login", {
      method: "POST", headers: { origin: "http://localhost:3000" },
    }), config)).not.toThrow();
    expect(() => checkMutationOrigin(new Request("http://localhost:3000/api/auth/login", {
      method: "POST", headers: { origin: "https://other.example" },
    }), config)).toThrow();
    expect(() => checkMutationOrigin(new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
    }), config)).toThrow();
  });

  it("blocks at the account and IP failure thresholds", () => {
    expect(loginBlocked(4, 29)).toBe(false);
    expect(loginBlocked(5, 0)).toBe(true);
    expect(loginBlocked(0, 30)).toBe(true);
  });
});
