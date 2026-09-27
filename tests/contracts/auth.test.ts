import { beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { DEMO_IDS } from "../fixtures/identities";
import { POST as login } from "../../app/api/auth/login/route";
import { POST as logout } from "../../app/api/auth/logout/route";
import { GET as session } from "../../app/api/auth/session/route";

const origin = "http://127.0.0.1:3000";
const runFile = promisify(execFile);

function request(path: string, method: string, body?: unknown, cookie?: string, csrf?: string): Request {
  const headers = new Headers({ origin });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  if (csrf) headers.set("x-csrf-token", csrf);
  return new Request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe("login/session/logout contract", () => {
  beforeAll(async () => {
    if (!process.env.TURAS_TEST_DATABASE_URL || !process.env.TURAS_TEST_ENVIRONMENT_ID) {
      throw new Error("Isolated test database required");
    }
    process.env.DATABASE_URL = process.env.TURAS_TEST_DATABASE_URL;
    process.env.TURAS_ENVIRONMENT_ID = process.env.TURAS_TEST_ENVIRONMENT_ID;
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("DELETE FROM rate_windows WHERE environment_id = $1 AND category LIKE 'login_%'", [process.env.TURAS_TEST_ENVIRONMENT_ID]);
    } finally {
      await client.end();
    }
  });

  it("denies unknown credentials without account details", async () => {
    const response = await login(request("/api/auth/login", "POST", { username: "unknown", password: "wrong" }));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("unknown");
  });

  it("rejects cross-origin login and external return URLs", async () => {
    const crossOrigin = request("/api/auth/login", "POST", { username: "panel", password: process.env.PANEL_PASSWORD });
    crossOrigin.headers.set("origin", "https://another.example");
    expect((await login(crossOrigin)).status).toBe(403);
    const externalReturn = await login(request("/api/auth/login", "POST", {
      username: "panel", password: process.env.PANEL_PASSWORD, returnTo: "https://another.example",
    }));
    expect(externalReturn.status).toBe(422);
  });

  it("sets an opaque cookie, returns current identity, and revokes on logout", async () => {
    const loggedIn = await login(request("/api/auth/login", "POST", {
      username: "panel", password: process.env.PANEL_PASSWORD,
    }));
    expect(loggedIn.status).toBe(200);
    const setCookie = loggedIn.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("Domain=");
    const cookie = setCookie.split(";")[0];
    const active = await session(request("/api/auth/session", "GET", undefined, cookie));
    expect(active.status).toBe(200);
    const payload = await active.json() as { data: { principal: { loginName: string }; csrfToken: string } };
    expect(payload.data.principal.loginName).toBe("panel");
    const signedOut = await logout(request("/api/auth/logout", "POST", {}, cookie, payload.data.csrfToken));
    expect(signedOut.status).toBe(200);
    expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await session(request("/api/auth/session", "GET", undefined, cookie))).status).toBe(401);
  });

  it("denies login after the principal is disabled", async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query("UPDATE principals SET active = false WHERE login_name = 'partner'");
      const response = await login(request("/api/auth/login", "POST", {
        username: "partner", password: process.env.PARTNER_PASSWORD,
      }));
      expect(response.status).toBe(401);
    } finally {
      await client.query("UPDATE principals SET active = true WHERE login_name = 'partner'");
      await client.end();
    }
  });

  it("blocks the sixth failed login for one account and local address", async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await login(request("/api/auth/login", "POST", {
        username: "unknown", password: "wrong",
      }));
      expect(response.status).toBe(401);
    }
    const blocked = await login(request("/api/auth/login", "POST", {
      username: "unknown", password: "wrong",
    }));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
  });

  it("preserves principal identity after credential rotation and revokes old sessions explicitly", async () => {
    const oldPassword = process.env.PANEL_PASSWORD;
    const first = await login(request("/api/auth/login", "POST", {
      username: "panel", password: oldPassword,
    }));
    expect(first.status).toBe(200);
    const oldCookie = (first.headers.get("set-cookie") ?? "").split(";")[0];
    process.env.PANEL_PASSWORD = `${oldPassword}-rotated`;
    try {
      const rotated = await login(request("/api/auth/login", "POST", {
        username: "panel", password: process.env.PANEL_PASSWORD,
      }));
      expect(rotated.status).toBe(200);
      const data = await rotated.json() as { data: { principal: { id: string } } };
      expect(data.data.principal.id).toBe(DEMO_IDS.panel);
      const newCookie = (rotated.headers.get("set-cookie") ?? "").split(";")[0];
      await runFile(process.execPath, ["--experimental-strip-types", "scripts/auth-maintenance.ts", "--revoke-principal", "panel"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: process.env.TURAS_TEST_DATABASE_URL,
          TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID,
        },
      });
      expect((await session(request("/api/auth/session", "GET", undefined, oldCookie))).status).toBe(401);
      expect((await session(request("/api/auth/session", "GET", undefined, newCookie))).status).toBe(401);
    } finally {
      process.env.PANEL_PASSWORD = oldPassword;
    }
  });

  it("prunes an expired session without touching active identities", async () => {
    const { Client } = await import("pg");
    const client = new Client({ connectionString: process.env.TURAS_TEST_DATABASE_URL });
    await client.connect();
    const id = randomUUID();
    try {
      await client.query(
        `INSERT INTO login_sessions (id, principal_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, $3, now() - interval '9 hours', now() - interval '1 hour')`,
        [id, DEMO_IDS.panel, "a".repeat(64)],
      );
      await runFile(process.execPath, ["--experimental-strip-types", "scripts/auth-maintenance.ts", "--prune"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: process.env.TURAS_TEST_DATABASE_URL,
          TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID,
        },
      });
      const remaining = await client.query("SELECT 1 FROM login_sessions WHERE id = $1", [id]);
      expect(remaining.rowCount).toBe(0);
      const identity = await client.query("SELECT active FROM principals WHERE id = $1", [DEMO_IDS.panel]);
      expect(identity.rows[0]?.active).toBe(true);
    } finally {
      await client.query("DELETE FROM login_sessions WHERE id = $1", [id]);
      await client.end();
    }
  });
});
