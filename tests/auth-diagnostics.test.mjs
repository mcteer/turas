import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionFailureDiagnostic } from "../lib/auth/diagnostics.ts";

test("session diagnostics expose controlled categories without error payloads", () => {
  const error = new Error("password authentication failed for postgresql://private-user:private-password@private-host/private-db");
  error.code = "28P01";
  error.cause = { connection: "private-value" };
  assert.deepEqual(sessionFailureDiagnostic(error), { reason: "database_authentication", sqlState: "28P01" });
  assert.equal(JSON.stringify(sessionFailureDiagnostic(error)).includes("private"), false);
  assert.deepEqual(sessionFailureDiagnostic(new Error("Compute quota exceeded")), { reason: "service_limit" });
  assert.deepEqual(sessionFailureDiagnostic(new Error("fetch failed")), { reason: "database_network" });
  assert.deepEqual(sessionFailureDiagnostic(new Error("TURAS_SESSION_SECRET must be configured")), { reason: "configuration" });
});

test("unknown errors and unsafe codes are not serialized", () => {
  for (const error of [null, "private-message", { code: "postgresql://private", stack: "private-stack" }]) {
    assert.deepEqual(sessionFailureDiagnostic(error), { reason: "unclassified" });
  }
});
