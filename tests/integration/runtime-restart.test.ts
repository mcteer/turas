import { describe, expect, it } from "vitest";
import { Client } from "pg";
import { getServerConfig } from "../../lib/server/config";

const liveIt = process.env.TURAS_RESTART_CONVERSATION_ID ? it : it.skip;

describe("opt-in local runtime restart", () => {
  liveIt("retains one acknowledged turn in Postgres and native Workflow after root dev restarts", async () => {
    const config = getServerConfig();
    const origin = new URL(config.TURAS_APP_ORIGIN);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
      throw new Error("Local restart check requires loopback app origin");
    }
    const id = process.env.TURAS_RESTART_CONVERSATION_ID!;
    const account = process.env.TURAS_RESTART_ACCOUNT;
    if (account !== "mcteer" && account !== "panel" && account !== "partner") {
      throw new Error("Choose a configured demo account");
    }
    const password = account === "mcteer" ? config.TURAS_DEMO_PASSWORD
      : account === "panel" ? config.PANEL_PASSWORD : config.PARTNER_PASSWORD;
    const client = new Client({ connectionString: config.DATABASE_URL });
    await client.connect();
    try {
      const before = await client.query<{ attempt_count: string; event_count: string }>(`
        SELECT (SELECT count(*) FROM response_attempts WHERE conversation_id = $1)::text AS attempt_count,
          (SELECT count(*) FROM event_projections WHERE conversation_id = $1)::text AS event_count`, [id]);
      expect(Number(before.rows[0].attempt_count)).toBe(1);
      expect(Number(before.rows[0].event_count)).toBeGreaterThan(0);
      const login = await fetch(new URL("/api/auth/login", origin), { method: "POST",
        headers: { origin: origin.origin, "content-type": "application/json" },
        body: JSON.stringify({ username: account, password }) });
      expect(login.status).toBe(200);
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      expect(cookie).toBeTruthy();
      const detail = await fetch(new URL(`/api/conversations/${id}`, origin),
        { headers: { cookie: cookie! }, cache: "no-store" });
      expect(detail.status).toBe(200);
      const body = await detail.json() as { data: { eveSessionId: string;
        history: Array<{ eventType: string; payload: { message?: string } }>;
        attempts: Array<{ requestKey: string; responseState: string }> } };
      expect(body.data.attempts).toHaveLength(1);
      expect(body.data.attempts[0].responseState).toBe("completed");
      expect(body.data.history.some((entry) => entry.eventType === "message.completed" &&
        Boolean(entry.payload.message))).toBe(true);
      const native = await fetch(new URL(`/eve/v1/session/${body.data.eveSessionId}/stream?startIndex=0`, origin),
        { headers: { cookie: cookie! }, signal: AbortSignal.timeout(5_000) });
      expect(native.status).toBe(200);
      expect(native.headers.get("content-type")).toMatch(/ndjson/);
      await native.body?.cancel();
      const after = await client.query<{ attempt_count: string; event_count: string }>(`
        SELECT (SELECT count(*) FROM response_attempts WHERE conversation_id = $1)::text AS attempt_count,
          (SELECT count(*) FROM event_projections WHERE conversation_id = $1)::text AS event_count`, [id]);
      expect(after.rows[0]).toEqual(before.rows[0]);
    } finally { await client.end(); }
  });
});
