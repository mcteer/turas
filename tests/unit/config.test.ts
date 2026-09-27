import { describe, expect, it } from "vitest";
import { parseServerConfig } from "../../lib/server/config";

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
