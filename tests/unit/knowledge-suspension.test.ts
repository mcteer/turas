import { describe,expect,it,vi } from "vitest";
import type { PoolClient } from "pg";

vi.mock("../../lib/server/profiles/eligibility",() => ({
  knowledgeLineageIsCurrent: async () => true,
}));
vi.mock("../../lib/server/retrieval/jobs",() => ({
  enqueueRetrievalJob: async () => null,
}));
import { suspendStaleKnowledge } from "../../lib/server/knowledge/suspension";

const uuid = (number: number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12,"0")}`;

describe("publication maintenance sweep",() => {
  it("advances beyond 100 healthy entries before wrapping",async () => {
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: "test-005",TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),
    })) vi.stubEnv(key,value);
    const visited: string[] = [];
    const publications = Array.from({ length: 201 },(_,index) => ({
      id: uuid(index+1),revision_id: uuid(index+300),
      author_membership_id: uuid(index+600),customer_id: uuid(900),
      workspace_id: uuid(901),
    }));
    const client = { query: vi.fn(async (sql: string,params?: unknown[]) => {
      if (sql.includes("SELECT schema_version")) return {
        rows: [{ schema_version: 28 }],rowCount: 1 };
      if (sql.includes("FROM knowledge_publications p")) {
        const cursor = params?.[1] as string | null;
        const rows = publications.filter((item) => !cursor || item.id > cursor).slice(0,100);
        visited.push(...rows.map((item) => item.id));
        return { rows,rowCount: rows.length };
      }
      if (sql.includes("FROM memberships m")) return { rows: [{ exists: 1 }],rowCount: 1 };
      throw new Error("Unexpected maintenance query");
    }) } as unknown as PoolClient;
    try {
      expect(await suspendStaleKnowledge(client)).toBe(0);
      expect(await suspendStaleKnowledge(client)).toBe(0);
      expect(await suspendStaleKnowledge(client)).toBe(0);
      expect(await suspendStaleKnowledge(client)).toBe(0);
      expect(visited).toHaveLength(201);
      expect(visited[200]).toBe(publications[200].id);
    } finally { vi.unstubAllEnvs(); }
  });
});
