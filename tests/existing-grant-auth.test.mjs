import assert from "node:assert/strict";
import { test } from "node:test";
import { ConnectionAuthorizationRequiredError } from "eve/connections";
import { existingGrantOnly } from "../agent/lib/existing-grant-auth.ts";

const context = {
  principal: { type: "user", id: "synthetic-reviewer", issuer: "turas-test" },
  connection: { url: "https://example.invalid/mcp" },
};

function provider(getToken) {
  return {
    principalType: "user",
    vercelConnect: { connector: "synthetic-connector" },
    getToken,
    evict: async () => {},
    startAuthorization: () => { throw new Error("Onboarding must not run"); },
    completeAuthorization: () => { throw new Error("Onboarding must not run"); },
  };
}

test("existing grants retain user identity and return the existing credential", async () => {
  const credential = { token: "synthetic-test-value" };
  let receivedContext;
  const original = provider(async (value) => { receivedContext = value; return credential; });
  const auth = existingGrantOnly(original);
  assert.equal(await auth.getToken(context), credential);
  assert.equal(receivedContext, context);
  assert.equal(auth.credentialOwner, "user");
  assert.equal(auth.evict, original.evict);
  assert.equal(auth.vercelConnect, original.vercelConnect);
  assert.equal("startAuthorization" in auth, false);
  assert.equal("completeAuthorization" in auth, false);
});

test("a missing grant becomes an unavailable-records failure without an auth challenge", async () => {
  const auth = existingGrantOnly(provider(async () => {
    throw new ConnectionAuthorizationRequiredError("notion");
  }));
  await assert.rejects(auth.getToken(context), {
    name: "ConnectionAuthorizationFailedError",
    connectionName: "notion",
    reason: "engagement_records_unavailable",
    retryable: false,
  });
});

test("bundled authorization errors are recognized without relying on class identity", async () => {
  const auth = existingGrantOnly(provider(async () => {
    throw Object.assign(new Error("Synthetic missing grant"), {
      name: "ConnectionAuthorizationRequiredError",
      connectionName: "linear",
    });
  }));
  await assert.rejects(auth.getToken(context), { reason: "engagement_records_unavailable", retryable: false });
});

test("unrelated provider failures keep their original cause", async () => {
  const failure = new Error("Synthetic provider outage");
  const auth = existingGrantOnly(provider(async () => { throw failure; }));
  await assert.rejects(auth.getToken(context), (error) => error === failure);
});
