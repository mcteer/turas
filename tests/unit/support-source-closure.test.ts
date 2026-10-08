import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { dependencyUnion } from "../../lib/server/support/sources";
import type { SupportActor } from "../../lib/server/support/policy";
import type { SupportSource } from "../../lib/server/support/schema";

vi.mock("../../lib/server/config", () => ({ getServerConfig: () => ({ TURAS_ENVIRONMENT_ID: "test-source-closure" }) }));

describe("support advice's combined original-source closure", () => {
  it.each([198, 199])("bounds %i originals across two independently bounded selections", async originals => {
    const refs: SupportSource[] = Array.from({ length: 2 }, () => ({ kind: "execution_record", id: randomUUID(),
      sourceRevisionId: randomUUID(), engagementId: randomUUID(), generation: 1, contentDigest: "a".repeat(64) }));
    const rows = Array.from({ length: originals }, () => ({ source_kind: "accepted_profile", source_revision_id: randomUUID(),
      source_generation: "3", content_digest: "b".repeat(64) }));
    const query = vi.fn(async (_sql: string, params: unknown[]) => ({ rows: params[0] === refs[0].sourceRevisionId ? rows.slice(0, 100) : rows.slice(100) }));
    const result = dependencyUnion({ query } as unknown as PoolClient, { workspaceId: randomUUID() } as SupportActor, randomUUID(), refs);
    if (originals === 199) await expect(result).rejects.toMatchObject({ code: "scope_too_large" });
    else {
      const closure = await result;
      expect(closure).toHaveLength(200);
      expect(closure.filter(source => source.kind === "accepted_profile")).toEqual(expect.arrayContaining([
        expect.objectContaining({ generation: 3, contentDigest: "b".repeat(64) }),
      ]));
    }
  });
});
