import { beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { canAccessCustomer } from "../../lib/server/access/policy";
import { projectCustomerReference } from "../../lib/server/access/customers";
import { POST as login } from "../../app/api/auth/login/route";
import { GET as customers } from "../../app/api/customers/route";
import { GET as adminAccess } from "../../app/api/admin/access/route";
import { GET as audit } from "../../app/api/admin/audit/route";
import { GET as currentSession } from "../../app/api/auth/session/route";
import { PUT as changeGrant } from "../../app/api/admin/grants/[membershipId]/[customerId]/route";
import { PATCH as changeMembership } from "../../app/api/admin/memberships/[id]/route";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { DEMO_IDS } from "../fixtures/identities";

const runFile = promisify(execFile);
const origin = "http://127.0.0.1:3000";

async function cookieFor(username: "mcteer" | "panel" | "partner", password: string | undefined) {
  const response = await login(new Request(origin + "/api/auth/login", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  }));
  expect(response.status).toBe(200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

describe("access contract", () => {
  beforeAll(async () => {
    if (!process.env.TURAS_TEST_DATABASE_URL) throw new Error("Isolated test database required");
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    await runFile(process.execPath, ["--experimental-strip-types", "scripts/bootstrap-demo.ts"], {
      cwd: process.cwd(), env: process.env,
    });
  });

  it("serializes only delivery-safe customer reference fields", () => {
    const row = {
      id: "customer-1", display_name: "Synthetic customer", synthetic: true,
      workspace_id: "workspace-1", created_at: new Date(), internal_risk: "private",
    };
    expect(projectCustomerReference(row)).toEqual({ id: "customer-1", displayName: "Synthetic customer", synthetic: true });
  });

  it("never grants access to a guessed customer in another workspace", () => {
    expect(canAccessCustomer({
      principalActive: true, membershipActive: true, workspaceActive: true,
      partnerOrganizationActive: true, kind: "partner", grantActive: true,
      membershipWorkspaceId: "one", customerWorkspaceId: "two",
    })).toBe(false);
  });

  it("shows all workspace references internally and only assigned references to partners", async () => {
    const panelCookie = await cookieFor("panel", process.env.PANEL_PASSWORD);
    const partnerCookie = await cookieFor("partner", process.env.PARTNER_PASSWORD);
    const list = async (cookie: string) => {
      const response = await customers(new Request(origin + "/api/customers", { headers: { cookie } }));
      expect(response.status).toBe(200);
      return (await response.json() as { data: { items: { id: string }[] } }).data.items.map((item) => item.id);
    };
    expect(await list(panelCookie)).toContain(DEMO_IDS.deniedCustomer);
    expect(await list(partnerCookie)).toContain(DEMO_IDS.sharedCustomer);
    expect(await list(partnerCookie)).not.toContain(DEMO_IDS.deniedCustomer);
  });

  it("restricts access administration and audit to mcteer", async () => {
    const adminCookie = await cookieFor("mcteer", process.env.TURAS_DEMO_PASSWORD);
    const panelCookie = await cookieFor("panel", process.env.PANEL_PASSWORD);
    expect((await adminAccess(new Request(origin + "/api/admin/access", { headers: { cookie: adminCookie } }))).status).toBe(200);
    expect((await audit(new Request(origin + "/api/admin/audit", { headers: { cookie: adminCookie } }))).status).toBe(200);
    expect((await adminAccess(new Request(origin + "/api/admin/access", { headers: { cookie: panelCookie } }))).status).toBe(403);
    expect((await audit(new Request(origin + "/api/admin/audit", { headers: { cookie: panelCookie } }))).status).toBe(403);
    const page = await adminAccess(new Request(origin + "/api/admin/access?limit=1", { headers: { cookie: adminCookie } }));
    expect((await page.json() as { data: { nextCursor: string | null } }).data.nextCursor).toBeTruthy();
  });

  it("revokes and restores the partner grant with revision and request-key checks", async () => {
    const adminCookie = await cookieFor("mcteer", process.env.TURAS_DEMO_PASSWORD);
    const partnerCookie = await cookieFor("partner", process.env.PARTNER_PASSWORD);
    const auth = await currentSession(new Request(origin + "/api/auth/session", { headers: { cookie: adminCookie } }));
    const csrf = (await auth.json() as { data: { csrfToken: string } }).data.csrfToken;
    const current = await adminAccess(new Request(origin + "/api/admin/access", { headers: { cookie: adminCookie } }));
    const grants = (await current.json() as { data: { grants: { membershipId: string; customerId: string; revision: number }[] } }).data.grants;
    const revision = grants.find((grant) => grant.membershipId === DEMO_IDS.partnerMembership && grant.customerId === DEMO_IDS.sharedCustomer)?.revision;
    expect(revision).toBeTypeOf("number");
    const db = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await db.connect();
    const generation = async () => Number((await db.query<{ delivery_generation: string }>(
      "SELECT delivery_generation FROM customer_profile_state WHERE customer_id=$1",
      [DEMO_IDS.sharedCustomer])).rows[0].delivery_generation);
    const beforeGeneration = await generation();
    const key = randomUUID();
    const mutate = (state: "active" | "revoked", expectedRevision: number, requestKey: string) => changeGrant(
      new Request(origin + "/api/admin/grants", {
        method: "PUT", headers: { origin, cookie: adminCookie, "x-csrf-token": csrf, "content-type": "application/json" },
        body: JSON.stringify({ state, expectedRevision, requestKey }),
      }),
      { params: Promise.resolve({ membershipId: DEMO_IDS.partnerMembership, customerId: DEMO_IDS.sharedCustomer }) },
    );
    const revoked = await mutate("revoked", revision!, key);
    expect(revoked.status).toBe(200);
    try {
      expect(await generation()).toBe(beforeGeneration + 1);
      expect((await mutate("revoked", revision!, key)).status).toBe(200);
      expect((await mutate("active", revision!, key)).status).toBe(409);
      expect((await mutate("active", revision!, randomUUID())).status).toBe(409);
      const visible = await customers(new Request(origin + "/api/customers", { headers: { cookie: partnerCookie } }));
      const ids = (await visible.json() as { data: { items: { id: string }[] } }).data.items.map((item) => item.id);
      expect(ids).not.toContain(DEMO_IDS.sharedCustomer);
      await runFile(process.execPath, ["--experimental-strip-types", "scripts/bootstrap-demo.ts"], { cwd: process.cwd(), env: process.env });
      const afterBootstrap = await customers(new Request(origin + "/api/customers", { headers: { cookie: partnerCookie } }));
      expect((await afterBootstrap.json() as { data: { items: { id: string }[] } }).data.items.map((item) => item.id)).not.toContain(DEMO_IDS.sharedCustomer);
    } finally {
      expect((await mutate("active", revision! + 1, randomUUID())).status).toBe(200);
      expect(await generation()).toBe(beforeGeneration + 2);
      await db.end();
    }
  });

  it("prevents disabling the final administrator through the API", async () => {
    const adminCookie = await cookieFor("mcteer", process.env.TURAS_DEMO_PASSWORD);
    const auth = await currentSession(new Request(origin + "/api/auth/session", { headers: { cookie: adminCookie } }));
    const csrf = (await auth.json() as { data: { csrfToken: string } }).data.csrfToken;
    const response = await changeMembership(new Request(origin + "/api/admin/memberships", {
      method: "PATCH", headers: { origin, cookie: adminCookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ active: false, expectedRevision: 0, requestKey: randomUUID() }),
    }), { params: Promise.resolve({ id: DEMO_IDS.mcteerMembership }) });
    expect(response.status).toBe(409);
  });
});
